#!/usr/bin/env python3
"""Pull verified public installers into an isolated, latest-only download site."""
import argparse
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import tempfile
import time
import urllib.parse
import urllib.request

REPO = 'redchenk/tsukuyomi-space-app'
UPSTREAM = 'https://github.com/' + REPO
API = 'https://api.github.com/repos/' + REPO + '/releases?per_page=20'
ORIGIN = 'https://downloads.yachiyo.hk'
TAG = re.compile(r'^v(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:-([A-Za-z0-9][A-Za-z0-9.-]{0,59}))?$')
SUFFIXES = ('android-arm64-v8a.apk', 'android-x86_64.apk', 'macos-universal.dmg',
            'ios-arm64-unsigned.ipa', 'windows-x64-setup.exe', 'windows-x64.zip',
            'linux-x64.deb', 'linux-x64.tar.gz')
DOCS = {'INSTALL.md', 'THIRD_PARTY_NOTICES.md', 'SHA256SUMS.txt'}
OHOS_DOCS = {'OHOS-INSTALL.md', 'OHOS-THIRD-PARTY-NOTICES.md',
             'OHOS-SHA256SUMS.txt', 'OHOS-BUILD-INFO.json'}
OWNER = {'owner': REPO, 'schema': 1}
REDIRECT_HOSTS = {'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url = urllib.parse.urlsplit(newurl)
        require(url.scheme == 'https' and url.hostname in REDIRECT_HOSTS and
                url.port in (None, 443) and not url.username and not url.password and not url.fragment,
                'Rejected upstream redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url):
    request = urllib.request.Request(url, headers={
        'User-Agent': 'Tsukuyomi-Release-Distribution', 'Accept-Encoding': 'identity',
        'Accept': 'application/vnd.github+json' if url == API else 'application/octet-stream'})
    deadline = time.monotonic() + 20 * 60
    with urllib.request.build_opener(OfficialRedirect()).open(request, timeout=45) as response:
        require(response.status == 200, 'Upstream request failed')
        while True:
            require(time.monotonic() < deadline, 'Upstream download deadline exceeded')
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            yield chunk


def version_key(tag):
    match = TAG.fullmatch(tag)
    require(match is not None, 'Invalid version')
    pre = match[4]
    return (*map(int, match.group(1, 2, 3)), not bool(pre),
            tuple((0, int(x)) if x.isdigit() else (1, x) for x in (pre or '').split('.')))


def candidate(value):
    if not isinstance(value, dict):
        return None
    tag = value.get('tag_name', '')
    match = TAG.fullmatch(tag) if isinstance(tag, str) else None
    if not match or value.get('draft') is not False or type(value.get('prerelease')) is not bool:
        return None
    if value.get('html_url') != UPSTREAM + '/releases/tag/' + tag:
        return None
    if not isinstance(value.get('published_at'), str) or len(value['published_at']) > 40:
        return None
    try:
        datetime.datetime.fromisoformat(value['published_at'].replace('Z', '+00:00'))
    except ValueError:
        return None
    version = '.'.join(match.group(1, 2, 3))
    base = {f'tsukuyomi-space-{version}-{suffix}' for suffix in SUFFIXES} | DOCS
    rows = value.get('assets')
    if not isinstance(rows, list) or len(rows) > 100:
        return None
    assets = {}
    hap = re.compile(r'^tsukuyomi-space-' + re.escape(version) + r'-[1-9]\d{0,8}-ohos-arm64-unsigned\.hap$')
    for asset in rows:
        if not isinstance(asset, dict):
            continue
        name = asset.get('name', '')
        if not isinstance(name, str) or not (name in base | OHOS_DOCS or hap.fullmatch(name)):
            continue
        if name in assets:
            return None
        if (asset.get('state') != 'uploaded' or
                asset.get('browser_download_url') != f'{UPSTREAM}/releases/download/{tag}/{name}' or
                type(asset.get('size')) is not int or not 0 < asset['size'] <= 2 * 1024**3 or
                not re.fullmatch(r'sha256:[0-9a-f]{64}', str(asset.get('digest', '')))):
            return None
        asset_id = asset.get('id')
        api_url = f'https://api.github.com/repos/{REPO}/releases/assets/{asset_id}'
        if type(asset_id) is not int or asset_id <= 0 or asset.get('url') != api_url:
            return None
        assets[name] = {key: asset[key] for key in ('name', 'size', 'digest', 'state', 'browser_download_url')}
        assets[name]['api_download_url'] = api_url
    if not base <= assets.keys():
        return None
    haps = [name for name in assets if hap.fullmatch(name)]
    # A separately published HAP is exposed only with its complete guidance and provenance.
    allowed = base | OHOS_DOCS | set(haps) if len(haps) == 1 and OHOS_DOCS <= assets.keys() else base
    selected = [assets[name] for name in sorted(allowed)]
    if sum(a['size'] for a in selected) > 8 * 1024**3:
        return None
    return {'tag_name': tag, 'html_url': value['html_url'], 'draft': False,
            'prerelease': value['prerelease'], 'published_at': value['published_at'],
            'body': str(value.get('body') or '')[:20000], 'assets': selected}


def hash_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def initialize(root):
    require(not root.is_symlink(), 'Distribution root must not be a symlink')
    root.mkdir(parents=True, exist_ok=True)
    marker = root / '.distribution-owner.json'
    if not marker.exists():
        require(not any(root.iterdir()), 'Refusing to use a nonempty, unowned directory')
        write_json(marker, OWNER)
    require(not marker.is_symlink() and json.loads(marker.read_text()) == OWNER, 'Wrong directory owner marker')
    generations = root / 'generations'
    require(not generations.is_symlink(), 'Invalid generation directory')
    generations.mkdir(exist_ok=True)


def remove_generation(root, path):
    require(path.parent == root / 'generations' and not path.is_symlink() and path.is_dir(),
            'Cleanup escaped distribution generations')
    marker = path / '.owner.json'
    require(not marker.is_symlink() and json.loads(marker.read_text()) == OWNER, 'Refusing to remove unowned files')
    shutil.rmtree(path)


def active_generation(root):
    link = root / 'current'
    if not link.is_symlink():
        require(not link.exists(), 'Invalid current pointer')
        return None
    target = pathlib.PurePosixPath(os.readlink(link))
    require(len(target.parts) == 3 and target.parts[0] == 'generations' and target.parts[2] == 'public'
            and re.fullmatch(r'v[0-9A-Za-z.-]+-[0-9a-f]{16}', target.parts[1]), 'Invalid current target')
    generation = root / 'generations' / target.parts[1]
    require(not generation.is_symlink() and json.loads((generation / '.owner.json').read_text()) == OWNER,
            'Invalid active generation')
    return generation


def verify_manifests(directory, release):
    assets = {a['name']: a for a in release['assets']}
    covered = set()
    for name in ('SHA256SUMS.txt', 'OHOS-SHA256SUMS.txt'):
        if name not in assets:
            continue
        require((directory / name).stat().st_size <= 65536, 'Checksum manifest too large')
        for line in (directory / name).read_text().splitlines():
            match = re.fullmatch(r'([0-9a-fA-F]{64}) [ *](.+)', line)
            require(match is not None, 'Invalid checksum manifest')
            digest, filename = match.groups()
            require(filename in assets and filename not in covered and
                    assets[filename]['digest'] == 'sha256:' + digest.lower(), 'Manifest digest mismatch')
            covered.add(filename)
    require(covered == assets.keys() - {'SHA256SUMS.txt', 'OHOS-SHA256SUMS.txt'}, 'Incomplete checksum coverage')
    if 'OHOS-BUILD-INFO.json' in assets:
        require((directory / 'OHOS-BUILD-INFO.json').stat().st_size <= 65536, 'HAP provenance too large')
        info = json.loads((directory / 'OHOS-BUILD-INFO.json').read_text())
        require(info.get('release_tag') == release['tag_name'] and info.get('file') in assets and
                info.get('signed') is False and assets[info['file']]['digest'] == 'sha256:' + str(info.get('sha256')),
                'HAP provenance mismatch')


def install(root, release, read=fetch, reserve_bytes=5 * 1024**3):
    initialize(root)
    with (root / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        active = active_generation(root)
        identity = hashlib.sha256(json.dumps(release, sort_keys=True).encode()).hexdigest()[:16]
        name = release['tag_name'] + '-' + identity
        # Crash leftovers and old versions are confined to explicitly owned generations.
        for old in (root / 'generations').iterdir():
            if old != active:
                remove_generation(root, old)
        if active and active.name == name:
            return {'status': 'unchanged', 'tag': release['tag_name']}
        if active:
            previous = json.loads((active / 'source.json').read_text())
            require(version_key(release['tag_name']) >= version_key(previous['tag_name']), 'Refusing a downgrade')
        require(shutil.disk_usage(root).free >= reserve_bytes + sum(a['size'] for a in release['assets']),
                'Insufficient free space; keeping the current release')
        pending = pathlib.Path(tempfile.mkdtemp(prefix='.pending-', dir=root / 'generations'))
        write_json(pending / '.owner.json', OWNER)
        try:
            directory = pending / 'public' / 'releases' / release['tag_name']
            directory.mkdir(parents=True)
            for asset in release['assets']:
                path = directory / asset['name']
                prior = active / 'public' / 'releases' / release['tag_name'] / asset['name'] if active else None
                expected = asset['digest'][7:]
                if prior and prior.is_file() and not prior.is_symlink() and prior.stat().st_size == asset['size'] and hash_file(prior) == expected:
                    os.link(prior, path)
                    continue
                size = 0
                digest = hashlib.sha256()
                with path.open('xb') as output:
                    for chunk in read(asset['api_download_url']):
                        size += len(chunk)
                        require(size <= asset['size'], 'Download exceeded declared size')
                        output.write(chunk)
                        digest.update(chunk)
                require(size == asset['size'] and digest.hexdigest() == expected, 'Downloaded asset integrity mismatch')
                print(json.dumps({'verified_asset': asset['name'], 'bytes': size}), flush=True)
            verify_manifests(directory, release)
            public = json.loads(json.dumps(release))
            for asset in public['assets']:
                del asset['api_download_url']
                asset['browser_download_url'] = f"{ORIGIN}/releases/{release['tag_name']}/{asset['name']}"
            write_json(pending / 'public' / 'releases.json', [public])
            write_json(pending / 'source.json', release)
            # mkdtemp is private; allow Nginx to traverse only the verified generation.
            pending.chmod(0o755)
            final = root / 'generations' / name
            pending.rename(final)
            temporary = root / '.current-next'
            require(not temporary.exists() or temporary.is_symlink(), 'Invalid temporary pointer')
            with contextlib.suppress(FileNotFoundError):
                temporary.unlink()
            temporary.symlink_to(f'generations/{name}/public')
            os.replace(temporary, root / 'current')
            if active:
                remove_generation(root, active)
            return {'status': 'published', 'tag': release['tag_name'], 'asset_count': len(release['assets'])}
        finally:
            if pending.exists():
                remove_generation(root, pending)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, required=True)
    args = parser.parse_args()
    data = bytearray()
    for chunk in fetch(API):
        data.extend(chunk)
        require(len(data) <= 1024 * 1024, 'Release metadata too large')
    values = json.loads(data)
    require(isinstance(values, list), 'Invalid release list')
    releases = [r for value in values[:20] if (r := candidate(value))]
    require(releases, 'No complete published release')
    latest = max(releases, key=lambda r: version_key(r['tag_name']))
    print(json.dumps(install(args.root, latest)), flush=True)


if __name__ == '__main__':
    main()
