#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tsukuyomi-space}"
ENV_DIR="${ENV_DIR:-/etc/tsukuyomi-space}"
DATA_DIR="${DATA_DIR:-/var/lib/tsukuyomi-space}"
LOG_DIR="${LOG_DIR:-/var/log/tsukuyomi-space}"

cd "$APP_DIR"

mkdir -p "$ENV_DIR" "$DATA_DIR" "$LOG_DIR"

if [ ! -f "$ENV_DIR/tsukuyomi-space.env" ]; then
    cp .env.example "$ENV_DIR/tsukuyomi-space.env"
    chmod 600 "$ENV_DIR/tsukuyomi-space.env"
    echo "Created $ENV_DIR/tsukuyomi-space.env. Edit secrets before starting."
fi

npm ci --omit=dev
npm run build:web
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save
