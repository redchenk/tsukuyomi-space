"""Package only new immutable assets, and the HTML entry."""
from hashlib import sha256
from pathlib import Path
import io
import json
import re
import sys
import tarfile

base = Path(sys.argv[1])
release = Path(__file__).resolve().parent
hashed = re.compile(r'assets/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+')

for site in ('domestic', 'overseas'):
    manifest_path = release / f'{site}.json'
    manifest = json.loads(manifest_path.read_text())
    assert manifest['site'] == site and 'after' not in manifest
    root = base / site
    payloads = {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*') if p.is_file()}
    assert 'index.html' in payloads and all(n == 'index.html' or hashed.fullmatch(n) for n in payloads)
    after = {n: sha256(data).hexdigest() for n, data in sorted(payloads.items())}
    changed = {n for n, digest in after.items() if manifest['before'].get(n) != digest}
    assert changed & manifest['before'].keys() == {'index.html'}, f'{site}: immutable asset collision or unchanged HTML'
    for prefix in ('water-mirror-enter-', 'water-mirror-standby-', 'water-mirror-poster-'):
        assert any(n.startswith('assets/' + prefix) for n in after), f'{site}: intro artwork missing'
    patch = {'frontend/' + n: payloads[n] for n in sorted(changed)}
    with tarfile.open(release / f'{site}.tgz', 'w:gz', compresslevel=6) as archive:
        for n, data in patch.items():
            entry = tarfile.TarInfo(n)
            entry.size = len(data)
            entry.mode = 0o644
            archive.addfile(entry, io.BytesIO(data))
    manifest['after'] = after
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    print(site, len(after), 'assets;', len(changed), 'updates')
