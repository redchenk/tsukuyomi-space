const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-security-'));
Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.sqlite'),
    JWT_SECRET: 'security-test-secret-over-32-characters', REDIS_URL: '',
    ADMIN_PASSWORD: 'security-test-password', ENABLE_FRONTEND_DIST: 'false',
    ROOM_WEATHER_OFFLINE: 'true', ROOM_WEATHER_IP_LOOKUP: 'false',
    QQ_CLIENT_ID: 'test-client', QQ_CLIENT_SECRET: 'test-secret',
    QQ_REDIRECT_URI: 'https://yachiyo.hk/api/auth/oauth/qq/callback'
});
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
const qqOAuth = require('../backend/services/qq-oauth');
const oauthBrowser = require('../backend/services/oauth-browser');
const objectStorage = require('../backend/services/object-storage');
const assetRepository = require('../backend/repositories/asset-repository');
let server, base;
const tokens = {};
let providerCalls = 0;
let providerId = '';
const originalProfile = qqOAuth.getProfileFromCode;
const originalObject = objectStorage.getObject;

before(async () => {
    const app = createApp();
    for (const id of ['owner', 'attacker', 'binding-user']) {
        db.prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)')
            .run(id, id, `${id}@example.test`, bcrypt.hashSync('test-password', 4));
        tokens[id] = generateToken({ id });
    }
    qqOAuth.getProfileFromCode = async () => {
        providerCalls++;
        return { provider: 'qq', providerUserId: providerId, nickname: 'Test QQ', email: '', raw: {} };
    };
    objectStorage.getObject = async () => ({ buffer: Buffer.from('private test content'), contentType: 'text/plain' });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    qqOAuth.getProfileFromCode = originalProfile;
    objectStorage.getObject = originalObject;
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

function cookieFor(response) {
    return response.headers.getSetCookie().find(value => value.startsWith(`${oauthBrowser.COOKIE_NAME}=`))?.split(';')[0] || '';
}
function headers(user = '', cookie = '') {
    return { 'Content-Type': 'application/json', Origin: base, 'Sec-Fetch-Site': 'same-origin',
        'X-Requested-With': 'XMLHttpRequest', ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}) };
}
async function start(user = '') {
    const response = await fetch(`${base}/api/auth/oauth/qq/start`, { headers: headers(user), redirect: 'manual' });
    assert.equal(response.status, 302);
    return { state: new URL(response.headers.get('location')).searchParams.get('state'), cookie: cookieFor(response), response };
}
async function callback(flow, user = '', cookie = flow.cookie) {
    return fetch(`${base}/api/auth/oauth/qq/callback?code=test-code&state=${flow.state}`, {
        headers: headers(user, cookie), redirect: 'manual'
    });
}

