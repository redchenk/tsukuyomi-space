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

if [ "${BUILD_ON_SERVER:-false}" = "true" ]; then
    echo "Code-only deployment requires prebuilt web artifacts; server-side builds are disabled to preserve Live2D resources." >&2
    exit 1
fi

mkdir -p "$ENV_DIR" "$DATA_DIR" "$LOG_DIR"

if [ "${INSTALL_SERVER_MAINTENANCE:-true}" = "true" ] && [ "$(id -u)" -eq 0 ]; then
    bash "$APP_DIR/deploy/install-server-maintenance.sh"
fi

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

if [ "${1:-}" = "--code-only" ]; then
    BUILD_ON_SERVER=false
    INSTALL_NGINX_CONFIG=false
    HARDEN_OPENRESTY_ORIGIN=false
fi

DB_FILE="${DB_PATH:-$DATA_DIR/tsukuyomi.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tsukuyomi-space/deploy}"
DATABASE_BACKUP_DIR="${DATABASE_BACKUP_DIR:-$DATA_DIR/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-10}"
BACKUP_STAMP="$(date +%Y%m%d-%H%M%S)"

# shellcheck disable=SC1091
. "$APP_DIR/deploy/backup-retention.sh"

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
        node - "$DB_FILE" "$backup_file" <<'NODE'
const Database = require('better-sqlite3');
const db = new Database(process.argv[2], { readonly: true });
db.backup(process.argv[3]).then(() => db.close()).catch(error => {
    console.error(error);
    db.close();
    process.exitCode = 1;
});
NODE
    fi

    chmod 600 "$backup_file"*
    echo "SQLite backup created: $backup_file"
}

backup_sqlite
prune_sqlite_backups "$BACKUP_DIR" "$BACKUP_RETENTION"
if [ "$DATABASE_BACKUP_DIR" != "$BACKUP_DIR" ]; then
    prune_sqlite_backups "$DATABASE_BACKUP_DIR" "$BACKUP_RETENTION"
fi

if ! getent group "$APP_GROUP" >/dev/null; then
    groupadd --system "$APP_GROUP"
fi
if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --gid "$APP_GROUP" --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

install -d -o "$APP_USER" -g "$APP_GROUP" -m 750 "$DATA_DIR" "$LOG_DIR"
if [ ! -e "$APP_DIR/assets/uploads" ] && [ ! -L "$APP_DIR/assets/uploads" ]; then
    install -d -o "$APP_USER" -g "$APP_GROUP" -m 750 "$APP_DIR/assets/uploads"
fi
install -d -o "$APP_USER" -g "$APP_GROUP" -m 700 "$DATA_DIR/mcp-home"
chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR" "$LOG_DIR"

harden_app_permissions() {
    if [ -L "$APP_DIR/assets/uploads" ]; then
        echo "Refusing to deploy with a symlinked upload directory" >&2
        exit 1
    fi

    # Large, pre-existing media and Live2D resources are managed separately.
    # A code-only deployment must not rewrite their ownership or mode bits.
    local protected_paths=( -path "$APP_DIR/assets" -o -path "$APP_DIR/models" \
        -o -path "$APP_DIR/models-v3" -o -path "$APP_DIR/models-v4" \
        -o -path "$APP_DIR/lib" -o -path "$APP_DIR/live2d-core.js" \
        -o -path "$APP_DIR/game-assets" -o -path "$APP_DIR/game-runtime" \
        -o -path "$APP_DIR/dist/live2d-studio" )
    find "$APP_DIR" -xdev \( "${protected_paths[@]}" \) -prune -o \
        \( -type f -o -type d \) -exec chown root:root {} +
    find "$APP_DIR" -xdev \( "${protected_paths[@]}" \) -prune -o \
        -type d -exec chmod go-w {} +
    find "$APP_DIR" -xdev \( "${protected_paths[@]}" \) -prune -o \
        -type f -exec chmod go-w {} +

    if [ -d "$APP_DIR/.git" ]; then
        find "$APP_DIR/.git" -xdev -type d -exec chmod 700 {} +
        find "$APP_DIR/.git" -xdev -type f -exec chmod 600 {} +
    fi

    if [ -d "$APP_DIR/node_modules" ]; then
        chown -R root:"$APP_GROUP" "$APP_DIR/node_modules"
        find "$APP_DIR/node_modules" -xdev -type d -exec chmod 750 {} +
        find "$APP_DIR/node_modules" -xdev -type f -exec chmod u+rw,g+r,o-rwx {} +
    fi

}

harden_app_permissions

if [ "${INSTALL_DEPS:-false}" = "true" ] || ! npm ls --omit=dev --depth=0 >/dev/null 2>&1; then
    if [ "${1:-}" = "--code-only" ]; then
        echo "Existing production dependencies must be ready before a code-only release; dependency installs require a separate environment release." >&2
        exit 1
    fi
    echo "Production dependencies are missing or out of date; installing with a single worker."
    npm_config_jobs="${npm_config_jobs:-1}" \
        NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=384}" \
        npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-save
fi

if [ "${BUILD_ON_SERVER:-false}" = "true" ]; then
    echo "BUILD_ON_SERVER=true is not supported by code-only deployment." >&2
    exit 1
fi

for output in dist/frontend/index.html lib/bundled/live2d-room-neuro-live.iife.js lib/bundled/live2d-room-neuro-live.20260727-adaptive-perf-r9.iife.js dist/live2d-studio/index.html; do
    [ -f "$output" ] || { echo "Missing prebuilt artifact: $output" >&2; exit 1; }
done

harden_app_permissions

pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

if [ "${INSTALL_NGINX_CONFIG:-false}" = "true" ]; then
    if [ -z "${NGINX_SITE_PATH:-}" ]; then
        if [ -f /etc/nginx/conf.d/tsukuyomi-space.conf ] \
            && grep -Fq 'include /etc/nginx/conf.d/*.conf;' /etc/nginx/nginx.conf; then
            NGINX_SITE_PATH=/etc/nginx/conf.d/tsukuyomi-space.conf
        else
            NGINX_SITE_PATH=/etc/nginx/sites-available/tsukuyomi-space
        fi
    fi
    NGINX_BACKUP="${NGINX_SITE_PATH}.predeploy"
    cp -p "$NGINX_SITE_PATH" "$NGINX_BACKUP"
    cp deploy/nginx.conf "${NGINX_SITE_PATH}.candidate"
    if [ -f /etc/nginx/snippets/agent-os.conf ] \
        && ! grep -Fq 'include /etc/nginx/snippets/agent-os.conf;' "${NGINX_SITE_PATH}.candidate"; then
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

healthy=false
for _ in $(seq 1 20); do
    if curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${PORT:-3000}/api/health" \
        | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{try{process.exit(JSON.parse(s).status==="ok"?0:1)}catch{process.exit(1)}})'; then
        healthy=true
        break
    fi
    sleep 2
done
[ "$healthy" = true ] || { echo "Application health check failed after reload." >&2; exit 1; }
