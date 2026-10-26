const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-native-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dir, DB_PATH: path.join(dir, 'test.sqlite'),
    JWT_SECRET: 'native-qq-fixture-secret-over-32-characters', REDIS_URL: '', ADMIN_PASSWORD: 'fixture-password',
    ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true', ROOM_WEATHER_IP_LOOKUP: 'false',
    QQ_NATIVE_APP_ID: '1905926637', PUBLIC_SITE_URL: 'https://yachiyo.hk' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const repository = require('../backend/repositories/auth-repository');
const browser = require('../backend/services/oauth-browser');
const native = require('../backend/services/qq-native');
const { generateToken, USER_SESSION_COOKIE } = require('../backend/middleware/auth');
const originalFetch = global.fetch;
const appId = '1905926637', accessToken = 'f'.repeat(32);
let openId = 'A'.repeat(32), providerMode = '', providerCalls = 0, base, server;
const sessions = {};
before(async () => {
    const app = createApp();
    for (const user of ['alice', 'bob', 'banned', 'racer']) {
        db.prepare('INSERT INTO users (id,username,email,password_hash,role) VALUES (?,?,?,?,?)')
            .run(user, user, `${user}@example.test`, bcrypt.hashSync('fixture-password', 4), user === 'banned' ? 'banned' : 'user');
        sessions[user] = `${USER_SESSION_COOKIE}=${generateToken({ id: user, role: user === 'banned' ? 'banned' : 'user' })}`;
    }
    global.fetch = async (input, options) => {
        const url = new URL(input);
        if (url.hostname !== 'graph.qq.com') return originalFetch(input, options);
        providerCalls++;
        assert.equal(options.redirect, 'error');
        assert.equal(url.searchParams.get('access_token'), accessToken);
        if (providerMode === 'throw') throw new Error(`unsafe provider ${accessToken}`);
        if (providerMode === 'oversize') return new Response(' '.repeat(65537));
        if (url.pathname === '/oauth2.0/me') return Response.json({
            client_id: providerMode === 'wrong-app' ? '1904951941' : providerMode === 'missing-app' ? undefined : appId,
            openid: providerMode === 'wrong-id' ? 'B'.repeat(32) : openId,
        });
        assert.equal(url.pathname, '/user/get_user_info');
        assert.equal(url.searchParams.get('oauth_consumer_key'), appId);
        assert.equal(url.searchParams.get('openid'), openId);
        return Response.json({ ret: providerMode === 'profile-error' ? 100 : 0, nickname: 'QQ Native Fixture',
            figureurl_qq_2: 'https://q.qlogo.cn/fixture', email: 'alice@example.test', unionid: 'unverified-union' });
    };
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { global.fetch = originalFetch; await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
function headers(user = '', cookie = '') { return { 'Content-Type': 'application/json', Origin: base, 'X-Requested-With': 'XMLHttpRequest', Cookie: [sessions[user], cookie].filter(Boolean).join('; ') }; }
async function post(route, body, user = '', cookie = '') { return fetch(`${base}/api/auth/oauth/qq/${route}`, { method: 'POST', headers: headers(user, cookie), body: JSON.stringify(body) }); }
async function start(user = '', action = 'login') {
    const response = await post('native/start', { action, redirect: '/user-center' }, user);
    const data = await response.json();
    const cookie = response.headers.getSetCookie().find(v => v.startsWith(`${browser.COOKIE_NAME}=`))?.split(';')[0] || '';
    return { response, ...data.data, cookie };
}
function complete(flow, user = '', cookie = flow.cookie) { return post('native/complete', { state: flow.state, clientId: appId, accessToken, openId }, user, cookie); }
function session(response) { return response.headers.getSetCookie().find(v => v.startsWith(`${USER_SESSION_COOKIE}=`))?.split(';')[0]; }

test('strict Tencent verification rejects wrong or missing AppID, wrong OpenID and provider failures', async () => {
    for (providerMode of ['wrong-app', 'missing-app', 'wrong-id', 'profile-error', 'throw', 'oversize']) {
        await assert.rejects(native.verify({ clientId: appId, accessToken, openId }), error => error.status === 401 && !error.message.includes(accessToken));
    }
    providerMode = '';
    await assert.rejects(native.verify({ clientId: '1904951941', accessToken, openId }), { status: 400 });
    const profile = await native.verify({ clientId: appId, accessToken, openId });
    assert.equal(profile.providerUserId, `mobile:${appId}:${openId}`);
    assert.equal(profile.email, ''); assert.equal(profile.unionId, '');
    assert.ok(!JSON.stringify(profile).includes(accessToken));
});
test('native flow binds website and mobile identities without replacing either', async () => {
    repository.linkOAuthAccount({ id: 'web-alice', provider: 'qq', providerUserId: openId, userId: 'alice', profile: {} });
    const flow = await start('alice', 'bind');
    assert.equal(flow.appId, appId);
    assert.match(flow.response.headers.get('set-cookie'), /HttpOnly.*SameSite=Lax/);
    const response = await complete(flow, 'alice');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.user.id, 'alice');
    assert.ok(session(response));
    assert.equal(repository.listOAuthAccountsByUser('alice').length, 2);
    assert.equal(repository.findUserByOAuthAccount('qq', openId).id, 'alice');
    assert.equal(repository.findUserByOAuthAccount('qq', `mobile:${appId}:${openId}`).id, 'alice');
});
test('bound native QQ signs in without WebView, cookie and nonce are one-use', async () => {
    const flow = await start();
    const before = providerCalls;
    for (const [user, cookie] of [['', ''], ['bob', flow.cookie], ['', `${browser.COOKIE_NAME}=${'f'.repeat(64)}`]]) {
        assert.equal((await complete(flow, user, cookie)).status, 401);
    }
    assert.equal(providerCalls, before);
    const response = await complete(flow);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: session(response) } });
    assert.equal((await me.json()).data.id, 'alice');
    assert.equal((await complete(flow)).status, 401);
});
test('linking a QQ owned by another user preserves the current account', async () => {
    const response = await complete(await start('bob', 'bind'), 'bob');
    assert.equal(response.status, 409);
    assert.equal(session(response), undefined);
    assert.equal(repository.findUserByOAuthAccount('qq', `mobile:${appId}:${openId}`).id, 'alice');
});
test('a different native QQ cannot silently replace the existing mobile binding', async () => {
    openId = 'C'.repeat(32);
    const response = await complete(await start('alice', 'bind'), 'alice');
    assert.equal(response.status, 409);
    assert.equal(repository.findUserByOAuthAccount('qq', `mobile:${appId}:${openId}`), undefined);
});
test('new native QQ uses native existing-account form with bound pending ticket', async () => {
    openId = 'D'.repeat(32);
    const flow = await start();
    const response = await complete(flow);
    const data = (await response.json()).data;
    assert.match(data.ticket, /^[a-f0-9]{48}$/);
    assert.equal(session(response), undefined);
    assert.equal((await fetch(`${base}/api/auth/oauth/qq/pending?ticket=${data.ticket}`)).status, 404);
    const pending = await fetch(`${base}/api/auth/oauth/qq/pending?ticket=${data.ticket}`, { headers: headers('', flow.cookie) });
    assert.equal((await pending.json()).data.requiresEmailBinding, true);
    const bound = await post('bind', { ticket: data.ticket, username: 'bob', password: 'fixture-password' }, '', flow.cookie);
    assert.equal(bound.status, 200);
    assert.equal((await bound.json()).data.user.id, 'bob');
    assert.equal(repository.findUserByOAuthAccount('qq', `mobile:${appId}:${openId}`).id, 'bob');
});
test('binding requires a current session and banned accounts cannot sign in', async () => {
    assert.equal((await start('', 'bind')).response.status, 401);
    openId = 'E'.repeat(32);
    repository.linkOAuthAccount({ id: 'banned-mobile', provider: 'qq', providerUserId: `mobile:${appId}:${openId}`, userId: 'banned', profile: {} });
    assert.equal((await complete(await start())).status, 403);
});

test('a pending account form cannot switch users when another binding wins a race', async () => {
    openId = 'F'.repeat(32);
    const flow = await start();
    const ticket = (await (await complete(flow)).json()).data.ticket;
    repository.linkOAuthAccount({ id: 'race-mobile', provider: 'qq', providerUserId: `mobile:${appId}:${openId}`, userId: 'racer', profile: {} });
    const response = await post('bind', { ticket, username: 'alice', password: 'fixture-password' }, '', flow.cookie);
    assert.equal(response.status, 409);
    assert.equal(session(response), undefined);
    assert.equal(repository.findUserByOAuthAccount('qq', `mobile:${appId}:${openId}`).id, 'racer');
});

test('unconfigured native QQ stays disabled without contacting Tencent', async () => {
    const config = require('../backend/config');
    const previous = config.oauth.qq.nativeAppId;
    const calls = providerCalls;
    try {
        config.oauth.qq.nativeAppId = '';
        const response = await post('native/start', { action: 'login' });
        assert.equal(response.status, 503);
        assert.equal(providerCalls, calls);
        assert.throws(() => native.appId(), error => error.status === 503);
    } finally { config.oauth.qq.nativeAppId = previous; }
});
