#!/usr/bin/env python3
"""Offload closed SQLite backup files to private OSS after a byte-for-byte restore."""
import argparse
from contextlib import closing, contextmanager
import fcntl
import pwd
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import tempfile
import time

ROOT = Path('/var/backups/tsukuyomi-space')
KEYS = Path('/etc/tsukuyomi-archive')
HELPER = '/usr/local/lib/tsukuyomi-archive/oss.cjs'
STAGE = Path('/var/cache/tsukuyomi-archive')
WEEK = 7 * 86400
MIB = 1024 * 1024
SUFFIX = '.oss-archive.json'


def digest(stream):
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(MIB), b''):
        h.update(chunk)
    return h.hexdigest()


def stamp(path):
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode):
        raise ValueError('Expected regular file')
    return s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns


def closed(path):
    return all(not Path(str(path) + ext).is_file() or Path(str(path) + ext).stat().st_size == 0
               for ext in ('-wal', '-journal'))


def candidates(root, now):
    found = []
    for base, dirs, names in os.walk(root, followlinks=False):
        for n in names:
            p = Path(base) / n
            if p.is_symlink() or not n.endswith(('.db', '.sqlite', '.db.gz', '.sqlite.gz')):
                continue
            s = p.stat()
            if stat.S_ISREG(s.st_mode) and s.st_size >= MIB:
                found.append(p)
    found.sort(key=lambda p: p.stat().st_mtime_ns, reverse=True)
    # Keep three recent restore points across the site and the two newest standard deploy snapshots.
    keep = set(found[:3]) | set([p for p in found if p.parent == root / 'deploy'][:2])
    return [p for p in reversed(found) if p not in keep and now - p.stat().st_mtime >= WEEK and closed(p)]


def transport(action, archive_id, *args):
    return ['runuser', '-u', 'tsukuyomi', '--', 'env', 'NODE_ENV=production',
            'DB_PATH=/var/lib/tsukuyomi-space/tsukuyomi.db', 'node', HELPER, action, archive_id, *args]


@contextmanager
def pipeline(commands, output=subprocess.PIPE):
    children = []
    try:
        for index, cmd in enumerate(commands):
            prev = children[-1].stdout if children else None
            child = subprocess.Popen(cmd, stdin=prev, stdout=output if index == len(commands)-1 else subprocess.PIPE)
            children.append(child)
            if prev:
                prev.close()
        yield children[-1].stdout
        if any([child.wait() != 0 for child in reversed(children)]):
            raise RuntimeError('Archive pipeline failed')
    finally:
        for child in reversed(children):
            if child.stdout:
                child.stdout.close()
            if child.poll() is None:
                child.kill()
            child.wait()


def decrypt():
    return ['openssl', 'cms', '-decrypt', '-binary', '-inform', 'DER', '-recip',
            str(KEYS/'recipient.pem'), '-inkey', str(KEYS/'recovery.key')]


def restore_stream(archive_id, relative):
    return pipeline([transport('read', archive_id), decrypt(), ['tar', '-xzOf', '-', '--', relative]])


def receipt_path(path):
    return Path(str(path) + SUFFIX)


