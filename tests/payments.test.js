const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-payments-'));
const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const alipay = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = merchant.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = alipay.publicKey.export({ type: 'spki', format: 'pem' });
fs.writeFileSync(path.join(directory, 'private.pem'), privateKey, { mode: 0o600 });
fs.writeFileSync(path.join(directory, 'alipay.txt'), publicKey.replace(/-----[^\n]+-----/g, '').replace(/\s/g, ''));
Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: directory, DB_PATH: path.join(directory, 'test.db'), REDIS_URL: '', ENABLE_FRONTEND_DIST: 'false',
    JWT_SECRET: 'payment-fixture-jwt-at-least-32-characters', ADMIN_USERNAME: 'payment-admin', ADMIN_PASSWORD: 'payment-fixture-password',
    ALIPAY_APP_ID: '2099000000000001', ALIPAY_SELLER_ID: '2088000000000001', ALIPAY_ENV: 'sandbox',
    ALIPAY_PRIVATE_KEY: '', ALIPAY_PUBLIC_KEY: '', ALIPAY_PRIVATE_KEY_PATH: path.join(directory, 'private.pem'),
    ALIPAY_PUBLIC_KEY_PATH: path.join(directory, 'alipay.txt'), PAYMENT_PUBLIC_BASE_URL: 'https://payments.example.test', PAYMENT_MAX_ORDER_YUAN: '50'
});
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
const payments = require('../backend/services/payments');
const config = require('../backend/services/payment-config');
const urllib = require('urllib').default;
const realRequest = urllib.request;
let server, base, owner, other, admin, staff, tradeCounter = 0, queryResult, unsignedQuery = false, queryCalls = 0;
const product = { id: 'service', title: '测试服务', description: '仅订单测试', price: '1.23', enabled: true };
const headers = token => ({ 'Content-Type': 'application/json', Origin: base, 'X-Requested-With': 'XMLHttpRequest', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
async function call(endpoint, { token = owner, method = 'GET', body, extra = {} } = {}) {
    const response = await fetch(base + endpoint, { method, headers: { ...headers(token), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { response, data: await response.json() };
}
async function order(key = crypto.randomUUID()) {
    const result = await call('/api/payments/orders', { method: 'POST', body: { productId: 'service', requestKey: key } });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    return result.data.data;
}
function payload(order, overrides = {}) {
    return { app_id: process.env.ALIPAY_APP_ID, seller_id: process.env.ALIPAY_SELLER_ID, out_trade_no: order.id,
        total_amount: order.amount, trade_no: `2026101900000000${String(++tradeCounter).padStart(8, '0')}`, trade_status: 'TRADE_SUCCESS',
        subject: '含中文 + 百分号%2B 的服务', sign_type: 'RSA2', ...overrides };
}
function signed(data) {
    const text = Object.keys(data).filter(key => key !== 'sign' && key !== 'sign_type' && data[key] !== '').sort().map(key => `${key}=${data[key]}`).join('&');
    return { ...data, sign: crypto.sign('RSA-SHA256', Buffer.from(text), alipay.privateKey).toString('base64') };
}
async function notify(body, suffix = '') {
    return fetch(base + '/api/payments/alipay/notify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://untrusted.example.test' }, body: new URLSearchParams(body).toString() + suffix });
}
before(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const id of ['owner', 'other']) db.prepare('INSERT INTO users(id,username,email,password_hash) VALUES (?,?,?,?)').run(id, id, `${id}@example.test`, 'fixture-hash');
    owner = generateToken({ id: 'owner', username: 'owner', role: 'user' });
    other = generateToken({ id: 'other', username: 'other', role: 'user' });
    const administrator = db.prepare('SELECT * FROM admins WHERE username = ?').get('payment-admin');
    admin = generateToken({ id: `admin-${administrator.id}`, adminId: administrator.id, username: administrator.username, role: 'super_admin', scope: 'admin' });
    const staffId = Number(db.prepare("INSERT INTO admins(username,password_hash,role) VALUES ('payment-staff','fixture-hash','admin')").run().lastInsertRowid);
    staff = generateToken({ id: `admin-${staffId}`, adminId: staffId, username: 'payment-staff', role: 'admin', scope: 'admin' });
    urllib.request = async (url, options) => {
        queryCalls++;
        assert.equal(new URL(url).origin, 'https://openapi-sandbox.dl.alipaydev.com');
        assert.equal(new URL(url).searchParams.get('method'), 'alipay.trade.query');
        const biz = JSON.parse(options.data.biz_content);
        const row = payments.view(payments.findOrder(biz.out_trade_no));
        const result = queryResult || { code: '10000', out_trade_no: row.id, total_amount: row.amount, trade_no: `202610191111111100000001`, trade_status: 'TRADE_SUCCESS' };
        const encoded = JSON.stringify(result);
        return { status: 200, headers: {}, data: JSON.stringify({ alipay_trade_query_response: result,
            sign: unsignedQuery ? 'invalid-signature' : crypto.sign('RSA-SHA256', Buffer.from(encoded), alipay.privateKey).toString('base64') }) };
    };
});
after(async () => { urllib.request = realRequest; await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

test('starts disabled, never returns credentials, and reserves settings for the super admin', async () => {
    assert.deepEqual((await call('/api/payments/catalog', { token: '' })).data.data, { enabled: false, products: [] });
    assert.equal((await call('/api/payments/orders', { token: '' })).response.status, 401);
    for (const token of [owner, staff]) assert.equal((await call('/api/admin/payments/settings', { token })).response.status, 403);
    const response = await call('/api/admin/payments/settings', { token: admin });
    assert.equal(response.data.data.enabled, false);
    assert.equal(response.data.data.readiness.configured, true);
    assert.ok(!JSON.stringify(response.data).includes(process.env.ALIPAY_APP_ID));
    assert.ok(!JSON.stringify(response.data).includes(privateKey));
    assert.ok(!JSON.stringify(response.data).includes(directory));
    assert.equal((await call('/api/admin/payments/settings', { token: admin, method: 'PUT', body: { enabled: true, products: [], privateKey: 'ignored?' } })).response.status, 400);
    const settings = await call('/api/admin/payments/settings', { token: admin, method: 'PUT', body: { enabled: true, products: [product] } });
    assert.equal(settings.response.status, 200);
});
test('server owns prices, idempotency, order identity and cashier destinations', async () => {
    const key = crypto.randomUUID(), created = await order(key);
    assert.equal((await order(key)).id, created.id);
    assert.equal(created.amount, '1.23');
    assert.ok(!Object.hasOwn(created, 'appId'));
    const tampered = await call('/api/payments/orders', { method: 'POST', body: { productId: 'service', requestKey: crypto.randomUUID(), amount: '0.01', userId: 'other' } });
    assert.equal(tampered.response.status, 400);
    const checkout = await call(`/api/payments/orders/${created.id}/checkout`, { method: 'POST', extra: { Host: 'evil.example.test' } });
    assert.equal(checkout.response.status, 200);
    const url = new URL(checkout.data.data.url), biz = JSON.parse(url.searchParams.get('biz_content'));
    assert.equal(url.origin, 'https://openapi-sandbox.dl.alipaydev.com');
    assert.equal(biz.total_amount, '1.23');
    assert.equal(biz.out_trade_no, created.id);
    assert.equal(url.searchParams.get('notify_url'), 'https://payments.example.test/api/payments/alipay/notify');
    assert.equal(url.searchParams.get('return_url'), `https://payments.example.test/payments?order=${created.id}`);
    for (const endpoint of [`/api/payments/orders/${created.id}`, `/api/payments/orders/${created.id}/checkout`, `/api/payments/orders/${created.id}/refresh`]) {
        assert.equal((await call(endpoint, { token: other, method: endpoint.endsWith(created.id) ? 'GET' : 'POST' })).response.status, 404);
    }
    assert.equal((await call('/api/payments/orders', { token: other })).data.data.total, 0);
    const crossSite = await fetch(base + '/api/payments/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.test' }, body: '{}' });
    assert.equal(crossSite.status, 403);
});
test('callback verifies RSA2, amount, application, seller, transaction and duplicate form fields', async () => {
    const created = await order();
    for (const overrides of [{ total_amount: '0.01' }, { app_id: '2099000000000002' }, { seller_id: '2088000000000002' }, { trade_no: '' }, { trade_status: 'invented' }]) {
        assert.equal((await notify(signed(payload(created, overrides)))).status, 400);
        assert.equal(payments.findOrder(created.id).status, 'pending');
    }
    const good = signed(payload(created));
    assert.equal((await notify({ ...good, sign: 'forged' })).status, 400);
    assert.equal((await notify(good, '&total_amount=0.01')).status, 400);
    assert.equal((await fetch(base + '/api/payments/alipay/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
    const responses = await Promise.all(Array.from({ length: 5 }, () => notify(good)));
    for (const response of responses) { assert.equal(response.status, 200); assert.equal(await response.text(), 'success'); }
    const paid = payments.findOrder(created.id);
    assert.equal(paid.status, 'paid');
    assert.ok(paid.paid_at);
    await notify(signed({ ...good, trade_status: 'TRADE_CLOSED' }));
    assert.equal(payments.findOrder(created.id).status, 'paid');
    assert.equal(payments.findOrder(created.id).paid_at, paid.paid_at);
    assert.equal((await notify(signed(payload(created)))).status, 400, 'a second transaction cannot replace the paid transaction');
    const duplicate = await order();
    assert.equal((await notify(signed(payload(duplicate, { trade_no: good.trade_no })))).status, 400, 'one transaction cannot pay two orders');
    assert.equal(payments.findOrder(duplicate.id).status, 'pending');
});
test('callbacks and queries settle previous orders while the purchase toggle is off', async () => {
    const created = await order();
    payments.saveSettings({ enabled: false, products: [product] });
    assert.equal((await call('/api/payments/orders', { method: 'POST', body: { productId: 'service', requestKey: crypto.randomUUID() } })).response.status, 409);
    assert.equal((await call(`/api/payments/orders/${created.id}/checkout`, { method: 'POST' })).response.status, 409);
    assert.equal((await notify(signed(payload(created)))).status, 200);
    assert.equal((await call(`/api/payments/orders/${created.id}`)).data.data.status, 'paid');
    payments.saveSettings({ enabled: true, products: [product] });
});
test('query validates actual SDK response signatures; browser query parameters never mark paid', async () => {
    const created = await order();
    assert.equal((await call(`/api/payments/orders/${created.id}?trade_status=TRADE_SUCCESS&total_amount=1.23`)).data.data.status, 'pending');
    unsignedQuery = true;
    assert.equal((await call(`/api/payments/orders/${created.id}/refresh`, { method: 'POST' })).response.status, 502);
    assert.equal(payments.findOrder(created.id).status, 'pending');
    db.prepare('UPDATE payment_orders SET last_query_at = 0 WHERE id = ?').run(created.id);
    unsignedQuery = false;
    queryResult = { code: '10000', out_trade_no: created.id, total_amount: '0.01', trade_no: '202610191111111100000002', trade_status: 'TRADE_SUCCESS' };
    assert.equal((await call(`/api/payments/orders/${created.id}/refresh`, { method: 'POST' })).response.status, 502);
    assert.equal(payments.findOrder(created.id).status, 'pending');
    db.prepare('UPDATE payment_orders SET last_query_at = 0 WHERE id = ?').run(created.id);
    queryResult = null;
    assert.equal((await call(`/api/payments/orders/${created.id}/refresh`, { method: 'POST' })).data.data.status, 'paid');
    const count = queryCalls;
    await call(`/api/payments/orders/${created.id}/refresh`, { method: 'POST' });
    assert.equal(queryCalls, count);
});
test('old product prices are immutable, expired orders cannot open a cashier, and config fails closed', async () => {
    const created = await order();
    payments.saveSettings({ enabled: true, products: [{ ...product, price: '2.34' }] });
    assert.equal(payments.findOrder(created.id).amount_cents, 123);
    db.prepare('UPDATE payment_orders SET expires_at = ? WHERE id = ?').run(Date.now() - 1, created.id);
    assert.equal((await call(`/api/payments/orders/${created.id}/checkout`, { method: 'POST' })).response.status, 409);
    const original = process.env.ALIPAY_PUBLIC_KEY_PATH;
    process.env.ALIPAY_PUBLIC_KEY_PATH = '/nonexistent/fixture-key';
    assert.equal(config.readiness().configured, false);
    assert.equal(payments.catalog().enabled, false);
    assert.throws(() => payments.saveSettings({ enabled: true, products: [product] }), /未就绪/);
    process.env.ALIPAY_PUBLIC_KEY_PATH = original;
    for (const price of ['0', '-1', '1.001', '1e2', '01.00', 'NaN']) assert.throws(() => payments.saveSettings({ enabled: true, products: [{ ...product, price }] }));
    const env = process.env.ALIPAY_ENV;
    process.env.ALIPAY_ENV = '__proto__'; assert.equal(config.readiness().configured, false); process.env.ALIPAY_ENV = env;
    const publicBase = process.env.PAYMENT_PUBLIC_BASE_URL;
    process.env.PAYMENT_PUBLIC_BASE_URL = 'https://evil.example.test/path'; assert.equal(config.readiness().configured, false); process.env.PAYMENT_PUBLIC_BASE_URL = publicBase;
    const privatePath = process.env.ALIPAY_PRIVATE_KEY_PATH;
    process.env.ALIPAY_PRIVATE_KEY_PATH = '';
    process.env.ALIPAY_PRIVATE_KEY = merchant.privateKey.export({ type: 'pkcs1', format: 'pem' }).replace(/-----[^\n]+-----/g, '').replace(/\s/g, '');
    assert.equal(config.readiness().configured, true, 'the official tool PKCS#1 export is accepted without adding keys to source');
    process.env.ALIPAY_PRIVATE_KEY_PATH = privatePath; process.env.ALIPAY_PRIVATE_KEY = '';
    assert.equal((await fetch(base + '/payments')).status, 503, 'the payment SPA route is recognized when the frontend build is deliberately disabled');
});
