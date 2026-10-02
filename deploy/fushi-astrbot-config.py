#!/usr/bin/env python3
"""Scoped, backed-up AstrBot public-client and callback-proxy configuration.

No credentials or OAuth grants are created. Run prepare before code activation,
activate after deploying the callback, and rollback before rolling code back.
Backups may contain secrets and must remain root-only on the original server.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

CLIENT_ID = 'tsukuyomi-fushi-astrbot'
CALLBACK = '/fushi/astrbot/callback'
ENV_KEY = 'FUSHI_OAUTH_EXTRA_CLIENTS_JSON'
REDIRECT = 'https://yachiyo.hk' + CALLBACK
OPENRESTY = '/usr/local/openresty/nginx/sbin/nginx'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def merge_client(text):
    lines = text.splitlines(keepends=True)
    indices = [i for i, line in enumerate(lines) if line.strip().startswith(ENV_KEY + '=')]
    require(len(indices) <= 1, 'Duplicate extra-client environment entries')
    extra = json.loads(lines[indices[0]].strip().split('=', 1)[1]) if indices else []
    require(isinstance(extra, list) and len(extra) <= 8, 'Invalid existing extra-client list')
    matches = [item for item in extra if isinstance(item, dict) and item.get('client_id') == CLIENT_ID]
    require(len(matches) <= 1, 'Duplicate AstrBot client')
    expected = {'client_id': CLIENT_ID, 'redirect_uris': [REDIRECT]}
    if matches:
        require(matches[0] == expected, 'Existing AstrBot registration differs; refusing to expand or overwrite it')
    else:
        require(len(extra) < 8, 'Extra-client list is full')
        extra.append(expected)
    # ecosystem.config.cjs reads literal values, without shell quote removal.
    line = ENV_KEY + '=' + json.dumps(extra, separators=(',', ':')) + '\n'
    if indices:
        lines[indices[0]] = line
    else:
        if lines and not lines[-1].endswith('\n'):
            lines[-1] += '\n'
        lines.append(line)
    return ''.join(lines)


def callback_headers(text):
    pattern = re.compile(r'(?m)^(\s*add_header\s+Referrer-Policy\s+)[^;]+;')
    require(len(pattern.findall(text)) == 1, 'Expected exactly one Referrer-Policy header')
    return pattern.sub(r'\1no-referrer always;', text)


def callback_location(include, frontend=None):
    lines = ['# AstrBot one-use callback: no query retention or shared caching.',
             'location = ' + CALLBACK + ' {',
             '    access_log off;', '    error_log /dev/null crit;', '    expires off;']
    if frontend:
        lines.append('    try_files ' + frontend + ' =404;')
    else:
        lines += ['    proxy_pass http://127.0.0.1:3280;', '    proxy_http_version 1.1;',
                  '    proxy_set_header Host $host;', '    proxy_set_header X-Real-IP $remote_addr;',
                  '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
                  '    proxy_set_header X-Forwarded-Proto $scheme;', '    proxy_cache off;',
                  '    proxy_no_cache 1;', '    proxy_cache_bypass 1;']
        # A local proxy_hide_header list replaces inherited lists: retain them all.
        for name in ('Cache-Control', 'Surrogate-Control', 'X-Robots-Tag',
                     'Content-Security-Policy', 'Strict-Transport-Security',
                     'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy',
                     'Permissions-Policy', 'X-Permitted-Cross-Domain-Policies',
                     'Origin-Agent-Cluster', 'Cross-Origin-Opener-Policy',
                     'Cross-Origin-Resource-Policy', 'X-XSS-Protection'):
            lines.append('    proxy_hide_header ' + name + ';')
    lines += ['    add_header Cache-Control "private, no-store" always;',
              '    add_header Surrogate-Control "no-store" always;',
              '    add_header X-Robots-Tag "noindex, nofollow" always;',
              '    include ' + include + ';', '}']
    return '\n'.join(lines) + '\n'


def plans(site):
    if site == 'domestic':
        env = Path('/etc/tsukuyomi-space/tsukuyomi-space.env')
        require(env.stat().st_uid == 0 and env.stat().st_mode & 0o077 == 0, 'Environment must be root-only')
        native = Path('/etc/nginx/snippets/fushi-mcp.conf')
        require(CALLBACK not in native.read_text(), 'Callback already configured; inspect before modifying')
        proxy = Path('/opt/1panel/www/sites/yachiyo.hk/proxy')
        public = proxy / '04-astrbot-fushi-callback.conf'
        internal_headers = Path('/etc/nginx/snippets/fushi-astrbot-callback-security-headers.inc')
        public_headers = proxy / '_tsukuyomi-fushi-callback-security-headers.inc'
        require(not public.exists() and not internal_headers.exists() and not public_headers.exists(),
                'Callback config paths already exist')
        return [(internal_headers, callback_headers(Path('/var/www/tsukuyomi-space/deploy/security-headers.inc').read_text())),
                (native, native.read_text().rstrip() + '\n\n' + callback_location(str(internal_headers), '/dist/frontend/index.html')),
                (public_headers, callback_headers((proxy / '_tsukuyomi-security-headers.inc').read_text())),
                (public, callback_location('/www/sites/yachiyo.hk/proxy/' + public_headers.name)),
                (env, merge_client(env.read_text()))]
    folder = Path('/opt/1panel/www/conf.d')
    config = folder / 'tsukuyomi-space.com.conf'
    header = folder / '_tsukuyomi-space-fushi-callback-security-headers.inc'
    text = config.read_text()
    anchor = '    root /www/sites/tsukuyomi-space.com/frontend;'
    require(text.count(anchor) == 1 and CALLBACK not in text and not header.exists(), 'Unexpected overseas callback configuration')
    block = callback_location('/usr/local/openresty/nginx/conf/conf.d/' + header.name, '/index.html')
    return [(header, callback_headers((folder / '_tsukuyomi-space-security-headers.inc').read_text())),
            (config, text.replace(anchor, anchor + '\n\n' + '\n'.join('    ' + line for line in block.splitlines()) + '\n', 1))]


def atomic(path, data, mode, uid, gid):
    require(not path.is_symlink(), 'Refusing a symlink target')
    fd, name = tempfile.mkstemp(prefix='.astrbot-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
            os.fchown(stream.fileno(), uid, gid)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def write_state(folder, state):
    atomic(folder / 'config-state.json', json.dumps(state, indent=2).encode(), 0o600, 0, 0)


def prepare(folder, site):
    require(not folder.exists(), 'Config backup directory already exists')
    changes = plans(site)
    folder.mkdir(parents=True, mode=0o700)
    os.chmod(folder, 0o700)
    state = {'site': site, 'status': 'prepared', 'files': []}
    for index, (path, text) in enumerate(changes):
        require(not path.is_symlink(), 'Refusing a symlink target')
        original = path.read_bytes() if path.exists() else None
        info = path.stat() if path.exists() else None
        data = text.encode()
        atomic(folder / ('new-' + str(index)), data, 0o600, 0, 0)
        if original is not None:
            atomic(folder / ('old-' + str(index)), original, 0o600, 0, 0)
        state['files'].append({'path': str(path), 'before': digest(original) if original is not None else None,
                               'after': digest(data), 'mode': info.st_mode & 0o777 if info else 0o644,
                               'uid': info.st_uid if info else 0, 'gid': info.st_gid if info else 0})
    atomic(folder / 'config.py', Path(__file__).read_bytes(), 0o600, 0, 0)
    write_state(folder, state)
    return state


def validate_and_reload(site):
    container = '1Panel-openresty-h9Tv' if site == 'domestic' else '1Panel-openresty-HX9X'
    public = ['docker', 'exec', container, OPENRESTY]
    commands = ([['nginx', '-t']] if site == 'domestic' else []) + [[*public, '-t']]
    # Validate all configs before any live process reload.
    for command in commands:
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        require(result.returncode == 0, 'Nginx config validation failed; use nginx -t locally for diagnostics')
    if site == 'domestic':
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run([*public, '-s', 'reload'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if site == 'domestic':
        subprocess.run(['pm2', 'startOrReload', 'deploy/ecosystem.config.cjs', '--update-env'],
                       cwd='/var/www/tsukuyomi-space', check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['pm2', 'save'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def change(folder, state, rollback=False):
    require(state['status'] in (('active', 'activating') if rollback else ('prepared',)), 'Invalid config state')
    for item in state['files']:
        path = Path(item['path'])
        require(not path.is_symlink(), 'Refusing a symlink target')
        current = digest(path.read_bytes()) if path.exists() else None
        require(current in ((item['before'], item['after']) if rollback else (item['before'],)),
                'Configuration changed after preparation; refusing overwrite')
        if path.exists():
            info = path.stat()
            require((info.st_mode & 0o777, info.st_uid, info.st_gid) == (item['mode'], item['uid'], item['gid']),
                    'Configuration ownership or permissions changed')
    # Verify the whole rollback plan before changing any live file.
    for index, item in enumerate(state['files']):
        require(digest((folder / ('new-' + str(index))).read_bytes()) == item['after'], 'Staged config hash mismatch')
        if item['before'] is not None:
            require(digest((folder / ('old-' + str(index))).read_bytes()) == item['before'], 'Backup hash mismatch')
    state['status'] = 'activating'
    write_state(folder, state)
    for index, item in enumerate(state['files']):
        path = Path(item['path'])
        if rollback and item['before'] is None:
            if path.exists():
                path.unlink()
            continue
        data = (folder / (('old-' if rollback else 'new-') + str(index))).read_bytes()
        require(digest(data) == (item['before'] if rollback else item['after']), 'Backup hash mismatch')
        atomic(path, data, item['mode'], item['uid'], item['gid'])
    validate_and_reload(state['site'])
    state['status'] = 'rolled_back' if rollback else 'active'
    write_state(folder, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('prepare', 'activate', 'rollback'))
    parser.add_argument('--site', choices=('domestic', 'overseas'))
    parser.add_argument('--state', required=True)
    args = parser.parse_args()
    require(os.geteuid() == 0, 'Run as root on the target host')
    folder = Path(args.state).absolute()
    folder.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (folder.parent / '.astrbot-config.lock').open('a') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.command == 'prepare':
            require(args.site, '--site is required for preparation')
            state = prepare(folder, args.site)
        else:
            state = json.loads((folder / 'config-state.json').read_text())
            try:
                change(folder, state, rollback=args.command == 'rollback')
            except (RuntimeError, OSError, subprocess.SubprocessError):
                if args.command == 'activate' and state['status'] == 'activating':
                    change(folder, state, rollback=True)
                raise
        print(json.dumps({'site': state['site'], 'status': state['status'], 'config_files': len(state['files'])}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError):
        raise SystemExit('Config operation failed; inspect locally without exporting secret configuration')
    except RuntimeError as error:
        raise SystemExit(str(error))
