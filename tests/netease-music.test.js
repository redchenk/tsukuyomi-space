const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-music-tests-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = root;
process.env.DB_PATH = path.join(root, 'app.sqlite');
const express = require('express');
const { createNeteaseMusic, mediaUrl, cookies } = require('../backend/services/netease-music');
const { createMusicSessions, QR_TTL, LOGIN_TTL } = require('../backend/services/music-sessions');
const { createMusicRouter } = require('../backend/routes/music');

after(() => fs.rmSync(root, { recursive: true, force: true }));
const secret = 'music-test-secret-is-not-a-production-credential';
function store(name, options = {}) { return createMusicSessions({ directory: path.join(root, name), secret, ...options }); }
function json(body, init) { return new Response(JSON.stringify(body), init); }
const profile = { id: '10001', nickname: '月下听歌人', avatar: '' };

test('credential store encrypts, binds identities, survives restart and expires', () => {
    let now = Date.now();
    let sessions = store('persistent', { now: () => now });
    const token = sessions.newToken();
    sessions.save(token, 'user:A', { cookie: 'MUSIC_U=private-test-session', profile }, now + LOGIN_TTL);
    const file = path.join(root, 'persistent', 'sessions.sqlite');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.equal(fs.readFileSync(file).includes(Buffer.from('private-test-session')), false);
    assert.equal(fs.readFileSync(file).includes(Buffer.from(token)), false);
    assert.equal(sessions.read(token, 'user:B'), null);
    sessions.close();
    sessions = store('persistent', { now: () => now });
    assert.equal(sessions.read(token, 'user:A').profile.id, profile.id);
    now += LOGIN_TTL + 1;
    assert.equal(sessions.read(token, 'user:A'), null);
    sessions.close();
});

test('credentials corrupted or encrypted with a different key are discarded', () => {
    const sessions = store('key-change'); const token = sessions.newToken();
    sessions.save(token, 'guest', { cookie: 'MUSIC_U=secret' }, Date.now() + LOGIN_TTL); sessions.close();
    const changed = store('key-change', { secret: 'another-private-key' });
    assert.equal(changed.read(token, 'guest'), null); changed.close();
});

test('media and cookies reject arbitrary hosts, IPs, credentials and injected attributes', () => {
    assert.equal(mediaUrl('http://m801.music.126.net/a.mp3'), 'https://m801.music.126.net/a.mp3');
    for (const value of ['https://music.126.net.evil.test/x', 'https://127.0.0.1/x', 'https://user:pass@m801.music.126.net/x', 'https://m801.music.126.net:9880/x', 'javascript:alert(1)']) assert.equal(mediaUrl(value), '');
    assert.equal(cookies('MUSIC_U=a; Domain=.music.163.com; other=bad; __csrf=abc'), 'MUSIC_U=a; __csrf=abc');
    assert.equal(cookies('MUSIC_U=a\r\nInjected:bad'), '');
});

test('provider uses fixed HTTPS hosts, encrypted requests and strips unrelated data', async () => {
    const provider = createNeteaseMusic({ transport: async (url, options) => {
        assert.ok(url.startsWith('https://interfacepc.music.163.com/eapi/'));
        assert.deepEqual(options.allowedHostnames, ['music.163.com', 'interfacepc.music.163.com']);
        assert.equal(options.redirect, undefined); // fetchPinnedUrl default rejects redirects.
        assert.equal(options.body.includes('cookie-private'), false);
        assert.ok(options.headers.Cookie.includes('MUSIC_U=cookie-private'));
        return json({ code: 200, result: { songs: [{ id: 12, name: '月光', ar: [{ name: '歌手' }], al: { picUrl: 'http://p1.music.126.net/cover.jpg' }, secret: 'not-public' }], songCount: 50 } });
    } });
    const result = await provider.search('MUSIC_U=cookie-private', '月光', 20);
    assert.equal(result.offset, 20); assert.equal(result.tracks[0].cover, 'https://p1.music.126.net/cover.jpg');
    assert.equal(JSON.stringify(result).includes('not-public'), false);
});

test('provider handles split JSON, oversize JSON, malformed data and non-2xx', async () => {
    const data = Buffer.from(JSON.stringify({ code: 200, unikey: 'test-qrcode-key-123456' }));
    const split = new ReadableStream({ start(controller) { controller.enqueue(data.subarray(0, 7)); controller.enqueue(data.subarray(7)); controller.close(); } });
    const provider = createNeteaseMusic({ transport: async () => new Response(split) });
    assert.equal(await provider.qrKey(), 'test-qrcode-key-123456');
    for (const [response, code] of [[new Response('bad-json-with-secret'), 'MUSIC_INVALID_RESPONSE'], [new Response('private-upstream-error', { status: 503 }), 'MUSIC_UPSTREAM_HTTP'], [new Response('x'.repeat(2 * 1024 * 1024 + 1)), 'MUSIC_RESPONSE_TOO_LARGE']]) {
        await assert.rejects(createNeteaseMusic({ transport: async () => response }).qrKey(), error => error.code === code && !error.message.includes('private'));
    }
});

test('full response body shares the timeout budget even after headers arrive', async () => {
    const stream = new ReadableStream({ start(c) { c.enqueue(Buffer.from('{')); } });
    const provider = createNeteaseMusic({ timeoutMs: 40, transport: async () => new Response(stream) });
    const started = Date.now();
    await assert.rejects(provider.qrKey(), { code: 'MUSIC_TIMEOUT' });
    assert.ok(Date.now() - started < 500);
});

