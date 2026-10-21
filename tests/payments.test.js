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
// Resolve the SDK's actual transport under both npm and pnpm layouts. Mocking
// an unrelated hoisted copy could accidentally send fixture requests online.
const sdkRequire = require('node:module').createRequire(require.resolve('alipay-sdk'));
const urllib = sdkRequire('urllib').default;
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
    assert.deepEqual((await call('/api/payments/catalog', { token: '' })).data.data, { enabled: false, mobileCheckout: false, appCheckout: false, products: [] });
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

test('wallet recharge uses verified existing orders, immutable amounts and atomic exactly-once credit', async () => {
    const wallet = require('../backend/services/site-wallet');
    payments.saveSettings({ enabled: true, products: [{ ...product, walletCredit: true }] });
    const created = await order();
    assert.equal(created.walletCredit, true);
    assert.equal(wallet.wallet('owner').balance_atoms, '0');
    payments.saveSettings({ enabled: true, products: [{ ...product, price: '2.34', walletCredit: false }] });
    const good = signed(payload(created));
    assert.equal((await notify({ ...good, sign: 'forged' })).status, 400);
    assert.equal(wallet.wallet('owner').balance_atoms, '0');
    db.exec("CREATE TRIGGER fixture_wallet_failure BEFORE INSERT ON billing_wallet_entries WHEN NEW.operation='credit' BEGIN SELECT RAISE(ABORT,'fixture'); END");
    assert.equal((await notify(good)).status, 400);
    assert.equal(payments.findOrder(created.id).status, 'pending', 'payment and wallet credit roll back together');
    db.exec('DROP TRIGGER fixture_wallet_failure');
    for (let n = 0; n < 3; n++) assert.equal((await notify(good)).status, 200);
    assert.equal(wallet.wallet('owner').balance_atoms, '1230000000');
    assert.equal(wallet.wallet('other').balance_atoms, '0');
    assert.equal(payments.view(payments.findOrder(created.id)).walletCreditAmount, '1.23');
    assert.equal(payments.view(payments.findOrder(created.id)).walletCredited, true);
    assert.equal(db.prepare("SELECT count(*) n FROM billing_wallet_entries WHERE operation='credit'").get().n, 1);
    const ordinary = await order();
    assert.equal((await notify(signed(payload(ordinary)))).status, 200);
    assert.equal(wallet.wallet('owner').balance_atoms, '1230000000', 'ordinary services never mint money');
    assert.equal((await call('/api/payments/wallet', { token: other })).data.data.balance_atoms, '0');
});

test('private wallet bridge rejects forgery, replay, stale timestamps and cross-account admissions', async () => {
    const key = crypto.randomBytes(32), file = path.join(directory, 'wallet-bridge.key');
    fs.writeFileSync(file, key, { mode: 0o600 }); process.env.OFFICIAL_WALLET_KEY_PATH = file;
    const endpoint = '/api/internal/official-wallet';
    async function rpc(body, { token = owner, nonce = crypto.randomBytes(16).toString('hex'), time = String(Date.now()), bad = false } = {}) {
        const raw = JSON.stringify(body), digest = crypto.createHash('sha256').update(raw).digest('hex');
        const signature = crypto.createHmac('sha256', key).update(`POST\n${endpoint}\n${time}\n${nonce}\n${digest}`).digest('hex');
        const response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json',
            'X-Wallet-Time': time, 'X-Wallet-Nonce': nonce, 'X-Wallet-Signature': bad ? '0'.repeat(64) : signature,
            ...(token ? { Cookie: `tsukuyomi_session=${token}` } : {}) }, body: raw });
        const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
        return { status: response.status, data };
    }
    const overview = { action: 'overview', user_id: 'owner', month: '2026-10' };
    assert.equal((await rpc(overview, { bad: true })).status, 403);
    assert.equal((await rpc(overview, { time: String(Date.now() - 120000) })).status, 403);
    const nonce = crypto.randomBytes(16).toString('hex');
    assert.equal((await rpc(overview, { nonce })).status, 200);
    assert.equal((await rpc(overview, { nonce })).status, 403);
    const price = { id: 'central-fixture', currency: 'CNY', rates_per_million_money_atoms: { input_uncached: '2200000000', input_cached: '44000000', output: '8800000000' } };
    const input = { action: 'reserve', user_id: 'owner', request_id: 'req_central', request_fingerprint: 'a'.repeat(64), hold_atoms: '100000000', pricing_snapshot: price, sponsored: false };
    assert.equal((await rpc(input, { token: other })).status, 403);
    assert.equal((await rpc(input, { token: admin })).status, 403);
    assert.equal((await rpc({ ...input, sponsored: true, hold_atoms: '0' })).status, 409);
    assert.equal((await rpc(input)).status, 200);
    assert.equal((await rpc(input)).status, 200, 'reservation replay cannot double hold');
    assert.equal(require('../backend/services/site-wallet').wallet('owner').held_atoms, '100000000');
    const settle = { action: 'settle', request_id: input.request_id, request_fingerprint: input.request_fingerprint, usage: { input_uncached: '10', input_cached: '0', output: '5' } };
    for (let n = 0; n < 2; n++) assert.equal((await rpc(settle, { token: '' })).status, 200);
    assert.equal(require('../backend/services/site-wallet').wallet('owner').balance_atoms, '1229934000');
    assert.equal(require('../backend/services/site-wallet').wallet('owner').held_atoms, '0');
    assert.equal((await rpc({ ...settle, usage: { ...settle.usage, output: '6' } })).status, 409);
    const empty = await rpc({ ...input, user_id: 'other', request_id: 'req_no_funds' }, { token: other });
    assert.equal(empty.status, 402);
    assert.equal(db.prepare("SELECT count(*) n FROM billing_requests WHERE request_id='req_no_funds'").get().n, 0);
    assert.equal((await fetch(base + endpoint, { method: 'POST', headers: headers(owner), body: JSON.stringify(overview) })).status, 403, 'browser origin and bearer tokens never authorize the private bridge');
});

