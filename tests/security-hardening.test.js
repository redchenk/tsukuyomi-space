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
        assert.match(config, /location ~ \^\/(?:\(\?:)?backend\|backups\|data\|deploy/);
        assert.match(config, /location \^~ \/\.git/);
        assert.doesNotMatch(config, /location \/ \{[\s\S]*?try_files \$uri \/dist\/frontend\/index\.html/);
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
});
