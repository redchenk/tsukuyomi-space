"""Activate a verified frontend package and roll back if the public routes fail."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

stage = Path(sys.argv[1]).resolve()
label = sys.argv[2]
if not re.fullmatch(r'design-frontend-(?:domestic|overseas)-[a-z0-9-]+', label):
    raise ValueError('Invalid release label')
manifest = json.loads((stage / 'manifest.json').read_text())
domestic = manifest['site'] == 'domestic'
host = 'yachiyo.hk' if domestic else 'tsukuyomi-space.com'
root = Path('/var/www/tsukuyomi-space') if domestic else Path('/opt/1panel/www/sites/tsukuyomi-space.com/frontend')
current = root / 'dist/frontend' if domestic else root
artifact = stage / 'frontend'
state = Path('/var/backups/tsukuyomi-space/releases') / label

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def get(route):
    return subprocess.check_output(['curl','-fsS','--retry','3','--retry-all-errors','--retry-delay','2',
        '--max-time','15','--resolve',host+':443:127.0.0.1','https://'+host+route])

def verify():
    assert sha(current / 'index.html') == manifest['after']
    for route in ['/users/redchenk','/gallery','/hub','/room','/payments']:
        assert manifest['entry'].encode() in get(route), route
    assert hashlib.sha256(get(manifest['entry'])).hexdigest() == manifest['files'][manifest['entry'][1:]]
    assert json.loads(get('/api/health'))['status'] == 'ok'
    assert json.loads(get('/api/payments/catalog'))['success'] is True

if sha(current / 'index.html') != manifest['after']:
    assert sha(current / 'index.html') == manifest['before'], 'The production frontend changed'
    for name, digest in manifest['files'].items():
        rel = Path(name)
        assert not rel.is_absolute() and '..' not in rel.parts
        dst = artifact / rel
        if not dst.exists():
            src = current / rel
            assert src.is_file() and not src.is_symlink() and sha(src) == digest, name
            dst.parent.mkdir(parents=True,exist_ok=True)
            os.link(src,dst)
        assert sha(dst) == digest, name
    args = ['--site',manifest['site'],'--state',state,'--root',root,'--frontend',current,'--artifact',artifact,
            '--base-url','https://'+host,'--resolve',host+':443:127.0.0.1','--commit',manifest['commit'],'--frontend-only']
    if domestic:
        args.extend(['--extra-resource','/var/www/tsukuyomi-game-assets'])
    subprocess.run(['bash',stage/'prepare-lightweight-release.sh',*args],check=True)
    assert sha(current/'index.html') == manifest['before']
    try:
        subprocess.run(['python3',stage/'safe-release.py','activate','--state',state],check=True)
        verify()
    except BaseException:
        subprocess.run(['python3',stage/'safe-release.py','rollback','--state',state],check=True)
        raise
else:
    verify()
print('Published',host,manifest['entry'], 'rollback',state)