test('main-site sponsored mode survives demotion for admitted requests and is denied for new ones', () => {
    const wallet = require('../backend/services/site-wallet');
    db.prepare("UPDATE users SET role='super_admin' WHERE id='other'").run();
    const pricing_snapshot = { id: 'sponsored-fixture', currency: 'CNY', rates_per_million_money_atoms: { input_uncached: '2200000000', input_cached: '44000000', output: '8800000000' } };
    const input = { user_id: 'other', request_id: 'req_sponsored', request_fingerprint: 'b'.repeat(64), hold_atoms: '0', pricing_snapshot, sponsored: true };
    wallet.admission(input);
    db.prepare("UPDATE users SET role='user' WHERE id='other'").run();
    assert.equal(wallet.settle({ request_id: input.request_id, request_fingerprint: input.request_fingerprint, usage: { input_uncached: '20', input_cached: '0', output: '50' } }).request.money_atoms, '0');
    assert.equal(wallet.wallet('other').balance_atoms, '0');
    assert.throws(() => wallet.admission({ ...input, request_id: 'req_demoted' }), /权限已变化/);
});

test('mobile WAP and native App payments preserve channel identity, prices, signatures and settlement', async () => {
    payments.saveSettings({ enabled: true, products: [{ ...product, walletCredit: true }] });
    db.prepare('INSERT INTO users(id,username,email,password_hash) VALUES (?,?,?,?)').run('mobile','mobile','mobile@example.test','fixture');
    const mobileToken = generateToken({ id: 'mobile', username: 'mobile', role: 'user' });
    const callAsMobile = (endpoint, options = {}) => call(endpoint, { token: mobileToken, ...options });
    assert.equal(config.readiness().appCheckout, false);
    let result = await callAsMobile('/api/payments/orders', { method: 'POST', body: {
        productId: product.id, requestKey: crypto.randomUUID(), channel: 'app'
    } });
    assert.equal(result.response.status, 503); // No mobile credentials: do not borrow website credentials.
    process.env.ALIPAY_WAP_ENABLED = 'true';
    result = await callAsMobile('/api/payments/orders', { method: 'POST', body: {
        productId: product.id, requestKey: crypto.randomUUID(), channel: 'mobile'
    } });
    const wap = result.data.data;
    assert.equal(wap.channel, 'mobile');
    const wapResult = await callAsMobile(`/api/payments/orders/${wap.id}/checkout`, { method: 'POST', body: { channel: 'mobile' } });
    const wapUrl = new URL(wapResult.data.data.url);
    assert.equal(wapUrl.searchParams.get('method'), 'alipay.trade.wap.pay');
    assert.equal(JSON.parse(wapUrl.searchParams.get('biz_content')).product_code, 'QUICK_WAP_WAY');
    const mobileMerchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const mobileAlipay = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    Object.assign(process.env, {
        ALIPAY_APP_PAY_ENABLED: 'true', ALIPAY_MOBILE_APP_ID: '2099000000000002', ALIPAY_MOBILE_SELLER_ID: '2088000000000002',
        ALIPAY_MOBILE_PRIVATE_KEY: mobileMerchant.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        ALIPAY_MOBILE_PUBLIC_KEY: mobileAlipay.publicKey.export({ type: 'spki', format: 'pem' })
    });
    assert.equal(config.readiness().appCheckout, true);
    const key = crypto.randomUUID();
    result = await callAsMobile('/api/payments/orders', { method: 'POST', body: { productId: product.id, requestKey: key, channel: 'app' } });
    assert.equal(result.response.status, 201);
    const appOrder = result.data.data;
    assert.equal(appOrder.channel, 'app');
    const replay = await callAsMobile('/api/payments/orders', { method: 'POST', body: { productId: product.id, requestKey: key, channel: 'app' } });
    assert.equal(replay.data.data.id, appOrder.id);
    assert.equal((await callAsMobile('/api/payments/orders', { method: 'POST', body: { productId: product.id, requestKey: key, channel: 'web' } })).response.status, 409);
    const checkout = await callAsMobile(`/api/payments/orders/${appOrder.id}/checkout`, { method: 'POST', body: { channel: 'app' } });
    assert.equal(checkout.response.status, 200);
    assert.equal(checkout.data.data.type, 'app');
    const params = new URLSearchParams(checkout.data.data.orderString);
    assert.equal(params.get('app_id'), process.env.ALIPAY_MOBILE_APP_ID);
    assert.equal(params.get('method'), 'alipay.trade.app.pay');
    const biz = JSON.parse(params.get('biz_content'));
    assert.equal(biz.product_code, 'QUICK_MSECURITY_PAY');
    assert.equal(biz.out_trade_no, appOrder.id); assert.equal(biz.total_amount, '1.23');
    const signature = params.get('sign'); params.delete('sign');
    const canonical = [...params.entries()].filter(([,value]) => value !== '').sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => `${key}=${value}`).join('&');
    assert.equal(crypto.verify('RSA-SHA256', Buffer.from(canonical), mobileMerchant.publicKey, Buffer.from(signature, 'base64')), true);
    assert.equal(crypto.verify('RSA-SHA256', Buffer.from(canonical), merchant.publicKey, Buffer.from(signature, 'base64')), false);
    assert.equal((await callAsMobile(`/api/payments/orders/${appOrder.id}/checkout`, { method: 'POST', body: { channel: 'web' } })).response.status, 409);
    assert.equal((await callAsMobile(`/api/payments/orders/${appOrder.id}/checkout`, { method: 'POST', token: other, body: { channel: 'app' } })).response.status, 404);
    const notification = payload(appOrder, { app_id: process.env.ALIPAY_MOBILE_APP_ID, seller_id: process.env.ALIPAY_MOBILE_SELLER_ID });
    assert.equal((await notify(signed(notification))).status, 400); // Website signing key is invalid for an App order.
    const signText = Object.keys(notification).filter(key => !['sign', 'sign_type'].includes(key) && notification[key] !== '').sort().map(key => `${key}=${notification[key]}`).join('&');
    const valid = { ...notification, sign: crypto.sign('RSA-SHA256', Buffer.from(signText), mobileAlipay.privateKey).toString('base64') };
    assert.equal((await notify(valid)).status, 200);
    assert.equal((await notify(valid)).status, 200);
    assert.equal(payments.findOrder(appOrder.id).status, 'paid');
    const queried = payments.createOrder('mobile', { productId: product.id, requestKey: crypto.randomUUID(), channel: 'app' });
    const originalQuery = urllib.request;
    let mobileQuerySigned = false;
    urllib.request = async (url, options) => {
        assert.equal(new URL(url).searchParams.get('app_id'), process.env.ALIPAY_MOBILE_APP_ID);
        assert.equal(new URL(url).searchParams.get('method'), 'alipay.trade.query');
        assert.equal(JSON.parse(options.data.biz_content).out_trade_no, queried.id);
        const body = { code: '10000', out_trade_no: queried.id, total_amount: queried.amount, seller_id: process.env.ALIPAY_MOBILE_SELLER_ID,
            trade_no: '202610210000000000099999', trade_status: 'TRADE_SUCCESS' };
        return { status: 200, headers: {}, data: JSON.stringify({ alipay_trade_query_response: body,
            sign: crypto.sign('RSA-SHA256', Buffer.from(JSON.stringify(body)), mobileQuerySigned ? mobileAlipay.privateKey : alipay.privateKey).toString('base64') }) };
    };
    try {
        await assert.rejects(payments.refreshOrder('mobile', queried.id), /查单暂时失败/);
        assert.equal(payments.findOrder(queried.id).status, 'pending');
        db.prepare('UPDATE payment_orders SET last_query_at = 0 WHERE id = ?').run(queried.id);
        mobileQuerySigned = true;
        assert.equal((await payments.refreshOrder('mobile', queried.id)).status, 'paid');
    } finally { urllib.request = originalQuery; }
    process.env.ALIPAY_APP_PAY_ENABLED = 'false'; process.env.ALIPAY_WAP_ENABLED = 'false';
    payments.saveSettings({ enabled: false, products: [] });
});
