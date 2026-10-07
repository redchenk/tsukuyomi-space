# Canonical public entrances

The canonical website origin is `https://yachiyo.hk`. Configure these redirects
at the Alibaba Cloud CDN client entrance, before cache lookup or origin access:

| CDN domain | Rule | Match | Response |
| --- | --- | --- | --- |
| `www.yachiyo.hk` | `www_canonical_https` | HTTP and HTTPS | 308 to the same path/query on `https://yachiyo.hk` |
| `yachiyo.hk` | `apex_canonical_https` | HTTP only | 308 to the same path/query on `https://yachiyo.hk` |

The rule sources are `cdn-www-canonical.es` and `cdn-apex-https.es` in this
directory. Both use priority 0, execution position **request processing start**,
enabled status, and Break disabled. The fixed target hostname prevents a request
path or query parameter from selecting another redirect destination. Using
`$request_uri` with `enhance_redirect` preserves escaped paths, repeated query
keys and parameter encoding. 308 preserves the request method and body.

The built-in **protocol redirect** remains **default** on both domains: these
EdgeScript rules implement the redirects. Do not add a second HTTPS-to-HTTP or
www-preserving redirect. The CDN origin stays `origin.yachiyo.hk:443`. Existing
certificates, Origin/CSRF validation, cache rules and security headers stay in
place. Do not apply these website rules to `oss`, `origin`, `fn` or other hosts.
No application build or service restart is needed.

## Publish and verify

1. Inspect production EdgeScript rules first. Never publish an incomplete
   staging list over existing unrelated production rules; copy them first when
   present.
2. Add the corresponding rule to the domain's simulation environment.
3. Resolve `staging.myalicdn.com` with a real DNS resolver. Do not use a local
   proxy's synthetic address. Test that staging IP with the appropriate command:

   ```sh
   python3 scripts/check-canonical-entries.py --www-only --resolve STAGING_IP
   python3 scripts/check-canonical-entries.py --apex-only --resolve STAGING_IP
   ```

4. Publish to production, then run:

   ```sh
   python3 scripts/check-canonical-entries.py --output /tmp/canonical-entries.json
   ```

The checker tests real GET/HEAD requests, preserves TLS verification, uses at
most two concurrent requests, and retains only status, Location and curl exit
code. It checks Chinese article paths, login redirects, repeated parameters,
root/Hub, sitemap/RSS and a double-slash path that must stay on the fixed host.
Canonical HTTPS root/Hub, sitemap/RSS and API health must remain 200 without an
entry redirect. Also verify from an independent network after CDN propagation.

For legacy article slugs the existing article canonicalization can still add a
separate redirect; the entry rules only change host/protocol.

## Rollback

Disable the named rule on the affected domain's production EdgeScript page;
retain unrelated rules. No database or application rollback is required. Verify
the reverted HTTP/www behavior explicitly. Permanent redirects may already be
cached by clients, so a CDN rollback alone does not clear those client caches.

Official references:

- [EdgeScript variables](https://help.aliyun.com/zh/cdn/user-guide/edgescript-built-in-variables)
- [Request processing and redirect flags](https://help.aliyun.com/en/cdn/user-guide/request-processing-functions)
- [EdgeScript deployment and examples](https://help.aliyun.com/en/cdn/user-guide/edgescript-common-scenarios)
