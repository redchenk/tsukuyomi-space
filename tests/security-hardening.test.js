const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

function sourceFile(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const {
    MAX_USER_UPLOAD_BYTES,
    validateUserUpload
} = require('../backend/services/file-security');
const {
    isPrivateAddress,
    resolvePublicUrl
} = require('../backend/services/outbound-url-security');
const { assertNoDuplicateJsonKeys } = require('../backend/services/json-security');
const {
    CONTENT_SECURITY_POLICY,
    securityHeaders
} = require('../backend/middleware/security');

function locationBlocks(config) {
    const lines = config.split(/\r?\n/);
    const blocks = [];

    for (let start = 0; start < lines.length; start += 1) {
        if (!/^\s*location\b/.test(lines[start])) continue;
        let depth = 0;
        for (let end = start; end < lines.length; end += 1) {
            depth += (lines[end].match(/\{/g) || []).length;
            depth -= (lines[end].match(/\}/g) || []).length;
            if (depth === 0) {
                blocks.push(lines.slice(start, end + 1).join('\n'));
                start = end;
                break;
            }
        }
    }

    return blocks;
}

describe('JSON duplicate-key validation', () => {
    it('rejects duplicate keys at any object depth, including escaped equivalents', () => {
        assert.throws(
            () => assertNoDuplicateJsonKeys('{"role":"user","role":"admin"}'),
            error => error?.code === 'DUPLICATE_JSON_KEY'
        );
        assert.throws(
            () => assertNoDuplicateJsonKeys('{"profile":{"name":"first","name":"second"}}'),
            error => error?.code === 'DUPLICATE_JSON_KEY'
        );
        assert.throws(
            () => assertNoDuplicateJsonKeys('{"name":"first","\\u006eame":"second"}'),
            error => error?.code === 'DUPLICATE_JSON_KEY'
        );
    });

    it('allows the same key in separate sibling objects', () => {
        assert.doesNotThrow(() => assertNoDuplicateJsonKeys('{"items":[{"name":"one"},{"name":"two"}]}'));
    });
});

describe('file upload validation', () => {
    it('allows a supported file and rejects dangerous extensions', () => {
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
        assert.equal(validateUserUpload({ buffer: jpeg, fileName: 'photo.jpg', claimedMimeType: 'image/jpeg' }).trustedMimeType, 'image/jpeg');
        assert.throws(
            () => validateUserUpload({ buffer: jpeg, fileName: 'payload.php', claimedMimeType: 'image/jpeg' }),
            /扩展名/
        );
    });

    it('rejects active image formats and oversized files', () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        assert.throws(
            () => validateUserUpload({ buffer: svg, fileName: 'payload.svg', claimedMimeType: 'image/svg+xml' }),
            /不支持|声明类型/
        );
        assert.throws(
            () => validateUserUpload({ buffer: Buffer.alloc(MAX_USER_UPLOAD_BYTES + 1), fileName: 'large.jpg', claimedMimeType: 'image/jpeg' }),
            /20MB/
        );
    });

    it('does not trust a safe MIME declaration for unknown binary content', () => {
        assert.throws(
            () => validateUserUpload({
                buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]),
                fileName: 'fake.jpg',
                claimedMimeType: 'image/jpeg'
            }),
            /不支持/
        );
    });
});

describe('outbound URL validation', () => {
    it('recognizes loopback, private, link-local, and documentation addresses', () => {
        for (const address of [
            '127.0.0.1',
            '10.0.0.1',
            '169.254.169.254',
            '172.16.0.1',
            '192.168.1.1',
            '192.0.2.1',
            '::1',
            '::ffff:7f00:1',
            '64:ff9b::7f00:1',
            '2002:7f00:1::',
            'fd00::1',
            'fe80::1'
        ]) {
            assert.equal(isPrivateAddress(address), true, address);
        }
        assert.equal(isPrivateAddress('8.8.8.8'), false);
        assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
    });

    it('rejects a literal private destination before any request is made', async () => {
        await assert.rejects(
            resolvePublicUrl('https://127.0.0.1/private'),
            /禁止访问/
        );
    });
});

