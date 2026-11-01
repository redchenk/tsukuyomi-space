const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
Object.assign(process.env, { NODE_ENV: 'test', GOOGLE_CLIENT_ID: 'google-fixture-client', GOOGLE_CLIENT_SECRET: 'google-fixture-secret' });
const google = require('../backend/services/google-oauth');
const originalFetch = global.fetch;
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'google-fixture-key', use: 'sig', alg: 'RS256' };
let claims = {}, tokenOverride, badSignature = false, certificateCalls = 0;
const requests = [];
global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/certs')) { certificateCalls++; return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=3600' } }); }
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    const payload = { iss: 'https://accounts.google.com', aud: 'google-fixture-client', sub: 'stable-google-subject',
        nonce: 'browser-bound-nonce', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
        email: 'VERIFIED@example.test', email_verified: true, name: 'Google Fixture', picture: 'https://example.test/avatar.png', ...claims };
    const key = badSignature ? crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey : privateKey;
    const id = tokenOverride === undefined ? jwt.sign(payload, key, { algorithm: 'RS256', keyid: 'google-fixture-key' }) : tokenOverride;
    return new Response(JSON.stringify({ id_token: id, access_token: 'private-access-token', refresh_token: 'private-refresh-token' }));
};
after(() => { global.fetch = originalFetch; });
const profile = () => google.getProfileFromCode('private-code', 'private-verifier', 'https://yachiyo.hk/api/auth/oauth/google/callback', 'browser-bound-nonce');

test('validates the signed identity and exchanges code plus PKCE only in a POST body', async () => {
    const data = await profile();
    assert.equal(data.providerUserId, 'stable-google-subject');
    assert.equal(data.email, 'verified@example.test');
    assert.deepEqual(data.raw, { sub: 'stable-google-subject' });
    const call = requests[0];
    assert.equal(call.options.method, 'POST');
    const form = new URLSearchParams(call.options.body);
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('code_verifier'), 'private-verifier');
    assert.equal(form.get('client_secret'), 'google-fixture-secret');
    assert.ok(requests.every(r => r.options.redirect === 'error' && !/private-|fixture-secret/.test(r.url)));
    assert.ok(!/private-|fixture-secret/.test(JSON.stringify(data)));
});
test('rejects expired, foreign, replayed, unsigned and forged ID tokens', async () => {
    for (const invalid of [{ exp: 1 }, { iss: 'https://evil.test' }, { aud: 'another-client' },
        { nonce: 'another-browser' }, { azp: 'another-client' }, { aud: ['google-fixture-client', 'another-client'] },
        { exp: undefined }, { sub: '' }, { iat: Math.floor(Date.now() / 1000) + 1000 }]) {
        claims = invalid;
        await assert.rejects(profile);
    }
    claims = {}; badSignature = true; await assert.rejects(profile); badSignature = false;
    tokenOverride = jwt.sign({ sub: 'forged', nonce: 'browser-bound-nonce' }, 'secret', { algorithm: 'HS256', keyid: jwk.kid });
    await assert.rejects(profile);
    tokenOverride = 'not-an-id-token'; await assert.rejects(profile); tokenOverride = undefined;
    assert.equal(certificateCalls, 1, 'Valid certificates are cached across requests');
});
test('unverified email is never trusted or prefilled and unsafe picture URLs are discarded', async () => {
    claims = { email_verified: false, picture: 'http://example.test/avatar.png' };
    const data = await profile();
    assert.equal(data.email, ''); assert.equal(data.avatar, '');
});

test('identity transport rejects arbitrary URLs before making a network request', async () => {
    const { fetchGoogleOAuthUrl } = require('../backend/services/google-oauth-transport');
    const count = requests.length;
    for (const url of ['http://oauth2.googleapis.com/token', 'https://evil.test/token', 'https://oauth2.googleapis.com/token?secret=leak', 'https://127.0.0.1/token']) {
        await assert.rejects(fetchGoogleOAuthUrl(url, {}));
    }
    assert.equal(requests.length, count);
    process.env.GOOGLE_OAUTH_EGRESS_MODE = 'unknown';
    try { await assert.rejects(fetchGoogleOAuthUrl('https://oauth2.googleapis.com/token', {})); }
    finally { delete process.env.GOOGLE_OAUTH_EGRESS_MODE; }
});
