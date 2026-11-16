#!/usr/bin/env python3
"""Add only the standalone probe routes; preserve and back up every other route."""
import argparse
import hashlib
import json
from pathlib import Path
import os
import subprocess
import tempfile

CONFIG = Path('/etc/nginx/conf.d/tsukuyomi-space.conf')


def candidate(original, block):
    if block in original:
        return original
    if '/compat' in original:
        raise RuntimeError('Existing compatibility route requires review')
    anchor = '    location = / {\n'
    if original.count(anchor) != 1:
        raise RuntimeError('Expected exactly one website root location')
    return original.replace(anchor, block + '\n' + anchor, 1)


def replace(config, data):
    fd, name = tempfile.mkstemp(prefix='.compat-route-', dir=config.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        os.chmod(name, config.stat().st_mode & 0o777)
        os.replace(name, config)
    finally:
        Path(name).unlink(missing_ok=True)


def reload():
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)


def apply(state, rollback=False, config=CONFIG):
    if config.is_symlink():
        raise RuntimeError('Refusing a symlinked nginx configuration')
    backup, metadata = state / 'nginx.before.conf', state / 'nginx-route.json'
    current = config.read_bytes()
    digest = lambda data: hashlib.sha256(data).hexdigest()
    if rollback:
        record = json.loads(metadata.read_text())
        if digest(current) not in (record['before'], record['after']):
            raise RuntimeError('Refusing rollback over another nginx change')
        restored = backup.read_bytes()
        if digest(restored) != record['before']:
            raise RuntimeError('Nginx backup changed')
        replace(config, restored)
        reload()
        return
    if metadata.exists() or backup.exists():
        raise RuntimeError('Route backup already exists; use a new release state')
    block = Path(__file__).with_name('compat-route.inc').read_text()
    updated = candidate(current.decode(), block).encode()
    backup.write_bytes(current)
    metadata.write_text(json.dumps({'before': digest(current), 'after': digest(updated)}))
    replace(config, updated)
    try:
        reload()
    except Exception:
        replace(config, current)
        reload()
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'rollback'])
    parser.add_argument('--state', required=True)
    args = parser.parse_args()
    apply(Path(args.state), rollback=args.action == 'rollback')
