const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-deletion-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.db'), JWT_SECRET: 'test-account-deletion-secret-over-32-characters', ADMIN_USERNAME: 'deletion-admin', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-password-12345', ENABLE_FRONTEND_DIST: 'false', REDIS_URL: '' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
const policy = require('../shared/privacy-policy.json');
let server, base, users = {}, admin;
const body = { confirmation: 'DELETE_ACCOUNT', policyVersion: policy.version };
async function call(url, token, value, headers = {}) {
    const response = await fetch(base + url, { method: value === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    const data = await response.json();
    return { status: response.status, headers: response.headers, ...data };
}
before(async () => {
    server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
    for (const id of ['alice', 'bob', 'limited', 'complete']) {
        db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run(id,id,`${id}@example.test`,'test-hash','user');
        users[id] = generateToken({ id, role: 'user' });
    }
    const a = db.prepare("SELECT * FROM admins WHERE role='super_admin'").get();
    admin = generateToken({ scope: 'admin', adminId: a.id, username: a.username, role: 'super_admin' });
});
after(async () => { await new Promise(r => server.close(r)); db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
test('requires authentication and never returns a cached private result', async () => {
    assert.equal((await call('/api/account-deletion/me')).status, 401);
    const result = await call('/api/account-deletion/me', users.alice);
    assert.equal(result.data, null); assert.match(result.headers.get('cache-control'), /no-store/);
});
test('requires current confirmation, ignores client account and is idempotent under concurrent submits', async () => {
    assert.equal((await call('/api/account-deletion', users.alice, {})).status, 400);
    assert.equal((await call('/api/account-deletion', users.alice, { ...body, policyVersion: 'old' })).status, 400);
    const results = await Promise.all(Array.from({ length: 3 }, () => call('/api/account-deletion', users.alice, { ...body, userId: 'bob' })));
    assert.equal(new Set(results.map(r => r.data.id)).size, 1);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 201]);
    assert.equal(db.prepare("SELECT count(*) n FROM account_deletion_requests WHERE user_id='alice'").get().n, 1);
    assert.equal((await call('/api/account-deletion/me', users.bob)).data, null);
    assert.equal('user_id' in results[0].data, false);
    assert.equal(Date.parse(results[0].data.due_at) - Date.parse(results[0].data.requested_at), 30 * 86400000);
});
test('private ownership, CSRF and separate admin session boundary', async () => {
    const row = (await call('/api/account-deletion/me', users.alice)).data;
    assert.equal((await call(`/api/account-deletion/${row.id}/cancel`, users.bob, {})).status, 409);
    assert.equal((await call('/api/account-deletion', null, body, { Cookie: `tsukuyomi_session=${users.bob}`, Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await call('/api/admin/account-deletions', users.alice)).status, 403);
    assert.equal((await call('/api/account-deletion/me', admin)).status, 403);
    assert.equal((await call('/api/admin/account-deletions', admin)).status, 200);
});
test('user may cancel pending but cannot cancel processing or mark complete', async () => {
    let row = (await call('/api/account-deletion', users.bob, body)).data;
    assert.equal((await call(`/api/account-deletion/${row.id}/cancel`, users.bob, {})).data.status, 'cancelled');
    row = (await call('/api/account-deletion', users.bob, body)).data;
    assert.equal((await call(`/api/admin/account-deletions/${row.id}/status`, admin, { status: 'processing' })).data.status, 'processing');
    assert.equal((await call(`/api/account-deletion/${row.id}/cancel`, users.bob, {})).status, 409);
    assert.equal((await call(`/api/admin/account-deletions/${row.id}/status`, admin, { status: 'completed' })).status, 409);
});
test('completion requires removed account plus all manual checks and receipt', async () => {
    const row = (await call('/api/account-deletion', users.complete, body)).data;
    const url = `/api/admin/account-deletions/${row.id}/status`;
    const value = { status: 'completed', resolution: '已核验清理并发送回执，无必要的个人数据留存。', checklist: Object.fromEntries(['identity','balance','content','privateData','storage','processors','backups','notification'].map(k => [k,true])) };
    assert.equal((await call(url, admin, value)).status, 409);
    await call(url, admin, { status: 'processing' });
    assert.equal((await call(url, admin, value)).status, 409);
    db.prepare("DELETE FROM users WHERE id='complete'").run();
    assert.equal((await call(url, admin, { ...value, checklist: {} })).status, 409);
    assert.equal((await call(url, admin, value)).data.status, 'completed');
    assert.equal((await call(url, admin, { status: 'processing' })).status, 409);
});
test('bounded request creation rate', async () => {
    let last;
    for (let i = 0; i < 21; i++) last = await call('/api/account-deletion', users.limited, body);
    assert.equal(last.status, 429); assert.ok(last.headers.has('retry-after'));
});
test('public privacy and deletion pages contain actual readable policy without authentication', async () => {
    for (const url of ['/privacy', '/delete-account']) {
        const response = await fetch(base + url); const html = await response.text();
        assert.equal(response.status, 200); assert.match(html, /redchenk919@gmail.com/); assert.match(html, /30 日/); assert.match(html, /月读空间/); assert.match(html, /无需|卸载/);
    }
    const sitemap = await (await fetch(base + '/sitemap.xml')).text(); assert.match(sitemap, /\/privacy/); assert.match(sitemap, /\/delete-account/);
});
