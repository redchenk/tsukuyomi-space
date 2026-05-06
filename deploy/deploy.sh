#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tsukuyomi-space}"
ENV_DIR="${ENV_DIR:-/etc/tsukuyomi-space}"
DATA_DIR="${DATA_DIR:-/var/lib/tsukuyomi-space}"
LOG_DIR="${LOG_DIR:-/var/log/tsukuyomi-space}"
ENV_FILE="$ENV_DIR/tsukuyomi-space.env"

cd "$APP_DIR"

mkdir -p "$ENV_DIR" "$DATA_DIR" "$LOG_DIR"

if [ ! -f "$ENV_FILE" ]; then
    cp .env.example "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Created $ENV_FILE. Edit secrets before starting."
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DB_FILE="${DB_PATH:-$DATA_DIR/tsukuyomi.db}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
BACKUP_STAMP="$(date +%Y%m%d-%H%M%S)"

backup_sqlite() {
    if [ ! -f "$DB_FILE" ]; then
        echo "SQLite database not found at $DB_FILE; skipping backup."
        return
    fi

    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"

    local backup_file="$BACKUP_DIR/tsukuyomi-$BACKUP_STAMP.db"
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$DB_FILE" ".backup '$backup_file'"
    else
        cp -p "$DB_FILE" "$backup_file"
        [ -f "$DB_FILE-wal" ] && cp -p "$DB_FILE-wal" "$backup_file-wal"
        [ -f "$DB_FILE-shm" ] && cp -p "$DB_FILE-shm" "$backup_file-shm"
    fi

    chmod 600 "$backup_file"*
    echo "SQLite backup created: $backup_file"
}

backup_sqlite

npm ci --omit=dev
npm run build:live2d
npm run build:web
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save
