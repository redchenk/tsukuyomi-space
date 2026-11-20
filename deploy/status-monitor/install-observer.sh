#!/bin/bash
set -euo pipefail
umask 077
config=/etc/yachiyo-status
app=/opt/yachiyo-status-observer
install -d -m 0700 "$config"
getent group yachiyo-status >/dev/null || groupadd --system yachiyo-status
id yachiyo-status >/dev/null 2>&1 || useradd --system -g yachiyo-status --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin yachiyo-status
python3 -c 'import pathlib; p=pathlib.Path("observer.py");compile(p.read_bytes(),str(p),"exec")'
if ! test -s "$config/flashduty"; then
  tmp=$(mktemp "$config/.incoming.XXXXXX")
  trap 'rm -f -- "$tmp"' EXIT
  openssl pkeyutl -decrypt -inkey "$config/transport.pem" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in sealed.bin -out "$tmp"
  python3 -c 'import pathlib,sys; s=pathlib.Path(sys.argv[1]).read_bytes().strip(); assert 8<=len(s)<=512 and all(32<c<127 for c in s)' "$tmp"
  chmod 0600 "$tmp"
  mv "$tmp" "$config/flashduty"
fi
install -d -m 0755 "$app"
install -m 0644 observer.py "$app/observer.new"
mv "$app/observer.new" "$app/observer.py"
install -m 0644 yachiyo-status-observer.{service,timer} /etc/systemd/system/
if [ "$(systemctl --version | awk 'NR==1 {print $2}')" -lt 247 ]; then
  legacy=/etc/yachiyo-status-observer-credentials
  install -d -m 0750 -g yachiyo-status "$legacy"
  install -m 0440 -g yachiyo-status "$config/flashduty" "$legacy/flashduty"
  sed -i "s|^LoadCredential=.*|Environment=CREDENTIALS_DIRECTORY=$legacy|" /etc/systemd/system/yachiyo-status-observer.service
fi
systemctl daemon-reload
systemctl start yachiyo-status-observer.service
systemctl enable --now yachiyo-status-observer.timer
systemctl is-active --quiet yachiyo-status-observer.timer
rm -f -- "$config/transport.pem"
