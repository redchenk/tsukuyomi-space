# Keep the application's per-client CSP through every proxy layer. The extra
# policy below also protects proxy-generated errors; policies are intersected.
# HTTPS form destinations permit the approved callback after a POST/303, while
# the application's policy narrows this to the registered callback origin.
proxy_pass_header Content-Security-Policy;
proxy_hide_header Strict-Transport-Security;
proxy_hide_header X-Content-Type-Options;
proxy_hide_header X-Frame-Options;
proxy_hide_header Referrer-Policy;
proxy_hide_header Permissions-Policy;
proxy_hide_header X-Permitted-Cross-Domain-Policies;
proxy_hide_header Origin-Agent-Cluster;
proxy_hide_header Cross-Origin-Opener-Policy;
proxy_hide_header Cross-Origin-Resource-Policy;
proxy_hide_header X-XSS-Protection;
add_header Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self' https:; frame-ancestors 'none'" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy no-referrer always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header X-Permitted-Cross-Domain-Policies none always;
add_header Origin-Agent-Cluster "?1" always;
add_header Cross-Origin-Opener-Policy same-origin-allow-popups always;
add_header Cross-Origin-Resource-Policy same-site always;
add_header X-XSS-Protection "0" always;
add_header X-Robots-Tag "noindex, nofollow" always;
add_header Surrogate-Control "no-store" always;
