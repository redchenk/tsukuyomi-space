#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tsukuyomi-space}"

if [ "$(id -u)" -ne 0 ]; then
    echo "Server maintenance installation requires root; skipping." >&2
    exit 0
fi

install -m 0755 "$APP_DIR/deploy/server-maintenance.sh" \
    /usr/local/sbin/tsukuyomi-server-maintenance
install -m 0644 "$APP_DIR/deploy/docker-container-json.logrotate" \
    /etc/logrotate.d/tsukuyomi-docker-json
install -m 0644 "$APP_DIR/deploy/tsukuyomi-app.logrotate" \
    /etc/logrotate.d/tsukuyomi-app

if [ -d /etc/systemd ]; then
    install -d -m 0755 /etc/systemd/journald.conf.d
    install -m 0644 "$APP_DIR/deploy/journald-tsukuyomi.conf" \
        /etc/systemd/journald.conf.d/tsukuyomi-storage.conf
fi

if command -v logrotate >/dev/null 2>&1; then
    logrotate --debug /etc/logrotate.d/tsukuyomi-docker-json >/dev/null 2>&1
    logrotate --debug /etc/logrotate.d/tsukuyomi-app >/dev/null 2>&1
fi

if command -v systemctl >/dev/null 2>&1; then
    install -m 0644 "$APP_DIR/deploy/tsukuyomi-maintenance.service" \
        /etc/systemd/system/tsukuyomi-maintenance.service
    install -m 0644 "$APP_DIR/deploy/tsukuyomi-maintenance.timer" \
        /etc/systemd/system/tsukuyomi-maintenance.timer
    systemctl daemon-reload
    systemctl enable --now tsukuyomi-maintenance.timer
    systemctl try-reload-or-restart systemd-journald.service >/dev/null 2>&1 || true
fi
