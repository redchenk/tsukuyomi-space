const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'official-usage-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dir, DB_PATH: path.join(dir, 'test.db'), REDIS_URL: '',
    JWT_SECRET: 'official-usage-fixture-secret-at-least-32', ADMIN_USERNAME: 'usage-admin', ADMIN_PASSWORD: 'fixture-password', ENABLE_FRONTEND_DIST: 'false' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const wallet = require('../backend/services/site-wallet');
const { dailyUsage } = require('../backend/repositories/official-usage-repository');
const { generateToken } = require('../backend/middleware/auth');
const now = Date.parse('2026-10-30T04:00:00Z');
const price = { id: 'usage-fixture-llm', currency: 'CNY', rates_per_million_money_atoms: { input_uncached: '1', input_cached: '1', output: '1' } };
const voice = { id: 'usage-fixture-tts', currency: 'CNY', unit: 'voice', unit_price_money_atoms: '5' };
let server, base, adminToken, userToken;
function request(id, state, createdAt, { tts = false, sponsored = false, admitted = true } = {}) {
    const user_id = sponsored ? 'usage-super' : 'usage-user';
    const input = { request_id: id, user_id, request_fingerprint: crypto.createHash('sha256').update(id).digest('hex'),
        hold_atoms: sponsored ? '0' : '5', pricing_snapshot: tts ? voice : price, sponsored };
    if (admitted) wallet.admission(input); else wallet.ledger.reserve(input);
    if (state === 'settled' || state === 'needs_review') wallet.ledger.settle({ ...input, money_atoms: state === 'needs_review' ? '10000' : input.hold_atoms,
        usage: tts ? { voices: 1 } : { input_uncached: 1, input_cached: 0, output: 1 }, usage_status: 'final_usage_observed' });
    if (state === 'released') wallet.release({ ...input, reason: 'cancelled_before_dispatch', proof_ref: `fixture:${id}` });
    if (state === 'unknown') wallet.ledger.markUnknown({ ...input, reason: 'transport_error', evidence_ref: `fixture:${id}` });
    db.prepare('UPDATE billing_requests SET created_at=? WHERE request_id=?').run(createdAt, id);
    return input;
}
before(async () => {
    server = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const [id, role] of [['usage-user', 'user'], ['usage-super', 'super_admin']]) {
        db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)').run(id, id, `${id}@example.test`, 'fixture', role);
        wallet.wallet(id);
        wallet.ledger.creditVerifiedEvent({ verified: true, source_id: 'fixture', event_id: id, order_id: id, user_id: id, currency: 'CNY', money_atoms: '1000' });
    }
    const admin = db.prepare('SELECT id,username,role FROM admins WHERE username=?').get('usage-admin');
    adminToken = generateToken({ adminId: admin.id, username: admin.username, role: admin.role, scope: 'admin' });
    userToken = generateToken({ id: 'usage-user', username: 'usage-user', role: 'user' });
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('empty history remains readable and supplies each calendar date', () => {
    const data = dailyUsage({ days: '7', now });
    assert.equal(data.rows.length, 7); assert.equal(data.firstRecordedDate, null);
    assert.equal(data.from, '2026-10-24'); assert.equal(data.to, '2026-10-30');
    assert.equal(data.total.llm.total + data.total.tts.total, 0);
});
test('counts both services, sponsored calls and all result states exactly once across Shanghai midnight', () => {
    const first = request('req_llm_prior', 'settled', '2026-10-29T15:59:59.999Z');
    wallet.admission(first); // A repeated admission is the same durable request.
    request('req_llm_today', 'settled', '2026-10-29T16:00:00.000Z', { sponsored: true });
    request('req_llm_failed', 'released', '2026-10-30T00:00:00.000Z');
    request('req_llm_waiting', 'reserved', '2026-10-30T00:01:00.000Z');
    request('req_llm_unknown', 'unknown', '2026-10-30T00:02:00.000Z');
    request('req_llm_review', 'needs_review', '2026-10-30T00:03:00.000Z');
    request('req_tts_done', 'settled', '2026-10-30T01:00:00.000Z', { tts: true });
    request('req_tts_free', 'settled', '2026-10-30T02:00:00.000Z', { tts: true, sponsored: true });
    request('req_tts_failed', 'released', '2026-10-30T03:00:00.000Z', { tts: true });
    request('req_other_ledger', 'settled', '2026-10-30T03:30:00.000Z', { admitted: false });
    request('req_next_day', 'settled', '2026-10-30T16:00:00.000Z');
    const data = dailyUsage({ days: '7', now });
    assert.deepEqual(data.today.llm, { total: 5, completed: 1, incomplete: 1, pending: 3 });
    assert.deepEqual(data.today.tts, { total: 3, completed: 2, incomplete: 1, pending: 0 });
    assert.equal(data.rows[1].llm.total, 1); assert.equal(data.rows[2].llm.total, 0);
    assert.equal(data.total.llm.total, 6); assert.equal(data.firstRecordedDate, '2026-10-29');
    assert.equal(data.timezone, 'Asia/Shanghai');
});
test('historical ranges keep today separate and completed late requests stay on their start day', () => {
    const report = dailyUsage({ days: '30', end: '2026-10-29', now });
    assert.equal(report.total.llm.total, 1); assert.equal(report.total.tts.total, 0);
    assert.equal(report.today.llm.total, 5); assert.equal(report.rows.length, 30);
    assert.equal(report.rows[0].date, '2026-10-29'); assert.equal(report.from, '2026-09-30');
});
test('reporting is read-only, does not leak identities or fingerprints, and uses an indexed date range', () => {
    const before = db.prepare('SELECT total_changes() n').get().n;
    const result = JSON.stringify(dailyUsage({ days: '90', now }));
    assert.equal(db.prepare('SELECT total_changes() n').get().n, before);
    assert.doesNotMatch(result, /usage-user|usage-super|request_id|fingerprint|pricing|money_atoms|audio|content/);
    assert.ok(db.prepare("EXPLAIN QUERY PLAN SELECT request_id FROM billing_requests WHERE created_at >= ? AND created_at < ?").all('2026-10-01', '2026-11-01').some(row => row.detail.includes('billing_requests_created_at')));
});
test('admin API is authenticated, rejects invalid ranges and never caches the report', async () => {
    const call = (query = '', token) => fetch(base + '/api/admin/official-usage' + query, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal((await call()).status, 401); assert.equal((await call('', userToken)).status, 403);
    const response = await call('?days=7', adminToken);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).data.rows.length, 7);
    for (const query of ['?days=1', '?days=365', '?days=7&days=30', '?end=2026-02-30', '?end=not-a-date', '?end=2099-01-01', '?end[]=2026-10-30']) {
        assert.equal((await call(query, adminToken)).status, 400, query);
    }
});
