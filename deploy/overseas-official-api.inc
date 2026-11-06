# Include inside the overseas HTTPS server. Both sites share one official service,
# encrypted provider key, identity verifier, price settings and central wallet.
location = /official-api {
    return 410;
}

location ^~ /official-api/ {
    proxy_pass https://yachiyo.hk;
    proxy_http_version 1.1;
    proxy_ssl_server_name on;
    proxy_ssl_name yachiyo.hk;
    proxy_ssl_verify on;
    proxy_ssl_verify_depth 3;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    proxy_set_header Host yachiyo.hk;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Official-Client-IP "";
    proxy_set_header X-Site-User "";
    proxy_set_header X-Authenticated-User "";
    proxy_set_header X-Official-Account "";
    proxy_set_header Upgrade "";
    proxy_set_header Connection "";
    proxy_set_header Accept-Encoding "";
    proxy_set_header Cookie $http_cookie;
    # Translate only this site's exact Origin; never turn a foreign request into
    # a same-origin write. Missing Origin stays missing and POST remains rejected.
    set $tsu_official_origin "";
    if ($http_origin != "") { set $tsu_official_origin "https://invalid.invalid"; }
    if ($http_origin = "https://tsukuyomi-space.com") { set $tsu_official_origin "https://yachiyo.hk"; }
    proxy_set_header Origin $tsu_official_origin;
    # Sec-Fetch-Site and Authorization stay intact for upstream validation.
    proxy_buffering off;
    proxy_request_buffering on;
    proxy_cache off;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    proxy_next_upstream off;
    proxy_intercept_errors off;
    proxy_redirect off;
    proxy_read_timeout 150s;
    proxy_send_timeout 15s;
    client_body_timeout 15s;
    client_max_body_size 3m;
    gzip off;
    access_log off;
    error_log /dev/null crit;
    proxy_pass_header Content-Security-Policy;
    proxy_pass_header X-Content-Type-Options;
    proxy_pass_header X-Frame-Options;
    proxy_pass_header Referrer-Policy;
    proxy_pass_header Permissions-Policy;
    proxy_pass_header Cross-Origin-Resource-Policy;
    add_header Cache-Control "private, no-store, no-cache, must-revalidate, no-transform" always;
    add_header Surrogate-Control "no-store" always;
    add_header X-Accel-Buffering "no" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /payments {
    try_files /index.html =404;
    add_header X-Robots-Tag "noindex, follow" always;
    add_header Cache-Control "private, no-store" always;
    include /usr/local/openresty/nginx/conf/conf.d/_tsukuyomi-space-security-headers.inc;
}
