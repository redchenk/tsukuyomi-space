"""Activate a pinned frontend using the site's normal release state and rollback."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

stage = Path(sys.argv[1]).resolve()
label = sys.argv[2]
if not re.fullmatch(r'shrine-entry-[a-zA-Z0-9-]+', label):
    raise ValueError('Invalid release label')
meta = json.loads((stage / 'manifest.json').read_text())
domestic = meta['site'] == 'domestic'
host = 'yachiyo.hk' if domestic else 'tsukuyomi-space.com'
root = Path('/var/www/tsukuyomi-space') if domestic else Path('/opt/1panel/www/sites/tsukuyomi-space.com/frontend')
current = root / 'dist/frontend' if domestic else root
artifact = stage / 'frontend'
state = Path('/var/backups/tsukuyomi-space/releases') / label

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def get(route):
    return subprocess.check_output(['curl', '-fsS', '--retry', '3', '--retry-all-errors',
        '--retry-delay', '2', '--max-time', '20', '--resolve', host + ':443:127.0.0.1', 'https://' + host + route])

def run(*args):
    subprocess.run([str(a) for a in args], check=True)

def verify():
    assert sha(current / 'index.html') == meta['after']
    for route in ['/access', '/hub']:
        assert meta['entry'].encode() in get(route), route
    assert json.loads(get('/api/health'))['status'] == 'ok'
    for name, digest in meta['shrine'].items():
        assert sha(current / name) == digest, name
        assert hashlib.sha256(get('/' + name)).hexdigest() == digest, name

if sha(current / 'index.html') == meta['after']:
    verify()
else:
    assert sha(current / 'index.html') == meta['before'], 'The active frontend changed'
    # Domestic archives carry only the changed files. Reuse current immutable
    # assets after verifying their contents against the complete candidate.
    for name, digest in meta.get('files', {}).items():
        target = artifact / name
        if not target.exists():
            source = current / name
            assert source.is_file() and not source.is_symlink() and sha(source) == digest, name
            target.parent.mkdir(exist_ok=True, parents=True)
            os.link(source, target)
        assert sha(target) == digest, name
    assert sha(artifact / 'index.html') == meta['after']
    args = ['--site', meta['site'], '--state', state, '--root', root, '--frontend', current,
        '--artifact', artifact, '--base-url', 'https://' + host, '--resolve', host + ':443:127.0.0.1',
        '--commit', meta['commit'], '--frontend-only']
    if domestic:
        args.extend(['--extra-resource', '/var/www/tsukuyomi-game-assets'])
    run('bash', stage / 'prepare-lightweight-release.sh', *args)
    assert sha(current / 'index.html') == meta['before']
    try:
        run('python3', stage / 'safe-release.py', 'activate', '--state', state)
        verify()
    except BaseException:
        run('python3', stage / 'safe-release.py', 'rollback', '--state', state)
        raise
print('Verified', host, meta['commit'], flush=True)
# No files referenced by the current build qualify. Keep the previous hashed
# URLs and rollback files valid while reclaiming duplicate old staging copies.
run('python3', stage / 'dedup-entry-media.py', current, stage / 'manifest.json')
