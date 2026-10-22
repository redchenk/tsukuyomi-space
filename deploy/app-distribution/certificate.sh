#!/usr/bin/env bash
set -euo pipefail
base=/opt/tsukuyomi-app-distribution
ssl=/opt/1panel/www/sites/tsukuyomi-app-distribution-ssl
acme=/opt/1panel/www/sites/tsukuyomi-app-distribution-acme
image=certbot/certbot@sha256:34ee91d2f43008eb78a007d22f23ed4b2eaa9a454cb27ca2c042b49527a695b4
args=(renew --quiet)
if [[ "${1:-}" == initial ]]; then
 args=(certonly --non-interactive --webroot -w /webroot -d downloads.yachiyo.hk --cert-name downloads.yachiyo.hk --agree-tos --register-unsafely-without-email)
fi
docker run --rm --network host --name tsukuyomi-downloads-certbot -e PYTHONPATH=/network -v "$base/network:/network:ro" -v "$base/letsencrypt:/etc/letsencrypt" -v "$base/certbot-work:/var/lib/letsencrypt" -v "$base/certbot-log:/var/log/letsencrypt" -v "$acme:/webroot" "$image" "${args[@]}"
lineage="$base/letsencrypt/live/downloads.yachiyo.hk"
if ! cmp -s "$lineage/fullchain.pem" "$ssl/fullchain.pem" || ! cmp -s "$lineage/privkey.pem" "$ssl/privkey.pem"; then
 install -m 644 "$lineage/fullchain.pem" "$ssl/fullchain.pem"
 install -m 600 "$lineage/privkey.pem" "$ssl/privkey.pem"
 docker exec 1Panel-openresty-ggdy nginx -t
 docker exec 1Panel-openresty-ggdy nginx -s reload
fi
