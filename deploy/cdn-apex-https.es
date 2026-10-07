# Domain: yachiyo.hk. Execution position: request processing start.
# HTTPS requests pass through unchanged; the destination host is fixed.
if and(eq($host, 'yachiyo.hk'), eq($scheme, 'http')) {
    rewrite(concat('https://yachiyo.hk', $request_uri), 'enhance_redirect', 308)
}
