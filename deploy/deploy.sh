#!/usr/bin/env bash
set -euo pipefail
umask 027

APP_DIR="${APP_DIR:-/var/www/tsukuyomi-space}"
ENV_DIR="${ENV_DIR:-/etc/tsukuyomi-space}"
DATA_DIR="${DATA_DIR:-/var/lib/tsukuyomi-space}"
LOG_DIR="${LOG_DIR:-/var/log/tsukuyomi-space}"
APP_USER="${APP_USER:-tsukuyomi}"
APP_GROUP="${APP_GROUP:-www-data}"
ENV_FILE="$ENV_DIR/tsukuyomi-space.env"

cd "$APP_DIR"

mkdir -p "$ENV_DIR" "$DATA_DIR" "$LOG_DIR"

if [ ! -f "$ENV_FILE" ]; then
    cp .env.example "$ENV_FILE"
    echo "Created $ENV_FILE. Edit secrets before starting."
fi
chown root:root "$ENV_DIR" "$ENV_FILE"
chmod 700 "$ENV_DIR"
chmod 600 "$ENV_FILE"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DB_FILE="${DB_PATH:-$DATA_DIR/tsukuyomi.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tsukuyomi-space/deploy}"
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

if ! getent group "$APP_GROUP" >/dev/null; then
    groupadd --system "$APP_GROUP"
fi
if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --gid "$APP_GROUP" --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

install -d -o "$APP_USER" -g "$APP_GROUP" -m 750 "$DATA_DIR" "$LOG_DIR" "$APP_DIR/assets/uploads"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 700 "$DATA_DIR/mcp-home"
chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR" "$LOG_DIR" "$APP_DIR/assets/uploads"

harden_app_permissions() {
    if [ -L "$APP_DIR/assets/uploads" ]; then
        echo "Refusing to deploy with a symlinked upload directory" >&2
        exit 1
    fi

    find "$APP_DIR" -xdev -path "$APP_DIR/assets/uploads" -prune -o \
        \( -type f -o -type d \) -exec chown root:root {} +
    find "$APP_DIR" -xdev -path "$APP_DIR/assets/uploads" -prune -o \
        -type d -exec chmod go-w {} +
    find "$APP_DIR" -xdev -path "$APP_DIR/assets/uploads" -prune -o \
        -type f -exec chmod go-w {} +

    if [ -d "$APP_DIR/.git" ]; then
        find "$APP_DIR/.git" -xdev -type d -exec chmod 700 {} +
        find "$APP_DIR/.git" -xdev -type f -exec chmod 600 {} +
    fi

    chown -R "$APP_USER:$APP_GROUP" "$APP_DIR/assets/uploads"
    find "$APP_DIR/assets/uploads" -xdev -type d -exec chmod 750 {} +
    find "$APP_DIR/assets/uploads" -xdev -type f -exec chmod 640 {} +
}

harden_app_permissions

if [ "${INSTALL_DEPS:-false}" = "true" ] || ! npm ls --omit=dev --depth=0 >/dev/null 2>&1; then
    echo "Production dependencies are missing or out of date; installing with a single worker."
    npm_config_jobs="${npm_config_jobs:-1}" \
        NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=384}" \
        npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-save
fi

if [ "${BUILD_ON_SERVER:-false}" = "true" ]; then
    npm run build:web
    npm run build:live2d
    npm run build:live2d-studio
fi

for output in dist/frontend/index.html lib/bundled/live2d-room-neuro-live.iife.js lib/bundled/live2d-room-neuro-live.20260714-mobile-perf-r3.iife.js dist/live2d-studio/index.html; do
    [ -f "$output" ] || { echo "Missing prebuilt artifact: $output" >&2; exit 1; }
done

harden_app_permissions

pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

if [ "${INSTALL_NGINX_CONFIG:-false}" = "true" ]; then
    NGINX_SITE_PATH="${NGINX_SITE_PATH:-/etc/nginx/sites-available/tsukuyomi-space}"
    NGINX_BACKUP="${NGINX_SITE_PATH}.predeploy"
    cp -p "$NGINX_SITE_PATH" "$NGINX_BACKUP"
    cp deploy/nginx.conf "${NGINX_SITE_PATH}.candidate"
    if [ -f /etc/nginx/snippets/agent-os.conf ]; then
        sed -i '/^[[:space:]]*server[[:space:]]*{/a\    include /etc/nginx/snippets/agent-os.conf;' "${NGINX_SITE_PATH}.candidate"
    fi
    mv "${NGINX_SITE_PATH}.candidate" "$NGINX_SITE_PATH"
    if ! nginx -t; then
        mv "$NGINX_BACKUP" "$NGINX_SITE_PATH"
        nginx -t
        exit 1
    fi
    rm -f "$NGINX_BACKUP"
    systemctl reload nginx
fi

if [ "${HARDEN_OPENRESTY_ORIGIN:-false}" = "true" ]; then
    bash deploy/install-openresty-hardening.sh
fi
