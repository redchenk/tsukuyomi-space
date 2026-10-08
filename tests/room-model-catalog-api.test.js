const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-catalog-api-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.db'), JWT_SECRET: 'catalog-fixture-secret-at-least-32-chars',
    ADMIN_USERNAME: 'catalog-admin', ADMIN_PASSWORD: 'catalog-fixture-password', REDIS_URL: '', ROOM_WEATHER_OFFLINE: 'true', ENABLE_FRONTEND_DIST: 'false' });
const { createApp } = require('../backend/app');
const catalog = require('../backend/services/room-model-catalog');
const original = catalog.page;
let server, base, calls = 0;
before(async () => {
    catalog.page = async body => { require('../shared/model-catalog.cjs').catalogPlan(body); calls++; return { provider: 'siliconflow', models: [{ id: 'vendor/chat', nativeId: 'vendor/chat', source: 'provider' }], nextCursor: '' }; };
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { catalog.page = original; await new Promise(resolve => server.close(resolve)); require('../backend/db').close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
const body = { apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', apiKey: 'fixture-key' };
const request = (value, headers = {}) => fetch(base + '/api/room/models/list', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base,
    'Sec-Fetch-Site': 'same-origin', 'X-Requested-With': 'XMLHttpRequest', ...headers }, body: JSON.stringify(value) });
test('guest relay retains trusted Origin and CSRF protections; no secrets are echoed', async () => {
    const okay = await request(body); assert.equal(okay.status, 200);
    assert.match(okay.headers.get('cache-control'), /no-store/);
    assert.ok(!JSON.stringify(await okay.json()).includes(body.apiKey));
    const before = calls;
    assert.equal((await request(body, { Origin: 'https://attacker.test', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await request(body, { Origin: 'https://attacker.test', 'Sec-Fetch-Site': 'cross-site', Authorization: 'Bearer invented-token' })).status, 403);
    assert.equal(calls, before);
});
test('relay rejects arbitrary destinations, writes, headers and oversized bodies', async () => {
    for (const value of [{ ...body, method: 'DELETE' }, { ...body, headers: { Cookie: 'private' } }, { ...body, apiUrl: 'https://127.0.0.1/v1/chat/completions' },
        { ...body, apiUrl: 'https://api.openai.com.attacker.test/v1/chat/completions' }]) assert.equal((await request(value)).status, 400);
    assert.equal((await request({ ...body, apiKey: 'x'.repeat(5000) })).status, 413);
});
test('relay shares existing route limits; disabled Room chat proxy stays disabled', async () => {
    let limited = false;
    for (let i = 0; i < 26; i++) if ((await request(body)).status === 429) { limited = true; break; }
    assert.ok(limited);
    const response = await fetch(base + '/api/room/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Requested-With': 'XMLHttpRequest' }, body: '{}' });
    assert.equal(response.status, 410);
});
