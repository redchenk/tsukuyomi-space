#!/usr/bin/env python3
"""Prune only this application's completed release states and entry backups."""
import argparse
import fcntl
import json
from pathlib import Path
import re
import shutil


def prune(root, retention):
    if retention < 1:
        raise ValueError('Backup retention must be a positive integer')
    root = Path(root)
    if not root.exists():
        return []
    (root / 'releases').mkdir(exist_ok=True)
    with (root / 'releases/.release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return prune_locked(root, retention)


def prune_locked(root, retention):
    removed = []
    for site in ('domestic', 'overseas'):
        entries = []
        for path in (root / 'frontend').glob(site + '-*.html'):
            if path.is_file() and not path.is_symlink() and re.fullmatch(site + r'-[0-9-]+\.html', path.name):
                entries.append(path)
        states = []
        for path in (root / 'releases').glob('*-' + site):
            if not path.is_dir() or path.is_symlink() or not re.fullmatch(r'[0-9]+-[0-9]+-' + site, path.name):
                continue
            try:
                state = json.loads((path / 'state.json').read_text())
            except (ValueError, OSError):
                continue
            if (state.get('format') == 'tsukuyomi-release-v1' and state.get('site') == site
                    and state.get('state_dir') == str(path.absolute())
                    and state.get('status') in ('active', 'rolled_back')):
                states.append(path)
        for group in (entries, states):
            group.sort(key=lambda path: path.stat().st_mtime_ns, reverse=True)
            for path in group[retention:]:
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
                removed.append(str(path))
    return removed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='/var/backups/tsukuyomi-space')
    parser.add_argument('--retention', type=int, default=10)
    args = parser.parse_args()
    for path in prune(args.root, args.retention):
        print('Pruned completed backup:', path)
