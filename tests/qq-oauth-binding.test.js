const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-binding-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dir, DB_PATH: path.join(dir, 'test.sqlite'),
    JWT_SECRET: 'qq-binding-fixture-secret-more-than-32-characters', REDIS_URL: '',
    ADMIN_PASSWORD: 'fixture-admin-password', ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true',
    ROOM_WEATHER_IP_LOOKUP: 'false', QQ_CLIENT_ID: 'fixture-client', QQ_CLIENT_SECRET: 'fixture-secret',
    PUBLIC_SITE_URL: 'https://yachiyo.hk', QQ_REDIRECT_URI: 'https://yachiyo.hk/api/auth/oauth/qq/callback' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const config = require('../backend/config');
const { generateToken, USER_SESSION_COOKIE } = require('../backend/middleware/auth');
const qq = require('../backend/services/qq-oauth');
const browser = require('../backend/services/oauth-browser');
const repository = require('../backend/repositories/auth-repository');
let server, base, profile, calls = 0, lastRedirect;
const sessions = {};
const original = qq.getProfileFromCode;
before(async () => {
    const app = createApp();
    for (const id of ['alice', 'bob', 'legacy', 'new-link']) {
        db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
            .run(id, id, `${id}@example.test`, bcrypt.hashSync('test-password', 4), 'user');
        sessions[id] = `${USER_SESSION_COOKIE}=${generateToken({ id })}`;
    }
    qq.getProfileFromCode = async (_code, uri) => { calls++; lastRedirect = uri; return profile; };
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { qq.getProfileFromCode = original; await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
function identity(id = crypto.randomUUID()) { return profile = { provider: 'qq', providerUserId: id, nickname: 'QQ Fixture', email: '', avatar: '', raw: {} }; }
function headers(user = '', binding = '') { return { Cookie: [sessions[user], binding].filter(Boolean).join('; ') }; }
async function start(user = '', action = 'bind') {
    const response = await fetch(`${base}/api/auth/oauth/qq/start?redirect=%2Fuser-center&action=${action}`, { headers: headers(user), redirect: 'manual' });
    const url = new URL(response.headers.get('location'));
    const cookie = response.headers.getSetCookie().find(value => value.startsWith(`${browser.COOKIE_NAME}=`))?.split(';')[0] || '';
    return { response, url, cookie, state: url.searchParams.get('state') };
}
function callback(flow, user = '', cookie = flow.cookie) { return fetch(`${base}/api/auth/oauth/qq/callback?state=${flow.state}&code=fixture-code`, { headers: headers(user, cookie), redirect: 'manual' }); }
function loginCookie(response) { return response.headers.getSetCookie().find(value => value.startsWith(`${USER_SESSION_COOKIE}=`))?.split(';')[0]; }
async function who(cookie) { return (await (await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).json()).data.id; }

test('public entry and registered callback have the same origin for the installed app', async () => {
    const data = (await (await fetch(`${base}/api/settings`)).json()).data;
    assert.equal(new URL(data.qqOAuthStartUrl).origin, new URL(config.publicSiteUrl).origin);
    const flow = await start('alice');
    assert.equal(flow.url.origin, 'https://graph.qq.com');
    assert.equal(flow.url.searchParams.get('redirect_uri'), config.oauth.qq.redirectUri);
    assert.equal(flow.response.headers.get('cache-control'), 'no-store');
    assert.match(flow.response.headers.get('set-cookie'), /HttpOnly.*SameSite=Lax/);
});
test('explicit binding needs a current session before contacting QQ', async () => {
    const flow = await start();
    assert.equal(flow.url.searchParams.get('oauth_error'), 'qq_login_required');
    assert.equal(flow.cookie, '');
});
test('native cookie session binds a fresh QQ and preserves the original account', async () => {
    const p = identity();
    const response = await callback(await start('alice'), 'alice');
    assert.equal(response.headers.get('location'), 'https://yachiyo.hk/user-center?oauth_linked=qq');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(repository.findUserByOAuthAccount('qq', p.providerUserId).id, 'alice');
    assert.equal(await who(loginCookie(response)), 'alice');
});
test('an already-linked QQ cannot switch the current user or move its binding', async () => {
    const p = identity('owned-by-bob');
    repository.linkOAuthAccount({ ...p, userId: 'bob', profile: p });
    const response = await callback(await start('new-link'), 'new-link');
    assert.match(response.headers.get('location'), /qq_already_bound/);
    assert.equal(loginCookie(response), undefined);
    assert.equal(await who(sessions['new-link']), 'new-link');
    assert.equal(repository.findUserByOAuthAccount('qq', p.providerUserId).id, 'bob');
    assert.equal(repository.listOAuthAccountsByUser('new-link').length, 0);
});
test('legacy authenticated starts also reject switching to somebody else', async () => {
    identity('owned-by-bob');
    const response = await callback(await start('legacy', ''), 'legacy');
    assert.match(response.headers.get('location'), /qq_already_bound/);
    assert.equal(loginCookie(response), undefined);
});
test('repeat authorization of the same QQ is idempotent', async () => {
    identity('owned-by-bob');
    const response = await callback(await start('bob'), 'bob');
    assert.equal(await who(loginCookie(response)), 'bob');
    assert.equal(repository.listOAuthAccountsByUser('bob').length, 1);
});
test('a different QQ cannot silently replace an existing QQ', async () => {
    const p = identity();
    const response = await callback(await start('bob'), 'bob');
    assert.match(response.headers.get('location'), /qq_already_bound/);
    assert.equal(repository.findUserByOAuthAccount('qq', p.providerUserId), undefined);
    assert.equal(repository.findUserByOAuthAccount('qq', 'owned-by-bob').id, 'bob');
});
test('lost cookies, switched accounts, and replay are rejected before the upstream call', async () => {
    identity();
    const flow = await start('legacy');
    const beforeCalls = calls;
    for (const [user, cookie] of [['', flow.cookie], ['alice', flow.cookie], ['legacy', ''], ['legacy', `${browser.COOKIE_NAME}=${'a'.repeat(64)}`]]) {
        assert.match((await callback(flow, user, cookie)).headers.get('location'), /qq_invalid_state/);
    }
    assert.equal(calls, beforeCalls);
    assert.match((await callback(flow, 'legacy')).headers.get('location'), /oauth_linked=qq/);
    assert.match((await callback(flow, 'legacy')).headers.get('location'), /qq_invalid_state/);
    assert.equal(calls, beforeCalls + 1);
});
test('anonymous QQ login still signs in to its existing account', async () => {
    identity('owned-by-bob');
    const response = await callback(await start('', 'login'));
    assert.equal(await who(loginCookie(response)), 'bob');
});
test('anonymous new QQ still requires email verification', async () => {
    const p = identity();
    const response = await callback(await start('', 'login'));
    const url = new URL(response.headers.get('location'));
    assert.equal(url.pathname, '/login');
    assert.equal(url.searchParams.get('mode'), 'email');
    assert.match(url.searchParams.get('ticket'), /^[a-f0-9]{48}$/);
    assert.equal(repository.findUserByOAuthAccount('qq', p.providerUserId), undefined);
});
test('token exchange retains the exact callback from the server-owned start state', async () => {
    const old = config.oauth.qq.redirectUri;
    try {
        config.oauth.qq.redirectUri = 'https://origin.yachiyo.hk/api/auth/oauth/qq/callback';
        identity('owned-by-bob');
        const flow = await start('', 'login');
        config.oauth.qq.redirectUri = old;
        assert.equal(await who(loginCookie(await callback(flow))), 'bob');
        assert.equal(lastRedirect, 'https://origin.yachiyo.hk/api/auth/oauth/qq/callback');
    } finally { config.oauth.qq.redirectUri = old; }
});
