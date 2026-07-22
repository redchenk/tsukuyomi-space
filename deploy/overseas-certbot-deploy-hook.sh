#!/usr/bin/env bash
set -euo pipefail

certificate_dir="/etc/letsencrypt/live/tsukuyomi-space.com"
site_ssl_dir="/opt/1panel/www/sites/tsukuyomi-space.com/ssl"
openresty_container="1Panel-openresty-HX9X"

install -d -m 755 "$site_ssl_dir"
install -m 644 "$certificate_dir/fullchain.pem" "$site_ssl_dir/fullchain.pem"
install -m 600 "$certificate_dir/privkey.pem" "$site_ssl_dir/privkey.pem"

docker exec "$openresty_container" nginx -t
docker exec "$openresty_container" nginx -s reload