describe('nginx static-file boundary', () => {
    it('does not serve arbitrary repository files from the SPA fallback', () => {
        const config = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'nginx.conf'), 'utf8');
        const expressStatic = sourceFile('backend/middleware/static.js');
        assert.match(config, /location ~ \^\/(?:\(\?:)?backend\|backups\|data\|deploy/);
        assert.match(config, /location \^~ \/\.git/);
        assert.match(config, /location = \/security_best_practices_report\.md[\s\S]*?return 404/);
        assert.doesNotMatch(config, /location \/ \{[\s\S]*?try_files \$uri \/dist\/frontend\/index\.html/);
        assert.doesNotMatch(expressStatic, /express\.static\(publicRoot/);
        assert.match(sourceFile('deploy/openresty-site-security.conf'), /location = \/security_best_practices_report\.md[\s\S]*?return 404/);
    });

    it('keeps public OpenResty free of Lua execution and ambiguous request framing', () => {
        const main = sourceFile('deploy/openresty-nginx.conf');
        const site = sourceFile('deploy/openresty-site-security.conf');
        const proxy = sourceFile('deploy/openresty-root-proxy.conf');

        assert.match(main, /^user www-data www-data;/m);
        assert.doesNotMatch(main, /_by_lua|lua_package_path|1pwaf/);
        assert.match(site, /\$http_transfer_encoding != ""/);
        assert.match(proxy, /proxy_request_buffering on;/);
        assert.match(proxy, /proxy_set_header Connection "";/);
        assert.match(proxy, /proxy_set_header Transfer-Encoding "";/);
    });

    it('delivers authenticated room memory events without proxy buffering', () => {
        const inner = sourceFile('deploy/nginx.conf');
        const origin = sourceFile('deploy/openresty-root-proxy.conf');
        const edge = sourceFile('deploy/hk-frontend-openresty.conf');

        for (const config of [inner, origin, edge]) {
            const block = config.match(/location = \/api\/room\/memory\/events \{[\s\S]*?\n\s*\}/)?.[0] || '';
            assert.match(block, /proxy_buffering off;/);
            assert.match(block, /proxy_cache off;/);
            assert.match(block, /proxy_read_timeout 1h;/);
            assert.match(block, /X-Accel-Buffering "no"/);
        }
    });

    it('proxies the RSS alias instead of serving the SPA shell', () => {
        const origin = sourceFile('deploy/nginx.conf');
        const edge = sourceFile('deploy/hk-frontend-openresty.conf');

        for (const config of [origin, edge]) {
            const block = config.match(/location = \/feed\.xml \{[\s\S]*?\n\s*\}/)?.[0] || '';
            assert.match(block, /proxy_pass/);
            assert.doesNotMatch(block, /try_files/);
        }
    });

    it('does not publish the origin hostname or server addresses in client and deploy defaults', () => {
        for (const relativePath of [
            '.env.example',
            'src/frontend/api/client.js',
            'deploy/hk-frontend-openresty.conf',
            'deploy/hk-frontend-sync.ps1'
        ]) {
            const content = sourceFile(relativePath);
            assert.doesNotMatch(content, /origin\.yachiyo\.hk/);
            assert.doesNotMatch(content, /120\.24\.144\.120|207\.57\.132\.225/);
        }
    });

    it('routes local uploads through the authenticated asset API', () => {
        const config = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'nginx.conf'), 'utf8');
        const block = config.match(/location \^~ \/assets\/uploads\/ \{[\s\S]*?\n    \}/)?.[0] || '';
        assert.match(block, /rewrite \^\/assets\/uploads\/\(\.\*\)\$ \/api\/assets\/local\/\$1 last/);
        assert.doesNotMatch(block, /try_files \$uri/);
    });

    it('serves the versioned Live2D model prefix from the read-only model directory', () => {
        const config = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'nginx.conf'), 'utf8');
        const staticMiddleware = fs.readFileSync(path.join(__dirname, '..', 'backend', 'middleware', 'static.js'), 'utf8');
        const block = config.match(/location \^~ \/models-v4\/ \{[\s\S]*?\n    \}/)?.[0] || '';
        assert.match(block, /alias \/var\/www\/tsukuyomi-space\/models\//);
        assert.match(block, /gzip_types application\/octet-stream/);
        assert.match(block, /immutable/);
        assert.match(staticMiddleware, /app\.use\('\/models-v4', express\.static\(path\.join\(publicRoot, 'models'\)/);
    });
});

