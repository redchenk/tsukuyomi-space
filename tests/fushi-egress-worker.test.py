import importlib.util
import io
import json
import pathlib
import socket
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('worker', pathlib.Path(__file__).parents[1] / 'deploy/fushi-egress-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
HOST = 'receiver.example.test'
RECORDS = [{'address': '93.184.216.34', 'family': 4}]


class Peer:
    def __init__(self, address=RECORDS[0]['address']):
        self.address, self.closed, self.sent = address, False, []
    def getpeername(self):
        return self.address, 443
    def close(self):
        self.closed = True
    def sendall(self, chunk):
        self.sent.append(chunk)


def frames(first=None, second=None):
    return io.BytesIO((json.dumps(first or {'type': 'resolve', 'hostname': HOST, 'port': 443})
                       + '\n' + json.dumps(second or {'type': 'connect'}) + '\n').encode())


class EgressTests(unittest.TestCase):
    def test_public_policy_blocks_private_mapped_reserved_and_transition_addresses(self):
        for value in ['127.0.0.1', '10.0.0.1', '100.100.2.136', '169.254.169.254', '198.18.0.1',
                      '192.52.193.1', '240.1.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1',
                      '64:ff9b::a00:1', '2002:a00:1::', '2001::1', '5f00::1', '3fff::1', 'invalid']:
            self.assertFalse(worker.public_address(value), value)
        for value in ['93.184.216.34', '2606:4700::1111', '::ffff:93.184.216.34']:
            self.assertTrue(worker.public_address(value), value)

    def test_control_frames_reject_duplicates_oversized_arrays_and_malformed_json(self):
        for value in [b'{"type":"resolve","type":"connect"}\n', b'x' * 65, b'[]\n', b'{bad}\n']:
            with self.assertRaises(worker.Rejected):
                worker.read_frame(io.BytesIO(value), 64)

    def test_unrelated_hosts_ports_and_extra_fields_fail_before_dns(self):
        for first in [{'type': 'resolve', 'hostname': 'other.example.test', 'port': 443},
                      {'type': 'resolve', 'hostname': HOST, 'port': 80},
                      {'type': 'resolve', 'hostname': HOST, 'port': 443, 'command': 'shell'}]:
            with self.assertRaises(worker.Rejected) as error:
                worker.serve(frames(first), io.BytesIO(), [HOST], resolve=lambda _: self.fail('DNS invoked'))
            self.assertEqual(error.exception.code, 'URL_REJECTED')

    def test_mixed_invalid_family_and_oversized_dns_fail_before_tcp(self):
        for records in [RECORDS + [{'address': '10.0.0.1', 'family': 4}],
                        [{'address': RECORDS[0]['address'], 'family': 6}], [], RECORDS * 17]:
            with self.assertRaises(worker.Rejected):
                worker.serve(frames(), io.BytesIO(), [HOST], resolve=lambda _: records,
                             dial=lambda _: self.fail('TCP invoked'))

    def test_source_resolver_checks_every_answer_before_limiting_records(self):
        values = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (RECORDS[0]['address'], 443)),
                  (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]
        with patch.object(socket, 'getaddrinfo', return_value=values), self.assertRaises(worker.Rejected):
            worker.resolve_records(HOST)

    def test_dns_failures_are_safe_and_classified(self):
        with patch.object(socket, 'getaddrinfo', side_effect=socket.gaierror(socket.EAI_AGAIN, 'secret raw detail')):
            with self.assertRaises(worker.Rejected) as error:
                worker.resolve_records(HOST)
            self.assertEqual(error.exception.code, 'EAI_AGAIN')
            self.assertNotIn('secret', str(error.exception))

    def test_valid_connection_uses_original_snapshot_and_opaque_stream(self):
        output, peer, resolutions = io.BytesIO(), Peer(), []
        def resolve(host):
            resolutions.append(host)
            return RECORDS
        def dial(records):
            self.assertEqual(records, RECORDS)
            return peer, RECORDS[0]
        forwarded = []
        worker.serve(frames(), output, [HOST], resolve=resolve, dial=dial,
                     forward=lambda source, sink, target: forwarded.append(target))
        answers = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(answers, [{'type': 'resolved', 'records': RECORDS}, {'type': 'connected', **RECORDS[0]}])
        self.assertEqual(resolutions, [HOST])
        self.assertEqual(forwarded, [peer])
        self.assertTrue(peer.closed)

    def test_unpinned_winner_is_rejected_and_closed(self):
        peer = Peer('8.8.8.8')
        with self.assertRaises(worker.Rejected):
            worker.serve(frames(), io.BytesIO(), [HOST], resolve=lambda _: RECORDS, dial=lambda _: (peer, RECORDS[0]))
        self.assertTrue(peer.closed)

    def test_extra_connect_parameters_cannot_choose_another_address(self):
        with self.assertRaises(worker.Rejected):
            worker.serve(frames(second={'type': 'connect', 'address': '127.0.0.1'}), io.BytesIO(), [HOST],
                         resolve=lambda _: RECORDS, dial=lambda _: self.fail('TCP invoked'))

    def test_stream_byte_limit_stops_before_forwarding_excess(self):
        peer = Peer()
        with tempfile.TemporaryFile() as source:
            source.write(b'x' * 800000)
            source.seek(0)
            with patch.object(worker.select, 'select', return_value=([source.fileno()], [], [])), self.assertRaises(worker.Rejected):
                worker.relay(source, io.BytesIO(), peer)
        self.assertLessEqual(sum(map(len, peer.sent)), 786432)


if __name__ == '__main__':
    unittest.main()