test('unavailable music and account expiry are explicit; preview remains identified', async () => {
    await assert.rejects(createNeteaseMusic({ transport: async () => json({ code: 301 }) }).search('MUSIC_U=x', 'q', 0), { code: 'MUSIC_LOGIN_REQUIRED', status: 401 });
    await assert.rejects(createNeteaseMusic({ transport: async () => json({ code: 200, data: [{ id: 1, url: null, code: -110 }] }) }).playback('', '1'), { code: 'MUSIC_UNAVAILABLE' });
    const result = await createNeteaseMusic({ transport: async () => json({ data: [{ id: 1, code: 200, url: 'http://m801.music.126.net/x.mp3', freeTrialInfo: { start: 0 }, expi: 3600 }] }) }).playback('', '1');
    assert.equal(result.preview, true); assert.equal(result.expiresIn, 1200);
});

async function server(t, name, provider, options = {}) {
    const sessions = store(name, options.storeOptions);
    const app = express(); app.use(express.json({ limit: '8kb' }));
    app.use('/api/music', createMusicRouter({ sessions, provider,
        authenticate: (req, res, next) => { if (req.headers['x-test-owner']) req.user = { id: req.headers['x-test-owner'] }; next(); }, ...options.routerOptions }));
    const listening = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const origin = `http://127.0.0.1:${listening.address().port}`;
    t.after(async () => { await new Promise(resolve => listening.close(resolve)); sessions.close(); });
    let cookie = '';
    async function call(url, body, extra = {}) {
        const response = await fetch(`${origin}/api/music${url}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', Cookie: cookie, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { status: response.status, headers: response.headers, body: await response.json(), cookie };
    }
    return { call, sessions, getToken: () => cookie.split('=')[1] };
}

test('QR login rotates browser token, validates profile, enforces ownership and logout', async t => {
    let checks = 0;
    const mock = { qrKey: async () => 'test-upstream-key-123', qrCheck: async () => { checks++; return { body: { code: 803 }, cookie: 'MUSIC_U=private-provider-cookie' }; }, profile: async () => profile,
        search: async (cookie, query, offset) => { assert.equal(cookie, 'MUSIC_U=private-provider-cookie'); return { tracks: [], total: 0, offset }; } };
    const { call, getToken, sessions } = await server(t, 'routes', mock);
    assert.equal((await call('/status')).body.profile, null);
    const qr = await call('/qr', {}); const pending = getToken();
    assert.match(qr.headers.get('set-cookie'), /HttpOnly/); assert.match(qr.headers.get('set-cookie'), /SameSite=Strict/); assert.match(qr.headers.get('set-cookie'), /Path=\/api\/music/);
    assert.ok(qr.body.url.startsWith('https://music.163.com/login?codekey='));
    const checked = await call('/qr/check', { qrId: qr.body.qrId });
    assert.equal(checked.body.status, 'authorized'); assert.notEqual(getToken(), pending);
    assert.equal(sessions.read(pending, 'guest'), null); assert.equal(checks, 1);
    assert.equal(JSON.stringify(checked.body).includes('private-provider-cookie'), false);
    assert.equal((await call('/search?q=abc&offset=20')).body.offset, 20);
    assert.equal((await call('/status', undefined, { 'X-Test-Owner': 'other-user' })).body.profile, null);
    assert.equal((await call('/search?q=abc', undefined, { 'X-Test-Owner': 'other-user' })).status, 401);
    assert.equal((await call('/logout', {})).body.success, true);
    assert.equal((await call('/status')).body.profile, null);
});

test('bad origin and bearer shortcut cannot read or change browser music state', async t => {
    let called = 0;
    const { call } = await server(t, 'origin', { qrKey: async () => { called++; return 'qr'; } });
    const headers = { Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site', Authorization: 'Bearer untrusted' };
    assert.equal((await call('/qr', {}, headers)).status, 403);
    assert.equal((await call('/status', undefined, headers)).status, 403);
    assert.equal((await call('/qr', {}, { 'X-Requested-With': '' })).status, 403);
    assert.equal(called, 0);
});

test('pending QR expires and repeated checks are coalesced without provider flooding', async t => {
    let now = Date.now(); let checks = 0;
    const { call } = await server(t, 'poll', { qrKey: async () => 'test-upstream-key-123', qrCheck: async () => { checks++; return { body: { code: 802 }, cookie: '' }; } }, { storeOptions: { now: () => now } });
    const qr = await call('/qr', {});
    assert.equal((await call('/qr/check', { qrId: 'another-tab' })).body.status, 'expired');
    assert.equal((await call('/qr/check', { qrId: qr.body.qrId })).body.status, 'scanned');
    assert.equal((await call('/qr/check', { qrId: qr.body.qrId })).body.status, 'waiting');
    assert.equal(checks, 1);
    now += QR_TTL + 1;
    assert.equal((await call('/qr/check', { qrId: qr.body.qrId })).body.status, 'expired');
});

test('cancelled login cannot be resurrected by an in-flight successful provider response', async t => {
    let release; let begun;
    const started = new Promise(resolve => { begun = resolve; });
    const { call } = await server(t, 'cancel-race', { qrKey: async () => 'test-upstream-key-123', qrCheck: async () => { begun(); await new Promise(resolve => { release = resolve; }); return { body: { code: 803 }, cookie: 'MUSIC_U=not-to-save' }; }, profile: async () => profile });
    const qr = await call('/qr', {});
    const waiting = call('/qr/check', { qrId: qr.body.qrId });
    await started; await call('/logout', {}); release();
    assert.equal((await waiting).body.status, 'expired');
    assert.equal((await call('/status')).body.profile, null);
});

test('disabled feature leaves status and logout available without calling the provider', async t => {
    const { call } = await server(t, 'disabled', {}, { routerOptions: { enabled: false } });
    assert.equal((await call('/status')).body.enabled, false);
    assert.equal((await call('/qr', {})).body.code, 'MUSIC_DISABLED');
    assert.equal((await call('/logout', {})).body.success, true);
});
