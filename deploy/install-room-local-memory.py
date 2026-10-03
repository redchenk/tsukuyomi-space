#!/usr/bin/env python3
"""Install verified runtimes offline or from pinned public URLs. Never enables them."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path('/var/lib/tsukuyomi-space/local-memory')
REPO = Path(__file__).resolve().parent.parent

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--asset-dir', type=Path)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Run installer as root inside a bounded systemd scope')
    if ROOT.is_symlink():
        raise RuntimeError('Runtime root cannot be a symlink')
    ROOT.mkdir(mode=0o750, parents=True, exist_ok=True)
    assets = ROOT / 'downloads'
    assets.mkdir(exist_ok=True)
    manifest = json.loads((REPO / 'backend/local-memory/models.manifest.json').read_text())
    for name, item in manifest.items():
        target = assets / name
        if not target.exists() or digest(target) != item['sha256']:
            temporary = assets / (name + '.part')
            if args.asset_dir:
                shutil.copyfile(args.asset_dir / name, temporary)
            else:
                with urllib.request.urlopen(item['url'], timeout=30) as source, temporary.open('wb') as dest:
                    shutil.copyfileobj(source, dest, length=1048576)
            if digest(temporary) != item['sha256']:
                temporary.unlink(missing_ok=True)
                raise RuntimeError('Asset checksum mismatch: ' + name)
            temporary.replace(target)
    models = ROOT / 'models'
    models.mkdir(exist_ok=True)
    for name in manifest:
        if not name.endswith('.tar.gz'):
            # Hard links avoid duplicating the 640 MB quantized model.
            target = models / name
            if not target.exists():
                os.link(assets / name, target)
            if digest(target) != manifest[name]['sha256']:
                raise RuntimeError('Installed model checksum mismatch')
    subprocess.run(['python3', '-m', 'venv', str(ROOT / 'venv')], check=True)
    subprocess.run([str(ROOT / 'venv/bin/pip'), 'install', '--disable-pip-version-check', '--no-cache-dir',
                    '--require-hashes', '--index-url', 'https://pypi.org/simple', '-r', str(REPO / 'backend/local-memory/requirements.lock')], check=True)
    subprocess.run(['chown', '-R', 'tsukuyomi:www-data', str(ROOT)], check=True)
    print('Runtime verified and installed; services remain inactive.')

if __name__ == '__main__':
    main()
