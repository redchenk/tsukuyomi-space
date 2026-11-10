from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
import json, re, sys, urllib.request
root = Path(sys.argv[1])
asset_url = re.compile(rb'/assets/[A-Za-z0-9._-]+\.(?:js|css)\b')
headers = {'Cache-Control': 'no-cache', 'User-Agent': 'Tsukuyomi-release-verification'}

def verify(site, origin):
    build = root / site
    def fetch(path):
        with urllib.request.urlopen(urllib.request.Request(origin + '/' + path, headers=headers), timeout=16) as response:
            return response.read()
    assert json.loads(fetch('api/health')).get('status') == 'ok', site
    expected = set(asset_url.findall((build / 'index.html').read_bytes()))
    for route in ('', 'hub', 'room'):
        html = fetch(route)
        assert expected and expected.issubset(asset_url.findall(html)), f'{site} still serves earlier HTML'
    assets = {build / ref.decode().lstrip('/') for ref in expected}
    for prefix in ('AccessPage-', 'RoomPage-', 'water-mirror-enter-', 'water-mirror-standby-',
                   'water-mirror-poster-', 'moonlight-corridor-', 'yachiyo-welcome-', 'gallery-frame-', 'wiki-frame-'):
        suffix = '*.js' if prefix in ('AccessPage-', 'RoomPage-') else '*'
        matches = list((build / 'assets').glob(prefix + suffix))
        assert len(matches) == 1, (site, prefix, matches)
        assets.update(matches)
    def check(path):
        relative = path.relative_to(build).as_posix()
        assert sha256(fetch(relative)).digest() == sha256(path.read_bytes()).digest(), (site, relative)
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(check, assets))
    return {'site': site, 'origin': origin, 'health': 'ok', 'checked_public_assets': len(assets)}

with ThreadPoolExecutor(2) as pool:
    checks = [pool.submit(verify, site, origin) for site, origin in [('domestic','https://yachiyo.hk'),('overseas','https://tsukuyomi-space.com')]]
    print(json.dumps([check.result() for check in checks]))