def sync_parent(path):
    fd = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def save_receipt(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as out:
        tmp = Path(out.name)
        try:
            out.write((json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode())
            out.flush()
            os.fsync(out.fileno())
            os.replace(tmp, path)
            sync_parent(path)
        finally:
            tmp.unlink(missing_ok=True)


def explicit_snapshot(path):
    path = path.resolve(strict=True)
    root = ROOT.resolve().parent
    if not path.is_relative_to(root) or path.is_relative_to(ROOT.resolve()):
        raise ValueError('Expected a legacy snapshot under the system backup directory')
    _, _, size, modified, _ = stamp(path)
    if (path.suffix not in ('.db', '.sqlite') or size < MIB or not closed(path)
            or time.time() - modified / 1e9 < WEEK):
        raise ValueError('Expected an old, closed SQLite snapshot')
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
        tables = db.execute("SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN "
                            "('articles','users','room_chat_messages','schema_migrations')").fetchone()[0]
    if tables != 4:
        raise ValueError('Snapshot does not match the Tsukuyomi site schema')
    return path


def archive(path, release_local, legacy=False):
    base = ROOT.resolve().parent if legacy else ROOT
    relative = str(path.relative_to(base))
    initial = stamp(path)
    with path.open('rb') as src:
        expected = digest(src)
    fingerprint = hashlib.sha256((KEYS/'recipient.pem').read_bytes()).hexdigest()
    archive_id = hashlib.sha256((fingerprint+'\n'+('legacy:' if legacy else '')+relative+'\n'+expected).encode()).hexdigest()
    receipt = receipt_path(path)
    if receipt.exists():
        data = json.loads(receipt.read_text())
        if data['id'] != archive_id or data['sha256'] != expected:
            raise RuntimeError('Backup differs from its existing receipt')
    else:
        # Keep only one compressed ciphertext on disk. Preserve headroom even for incompressible input.
        disk = os.statvfs(STAGE)
        if disk.f_bavail * disk.f_frsize < initial[2] * 1.02 + 64*MIB:
            raise RuntimeError('Insufficient staging space for this snapshot')
        with tempfile.NamedTemporaryFile(dir=STAGE, prefix='archive-') as cipher:
            with pipeline([['tar', '-C', str(base), '-cf', '-', '--', relative],
                           ['gzip', '-1c'], ['openssl', 'cms', '-encrypt', '-aes-256-gcm', '-binary',
                            '-stream', '-outform', 'DER', str(KEYS/'recipient.pem')]], cipher):
                pass
            os.fchown(cipher.fileno(), pwd.getpwnam('tsukuyomi').pw_uid, -1)
            os.fchmod(cipher.fileno(), 0o400)
            subprocess.run(transport('put', archive_id, cipher.name), check=True)
    # Verify the provider's actual copy, including decryption, decompression and original bytes.
    with restore_stream(archive_id, relative) as restored:
        if digest(restored) != expected:
            raise RuntimeError('Restored backup digest mismatch')
    if stamp(path) != initial or not closed(path):
        raise RuntimeError('Source changed during verification')
    data = dict(version=1, legacy=legacy, path=relative, id=archive_id, key='ops-archive/domestic-v1/'+archive_id+'.cms',
                sha256=expected, bytes=initial[2], verified_at=int(time.time()), recipient_sha256=fingerprint)
    save_receipt(receipt, data)
    if release_local:
        path.unlink()
        sync_parent(path)
    print(('Archived' if release_local else 'Verified'), relative, initial[2], flush=True)


def restore(receipt, output):
    receipt = receipt.resolve(strict=True)
    data = json.loads(receipt.read_text())
    base = ROOT.resolve().parent if data.get('legacy') else ROOT.resolve()
    relative = str(receipt.relative_to(base))
    if not relative.endswith(SUFFIX) or data['path'] != relative[:-len(SUFFIX)]:
        raise ValueError('Receipt path does not match backup')
    # Materialize privately and publish only fully verified bytes. Never overwrite a live file.
    with tempfile.NamedTemporaryFile(dir=output.parent) as tmp:
        with restore_stream(data['id'], data['path']) as src:
            h = hashlib.sha256()
            for chunk in iter(lambda: src.read(MIB), b''):
                tmp.write(chunk)
                h.update(chunk)
        if h.hexdigest() != data['sha256'] or tmp.tell() != data['bytes']:
            raise ValueError('Recovered bytes do not match receipt')
        tmp.flush()
        os.fsync(tmp.fileno())
        os.link(tmp.name, output)
        sync_parent(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'verify', 'offload', 'restore'])
    parser.add_argument('--limit', type=int, default=4)
    parser.add_argument('--snapshot', action='append', type=Path, help='Explicit old site SQLite file under /var/backups')
    parser.add_argument('--receipt', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.snapshot and args.action not in ('offload', 'verify'):
        parser.error('--snapshot is only supported for offload or verify')
    if args.action == 'restore':
        if not args.receipt or not args.output:
            parser.error('restore requires --receipt and --output')
        restore(args.receipt, args.output)
        return
    if args.limit < 1:
        parser.error('limit must be positive')
    if args.action == 'plan':
        items = candidates(ROOT, time.time())
        print(json.dumps(dict(files=len(items), bytes=sum(p.stat().st_size for p in items))))
        return
    with open('/run/lock/tsukuyomi-oss-archive.lock', 'a') as lock, open('/run/lock/tsukuyomi-maintenance.lock', 'a') as maintenance:
        fcntl.flock(lock, fcntl.LOCK_EX)
        fcntl.flock(maintenance, fcntl.LOCK_EX)
        # Only this worker writes the stage directory. Recover interrupted ciphertext staging.
        for orphan in STAGE.glob('archive-*'):
            if orphan.is_file() and not orphan.is_symlink():
                orphan.unlink()
        items = ([explicit_snapshot(p) for p in args.snapshot] if args.snapshot
                 else candidates(ROOT, time.time())[:args.limit])
        for p in items:
            archive(p, args.action == 'offload', legacy=bool(args.snapshot))


if __name__ == '__main__':
    main()
