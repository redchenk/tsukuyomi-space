"""Publish the hash-verified Water Mirror frontend; retain rollback assets."""
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tarfile
import subprocess
import time
import urllib.request

CANDIDATE = 'cf1b10eeef98741daaeaff640ff22985352676ab'
RELEASE = 'water-mirror-entry'
stage = Path(__file__).resolve().parent
site, action, attempt = sys.argv[1:]
assert len(attempt.split('-')) == 2 and all(part.isdecimal() for part in attempt.split('-'))
assert site in ('domestic', 'overseas') and action in ('prepare', 'activate', 'verify', 'rollback')
manifest = json.loads((stage / (site + '.json')).read_text())
assert manifest['site'] == site and manifest['commit'] == CANDIDATE
domestic = site == 'domestic'
root = Path('/var/www/tsukuyomi-space') if domestic else Path('/opt/1panel/www/sites/tsukuyomi-space.com/frontend')
front = root / 'dist/frontend' if domestic else root
state = Path('/var/backups/tsukuyomi-space') / (RELEASE + '-' + attempt + '-' + site)
spec = importlib.util.spec_from_file_location('safe', stage / 'safe-release.py')
safe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(safe)
locks = [Path(n).open('a') for n in ('/var/lock/tsukuyomi-site-release.lock', '/var/backups/tsukuyomi-space/releases/.release.lock')]
for lock in locks:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

def target(directory, name):
    p = directory / name
    assert not p.is_symlink() and p.resolve() == directory.resolve() / name, 'Unexpected symlink: ' + name
    return p

def matches(p, expected):
    return p.is_file() and safe.sha(p) == expected if expected else not p.exists() and not p.is_symlink()

def verify(which):
    for name, digest in manifest[which].items():
        assert name == 'index.html' or (len(Path(name).parts) == 2 and name.startswith('assets/') and safe.ASSET_NAME.fullmatch(Path(name).name))
        assert matches(target(front, name), digest), 'Frontend changed: ' + name

def protected():
    return safe.resource_manifest(root, site, ['/var/www/tsukuyomi-game-assets'] if domestic else [])

def verify_protected():
    assert json.loads((state / 'protected.json').read_text()) == protected(), 'Protected resources changed'

def status(value):
    p = state / 'status.tmp'
    p.write_text(json.dumps({'status': value, 'source_commit': CANDIDATE, 'site': site, 'frontend_files': len(manifest['after'])}) + '\n')
    p.replace(state / 'status.json')

def refresh_shell():
    if not domestic:
        return
    # The domestic middleware reads index.html once at process startup.
    subprocess.run(['pm2', 'reload', str(root / 'deploy/ecosystem.config.cjs'), '--only', 'tsukuyomi-api', '--update-env'], cwd=root, check=True, stdout=subprocess.DEVNULL, timeout=90)
    for _ in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=3) as response:
                if json.load(response).get('status') == 'ok':
                    return
        except OSError:
            pass
        time.sleep(.5)
    raise RuntimeError('Domestic API did not recover after refreshing the frontend shell')

def rollback():
    assert safe.sha(front / 'index.html') in {manifest['before']['index.html'], manifest['after']['index.html']}
    assert matches(state / 'index.html', manifest['before']['index.html'])
    safe.copy_atomic(state / 'index.html', front / 'index.html')
    refresh_shell()
    verify('before')
    verify_protected()
    status('rolled_back')

if action == 'prepare':
    assert not state.exists() and not (stage / 'frontend').exists()
    verify('before')
    changed = {name for name, digest in manifest['after'].items() if manifest['before'].get(name) != digest}
    assert changed & set(manifest['before']) == {'index.html'}
    expected = {'frontend/' + name: manifest['after'][name] for name in changed}
    with tarfile.open(stage / (site + '.tgz')) as archive:
        members = archive.getmembers()
        assert len(members) == len(expected) and {member.name for member in members} == set(expected)
        for member in members:
            assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
            assert hashlib.sha256(archive.extractfile(member).read()).hexdigest() == expected[member.name]
        archive.extractall(stage)
    safe.frontend_files(stage / 'frontend', front)
    resources = protected()
    state.mkdir(mode=0o700)
    safe.copy_atomic(front / 'index.html', state / 'index.html')
    for name in (site + '.json', 'publish.py', 'safe-release.py'):
        safe.copy_atomic(stage / name, state / name)
    (state / 'protected.json').write_text(json.dumps(resources, sort_keys=True))
    status('prepared')
    print(site, 'prepared', len(changed), 'frontend files;', len(resources), 'protected entries')
elif action == 'activate':
    assert json.loads((state / 'status.json').read_text())['status'] == 'prepared'
    verify('before')
    verify_protected()
    files = safe.frontend_files(stage / 'frontend', front)
    try:
        for name in files:
            if name != 'index.html' and not (front / name).exists():
                safe.copy_atomic(stage / 'frontend' / name, front / name)
        safe.copy_atomic(stage / 'frontend/index.html', front / 'index.html')
        refresh_shell()
        verify('after')
        verify_protected()
        status('active')
        print(site, 'active; all hashes and protected resources verified')
    except BaseException:
        rollback()
        raise
elif action == 'verify':
    assert json.loads((state / 'status.json').read_text())['status'] == 'active'
    verify('after')
    verify_protected()
    print(site, 'verified active')
else:
    receipt = state / 'status.json'
    if receipt.is_file() and json.loads(receipt.read_text())['status'] in ('prepared', 'active'):
        rollback()
        print(site, 'rolled back')
