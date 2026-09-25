#!/usr/bin/env python3
"""Prepare, publish, verify and roll back code-only releases on either host.

Run this copy from the uploaded staging directory, not the checkout being updated.
Only Python's standard library is required, including on the overseas frontend host.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time


PROTECTED = ('assets', 'lib', 'models', 'models-v3', 'models-v4', 'live2d-core.js',
             'dist/live2d-studio', 'game-assets', 'game-runtime')
FRONTEND_PROTECTED = ('assets/music', 'assets/video', 'assets/audio', 'assets/uploads',
                      'lib', 'models', 'models-v3', 'models-v4', 'live2d-core.js',
                      'live2d-studio', 'game-assets', 'game-runtime')
CODE_DIRS = ('backend', 'shared', 'src', 'scripts', 'tests', 'deploy', 'docs', '.github', 'live2d-studio')
CODE_FILES = ('package.json', 'package-lock.json', 'Dockerfile', '.dockerignore', '.gitignore',
              '.gitattributes', '.env.example', '.env.docker.example', '.env.overseas',
              'docker-compose.yml', 'docker-compose.resources.example.yml',
              'vite.config.js', 'vite.frontend.config.js', 'playwright.config.js',
              'README.md', 'README_EN.md', 'LICENSE', 'design.md', 'design-qa.md')
ASSET_NAME = re.compile(r'^[^/\\]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9.]+$')
DEPENDENCY_FIELDS = ('dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies',
                     'peerDependenciesMeta', 'overrides', 'workspaces', 'config', 'os', 'cpu', 'libc', 'packageManager')
INSTALL_SCRIPTS = ('preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(args, cwd=None):
    return subprocess.check_output(args, cwd=cwd)


def git(root, *args):
    # Production only imports a CI bundle. Never start a repository-wide GC or
    # use one pack/index worker per CPU on the small production host.
    return run(['git', '-c', 'core.hooksPath=/dev/null', '-c', 'gc.auto=0',
                '-c', 'maintenance.auto=false', '-c', 'pack.threads=1',
                '-c', 'index.threads=1', '-c', 'pack.windowMemory=32m',
                '-c', 'core.deltaBaseCacheLimit=32m', *args], cwd=root)


def beneath(name, roots):
    return any(name == root or name.startswith(root + '/') for root in roots)


def code_path(name):
    return not beneath(name, PROTECTED) and (name in CODE_FILES or beneath(name, CODE_DIRS))


def changed_paths(root, before, after):
    return [os.fsdecode(p) for p in git(root, 'diff', '--no-renames', '--name-only', '-z', before, after).split(b'\0') if p]


def dependency_install_needed(root, before, after, paths):
    if 'package-lock.json' in paths:
        return True
    if 'package.json' not in paths:
        return False
    old = json.loads(git(root, 'show', before + ':package.json'))
    new = json.loads(git(root, 'show', after + ':package.json'))
    return (any(old.get(key) != new.get(key) for key in DEPENDENCY_FIELDS)
            or any(old.get('scripts', {}).get(key) != new.get('scripts', {}).get(key) for key in INSTALL_SCRIPTS))


def check_git(root, before, after, environment_release=False):
    git(root, 'merge-base', '--is-ancestor', before, after)
    paths = changed_paths(root, before, after)
    forbidden = [p for p in paths if not code_path(p)]
    require(not forbidden, 'Code-only release would change protected/unmanaged paths: ' + ', '.join(forbidden))
    for name in paths:
        current = Path(root)
        for part in Path(name).parts:
            current /= part
            require(not current.is_symlink(), 'Code path crosses an existing symlink: ' + name)
    # Schema changes need an explicit migration/restore plan rather than an
    # automatic code rollback against an unknown database schema.
    migrations = [p for p in paths if p.startswith('backend/db/migrations/')]
    require(not migrations, 'Database migration changes require a separate migration release: ' + ', '.join(migrations))
    require(not any(p in ('backend/package.json', 'backend/package-lock.json') for p in paths)
            and (environment_release or not dependency_install_needed(root, before, after, paths)),
            'Dependency changes require a separate environment release with a dependency rollback plan')
    if 'package.json' in paths:
        old_package = json.loads(git(root, 'show', before + ':package.json'))
        new_package = json.loads(git(root, 'show', after + ':package.json'))
        require(old_package.get('engines') == new_package.get('engines'),
                'Dependency/runtime changes require a separate environment release: engines')
    for entry in git(root, 'ls-tree', '-r', '-z', after).split(b'\0'):
        if not entry:
            continue
        metadata, name = entry.split(b'\t', 1)
        if os.fsdecode(name) in paths:
            require(metadata.split()[0] in (b'100644', b'100755'), 'Code release cannot install symlinks or submodules: ' + os.fsdecode(name))
    return paths


def prepare_dependencies(state):
    """Install a locked dependency tree without touching the running application.

    The active tree is moved to the release backup only during activation; a
    rollback moves it back verbatim. No npm command runs in the live checkout.
    """
    root = Path(state['root'])
    dependency_root = root / '.release-dependencies'
    require(not dependency_root.is_symlink(), 'Dependency staging cannot be a symlink')
    dependency_root.mkdir(exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='environment-', dir=dependency_root))
    require((root / 'node_modules').is_dir() and not (root / 'node_modules').is_symlink(),
            'Environment release requires a regular existing node_modules tree')
    for name in ('package.json', 'package-lock.json'):
        (stage / name).write_bytes(git(root, 'show', state['target'] + ':' + name))
    subprocess.check_call(['npm', 'ci', '--omit=dev', '--no-audit', '--no-fund'], cwd=stage,
                          env=dict(os.environ, npm_config_jobs='1'))
    subprocess.check_call(['npm', 'ls', '--omit=dev', '--depth=0'], cwd=stage)
    subprocess.check_call(['node', '-e', "const D=require('better-sqlite3');const d=new D(':memory:');d.prepare('select 1').get();d.close();if(require('./package.json').dependencies?.mem0ai)require('mem0ai/oss');"], cwd=stage,
                          env=dict(os.environ, MEM0_TELEMETRY='false', DOTENV_CONFIG_QUIET='true'))
    state['dependencies'] = {'stage': str(stage), 'lock_hash': sha(stage / 'package-lock.json'),
                             'previous': str(stage / 'previous-node_modules')}


def activate_dependencies(state):
    dependency = state.get('dependencies')
    if not dependency:
        return
    root, stage = Path(state['root']), Path(dependency['stage'])
    require(sha(root / 'package-lock.json') == dependency['lock_hash'], 'Prepared dependency lock does not match release')
    require(not Path(dependency['previous']).exists(), 'Dependency backup already exists')
    # Persist the plan before either rename so rollback also handles a process
    # interruption between the two operations. Both paths are on one filesystem.
    os.replace(root / 'node_modules', dependency['previous'])
    os.replace(stage / 'node_modules', root / 'node_modules')


def rollback_dependencies(state):
    dependency = state.get('dependencies')
    if not dependency or not Path(dependency['previous']).exists():
        return
    root, stage = Path(state['root']), Path(dependency['stage'])
    if (root / 'node_modules').exists():
        require(not (stage / 'failed-node_modules').exists(), 'Failed dependency tree already exists')
        os.replace(root / 'node_modules', stage / 'failed-node_modules')
    os.replace(dependency['previous'], root / 'node_modules')


def sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def resource_manifest(root, site, extra=()):
    result = {}

    def visit(path, name, ancestors=()):
        if not path.exists() and not path.is_symlink():
            result[name] = None
            return
        info = path.lstat()
        item = {'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid}
        # Uploads can change while the application is serving users. Protect the
        # deployment boundary and directory identity, not live user data hashes.
        if name == 'assets/uploads':
            item['link'] = os.readlink(path) if path.is_symlink() else None
            result[name] = item
            return
        item['mtime_ns'] = info.st_mtime_ns
        if path.is_symlink():
            item['link'] = os.readlink(path)
            result[name] = item
            target = path.resolve()
            require(str(target) not in ancestors, 'Cyclic resource symlink: ' + name)
            visit(target, name + '/@target', (*ancestors, str(target)))
        elif path.is_dir():
            item['type'] = 'dir'
            result[name] = item
            for child in sorted(path.iterdir()):
                visit(child, name + '/' + child.name, ancestors)
        elif path.is_file():
            item.update(type='file', size=info.st_size, sha256=sha(path))
            result[name] = item
        else:
            raise RuntimeError('Unsupported resource type: ' + str(path))

    for name in PROTECTED if site == 'domestic' else FRONTEND_PROTECTED:
        visit(Path(root) / name, name)
    for path in extra:
        visit(Path(path), 'external:' + str(path))
    return result


def verify_resources(state):
    actual = resource_manifest(state['root'], state['site'], state['extra_resources'])
    expected = json.loads((Path(state['state_dir']) / 'resources.json').read_text())
    changes = [p for p in sorted(actual.keys() | expected.keys()) if actual.get(p) != expected.get(p)]
    require(not changes, 'Protected resources changed; no automatic resource restore will run: ' + ', '.join(changes[:20]))


def frontend_files(source, destination):
    source, destination = Path(source), Path(destination)
    require(source.is_dir() and not source.is_symlink(), 'Missing or symlinked frontend artifact')
    require((source / 'index.html').is_file(), 'Missing frontend index.html')
    files = []
    for path in sorted(source.rglob('*')):
        require(not path.is_symlink(), 'Artifact symlinks are not allowed: ' + str(path))
        relative = path.relative_to(source)
        name = relative.as_posix()
        if path.is_dir():
            require(name == 'assets', 'Unexpected artifact directory: ' + name)
            continue
        require(path.is_file(), 'Unexpected artifact entry: ' + name)
        require(name == 'index.html' or (len(relative.parts) == 2 and relative.parts[0] == 'assets' and ASSET_NAME.fullmatch(relative.name)),
                'Only index.html and flat hashed assets can be published: ' + name)
        target = destination / relative
        require(not target.is_symlink() and not (destination / 'assets').is_symlink(), 'Refusing to overwrite a frontend symlink: ' + name)
        if target.exists():
            require(target.is_file(), 'Frontend target is not a file: ' + name)
            if name != 'index.html':
                require(sha(path) == sha(target), 'Existing hashed asset has different content: ' + name)
        files.append(name)
    require(bool(files), 'Empty frontend artifact')
    return files


def copy_atomic(source, target):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.tsukuyomi-', dir=target.parent)
    os.close(fd)
    try:
        shutil.copy2(source, temp)
        os.replace(temp, target)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def save(state):
    directory = Path(state['state_dir'])
    fd, temp = tempfile.mkstemp(prefix='.state-', dir=directory)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(json.dumps(state, indent=2) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, directory / 'state.json')
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def check_frontend_target(state):
    require(str(Path(state['frontend']).resolve()) == state['frontend_real'], 'Frontend symlink target changed since preparation')
    index = Path(state['frontend_real']) / 'index.html'
    require(index.is_file() and not index.is_symlink(), 'Frontend index is missing or symlinked')


def prepare(args):
    state_dir = Path(args.state).absolute()
    require(not state_dir.exists(), 'Release state already exists; use a new release id')
    root = Path(args.root).absolute()
    frontend = Path(args.frontend).absolute()
    require(root.is_dir() and frontend.is_dir(), 'Existing application/frontend directory is required')
    require((frontend / 'index.html').is_file() and not (frontend / 'index.html').is_symlink(), 'Existing regular index.html is required for rollback')
    files = frontend_files(args.artifact, frontend)
    state = dict(format='tsukuyomi-release-v1', site=args.site, root=str(root), frontend=str(frontend), frontend_real=str(frontend.resolve()),
                 artifact=str(Path(args.artifact).resolve()), state_dir=str(state_dir), status='preparing',
                 extra_resources=args.extra_resource, base_url=args.base_url, resolve=args.resolve,
                 files=files, index_before=sha(frontend / 'index.html'), index_after=sha(Path(args.artifact) / 'index.html'))
    if args.site == 'domestic':
        require(args.bundle and args.commit, 'Domestic release requires a bundle and commit')
        git(root, 'fetch', str(Path(args.bundle).resolve()), 'refs/heads/codex-deploy')
        target = git(root, 'rev-parse', 'FETCH_HEAD').decode().strip()
        require(target == args.commit, 'Bundle commit does not match requested commit')
        before = git(root, 'rev-parse', 'HEAD').decode().strip()
        environment_release = bool(getattr(args, 'environment_release', False))
        paths = check_git(root, before, target, environment_release)
        require(not git(root, 'diff', '--cached', '--name-only'), 'Staged server edits need review before deployment')
        dirty = [os.fsdecode(p) for p in git(root, 'diff', '--name-only', '-z').split(b'\0') if p]
        adopted = []
        for name in dirty:
            if beneath(name, PROTECTED):
                continue
            require(name in paths and code_path(name), 'Uncommitted server edit needs review: ' + name)
            path = root / name
            require(path.is_file() and not path.is_symlink() and path.read_bytes() == git(root, 'show', target + ':' + name),
                    'Incoming code does not exactly preserve server edit: ' + name)
            adopted.append(name)
        untracked = {os.fsdecode(p) for p in git(root, 'ls-files', '--others', '--exclude-standard', '-z').split(b'\0') if p}
        require(not any(beneath(name, untracked) for name in paths), 'Incoming code collides with untracked server files')
        state.update(before=before, target=target, paths=paths, adopted=adopted,
                     environment_release=environment_release,
                     worktree_patch=hashlib.sha256(git(root, 'diff', '--binary', 'HEAD')).hexdigest())
    state_dir.mkdir(parents=True, mode=0o700)
    os.chmod(state_dir, 0o700)
    shutil.copy2(__file__, state_dir / 'release.py')
    shutil.copy2(frontend / 'index.html', state_dir / 'index.before.html')
    (state_dir / 'resources.json').write_text(json.dumps(resource_manifest(root, args.site, args.extra_resource), sort_keys=True))
    if args.site == 'domestic':
        (state_dir / 'server-edits.patch').write_bytes(git(root, 'diff', '--binary', 'HEAD', '--', *state['adopted']) if state['adopted'] else b'')
        index = git(root, 'rev-parse', '--git-path', 'index').decode().strip()
        state['git_index'] = str((root / index).resolve())
        shutil.copy2(state['git_index'], state_dir / 'git-index.before')
        if state.get('environment_release') and dependency_install_needed(root, state['before'], state['target'], state['paths']):
            prepare_dependencies(state)
    state['status'] = 'prepared'
    save(state)
    return state


def restart(state):
    if state['site'] == 'domestic':
        subprocess.check_call(['pm2', 'startOrReload', 'deploy/ecosystem.config.cjs', '--update-env'], cwd=state['root'])
        subprocess.check_call(['pm2', 'save'], cwd=state['root'])


def activate(state):
    require(state['status'] == 'prepared', 'Release must be prepared before activation')
    check_frontend_target(state)
    require(sha(Path(state['frontend_real']) / 'index.html') == state['index_before'], 'Frontend changed after preparation')
    verify_resources(state)
    frontend_files(state['artifact'], state['frontend_real'])
    if state['site'] == 'domestic':
        require(git(state['root'], 'rev-parse', 'HEAD').decode().strip() == state['before'], 'Server HEAD changed after preparation')
        check_git(state['root'], state['before'], state['target'], state.get('environment_release', False))
        require(hashlib.sha256(git(state['root'], 'diff', '--binary', 'HEAD')).hexdigest() == state['worktree_patch'], 'Server edit changed after preparation')
        require(not git(state['root'], 'diff', '--cached', '--name-only'), 'Server index changed after preparation')
        untracked = {os.fsdecode(p) for p in git(state['root'], 'ls-files', '--others', '--exclude-standard', '-z').split(b'\0') if p}
        require(not any(beneath(name, untracked) for name in state['paths']), 'Incoming code collides with new server files')
    state['status'] = 'activating'
    save(state)
    if state['site'] == 'domestic':
        # Adopt only byte-identical incoming fixes, preserving existing content.
        for name in state['adopted']:
            require((Path(state['root']) / name).read_bytes() == git(state['root'], 'show', state['target'] + ':' + name), 'Server edit changed after preparation')
            git(state['root'], 'add', '--', name)
        git(state['root'], 'merge', '--ff-only', state['target'])
        activate_dependencies(state)
    for name in state['files']:
        if name != 'index.html' and not (Path(state['frontend_real']) / name).exists():
            copy_atomic(Path(state['artifact']) / name, Path(state['frontend_real']) / name)
    # Publish the entry only after every immutable asset is available.
    copy_atomic(Path(state['artifact']) / 'index.html', Path(state['frontend_real']) / 'index.html')
    if state['site'] == 'domestic':
        env = dict(os.environ, APP_DIR=state['root'], BUILD_ON_SERVER='false', INSTALL_NGINX_CONFIG='false',
                   HARDEN_OPENRESTY_ORIGIN='false', INSTALL_SERVER_MAINTENANCE='false')
        subprocess.check_call(['bash', 'deploy/deploy.sh', '--code-only'], cwd=state['root'], env=env)
    state['status'] = 'active'
    save(state)
    verify(state)


def fetch(state, path):
    args = ['curl', '--fail', '--silent', '--show-error', '--connect-timeout', '5', '--max-time', '15',
            '-H', 'Cache-Control: no-cache', '-H', 'Sec-Fetch-Mode: navigate', '-A', 'Mozilla/5.0 TsukuyomiReleaseCheck']
    if state['resolve']:
        args += ['--resolve', state['resolve']]
    return run([*args, state['base_url'].rstrip('/') + path])


def verify(state, attempts=15):
    require(state['status'] in ('active', 'rolled_back'), 'Only an activated or rolled-back release can be verified')
    check_frontend_target(state)
    expected = state['index_before'] if state['status'] == 'rolled_back' else state['index_after']
    require(sha(Path(state['frontend_real']) / 'index.html') == expected, 'Frontend entry does not match this release')
    verify_resources(state)
    for attempt in range(attempts):
        try:
            health = json.loads(fetch(state, '/api/health'))
            require(health.get('status') == 'ok', 'API health response is not ok')
            html = fetch(state, '/?release-check=' + expected[:16])
            require(hashlib.sha256(html).hexdigest() == expected, 'HTTP frontend entry is stale or incorrect')
            # Only hashed build assets live in frontend_real. Static icons/media
            # are served from the resource root (or an upstream on overseas).
            # Their local contents remain covered by verify_resources above.
            references = [reference for reference in re.findall(rb'(?:src|href)="(/assets/[^"?]+)', html)
                          if reference.count(b'/') == 2 and ASSET_NAME.fullmatch(reference.rsplit(b'/', 1)[1].decode())]
            require(references, 'Frontend has no built asset references')
            for reference in set(references):
                name = reference.decode().lstrip('/')
                require(hashlib.sha256(fetch(state, '/' + name)).hexdigest() == sha(Path(state['frontend_real']) / name), 'HTTP asset mismatch: ' + name)
            print('Health, frontend assets and protected resources verified:', state['site'])
            return
        except (RuntimeError, subprocess.CalledProcessError, ValueError) as error:
            if attempt + 1 == attempts:
                raise RuntimeError('Release verification failed: ' + str(error)) from error
            time.sleep(2)


def rollback(state):
    if state['status'] == 'rolled_back':
        verify(state)
        return
    if state['status'] == 'prepared':
        print('No active change to roll back:', state['site'])
        return
    require(state['status'] in ('activating', 'active'), 'Cannot roll back this release state')
    check_frontend_target(state)
    require(sha(Path(state['frontend_real']) / 'index.html') in (state['index_before'], state['index_after']),
            'Refusing rollback over a newer or manually edited frontend entry')
    if state['site'] == 'domestic':
        head = git(state['root'], 'rev-parse', 'HEAD').decode().strip()
        require(head in (state['before'], state['target']), 'Refusing rollback over a newer server commit')
        if state['paths']:
            # Restore only the allowlisted code paths, never the whole worktree.
            git(state['root'], 'restore', '--source=' + state['before'], '--staged', '--worktree', '--', *state['paths'])
        git(state['root'], 'update-ref', 'HEAD', state['before'], head)
        patch = Path(state['state_dir']) / 'server-edits.patch'
        if patch.stat().st_size:
            git(state['root'], 'apply', str(patch))
        shutil.copy2(Path(state['state_dir']) / 'git-index.before', state['git_index'])
        rollback_dependencies(state)
    copy_atomic(Path(state['state_dir']) / 'index.before.html', Path(state['frontend_real']) / 'index.html')
    restart(state)
    state['status'] = 'rolled_back'
    save(state)
    # New hashed files are intentionally retained. No user data or media is deleted.
    verify(state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('prepare', 'activate', 'verify', 'rollback', 'check-git'))
    parser.add_argument('--state')
    parser.add_argument('--site', choices=('domestic', 'overseas'))
    parser.add_argument('--root')
    parser.add_argument('--frontend')
    parser.add_argument('--artifact')
    parser.add_argument('--bundle')
    parser.add_argument('--commit')
    parser.add_argument('--before', default='HEAD~1')
    parser.add_argument('--base-url')
    parser.add_argument('--resolve', default='')
    parser.add_argument('--extra-resource', action='append', default=[])
    parser.add_argument('--environment-release', action='store_true', help='Stage locked dependencies with verbatim rollback of the prior tree')
    args = parser.parse_args()
    if args.command == 'check-git':
        check_git(args.root or '.', args.before, args.commit or 'HEAD')
        return
    require(args.state, '--state is required')
    parent = Path(args.state).absolute().parent
    parent.mkdir(parents=True, exist_ok=True)
    with (parent / '.release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.command == 'prepare':
            require(all((args.site, args.root, args.frontend, args.artifact, args.base_url)), 'Missing prepare arguments')
            state = prepare(args)
        else:
            state = json.loads((Path(args.state) / 'state.json').read_text())
            if args.command == 'activate':
                activate(state)
            elif args.command == 'rollback':
                rollback(state)
            else:
                verify(state)
        print('Release state:', state['site'], state['status'])


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