test('QQ authorization rejects a transplanted callback before contacting the provider', async () => {
    const flow = await start();
    assert.match(flow.cookie, /^tsukuyomi_qq_oauth=[a-f0-9]{64}$/);
    assert.match(flow.response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(flow.response.headers.get('set-cookie'), /SameSite=Lax/);
    const previous = providerCalls;
    for (const cookie of ['', `tsukuyomi_qq_oauth=${'b'.repeat(64)}`]) {
        const response = await callback(flow, 'owner', cookie);
        assert.match(response.headers.get('location'), /qq_invalid_state/);
    }
    // Even a correct flow cookie cannot bind to an account logged in later.
    const changedAccount = await callback(flow, 'owner');
    assert.match(changedAccount.headers.get('location'), /qq_invalid_state/);
    assert.equal(providerCalls, previous);
});

test('QQ binding succeeds for the initiating browser and account; callback cannot replay', async () => {
    providerId = 'binding-provider-id';
    const flow = await start('binding-user');
    const response = await callback(flow, 'binding-user');
    assert.equal(response.status, 302);
    assert.doesNotMatch(response.headers.get('location'), /oauth_error/);
    assert.equal(db.prepare('SELECT user_id FROM user_oauth_accounts WHERE provider_user_id = ?').get(providerId).user_id, 'binding-user');
    const replay = await callback(flow, 'binding-user');
    assert.match(replay.headers.get('location'), /qq_invalid_state/);
});

test('QQ pending profile and binding remain bound to the initiating browser', async () => {
    providerId = 'pending-provider-id';
    const flow = await start();
    const response = await callback(flow);
    const ticket = new URL(response.headers.get('location')).searchParams.get('ticket');
    assert.ok(ticket);
    const pendingPath = `${base}/api/auth/oauth/qq/pending?ticket=${ticket}`;
    assert.equal((await fetch(pendingPath)).status, 404);
    assert.equal((await fetch(pendingPath, { headers: headers('', flow.cookie) })).status, 200);
    const wrong = await fetch(`${base}/api/auth/oauth/qq/bind`, {
        method: 'POST', headers: headers('owner'), body: JSON.stringify({ ticket })
    });
    assert.equal(wrong.status, 404);
    const correct = await fetch(`${base}/api/auth/oauth/qq/bind`, {
        method: 'POST', headers: headers('owner', flow.cookie), body: JSON.stringify({ ticket })
    });
    assert.equal(correct.status, 200);
    assert.equal((await fetch(pendingPath, { headers: headers('', flow.cookie) })).status, 404);
});

test('OAuth entry metadata uses the registered callback origin without credentials', async () => {
    const payload = await (await fetch(`${base}/api/settings`)).json();
    assert.equal(payload.data.qqOAuthStartUrl, 'https://yachiyo.hk/api/auth/oauth/qq/start');
    assert.ok(!JSON.stringify(payload).includes('test-secret'));
});

test('an article cannot publish another users private attachment by referencing its URL', async () => {
    const id = crypto.randomUUID();
    const url = `https://storage.example.test/${id}.txt`;
    assetRepository.createAsset({ id, ownerId: 'owner', assetType: 'document', mimeType: 'text/plain',
        url, storageKey: `${id}.txt`, metadata: { storage: 'oss', visibility: 'private' } });
    const path = `/api/assets/proxy/${id}`;
    assert.equal((await fetch(`${base}${path}`, { headers: headers('attacker') })).status, 403);
    const article = await fetch(`${base}/api/articles`, { method: 'POST', headers: headers('attacker'),
        body: JSON.stringify({ title: 'Attacker reference', content: `[file](${path})\n${url}`, cover_image: path, category: '二创' }) });
    assert.equal(article.status, 201);
    assert.equal((await fetch(`${base}${path}`)).status, 401);
    assert.equal((await fetch(`${base}${path}`, { headers: headers('attacker') })).status, 403);
    assert.equal((await fetch(`${base}${path}`, { headers: headers('owner') })).status, 200);

    const owned = await fetch(`${base}/api/articles`, { method: 'POST', headers: headers('owner'),
        body: JSON.stringify({ title: 'Owner publication', content: `[file](${path})`, category: '二创' }) });
    assert.equal(owned.status, 201);
    assert.equal((await fetch(`${base}${path}`)).status, 200);
    const articleId = (await owned.json()).data.id;
    db.prepare("UPDATE articles SET status = 'draft' WHERE id = ?").run(articleId);
    assert.equal((await fetch(`${base}${path}`)).status, 401);
});

test('explicitly authorized article attachments still publish', () => {
    const articleId = db.prepare("INSERT INTO articles (title, author_id, status) VALUES ('Editor approved', 'attacker', 'published')").run().lastInsertRowid;
    const id = crypto.randomUUID();
    assetRepository.createAsset({ id, articleId, ownerId: 'owner', assetType: 'document', mimeType: 'text/plain',
        url: `/api/assets/proxy/${id}`, storageKey: `${id}.txt`, metadata: { visibility: 'private' } });
    assert.equal(assetRepository.isAssetPubliclyReferenced(id), true);
});

test('malformed anonymous async queries return errors without killing the API', async () => {
    const response = await fetch(`${base}/api/room/world?timezone[toString]=invalid`);
    assert.equal(response.status, 500);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('invalid MCP hosts return a bounded JSON-RPC error and keep the API alive', async () => {
    const response = await fetch(`${base}/api/mcp/token-plan`, { method: 'POST', headers: headers('owner'),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'web_search',
            meta: { auth: { api_key: 'test-not-real', api_host: 'https://127.0.0.1/' } }, arguments: { query: 'test' } } }) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, -32602);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
});