describe('browser security headers', () => {
    it('keeps one enforced CSP aligned across the app, HTML fallback, and proxies', () => {
        const headerConfig = sourceFile('deploy/security-headers.inc');
        const frontend = sourceFile('src/frontend/index.html');
        const configuredPolicy = headerConfig.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
        const metaPolicy = frontend.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
        const metaCompatiblePolicy = CONTENT_SECURITY_POLICY.replace(/frame-ancestors 'self';?\s*/, '');

        assert.equal(configuredPolicy, CONTENT_SECURITY_POLICY);
        assert.equal(metaPolicy, metaCompatiblePolicy);
        assert.doesNotMatch(metaPolicy, /frame-ancestors/);
        assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/);
        assert.match(CONTENT_SECURITY_POLICY, /script-src-attr 'none'/);
        assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
        assert.match(CONTENT_SECURITY_POLICY, /base-uri 'self'/);
        assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'self'/);
        assert.match(CONTENT_SECURITY_POLICY, /form-action 'self'/);
        assert.match(CONTENT_SECURITY_POLICY, /manifest-src 'self'/);
        assert.match(CONTENT_SECURITY_POLICY, /connect-src[^;]*http:\/\/localhost:11434/);
        assert.match(CONTENT_SECURITY_POLICY, /img-src[^;]*http:\/\/localhost:9880[^;]*http:\/\/127\.0\.0\.1:9880/);
        assert.match(CONTENT_SECURITY_POLICY, /media-src[^;]*http:\/\/localhost:9880[^;]*http:\/\/127\.0\.0\.1:9880/);
        assert.doesNotMatch(CONTENT_SECURITY_POLICY, /connect-src[^;]*\shttp:\s/);
        assert.doesNotMatch(CONTENT_SECURITY_POLICY, /(?:img|media)-src[^;]*\shttp:\s/);
        assert.doesNotMatch(CONTENT_SECURITY_POLICY, /upgrade-insecure-requests/);
        assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval|script-src[^;]*unsafe-inline/);
    });

    it('sets the complete browser header bundle in Express', () => {
        const headers = new Map();
        securityHeaders({}, {
            setHeader(name, value) {
                headers.set(name.toLowerCase(), value);
            }
        }, () => {});

        assert.equal(headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
        assert.equal(headers.get('x-content-type-options'), 'nosniff');
        assert.equal(headers.get('x-frame-options'), 'SAMEORIGIN');
        assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
        assert.equal(headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=(self)');
        assert.equal(headers.get('x-permitted-cross-domain-policies'), 'none');
        assert.equal(headers.get('origin-agent-cluster'), '?1');
        assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
        assert.equal(headers.get('cross-origin-resource-policy'), 'same-site');
        assert.equal(headers.get('x-xss-protection'), '0');
    });

    it('retains security headers in every location that overrides add_header inheritance', () => {
        for (const relativePath of [
            'deploy/nginx.conf',
            'deploy/hk-frontend-openresty.conf',
            'deploy/openresty-root-proxy.conf',
            'deploy/openresty-agent-os.conf'
        ]) {
            for (const block of locationBlocks(sourceFile(relativePath))) {
                if (!/\badd_header\b/.test(block)) continue;
                assert.match(block, /security-headers\.inc/, `${relativePath}: ${block.split('\n')[0].trim()}`);
            }
        }
    });

    it('normalizes proxy headers and forces HTTP requests back to HTTPS', () => {
        const headerConfig = sourceFile('deploy/security-headers.inc');
        const originSecurity = sourceFile('deploy/openresty-site-security.conf');
        const originProxy = sourceFile('deploy/openresty-root-proxy.conf');
        const agentOs = sourceFile('deploy/openresty-agent-os.conf');
        const installer = sourceFile('deploy/install-openresty-hardening.sh');
        const edge = sourceFile('deploy/hk-frontend-openresty.conf');

        for (const name of [
            'Content-Security-Policy',
            'Strict-Transport-Security',
            'X-Content-Type-Options',
            'X-Frame-Options',
            'Referrer-Policy',
            'Permissions-Policy',
            'X-Permitted-Cross-Domain-Policies',
            'Origin-Agent-Cluster',
            'Cross-Origin-Opener-Policy',
            'Cross-Origin-Resource-Policy',
            'X-XSS-Protection'
        ]) {
            assert.match(headerConfig, new RegExp(`add_header ${name.replaceAll('-', '\\-')} `));
            assert.match(originProxy, new RegExp(`proxy_hide_header ${name.replaceAll('-', '\\-')};`));
            assert.match(edge, new RegExp(`proxy_hide_header ${name.replaceAll('-', '\\-')};`));
        }

        assert.match(headerConfig, /Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/);
        for (const config of [originSecurity, originProxy, agentOs]) {
            assert.match(config, /include \/www\/sites\/yachiyo\.hk\/proxy\/_tsukuyomi-security-headers\.inc;/);
            assert.doesNotMatch(config, /include \/opt\/1panel\/www\/sites\//);
        }
        assert.match(originSecurity, /\$http_x_forwarded_proto = "http"[\s\S]*return 308 https:\/\/\$host\$request_uri;/);
        assert.match(edge, /listen 80;[\s\S]*location \/ \{[\s\S]*return 308 https:\/\/\$host\$request_uri;/);
        assert.match(installer, /WWW_SITE_DIR="\$SITE_ROOT\/www\.yachiyo\.hk"/);
        assert.match(installer, /install[^\n]+openresty-root-proxy\.conf "\$WWW_SITE_DIR\/proxy\/root\.conf"/);
        assert.match(installer, /install[^\n]+openresty-agent-os\.conf "\$WWW_SITE_DIR\/proxy\/agent-os\.conf"/);
    });
});

describe('sensitive error handling', () => {
    it('does not expose proxy bodies, runtime errors, or JWT configuration through client helpers', () => {
        const client = sourceFile('src/frontend/api/client.js');
        const terminal = sourceFile('src/frontend/pages/TerminalPage.vue');
        const frontendMain = sourceFile('src/frontend/main.js');
        const auth = sourceFile('backend/middleware/auth.js');
        const server = sourceFile('backend/server.js');

        assert.doesNotMatch(client, /text\.replace\(/);
        assert.doesNotMatch(terminal, /text\.replace\(/);
        assert.match(frontendMain, /if \(import\.meta\.env\.DEV\) console\.error/);
        assert.doesNotMatch(auth, /JWT_SECRET\s*:/);
        assert.doesNotMatch(server, /console\.log\('Database:'/);
    });
});

describe('stage delivery hardening', () => {
    it('does not truncate SEO articles and reserves static HTML for crawlers', () => {
        const staticMiddleware = sourceFile('backend/middleware/static.js');
        const seoRenderer = sourceFile('backend/seo/render-article.js');
        const nginxConfig = sourceFile('deploy/nginx.conf');

        assert.match(staticMiddleware, /CRAWLER_USER_AGENT/);
        assert.match(staticMiddleware, /!isCrawlerRequest\(req\)/);
        assert.doesNotMatch(seoRenderer, /articles\.slice\(0, 24\)/);
        assert.match(nginxConfig, /location = \/sitemap-images\.xml \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/);
        assert.match(nginxConfig, /location ~ \^\/\(\?:hub\|pixel\|gallery\|friend-links\|wiki[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/);
    });

    it('keeps versioned friend previews cacheable without weakening API cache isolation', () => {
        for (const relativePath of [
            'deploy/nginx.conf',
            'deploy/openresty-root-proxy.conf',
            'deploy/hk-frontend-openresty.conf',
            'deploy/overseas-openresty.conf'
        ]) {
            const config = sourceFile(relativePath);
            const block = config.match(/location \^~ \/friend-link-previews\/ \{[\s\S]*?\n\s*\}/)?.[0] || '';
            assert.match(block, /proxy_pass/);
            assert.match(block, /max-age=31536000, immutable/);
            assert.match(block, /proxy_hide_header Set-Cookie/);
        }

        const origin = sourceFile('deploy/nginx.conf');
        const apiBlock = origin.match(/location \/api\/ \{[\s\S]*?\n\s*\}/)?.[0] || '';
        assert.match(apiBlock, /private, no-store/);
    });

    it('bounds the overseas Wiki translation and crawler rendering surface', () => {
        const nginx = sourceFile('deploy/overseas-openresty.conf');
        const service = sourceFile('deploy/overseas-translation-service.py');
        const translationBlock = nginx.match(/location = \/en-translate \{[\s\S]*?\n    \}/)?.[0] || '';
        const seoBlock = nginx.match(/location @english_seo \{[\s\S]*?\n    \}/)?.[0] || '';

        assert.match(translationBlock, /limit_except POST/);
        assert.match(translationBlock, /client_max_body_size 256k/);
        assert.match(translationBlock, /client_body_timeout 10s/);
        assert.match(seoBlock, /set \$english_original_uri \$request_uri/);
        assert.match(seoBlock, /X-Original-URI \$english_original_uri/);
        assert.doesNotMatch(seoBlock, /X-Original-URI \$request_uri/);
        assert.match(service, /def normalize_public_seo_path/);
        assert.match(service, /set\(query\) != \{"art"\}/);
        assert.match(service, /re\.fullmatch\(r"\[1-9\]\\d\{0,18\}"/);
        assert.match(service, /PUBLIC_SEO_PATHS/);
        assert.match(service, /MAX_TRANSLATION_CACHE_ROWS/);
        assert.match(service, /MAX_DOCUMENT_CACHE_ROWS/);
        assert.match(service, /BoundedSemaphore\(MAX_CONCURRENT_TRANSLATIONS\)/);
        assert.match(service, /SEO_REQUESTS_PER_MINUTE/);
        assert.match(service, /TRANSLATED_API_PATH_RE/);
    });
});

describe('deployment privilege boundary', () => {
    it('keeps application source read-only to the service account', () => {
        const deploy = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'deploy.sh'), 'utf8');
        const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
        const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
        assert.match(deploy, /umask 027/);
        assert.match(deploy, /chown root:root/);
        assert.match(deploy, /chmod go-w/);
        assert.match(deploy, /npm ls --omit=dev --depth=0/);
        assert.match(deploy, /npm_config_jobs="\$\{npm_config_jobs:-1\}"/);
        assert.match(deploy, /npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-save/);
        assert.match(dockerfile, /chown -R root:root \/app/);
        assert.match(compose, /read_only: true/);
        assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
        assert.match(compose, /no-new-privileges:true/);
        assert.match(compose, /127\.0\.0\.1:\$\{TSUKUYOMI_HTTP_PORT/);
        assert.match(compose, /MINIO_ROOT_USER: \$\{MILVUS_MINIO_ACCESS_KEY:/);
        assert.match(compose, /MINIO_ACCESS_KEY_ID: \$\{MILVUS_MINIO_ACCESS_KEY:/);
    });

    it('stages prebuilt files outside the Git worktree before merging', () => {
        const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
        assert.match(workflow, /target: \/tmp\/tsukuyomi-prebuilt-\$\{\{ github\.run_id \}\}/);
        assert.match(workflow, /git restore --worktree -- lib\/bundled\/live2d-room-neuro-live\.iife\.js[\s\S]*git .*merge --ff-only FETCH_HEAD/);
        assert.match(workflow, /git .*merge --ff-only FETCH_HEAD[\s\S]*cp -a "\$prebuilt\/dist\/\." "\$app\/dist\/"/);
    });

    it('updates the Nginx configuration that the host actually includes', () => {
        const deploy = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'deploy.sh'), 'utf8');
        assert.match(deploy, /include \/etc\/nginx\/conf\.d\/\*\.conf;/);
        assert.match(deploy, /NGINX_SITE_PATH=\/etc\/nginx\/conf\.d\/tsukuyomi-space\.conf/);
        assert.match(deploy, /NGINX_SITE_PATH=\/etc\/nginx\/sites-available\/tsukuyomi-space/);
        assert.match(deploy, /if ! nginx -t; then[\s\S]*mv "\$NGINX_BACKUP" "\$NGINX_SITE_PATH"/);
    });
});
