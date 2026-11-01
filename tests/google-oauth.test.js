const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-google-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.sqlite'),
    JWT_SECRET: 'google-oauth-fixture-secret-over-32-characters', REDIS_URL: '',
    ADMIN_PASSWORD: 'google-fixture-password', ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true',
    ROOM_WEATHER_IP_LOOKUP: 'false', GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret',
    PUBLIC_SITE_URL: 'https://yachiyo.hk', GOOGLE_REDIRECT_URI: 'https://yachiyo.hk/api/auth/oauth/google/callback',
    GOOGLE_ADDITIONAL_REDIRECT_URIS: 'https://tsukuyomi-space.com/api/auth/oauth/google/callback' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
const google = require('../backend/services/google-oauth');
const oauthBrowser = require('../backend/services/oauth-browser');
const authState = require('../backend/services/auth-state');
const repository = require('../backend/repositories/auth-repository');
let server, base, calls = 0, profile, lastVerifier;
const tokens = {};
const originalProfile = google.getProfileFromCode;
before(async () => {
    const app = createApp();
    for (const id of ['existing', 'other', 'binding', 'conflict', 'banned']) {
        db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
            .run(id, id, `${id}@example.test`, bcrypt.hashSync('existing-password', 4), id === 'banned' ? 'banned' : 'user');
        tokens[id] = generateToken({ id });
    }
    google.getProfileFromCode = async (code, verifier, uri, nonce) => {
        assert.match(nonce, /^[a-f0-9]{48}$/);
        calls++;
        lastVerifier = verifier;
        assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
        assert.ok(google.redirectUris().includes(uri));
        return profile;
    };
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { google.getProfileFromCode = originalProfile; await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
function headers(user = '', cookie = '') { return { 'Content-Type': 'application/json', Origin: base, 'Sec-Fetch-Site': 'same-origin', 'X-Requested-With': 'XMLHttpRequest', ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }; }
function newProfile(id = crypto.randomUUID(), email = '') { profile = { provider: 'google', providerUserId: id, nickname: 'Google Tester', email, raw: { login: 'fixture-user' } }; return profile; }
async function start(user = '', query = '') {
    const response = await fetch(`${base}/api/auth/oauth/google/start?${query}`, { headers: headers(user), redirect: 'manual' });
    const url = new URL(response.headers.get('location'));
    const cookie = response.headers.getSetCookie().find(value => value.startsWith(`${oauthBrowser.COOKIE_NAME}=`))?.split(';')[0] || '';
    return { response, url, state: url.searchParams.get('state'), cookie };
}
function callback(flow, user = '', cookie = flow.cookie, query = 'code=fixture-code') {
    return fetch(`${base}/api/auth/oauth/google/callback?state=${flow.state}&${query}`, { headers: headers(user, cookie), redirect: 'manual' });
}
async function pending(email = '', site = '') {
    newProfile(undefined, email);
    const flow = await start('', site ? `site=${encodeURIComponent(site)}` : '');
    const response = await callback(flow);
    const url = new URL(response.headers.get('location'));
    return { ...flow, completionUrl: url, ticket: url.searchParams.get('ticket'), profile: { ...profile } };
}
async function code(email, purpose = 'oauth_bind') {
    await authState.createVerificationCode({ email, purpose, code: '123456', ttlMs: 60000, cooldownMs: 1000 });
}
function complete(flow, email, extra = {}) {
    return fetch(`${base}/api/auth/oauth/google/email`, { method: 'POST', headers: headers('', flow.cookie),
        body: JSON.stringify({ ticket: flow.ticket, email, emailCode: '123456', newPassword: 'new-account-password', ...extra }) });
}

test('authorization uses minimal identity scopes, PKCE, and a browser-bound state', async () => {
    const flow = await start();
    assert.equal(flow.url.origin, 'https://accounts.google.com');
    assert.equal(flow.url.searchParams.get('scope'), 'openid email profile');
    assert.equal(flow.url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(flow.url.searchParams.get('nonce'), flow.state);
    assert.match(flow.url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
    assert.match(flow.response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(flow.response.headers.get('set-cookie'), /SameSite=Lax/);
    const previous = calls;
    for (const cookie of ['', `${oauthBrowser.COOKIE_NAME}=${'b'.repeat(64)}`]) {
        assert.match((await callback(flow, '', cookie)).headers.get('location'), /google_invalid_state/);
    }
    assert.match((await callback(flow, 'existing')).headers.get('location'), /google_invalid_state/);
    assert.equal(calls, previous);
});

test('current-user API reports refreshed official API entitlement from the database', async () => {
    const read = async () => (await (await fetch(`${base}/api/auth/me`, { headers: headers('existing') })).json()).data;
    assert.equal((await read()).official_api_unlimited, false);
    db.prepare("UPDATE users SET role='super_admin' WHERE id='existing'").run();
    try { assert.equal((await read()).official_api_unlimited, true); }
    finally { db.prepare("UPDATE users SET role='user' WHERE id='existing'").run(); }
    assert.equal((await read()).official_api_unlimited, false);
});

test('new Google identity always requires site email verification, including a verified matching email', async () => {
    const flow = await pending('existing@example.test');
    assert.equal(flow.completionUrl.searchParams.get('oauth'), 'google');
    assert.equal(flow.url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(lastVerifier).digest('base64url'));
    assert.equal(repository.findUserByOAuthAccount('google', flow.profile.providerUserId), undefined);
    const url = `${base}/api/auth/oauth/google/pending?ticket=${flow.ticket}`;
    assert.equal((await fetch(url)).status, 404);
    const response = await fetch(url, { headers: headers('', flow.cookie) });
    const body = await response.json();
    assert.equal(body.data.requiresEmailBinding, true);
    assert.equal(body.data.hasEmailMatch, true);
    assert.ok(!JSON.stringify(body).includes(flow.profile.providerUserId));
    assert.equal((await complete(flow, 'existing@example.test')).status, 400);
    assert.equal(repository.findUserByOAuthAccount('google', flow.profile.providerUserId), undefined);
    assert.equal((await fetch(`${base}/api/auth/oauth/google/create`, { method: 'POST', headers: headers('', flow.cookie), body: JSON.stringify({ ticket: flow.ticket }) })).status, 404);
});

test('new account needs a real email, correct-purpose code and password; completed tickets cannot replay', async () => {
    const flow = await pending();
    assert.equal((await complete(flow, 'google@oauth.yachiyo.local')).status, 400);
    assert.equal((await complete(flow, 'new@example.test', { newPassword: 'short' })).status, 400);
    await code('new@example.test', 'login');
    assert.equal((await complete(flow, 'new@example.test')).status, 400);
    await code('new@example.test');
    const response = await complete(flow, 'new@example.test');
    assert.equal(response.status, 201);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    const body = await response.json();
    assert.equal(body.data.user.email, 'new@example.test');
    assert.equal(body.data.user.oauth_accounts[0].provider, 'google');
    assert.ok(bcrypt.compareSync('new-account-password', repository.findUserByEmail('new@example.test').password_hash));
    assert.equal((await complete(flow, 'new@example.test')).status, 404);
});

test('verified existing mailbox links its account without changing its password', async () => {
    const flow = await pending('existing@example.test');
    const previous = repository.findUserById('existing').password_hash;
    await code('existing@example.test');
    assert.equal((await complete(flow, 'existing@example.test', { newPassword: '' })).status, 200);
    assert.equal(repository.findUserByOAuthAccount('google', flow.profile.providerUserId).id, 'existing');
    assert.equal(repository.findUserById('existing').password_hash, previous);
    const loginFlow = await start();
    profile = flow.profile;
    const result = await callback(loginFlow);
    assert.equal(new URL(result.headers.get('location')).pathname, '/hub');
    assert.match(result.headers.get('set-cookie'), /HttpOnly/);
});

test('user center binds only the initiating account and rejects a different owner', async () => {
    newProfile();
    assert.match((await start('', 'action=bind')).url.href, /google_login_required/);
    const flow = await start('binding', 'action=bind');
    assert.match((await callback(flow, 'other')).headers.get('location'), /google_invalid_state/);
    const result = await callback(flow, 'binding');
    assert.match(result.headers.get('location'), /user-center\?oauth_linked=google/);
    assert.equal(repository.findUserByOAuthAccount('google', profile.providerUserId).id, 'binding');
    assert.match((await callback(flow, 'binding')).headers.get('location'), /google_invalid_state/);
    const conflict = await start('other', 'action=bind');
    assert.match((await callback(conflict, 'other')).headers.get('location'), /google_already_bound/);
    assert.equal(repository.findUserByOAuthAccount('google', profile.providerUserId).id, 'binding');
    const ownerProfile = { ...profile };
    newProfile();
    const second = await start('binding', 'action=bind');
    assert.match((await callback(second, 'binding')).headers.get('location'), /google_already_bound/);
    assert.equal(repository.listOAuthAccountsByUser('binding').filter(row => row.provider === 'google').length, 1);
    assert.throws(() => repository.linkOAuthAccount({ provider: 'google', providerUserId: ownerProfile.providerUserId, userId: 'other' }), /已绑定其他账号/);
});

test('a pending identity cannot move from an account linked after authorization', async () => {
    const flow = await pending();
    repository.linkOAuthAccount({ id: crypto.randomUUID(), provider: 'google', providerUserId: flow.profile.providerUserId, userId: 'conflict' });
    await code('other@example.test');
    assert.equal((await complete(flow, 'other@example.test')).status, 409);
    assert.equal(repository.findUserByOAuthAccount('google', flow.profile.providerUserId).id, 'conflict');
});

test('email linking refuses banned users and another Google already linked to the mailbox', async () => {
    const banned = await pending();
    await code('banned@example.test');
    assert.equal((await complete(banned, 'banned@example.test')).status, 403);
    const occupied = await pending();
    await code('existing@example.test');
    assert.equal((await complete(occupied, 'existing@example.test')).status, 409);
});

test('Google unlink requires current password and affects only the current account', async () => {
    const send = (user, currentPassword) => fetch(`${base}/api/auth/oauth/google/unlink`, { method: 'POST', headers: headers(user), body: JSON.stringify({ currentPassword }) });
    assert.equal((await send('', 'existing-password')).status, 401);
    assert.equal((await send('binding', 'wrong-password')).status, 400);
    assert.equal((await send('binding', 'existing-password')).status, 200);
    assert.equal(repository.listOAuthAccountsByUser('binding').length, 0);
    assert.equal(repository.listOAuthAccountsByUser('existing').length, 1);
});

test('both registered site origins keep completion and binding on the initiating site', async () => {
    const flow = await pending('', 'https://tsukuyomi-space.com');
    assert.equal(flow.completionUrl.origin, 'https://tsukuyomi-space.com');
    assert.equal(flow.url.searchParams.get('redirect_uri'), 'https://tsukuyomi-space.com/api/auth/oauth/google/callback');
    const response = await fetch(`${base}/api/auth/oauth/google/email`, { method: 'POST', headers: { ...headers('', flow.cookie), Origin: 'https://tsukuyomi-space.com' }, body: '{}' });
    assert.equal(response.status, 404);
    assert.equal((await start('', 'site=https://evil.test&redirect=https://evil.test')).url.searchParams.get('redirect_uri'), 'https://yachiyo.hk/api/auth/oauth/google/callback');
    const metadata = await (await fetch(`${base}/api/settings`)).json();
    assert.equal(metadata.data.googleOAuthStartUrls.length, 2);
    assert.ok(!JSON.stringify(metadata).includes('fixture-secret'));
});

test('cancelled authorization consumes state without calling Google', async () => {
    const flow = await start();
    const previous = calls;
    assert.match((await callback(flow, '', flow.cookie, 'error=access_denied')).headers.get('location'), /google_denied/);
    assert.match((await callback(flow)).headers.get('location'), /google_invalid_state/);
    assert.equal(calls, previous);
});

test('concurrent callbacks cannot consume the same state twice', async () => {
    newProfile();
    const flow = await start();
    const previous = calls;
    const responses = await Promise.all([callback(flow), callback(flow)]);
    assert.equal(responses.filter(response => /google_invalid_state/.test(response.headers.get('location'))).length, 1);
    assert.equal(calls, previous + 1);
});
