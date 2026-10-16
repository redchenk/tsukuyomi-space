const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-oauth-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dir, DB_PATH: path.join(dir, 'test.db'),
    JWT_SECRET: 'partner-oauth-fixture-key-not-for-production', REDIS_URL: '', ADMIN_PASSWORD: 'fixture-password',
    ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true', FUSHI_ENABLED: 'false',
    PARTNER_OAUTH_ISSUER: 'https://yachiyo.hk' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const oauth = require('../backend/services/partner-oauth');
const { generateToken } = require('../backend/middleware/auth');
let server, base, session, secondSession;
const clientId = 'eighth-generation', secret = 's'.repeat(43), callback = 'https://partner.example.test/callback';
const verifier = 'v'.repeat(43);
const basic = (id = clientId, password = secret) => 'Basic ' + Buffer.from(`${id}:${password}`).toString('base64');
const params = (extra = {}) => ({ response_type: 'code', client_id: clientId, redirect_uri: callback,
    scope: 'profile.basic', state: 'state-fixture', code_challenge_method: 'S256',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), ...extra });
async function call(url, options = {}) {
    const response = await fetch(base + url, { ...options, redirect: 'manual' });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch (_) { /* HTML or empty response */ }
    return { response, status: response.status, text, data };
}
function cookie(token = session) { return { Cookie: `tsukuyomi_session=${token}` }; }
async function consent(extra = {}, token = session) {
    const result = await call('/oauth/authorize?' + new URLSearchParams(params(extra)), { headers: cookie(token) });
    assert.equal(result.status, 200);
    return result.text.match(/name="ticket" value="([^"]+)"/)?.[1];
}
async function decide(ticket, approve = 'yes', token = session, extraHeaders = {}) {
    return call('/oauth/authorize', { method: 'POST', headers: { ...cookie(token), Origin: base,
        'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders }, body: new URLSearchParams({ ticket, approve }).toString() });
}
async function code(extra = {}) {
    const result = await decide(await consent(extra));
    assert.equal(result.status, 303);
    const location = new URL(result.response.headers.get('location'));
    assert.equal(location.searchParams.get('iss'), 'https://yachiyo.hk');
    assert.equal(location.searchParams.get('state'), 'state-fixture');
    return location.searchParams.get('code');
}
async function exchange(value, extra = {}, auth = basic()) {
    return call('/api/partner/oauth/token', { method: 'POST', headers: { Authorization: auth,
        'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: value, redirect_uri: callback, code_verifier: verifier, ...extra }).toString() });
}
async function profile(token) { return call('/api/partner/oauth/userinfo', { headers: { Authorization: `Bearer ${token}` } }); }
before(async () => {
    const app = createApp();
    db.prepare('INSERT INTO users(id,username,nickname,email,password_hash,role,avatar) VALUES(?,?,?,?,?,?,?)')
        .run('partner-user', 'private-username', '昵称', 'private@example.test', 'password-fixture', 'user', '/assets/avatar.png');
    db.prepare('INSERT INTO users(id,username,nickname,email,password_hash,role) VALUES(?,?,?,?,?,?)')
        .run('other-user', 'other', '其他用户', 'other@example.test', 'other-password', 'user');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
    for (const table of ['partner_oauth_tokens', 'partner_oauth_codes', 'partner_oauth_requests', 'partner_oauth_identities', 'partner_oauth_clients']) db.prepare(`DELETE FROM ${table}`).run();
    db.prepare("UPDATE users SET password_hash='password-fixture',role='user',nickname='昵称',avatar='/assets/avatar.png' WHERE id='partner-user'").run();
    oauth.registerClient({ id: clientId, name: '第八千代', redirectUris: [callback], secret });
    session = generateToken({ id: 'partner-user' });
    secondSession = generateToken({ id: 'other-user' });
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('real HTTP flow gives minimal stable identity, no refresh, no CORS and no cache', async () => {
    const result = await exchange(await code());
    assert.equal(result.status, 200); assert.equal(result.data.expires_in, 300);
    assert.deepEqual(Object.keys(result.data).sort(), ['access_token', 'expires_in', 'scope', 'token_type']);
    assert.equal(result.data.scope, 'profile.basic');
    assert.match(result.response.headers.get('cache-control'), /no-store/);
    assert.equal(result.response.headers.get('access-control-allow-origin'), null);
    const user = await profile(result.data.access_token);
    assert.equal(user.status, 200);
    assert.deepEqual(Object.keys(user.data).sort(), ['avatar', 'nickname', 'sub']);
    assert.equal(user.data.avatar, 'https://yachiyo.hk/assets/avatar.png');
    db.prepare("UPDATE users SET nickname='新昵称',avatar='javascript:alert(1)' WHERE id='partner-user'").run();
    const again = await profile((await exchange(await code())).data.access_token);
    assert.equal(again.data.sub, user.data.sub); assert.equal(again.data.nickname, '新昵称'); assert.equal(again.data.avatar, '');
    const stored = JSON.stringify(db.prepare('SELECT * FROM partner_oauth_tokens').all());
    assert.ok(!stored.includes(result.data.access_token));
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM partner_oauth_clients').all()).includes(secret));
});
test('login preserves request; exact callback, repeated fields, scope and PKCE are enforced', async () => {
    const url = '/oauth/authorize?' + new URLSearchParams(params());
    const guest = await call(url);
    assert.match(guest.text, /前往登录/); assert.match(guest.text, /redirect=%2Foauth%2Fauthorize/);
    assert.match(guest.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(guest.response.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(!guest.text.includes('<script'));
    for (const extra of [{ redirect_uri: callback + '/evil' }, { scope: 'email' }, { code_challenge_method: 'plain' }, { response_type: 'token' }, { client_id: 'missing' }]) {
        const r = await call('/oauth/authorize?' + new URLSearchParams(params(extra)), { headers: cookie() });
        assert.equal(r.status, 400); assert.equal(r.response.headers.get('location'), null);
    }
    assert.equal((await call(url + '&client_id=duplicate', { headers: cookie() })).status, 400);
});
test('registration rejects unsafe callbacks and consent escapes client and account text', async () => {
    for (const uri of ['http://partner.example.test/callback', 'https://*.example.test/callback', callback + '?',
        callback + '?next=evil', callback + '#', callback + '#fragment', 'https://user:password@partner.example.test/callback', callback + '\\x']) {
        assert.throws(() => oauth.validateRegistration({ id: 'test', name: 'test', redirectUris: [uri] }), e => e.oauthError === 'invalid_request');
    }
    db.prepare('UPDATE partner_oauth_clients SET name=?').run('<script>alert(1)</script>');
    db.prepare('UPDATE users SET nickname=? WHERE id=?').run('<img src=x onerror=alert(1)>', 'partner-user');
    const page = await call('/oauth/authorize?' + new URLSearchParams(params()), { headers: cookie() });
    assert.match(page.text, /&lt;script&gt;/); assert.match(page.text, /&lt;img/);
    assert.doesNotMatch(page.text, /<script>|<img/);
});
test('production endpoints require the configured host and preserve no-store failures', async () => {
    const config = require('../backend/config');
    const previous = config.isProduction;
    config.isProduction = true;
    try {
        // Fetch reserves Host; use the HTTP transport to exercise proxy hosts.
        const withHost = host => new Promise((resolve, reject) => {
            require('node:http').get(base + '/api/partner/oauth/userinfo', { headers: { Host: host } }, res => {
                let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) }));
            }).on('error', reject);
        });
        const invalid = await withHost('other.example.test');
        assert.equal(invalid.status, 400); assert.match(invalid.headers['cache-control'], /no-store/);
        const canonical = await withHost('yachiyo.hk');
        assert.equal(canonical.status, 401); assert.equal(canonical.data.error, 'invalid_token');
    } finally { config.isProduction = previous; }
});
test('consent requires same-origin browser session, explicit action and one-use ticket', async () => {
    const ticket = await consent();
    assert.equal((await decide(ticket, 'yes', session, { Origin: 'https://evil.example.test' })).status, 403);
    assert.equal((await decide(ticket, 'yes', session, { Origin: 'null' })).status, 403);
    assert.equal((await decide(ticket, 'yes', session, { Origin: 'null', 'Sec-Fetch-Site': 'same-site' })).status, 403);
    assert.equal((await decide(ticket, 'yes', session, { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await decide(ticket, 'yes', secondSession)).status, 400);
    assert.equal((await decide(ticket, 'yes', generateToken({ id: 'partner-user' }))).status, 400);
    assert.equal((await decide(ticket, 'maybe')).status, 400);
    const cancel = await decide(ticket, 'no', session, { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(cancel.status, 303);
    const location = new URL(cancel.response.headers.get('location'));
    assert.equal(location.searchParams.get('error'), 'access_denied'); assert.ok(!location.searchParams.has('code'));
    assert.equal((await decide(ticket)).status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_oauth_codes').get().n, 0);
});
test('wrong verifier does not burn code or revoke token; authenticated replay revokes it', async () => {
    const value = await code();
    assert.equal((await exchange(value, { code_verifier: 'x'.repeat(43) })).data.error, 'invalid_grant');
    assert.equal((await exchange(value, { redirect_uri: callback + '/wrong' })).data.error, 'invalid_grant');
    const token = (await exchange(value)).data.access_token;
    assert.equal((await exchange(value, { code_verifier: 'x'.repeat(43) })).status, 400);
    assert.equal((await profile(token)).status, 200);
    assert.equal((await exchange(value)).data.error, 'invalid_grant');
    assert.equal((await profile(token)).status, 401);
});
test('concurrent code exchanges can issue at most one token', async () => {
    const value = await code();
    const results = await Promise.all([exchange(value), exchange(value)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_oauth_tokens').get().n, 1);
});
test('back-channel endpoints refuse cookies, browser origins, JSON, query tokens and site JWTs', async () => {
    const value = await code();
    assert.equal((await exchange(value, {}, basic(clientId, 'wrong'))).status, 401);
    for (const headers of [{ Origin: base }, cookie(), { 'Sec-Fetch-Site': 'same-origin' }]) {
        const r = await call('/api/partner/oauth/token', { method: 'POST', headers: { ...headers,
            Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=authorization_code' });
        assert.equal(r.status, 403); assert.equal(r.response.headers.get('access-control-allow-origin'), null);
    }
    assert.equal((await call('/api/partner/oauth/token', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/json' }, body: '{}' })).data.error, 'invalid_request');
    const duplicate = await call('/api/partner/oauth/token', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'code=a&code=b' });
    assert.equal(duplicate.status, 400);
    assert.equal((await profile(session)).data.error, 'invalid_token');
    assert.equal((await call('/api/partner/oauth/userinfo?access_token=bad')).status, 400);
    assert.equal((await call('/api/partner/oauth/token', { method: 'OPTIONS' })).status, 405);
    const token = (await exchange(value)).data.access_token;
    assert.equal((await call('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })).status, 403);
    assert.equal((await exchange('fixture', { grant_type: 'refresh_token' })).data.error, 'unsupported_grant_type');
});
test('code, request and token expiry reject access', async () => {
    let ticket = await consent();
    db.prepare('UPDATE partner_oauth_requests SET expires_at=0').run();
    assert.equal((await decide(ticket)).status, 400);
    let value = await code();
    db.prepare('UPDATE partner_oauth_codes SET expires_at=0').run();
    assert.equal((await exchange(value)).data.error, 'invalid_grant');
    const token = (await exchange(await code())).data.access_token;
    db.prepare('UPDATE partner_oauth_tokens SET expires_at=0').run();
    assert.equal((await profile(token)).data.error, 'invalid_token');
});
test('password changes, banned users, disabled clients and issuer changes invalidate grants', async () => {
    for (const action of ['password', 'ban', 'client', 'issuer']) {
        const token = (await exchange(await code())).data.access_token;
        if (action === 'password') db.prepare("UPDATE users SET password_hash='new' WHERE id='partner-user'").run();
        if (action === 'ban') db.prepare("UPDATE users SET role='banned' WHERE id='partner-user'").run();
        if (action === 'client') db.prepare('UPDATE partner_oauth_clients SET enabled=0').run();
        if (action === 'issuer') process.env.PARTNER_OAUTH_ISSUER = 'https://other.example.test';
        assert.equal((await profile(token)).status, 401);
        process.env.PARTNER_OAUTH_ISSUER = 'https://yachiyo.hk';
        db.prepare("UPDATE users SET password_hash='password-fixture',role='user' WHERE id='partner-user'").run();
        db.prepare('UPDATE partner_oauth_clients SET enabled=1').run();
    }
});
test('client ownership on exchange and revocation, idempotent revoke and Basic form encoding', async () => {
    oauth.registerClient({ id: 'other', name: 'Other', redirectUris: [callback], secret });
    const value = await code();
    assert.equal((await exchange(value, {}, basic('other'))).status, 400);
    const encodedBasic = 'Basic ' + Buffer.from(`%65ighth-generation:${secret}`).toString('base64');
    const token = (await exchange(value, {}, encodedBasic)).data.access_token;
    const revoke = (auth, t = token) => call('/api/partner/oauth/revoke', { method: 'POST', headers: { Authorization: auth,
        'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t, token_type_hint: 'access_token' }).toString() });
    assert.equal((await revoke(basic('other'))).status, 200); assert.equal((await profile(token)).status, 200);
    assert.equal((await revoke(basic())).status, 200); assert.equal((await profile(token)).status, 401);
    assert.equal((await revoke(basic())).text, ''); assert.equal((await revoke(basic(), 'unknown')).status, 200);
    assert.equal((await revoke(basic(clientId, 'wrong'))).status, 401);
});
test('user can revoke all existing codes and tokens without changing stable sub', async () => {
    const token = (await exchange(await code())).data.access_token;
    const oldSub = (await profile(token)).data.sub;
    const pendingCode = await code(), pendingConsent = await consent();
    const list = await call('/oauth/connections', { headers: cookie() });
    const ticket = list.text.match(/name="ticket" value="([^"]+)"/)[1];
    const revoke = token => call('/oauth/connections', { method: 'POST', headers: { ...cookie(token), Origin: base,
        'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ticket }).toString() });
    assert.equal((await revoke(secondSession)).status, 400);
    assert.equal((await revoke(session)).status, 303);
    assert.equal((await profile(token)).status, 401); assert.equal((await exchange(pendingCode)).status, 400);
    assert.equal((await decide(pendingConsent)).status, 400);
    const again = (await exchange(await code())).data.access_token;
    assert.equal((await profile(again)).data.sub, oldSub);
});
test('operator CLI issues secrets only into exclusive mode-600 files and preserves identity across rotation', async () => {
    const script = path.join(__dirname, '../scripts/partner-oauth-client.cjs');
    const output = path.join(dir, 'delivery.json');
    const invoke = args => spawnSync(process.execPath, [script, ...args], { env: process.env, encoding: 'utf8' });
    const created = invoke(['create', '--id', 'cli-client', '--name', '测试应用', '--redirect', callback, '--output', output]);
    assert.equal(created.status, 0, created.stderr);
    const delivered = JSON.parse(fs.readFileSync(output));
    assert.equal(fs.statSync(output).mode & 0o777, 0o600); assert.equal(delivered.issuer, 'https://yachiyo.hk');
    assert.ok(!created.stdout.includes(delivered.client_secret));
    const overwrite = invoke(['rotate', '--id', 'cli-client', '--output', output]);
    assert.notEqual(overwrite.status, 0);
    const token = (await exchange(await code())).data.access_token;
    const sub = (await profile(token)).data.sub;
    assert.equal(invoke(['rotate', '--id', clientId, '--output', path.join(dir, 'rotated.json')]).status, 0);
    assert.equal((await profile(token)).status, 401);
    assert.equal(db.prepare('SELECT sub FROM partner_oauth_identities WHERE client_id=?').get(clientId).sub, sub);
    assert.equal(invoke(['disable', '--id', 'cli-client']).status, 0);
    assert.equal(oauth.client('cli-client'), null);
});
test('rate-limited back-channel responses retain the OAuth error contract', async () => {
    let result;
    for (let n = 0; n < 121; n++) result = await call('/api/partner/oauth/userinfo', { headers: { 'X-Real-IP': '2001:db8::aaaa' } });
    assert.equal(result.status, 429); assert.deepEqual(result.data, { error: 'rate_limited' });
    assert.ok(Number(result.response.headers.get('retry-after')) > 0);
    assert.match(result.response.headers.get('cache-control'), /no-store/);
    assert.equal(result.response.headers.get('access-control-allow-origin'), null);
});
