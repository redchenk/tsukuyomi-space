#!/usr/bin/env bash
set -euo pipefail
key_file=${1:?Pass the dedicated CI public key file}
base=/opt/tsukuyomi-app-distribution
home_dir="$base/push-home"
python3 - "$key_file" "$home_dir" <<'PY'
from pathlib import Path
import os,re,sys
key=Path(sys.argv[1]).read_text().strip()
if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\r\n]+)?',key):
 raise ValueError('Expected one dedicated Ed25519 public key')
home=Path(sys.argv[2]);home.mkdir(mode=0o755,exist_ok=True);(home/'.ssh').mkdir(mode=0o755,exist_ok=True)
path=home/'.ssh/authorized_keys'
if path.exists():raise ValueError('Existing authorized key must be reviewed before replacement')
command='/usr/bin/timeout --kill-after=10s 45m /usr/bin/prlimit --as=268435456 --cpu=600 --nofile=64 /usr/bin/nice -n 10 /usr/bin/env PYTHONPATH=/opt/tsukuyomi-app-distribution/network /usr/bin/python3 /opt/tsukuyomi-app-distribution/sync.py --root /opt/1panel/www/sites/tsukuyomi-app-distribution --receive'
path.write_text('restrict,command="'+command+'" '+key+'\n');os.chmod(path,0o644)
PY
usermod --home "$home_dir" --shell /bin/sh tsukuyomi-download
systemctl disable --now tsukuyomi-app-distribution.timer
