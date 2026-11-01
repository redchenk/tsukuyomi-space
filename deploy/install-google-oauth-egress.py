#!/usr/bin/env python3
"""Provision an isolated, forced-command Google identity relay on the overseas host."""
import argparse
import base64
import ipaddress
import json
import os
import pathlib
import pwd
import re
import subprocess

def install(public_key_file, source_ip):
    if os.geteuid() != 0:
        raise RuntimeError('Run as root on the overseas relay host')
    address = ipaddress.ip_address(source_ip)
    if not address.is_global:
        raise ValueError('A public website source IP is required')
    public_key = pathlib.Path(public_key_file).read_text().strip()
    if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [A-Za-z0-9_.@-]+)?', public_key):
        raise ValueError('Expected one Ed25519 public key')
    base64.b64decode(public_key.split()[1], validate=True)
    template = pathlib.Path(__file__).with_name('fushi-egress-worker.py').read_text()
    old = '/etc/tsukuyomi-fushi-egress/hosts.json'
    new = '/etc/tsukuyomi-google-oauth-egress/hosts.json'
    assert template.count(old) == 1
    worker = template.replace(old, new)
    user = 'google-oauth-egress'
    home = pathlib.Path('/var/lib/google-oauth-egress')
    files = {
        pathlib.Path('/opt/tsukuyomi-google-oauth-egress/worker.py'): worker,
        pathlib.Path(new): json.dumps(['oauth2.googleapis.com', 'www.googleapis.com']) + '\n',
        home / '.ssh/authorized_keys': f'restrict,from="{address}",command="/usr/bin/python3 /opt/tsukuyomi-google-oauth-egress/worker.py" {public_key}\n',
    }
    # Refuse to replace another deployment or credential; repeated identical runs
    # are safe. The existing Fushi relay and SSH daemon configuration are untouched.
    for path, contents in files.items():
        if path.is_symlink() or path.exists() and path.read_text() != contents:
            raise RuntimeError(f'Existing configuration requires inspection: {path}')
    try:
        account = pwd.getpwnam(user)
        if account.pw_dir != str(home) or account.pw_shell != '/bin/sh':
            raise RuntimeError('Existing relay account does not match the deployment')
    except KeyError:
        subprocess.run(['useradd', '--system', '--user-group', '--create-home', '--home-dir', str(home), '--shell', '/bin/sh', user], check=True)
    for path, contents in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        os.chown(path.parent, 0, 0)
        os.chmod(path.parent, 0o755)
        path.write_text(contents)
        os.chown(path, 0, 0)
        os.chmod(path, 0o644)
    os.chown(home, 0, 0)
    os.chmod(home, 0o755)
    subprocess.run(['/usr/sbin/sshd', '-t'], check=True)
    print(json.dumps({'installed': True, 'user': user, 'allowed_hosts': ['oauth2.googleapis.com', 'www.googleapis.com'], 'source_ip': str(address)}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public-key', required=True)
    parser.add_argument('--source-ip', required=True)
    args = parser.parse_args()
    install(args.public_key, args.source_ip)
