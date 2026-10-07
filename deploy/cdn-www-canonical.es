# Domain: www.yachiyo.hk. Execution position: request processing start.
# Fixed destination; preserve the original escaped path and query string.
if eq($host, 'www.yachiyo.hk') {
    rewrite(concat('https://yachiyo.hk', $request_uri), 'enhance_redirect', 308)
}
