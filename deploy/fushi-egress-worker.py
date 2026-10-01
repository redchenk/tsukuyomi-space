#!/usr/bin/env python3
"""Restricted SSH forced command. Standard library only; never an HTTP server."""
import errno
import ipaddress
import json
import os
import re
import select
import selectors
import signal
import socket
import sys
import time

# Keep the remote policy at least as strict as the website's ipaddr.js policy.
DENIED = tuple(ipaddress.ip_network(value) for value in (
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
    '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '192.0.0.0/24',
    '192.0.2.0/24', '192.88.99.0/24', '198.18.0.0/15', '198.51.100.0/24',
    '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4', '192.175.48.0/24',
    '192.31.196.0/24', '192.52.193.0/24', '::/128', '::1/128', 'fe80::/10',
    'ff00::/8', 'fc00::/7', 'fec0::/10', '100::/64', '::ffff:0:0:0/96',
    '64:ff9b::/96', '64:ff9b:1::/48', '2002::/16', '2001::/23',
    '2620:4f:8000::/48', '2001:10::/28', '2001:20::/28', '2001:30::/28',
    '5f00::/16', '2001:db8::/32', '3fff::/20'))
SAFE_CODES = {'URL_REJECTED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
              'ENETUNREACH', 'ECONNREFUSED', 'ECONNRESET'}


class Rejected(Exception):
    def __init__(self, code='NETWORK_ERROR'):
        self.code = code if code in SAFE_CODES else 'NETWORK_ERROR'
        super().__init__('Fushi egress unavailable')


def public_address(value):
    try:
        address = ipaddress.ip_address(value)
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        return address.is_global and not any(address in block for block in DENIED if block.version == address.version)
    except ValueError:
        return False


def read_frame(stream, limit):
    line = stream.readline(limit + 2)
    if not line.endswith(b'\n') or len(line) > limit + 1:
        raise Rejected()
    try:
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise Rejected()
                result[key] = value
            return result
        value = json.loads(line, object_pairs_hook=unique)
        if not isinstance(value, dict):
            raise Rejected()
        return value
    except (ValueError, UnicodeError):
        raise Rejected() from None


def write_frame(stream, value):
    stream.write(json.dumps(value, separators=(',', ':')).encode() + b'\n')
    stream.flush()


def resolve_records(host):
    try:
        values = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise Rejected('EAI_AGAIN' if error.errno == socket.EAI_AGAIN else 'ENOTFOUND') from None
    records = []
    for family, _, _, _, peer in values:
        if family not in (socket.AF_INET, socket.AF_INET6) or not public_address(peer[0]):
            raise Rejected('URL_REJECTED')
        record = {'address': str(ipaddress.ip_address(peer[0])), 'family': 4 if family == socket.AF_INET else 6}
        if record not in records:
            records.append(record)
    if not records or len(records) > 16:
        raise Rejected('URL_REJECTED')
    return records


def dial_records(records, timeout=10):
    # Preserve an earlier candidate while starting the next; never re-resolve.
    deadline, next_start = time.monotonic() + timeout, 0
    selector = selectors.DefaultSelector()
    active, candidates, last_error, winner = {}, iter(records[:8]), None, None
    try:
        exhausted = False
        while time.monotonic() < deadline:
            now = time.monotonic()
            if not exhausted and len(active) < 2 and now >= next_start:
                record = next(candidates, None)
                if record is None:
                    exhausted = True
                else:
                    peer = socket.socket(socket.AF_INET if record['family'] == 4 else socket.AF_INET6, socket.SOCK_STREAM)
                    peer.setblocking(False)
                    result = peer.connect_ex((record['address'], 443))
                    if result == 0:
                        winner = peer
                        peer.setblocking(True)
                        return peer, record
                    if result not in (errno.EINPROGRESS, errno.EWOULDBLOCK, errno.EALREADY):
                        last_error = result
                        peer.close()
                        next_start = now
                        continue
                    active[peer] = record
                    selector.register(peer, selectors.EVENT_WRITE)
                    next_start = now + .25
            if exhausted and not active:
                raise Rejected(errno.errorcode.get(last_error, 'NETWORK_ERROR'))
            wait = min(.25, max(0, deadline - time.monotonic()))
            for key, _ in selector.select(wait):
                peer, record = key.fileobj, active.pop(key.fileobj)
                selector.unregister(peer)
                result = peer.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR)
                if not result:
                    winner = peer
                    peer.setblocking(True)
                    return peer, record
                last_error = result
                peer.close()
                next_start = 0
        raise Rejected('ETIMEDOUT')
    finally:
        for peer in active:
            if peer is not winner:
                peer.close()
        selector.close()


def relay(input_stream, output_stream, peer):
    counts = [0, 0]
    # Raw stdin is essential: buffered readline must not consume a TLS record.
    source = input_stream.fileno()
    while True:
        ready, _, _ = select.select([source, peer], [], [], 1)
        for item in ready:
            index = 0 if item == source else 1
            chunk = os.read(source, 65536) if index == 0 else peer.recv(65536)
            if not chunk:
                return
            counts[index] += len(chunk)
            if counts[index] > 786432:
                raise Rejected()
            if index == 0:
                peer.sendall(chunk)
            else:
                output_stream.write(chunk)
                output_stream.flush()


def serve(input_stream, output_stream, hosts, resolve=resolve_records, dial=dial_records, forward=relay, on_connected=lambda: None):
    first = read_frame(input_stream, 512)
    host = first.get('hostname')
    if (set(first) != {'type', 'hostname', 'port'} or first.get('type') != 'resolve'
            or type(first.get('port')) is not int or first['port'] != 443
            or not isinstance(host, str) or host not in hosts or len(host) > 253
            or not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{1,63}', host)):
        raise Rejected('URL_REJECTED')
    records = resolve(host)
    if (not records or len(records) > 16 or any(set(record) != {'address', 'family'}
            or type(record['family']) is not int or record['family'] not in (4, 6)
            or not public_address(record['address'])
            or ipaddress.ip_address(record['address']).version != record['family'] for record in records)):
        raise Rejected('URL_REJECTED')
    write_frame(output_stream, {'type': 'resolved', 'records': records})
    if read_frame(input_stream, 64) != {'type': 'connect'}:
        raise Rejected()
    peer, selected = dial(records)
    try:
        if selected not in records or ipaddress.ip_address(peer.getpeername()[0]) != ipaddress.ip_address(selected['address']):
            raise Rejected()
        write_frame(output_stream, {'type': 'connected', **selected})
        on_connected()
        forward(input_stream, output_stream, peer)
    finally:
        peer.close()


if __name__ == '__main__':
    # No inherited environment switches, shell execution or original SSH command.
    signal.signal(signal.SIGALRM, lambda *_: os._exit(1))
    signal.alarm(12)
    if os.environ.get('SSH_ORIGINAL_COMMAND'):
        sys.exit(1)
    connected = [False]
    try:
        with open('/etc/tsukuyomi-fushi-egress/hosts.json') as source:
            allowed = json.load(source)
        if not isinstance(allowed, list) or not 1 <= len(allowed) <= 8 or any(not isinstance(host, str) for host in allowed):
            raise Rejected()
        serve(os.fdopen(0, 'rb', buffering=0), sys.stdout.buffer, allowed, on_connected=lambda: connected.__setitem__(0, True))
    except Rejected as error:
        if not connected[0]:
            write_frame(sys.stdout.buffer, {'type': 'error', 'code': error.code})
        sys.exit(1)
    except Exception:
        # stdout is a protocol/TLS stream, stderr may contain no destinations or secrets.
        sys.exit(1)
