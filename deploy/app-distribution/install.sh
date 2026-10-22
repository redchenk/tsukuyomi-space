#!/usr/bin/env bash
set -euo pipefail
stage=/tmp/tsukuyomi-app-distribution-install
code=/opt/tsukuyomi-app-distribution
data=/opt/1panel/www/sites/tsukuyomi-app-distribution
acme=/opt/1panel/www/sites/tsukuyomi-app-distribution-acme
ssl=/opt/1panel/www/sites/tsukuyomi-app-distribution-ssl
conf=/opt/1panel/www/conf.d/downloads.yachiyo.hk.conf
for f in sync.py sitecustomize.py certificate.sh downloads.yachiyo.hk.conf tsukuyomi-app-distribution.service tsukuyomi-app-distribution.timer tsukuyomi-downloads-certificate.service tsukuyomi-downloads-certificate.timer; do test -f "$stage/$f"; done
for p in "$code" "$data" "$acme" "$ssl" "$conf"; do
  if test -e "$p" || test -L "$p"; then echo "Refusing to overwrite preexisting path: $p" >&2; exit 1; fi
done
if getent passwd tsukuyomi-download >/dev/null; then echo 'Account already exists' >&2; exit 1; fi
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin tsukuyomi-download
install -d -m 755 "$code" "$acme" "$ssl"
install -d -m 755 -o tsukuyomi-download -g tsukuyomi-download "$data"
install -m 644 "$stage/sync.py" "$code/sync.py"
install -d -m 755 "$code/network"
install -m 644 "$stage/sitecustomize.py" "$code/network/sitecustomize.py"
install -m 644 "$stage/tsukuyomi-app-distribution.service" /etc/systemd/system/
install -m 644 "$stage/tsukuyomi-app-distribution.timer" /etc/systemd/system/
python3 - "$stage/downloads.yachiyo.hk.conf" "$conf" <<'PY'
import pathlib,sys
s=pathlib.Path(sys.argv[1]).read_text()
pathlib.Path(sys.argv[2]).write_text(s.split('\nserver {',1)[0]+'\n')
PY
docker exec 1Panel-openresty-ggdy nginx -t
docker exec 1Panel-openresty-ggdy nginx -s reload
install -m 755 "$stage/certificate.sh" "$code/certificate.sh"
install -d -m 700 "$code/letsencrypt" "$code/certbot-work" "$code/certbot-log"
"$code/certificate.sh" initial
install -m 644 "$stage/downloads.yachiyo.hk.conf" "$conf"
docker exec 1Panel-openresty-ggdy nginx -t
docker exec 1Panel-openresty-ggdy nginx -s reload
install -m 644 "$stage/tsukuyomi-downloads-certificate.service" /etc/systemd/system/
install -m 644 "$stage/tsukuyomi-downloads-certificate.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tsukuyomi-app-distribution.timer tsukuyomi-downloads-certificate.timer
systemctl start --no-block tsukuyomi-app-distribution.service
systemctl is-active tsukuyomi-app-distribution.timer
