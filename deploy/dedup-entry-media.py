"""Coalesce identical, immutable old entrance media in production release stages."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

current = Path(sys.argv[1]).resolve()
meta = json.loads(Path(sys.argv[2]).read_text())
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

assert digest(current / 'index.html') == meta['after']
saved = 0
linked = 0
# Only content-addressed files with the reference release's exact bytes qualify.
# Their old URLs can still be requested by cached tabs or an immediate rollback.
for name, expected in meta['retired'].items():
    assert Path(name).name == name and name.startswith(('moon-gate-', 'water-mirror-'))
    anchors = {}
    paths = [current / 'assets' / name]
    for top in sorted(Path('/tmp').glob('tsukuyomi-*')):
        if top.is_dir() and not top.is_symlink() and top.stat().st_uid == 0:
            for layout in ['frontend/assets', 'unpacked/dist/frontend/assets', 'dist/frontend/assets']:
                p = top / layout / name
                if p.is_file() and p.resolve() == p: paths.append(p)
    for path in paths:
        if path.is_symlink() or not path.is_file(): continue
        info = path.stat()
        if info.st_mode & 0o022 or digest(path) != expected: continue
        key = info.st_dev, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)
        anchor = anchors.setdefault(key, path)
        if os.path.samefile(anchor, path): continue
        with tempfile.TemporaryDirectory(prefix='.entry-media-', dir=path.parent) as folder:
            link = Path(folder) / name
            os.link(anchor, link)
            if digest(link) != expected or path.stat().st_ino != info.st_ino:
                raise RuntimeError('Media changed during cleanup')
            last_link = path.stat().st_nlink == 1
            os.replace(link, path)
            if last_link: saved += info.st_blocks * 512
            linked += 1
print('Old entrance media deduplicated:', linked, 'copies;', saved, 'allocated bytes released', flush=True)
