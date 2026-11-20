const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-login-'));
Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: dir, DB_PATH: path.join(dir, 'test.sqlite'), REDIS_URL: '',
    JWT_SECRET: 'wechat-test-fixture-secret-over-32-characters', ADMIN_PASSWORD: 'fixture-password',
    ROOM_WEATHER_OFFLINE: 'true', ROOM_WEATHER_IP_LOOKUP: 'false',
    WECHAT_APP_ID: 'fixture-app', WECHAT_APP_SECRET: 'fixture-app-secret',
    WECHAT_REDIRECT_URI: 'https://yachiyo.hk/api/auth/oauth/wechat/callback'
});
const { createApp } = require('../backend/app');
const config = require('../backend/config');
const db = require('../backend/db');
const authState = require('../backend/services/auth-state');
const { COOKIE_NAME } = require('../backend/services/oauth-browser');
const repo = require('../backend/repositories/auth-repository');
const provider = require('../backend/services/wechat-oauth');

const http = global.fetch;
let server, base, identity = 'fixture-openid', profileId, upstreamError;
before(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
    global.fetch = async (input, options) => {
        const url = new URL(input);
        assert.equal(url.origin, 'https://api.weixin.qq.com');
        assert.equal(options.redirect, 'error');
        if (upstreamError) return Response.json({ errcode: 40029, errmsg: 'fixture error' });
        if (url.pathname === '/sns/oauth2/access_token') {
            assert.equal(url.searchParams.get('appid'), 'fixture-app');
            assert.equal(url.searchParams.get('secret'), 'fixture-app-secret');
            assert.equal(url.searchParams.get('code'), 'fixture-code');
            return Response.json({ openid: identity, access_token: 'fixture-user-token', refresh_token: 'fixture-refresh' });
        }
        assert.equal(url.pathname, '/sns/userinfo');
        assert.equal(url.searchParams.get('access_token'), 'fixture-user-token');
        assert.equal(url.searchParams.get('openid'), identity);
        return Response.json({ openid: profileId || identity, nickname: '扫码用户' });
    };
});
after(async () => {
    global.fetch = http;
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
});

async function start() {
    const res = await http(base + '/api/auth/oauth/wechat/start?redirect=%2Fgallery', { redirect: 'manual' });
    const url = new URL(res.headers.get('location'));
    const cookie = res.headers.getSetCookie().find(v => v.startsWith(COOKIE_NAME + '='))?.split(';')[0];
    return { url, state: url.searchParams.get('state'), cookie };
}
async function callback(flow, code = 'fixture-code') {
    return http(base + '/api/auth/oauth/wechat/callback?' + new URLSearchParams({ state: flow.state, code }), {
        redirect: 'manual', headers: { Cookie: flow.cookie }
    });
}
async function link(email, newPassword) {
    const flow = await start();
    const response = await callback(flow);
    const url = new URL(response.headers.get('location'));
    assert.equal(url.searchParams.get('oauth'), 'wechat');
    const ticket = url.searchParams.get('ticket');
    const pending = await http(base + '/api/auth/oauth/wechat/pending?ticket=' + ticket, { headers: { Cookie: flow.cookie } });
    assert.equal((await pending.json()).data.requiresEmailBinding, true);
    assert.equal((await callback(flow)).headers.get('location').endsWith('wechat_invalid_state'), true);
    await authState.createVerificationCode({ email, purpose: 'oauth_bind', code: '123456', ttlMs: 60000, cooldownMs: 1000 });
    return http(base + '/api/auth/oauth/wechat/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: flow.cookie, Origin: base, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ ticket, email, emailCode: '123456', newPassword })
    });
}

test('settings and QR authorization use the registered website and require both credentials', async () => {
    const settings = async () => (await (await http(base + '/api/settings')).json()).data;
    assert.equal((await settings()).wechatOAuthEnabled, true);
    const flow = await start();
    assert.equal(flow.url.origin + flow.url.pathname, 'https://open.weixin.qq.com/connect/qrconnect');
    assert.equal(flow.url.searchParams.get('redirect_uri'), process.env.WECHAT_REDIRECT_URI);
    assert.equal(flow.url.searchParams.get('scope'), 'snsapi_login');
    assert.equal(flow.url.hash, '#wechat_redirect');
    assert.match(flow.state, /^[a-f0-9]{48}$/);
    assert.ok(!flow.url.toString().includes('fixture-app-secret'));
    assert.match((await callback(flow, '')).headers.get('location'), /wechat_denied$/);
    const saved = config.oauth.wechat.appSecret;
    try {
        config.oauth.wechat.appSecret = '';
        assert.equal((await settings()).wechatOAuthEnabled, false);
        assert.match((await start()).url.href, /wechat_not_configured$/);
    } finally { config.oauth.wechat.appSecret = saved; }
});

test('verified mailbox creates a new account then returning WeChat sessions resume the requested page', async () => {
    const response = await link('new@example.test', 'new-user-password');
    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.redirect, '/gallery');
    const account = repo.findOAuthAccount('wechat', 'fixture-app:' + identity);
    assert.ok(!/fixture-user-token|fixture-refresh|fixture-app-secret/.test(account.profile_json));
    const res = await callback(await start());
    assert.equal(res.headers.get('location'), 'https://yachiyo.hk/gallery');
    assert.match(res.headers.get('set-cookie'), /HttpOnly/);
});

test('verified existing mailbox preserves its password and binds the same user', async () => {
    identity = 'existing-openid';
    const email = 'owner@example.test';
    repo.createUser({ id: 'owner', username: 'owner', email, passwordHash: 'original-password-hash' });
    const response = await link(email, '');
    assert.equal(response.status, 200);
    assert.equal(repo.findUserByOAuthAccount('wechat', 'fixture-app:' + identity).id, 'owner');
    assert.equal(repo.findUserByEmail(email).password_hash, 'original-password-hash');
});

test('provider errors and inconsistent account details stop authentication', async () => {
    upstreamError = true;
    try { await assert.rejects(provider.getProfileFromCode('fixture-code'), /微信授权失败/); }
    finally { upstreamError = false; }
    profileId = 'another-identity';
    try { await assert.rejects(provider.getProfileFromCode('fixture-code'), /微信账号资料无效/); }
    finally { profileId = ''; }
});
