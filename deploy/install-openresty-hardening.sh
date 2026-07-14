#!/usr/bin/env bash
set -euo pipefail
umask 027

LOCK_FILE="${LOCK_FILE:-/run/lock/tsukuyomi-openresty-hardening.lock}"
exec 9>"$LOCK_FILE"
flock -w 120 9 || { echo "Timed out waiting for the OpenResty deployment lock" >&2; exit 1; }

OPENRESTY_ROOT="${OPENRESTY_ROOT:-/opt/1panel/apps/openresty/openresty}"
SITE_ROOT="${SITE_ROOT:-/opt/1panel/www/sites}"
OPENRESTY_CONTAINER="${OPENRESTY_CONTAINER:-}"
UPDATE_OPENRESTY_IMAGE="${UPDATE_OPENRESTY_IMAGE:-false}"
OPENRESTY_REGISTRY="${OPENRESTY_REGISTRY:-docker.1panel.live}"
PRIMARY_SITE_DIR="$SITE_ROOT/yachiyo.hk"
ORIGIN_SITE_DIR="$(find "$SITE_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'origin.*' -print -quit 2>/dev/null || true)"

if [ -z "$OPENRESTY_CONTAINER" ]; then
    OPENRESTY_CONTAINER="$(docker ps --format '{{.Names}}' | awk '/^1Panel-openresty-/{print; exit}')"
fi

[ -n "$OPENRESTY_CONTAINER" ] || { echo "Running 1Panel OpenResty container not found" >&2; exit 1; }
[ -d "$OPENRESTY_ROOT/conf" ] || { echo "OpenResty configuration directory not found" >&2; exit 1; }

backup_dir="$(mktemp -d "/root/openresty-prehardening-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
chmod 700 "$backup_dir"
cp -a "$OPENRESTY_ROOT/conf/nginx.conf" "$backup_dir/nginx.conf"

for site_dir in "$PRIMARY_SITE_DIR" "$ORIGIN_SITE_DIR"; do
    [ -n "$site_dir" ] || continue
    proxy_dir="$site_dir/proxy"
    [ -d "$proxy_dir" ] || continue
    backup_site="$backup_dir/$(basename "$site_dir")"
    install -d -m 700 "$backup_site"
    cp -a "$proxy_dir"/*.conf "$backup_site/" 2>/dev/null || true
done

restore_managed_proxy_files() {
    local site_dir="$1"
    local proxy_dir
    local backup_site
    local filename
    [ -n "$site_dir" ] || return 0
    proxy_dir="$site_dir/proxy"
    backup_site="$backup_dir/$(basename "$site_dir")"
    [ -d "$proxy_dir" ] || return 0

    for filename in 00-tsukuyomi-security.conf root.conf agent-os.conf; do
        if [ -f "$backup_site/$filename" ]; then
            cp -a "$backup_site/$filename" "$proxy_dir/$filename"
        else
            rm -f "$proxy_dir/$filename"
        fi
    done
}

# nginx.conf is a single-file bind mount in 1Panel. Preserve its inode so the
# running container sees the candidate before validation and reload.
cat deploy/openresty-nginx.conf > "$OPENRESTY_ROOT/conf/nginx.conf"
chown root:root "$OPENRESTY_ROOT/conf/nginx.conf"
chmod 644 "$OPENRESTY_ROOT/conf/nginx.conf"
# A prior package update may have replaced the bind source inode. Write through
# the active mount as well; the host copy is used on the next container start.
docker exec -i "$OPENRESTY_CONTAINER" sh -c \
    'cat > /usr/local/openresty/nginx/conf/nginx.conf' < deploy/openresty-nginx.conf

for site_dir in "$PRIMARY_SITE_DIR" "$ORIGIN_SITE_DIR"; do
    [ -n "$site_dir" ] || continue
    proxy_dir="$site_dir/proxy"
    [ -d "$proxy_dir" ] || continue
    install -o root -g root -m 644 deploy/openresty-site-security.conf "$proxy_dir/00-tsukuyomi-security.conf"
done

if [ -d "$PRIMARY_SITE_DIR/proxy" ]; then
    install -o root -g root -m 644 deploy/openresty-root-proxy.conf "$PRIMARY_SITE_DIR/proxy/root.conf"
fi

if [ -n "$ORIGIN_SITE_DIR" ] && [ -d "$ORIGIN_SITE_DIR/proxy" ]; then
    install -o root -g root -m 644 deploy/openresty-root-proxy.conf "$ORIGIN_SITE_DIR/proxy/root.conf"
fi

if [ -d "$PRIMARY_SITE_DIR/proxy" ]; then
    install -o root -g root -m 644 deploy/openresty-agent-os.conf "$PRIMARY_SITE_DIR/proxy/agent-os.conf"
fi

if ! docker exec "$OPENRESTY_CONTAINER" /usr/local/openresty/bin/openresty -t; then
    cat "$backup_dir/nginx.conf" > "$OPENRESTY_ROOT/conf/nginx.conf"
    docker exec -i "$OPENRESTY_CONTAINER" sh -c \
        'cat > /usr/local/openresty/nginx/conf/nginx.conf' < "$backup_dir/nginx.conf"
    for site_dir in "$PRIMARY_SITE_DIR" "$ORIGIN_SITE_DIR"; do
        restore_managed_proxy_files "$site_dir"
    done
    docker exec "$OPENRESTY_CONTAINER" /usr/local/openresty/bin/openresty -t
    exit 1
fi

docker exec "$OPENRESTY_CONTAINER" /usr/local/openresty/bin/openresty -s reload

if [ "$UPDATE_OPENRESTY_IMAGE" = "true" ]; then
    case "$(uname -m)" in
        x86_64|amd64) image_arch="amd64" ;;
        aarch64|arm64) image_arch="arm64" ;;
        *) echo "Unsupported OpenResty image architecture: $(uname -m)" >&2; exit 1 ;;
    esac

    target_version="1.29.2.5-0-noble"
    target_image="${OPENRESTY_REGISTRY}/1panel/openresty:${target_version}-${image_arch}"
    current_image="$(docker inspect --format '{{.Config.Image}}' "$OPENRESTY_CONTAINER")"

    if [ "$current_image" != "$target_image" ]; then
        compose_file="$OPENRESTY_ROOT/docker-compose.yml"
        compose_backup="$backup_dir/docker-compose.yml"
        cp -a "$compose_file" "$compose_backup"
        docker pull "$target_image"
        sed -i -E "s|PANEL_OPENRESTY_VERSION=[^[:space:]]+|PANEL_OPENRESTY_VERSION=${target_version}|" "$compose_file"
        sed -i -E "s|^[[:space:]]*image:[[:space:]].*|        image: ${target_image}|" "$compose_file"

        if ! docker compose --env-file "$OPENRESTY_ROOT/.env" -f "$compose_file" up -d; then
            cp -a "$compose_backup" "$compose_file"
            docker compose --env-file "$OPENRESTY_ROOT/.env" -f "$compose_file" up -d
            exit 1
        fi

        for _ in $(seq 1 30); do
            if docker exec "$OPENRESTY_CONTAINER" /usr/local/openresty/bin/openresty -t >/dev/null 2>&1; then
                break
            fi
            sleep 1
        done
        docker exec "$OPENRESTY_CONTAINER" /usr/local/openresty/bin/openresty -t
    fi
fi

echo "OpenResty hardening installed; backup: $backup_dir"
