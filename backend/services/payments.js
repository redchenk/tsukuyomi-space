const crypto = require('node:crypto');
const db = require('../db');
const { AlipaySdk } = require('alipay-sdk');
const configuration = require('./payment-config');

function failure(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }
function amount(cents) { return (cents / 100).toFixed(2); }
function cents(value) {
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value)) throw failure(400, '金额格式无效');
    const [yuan, fraction = ''] = value.split('.');
    return Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
}
function settings() {
    const row = db.prepare('SELECT * FROM payment_settings WHERE id = 1').get();
    return { enabled: row.enabled === 1, products: JSON.parse(row.products_json) };
}
function saveSettings(input) {
    if (!input || typeof input.enabled !== 'boolean' || !Array.isArray(input.products) || input.products.length > 20
        || Object.keys(input).some(key => !['enabled', 'products'].includes(key))) throw failure(400, '支付设置格式无效');
    const ids = new Set();
    const products = input.products.map(product => {
        if (!product || Object.keys(product).some(key => !['id', 'title', 'description', 'price', 'enabled'].includes(key))
            || typeof product.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(product.id) || ids.has(product.id)
            || typeof product.title !== 'string' || !product.title.trim() || product.title.trim().length > 60
            || typeof product.description !== 'string' || product.description.length > 500 || typeof product.enabled !== 'boolean') throw failure(400, '商品信息无效，请检查编号、名称和说明');
        const priceCents = cents(product.price);
        if (priceCents < 1 || priceCents > 100000000) throw failure(400, '商品金额超出范围');
        ids.add(product.id);
        return { id: product.id, title: product.title.trim(), description: product.description.trim(), price: amount(priceCents), enabled: product.enabled };
    });
    if (input.enabled) {
        const config = configuration.readConfig();
        if (!config.configured) throw failure(400, '服务器支付配置未就绪，无法开启收款');
        const active = products.filter(product => product.enabled);
        if (!active.length || active.some(product => cents(product.price) > config.maxAmountCents)) throw failure(400, '请配置可售商品，且金额不得超过服务器单笔限额');
    }
    db.prepare('UPDATE payment_settings SET enabled = ?, products_json = ?, updated_at = ? WHERE id = 1')
        .run(input.enabled ? 1 : 0, JSON.stringify(products), Date.now());
    return settings();
}
function catalog() {
    const saved = settings(), ready = configuration.readiness();
    const enabled = saved.enabled && ready.configured;
    return { enabled, products: enabled ? saved.products.filter(p => p.enabled && cents(p.price) <= ready.maxAmountCents).map(({ enabled, ...p }) => p) : [] };
}
function runtime(order = null) {
    const config = configuration.readConfig();
    if (!config.configured) throw failure(503, '支付服务配置未就绪，请联系管理员');
    if (order && (order.app_id !== config.appId || order.seller_id !== config.sellerId || order.environment !== config.environment)) throw failure(503, '订单所属支付配置已变更，请联系管理员');
    return { ...config, sdk: new AlipaySdk({ appId: config.appId, privateKey: config.privateKey, alipayPublicKey: config.alipayPublicKey,
        gateway: config.gateway, signType: 'RSA2', keyType: 'PKCS8', camelcase: false, timeout: 10000 }) };
}
function view(order) {
    return { id: order.id, productId: order.product_id, title: order.title, description: order.description, amount: amount(order.amount_cents),
        status: order.status, expired: order.status === 'pending' && order.expires_at <= Date.now(),
        createdAt: order.created_at, expiresAt: order.expires_at, paidAt: order.paid_at, closedAt: order.closed_at };
}
function findOrder(id, userId = null) {
    if (typeof id !== 'string' || !/^TS[a-f0-9]{32}$/.test(id)) throw failure(404, '订单不存在');
    const row = userId === null ? db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(id)
        : db.prepare('SELECT * FROM payment_orders WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) throw failure(404, '订单不存在');
    return row;
}
function createOrder(userId, input) {
    if (!input || Object.keys(input).some(key => !['productId', 'requestKey'].includes(key))
        || typeof input.productId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(input.productId)
        || typeof input.requestKey !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(input.requestKey)) throw failure(400, '订单请求无效');
    return db.transaction(() => {
        const previous = db.prepare('SELECT * FROM payment_orders WHERE user_id = ? AND request_key = ?').get(userId, input.requestKey);
        if (previous) {
            if (previous.product_id !== input.productId) throw failure(409, '该请求编号已用于其他商品');
            return view(previous);
        }
        const product = catalog().products.find(product => product.id === input.productId);
        if (!product) throw failure(409, '该商品当前不可购买');
        const config = runtime();
        const id = `TS${crypto.randomBytes(16).toString('hex')}`, now = Date.now();
        db.prepare(`INSERT INTO payment_orders (id, user_id, request_key, product_id, title, description, amount_cents,
            app_id, seller_id, environment, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, userId, input.requestKey, product.id, product.title, product.description, cents(product.price), config.appId, config.sellerId, config.environment, now, now + 15 * 60000);
        return view(findOrder(id, userId));
    }).immediate();
}
function checkout(userId, id) {
    const order = findOrder(id, userId);
    if (!catalog().enabled) throw failure(409, '收款入口暂未开放');
    if (order.status !== 'pending' || order.expires_at <= Date.now()) throw failure(409, '该订单已完成或已到期，请刷新订单状态');
    const config = runtime(order);
    if (order.amount_cents > config.maxAmountCents) throw failure(409, '该订单金额超过当前单笔限额，请联系管理员');
    const returnUrl = new URL('/payments', config.baseUrl);
    returnUrl.searchParams.set('order', order.id);
    const remainingMinutes = Math.max(1, Math.floor((order.expires_at - Date.now()) / 60000));
    return { url: config.sdk.pageExecute('alipay.trade.page.pay', 'GET', {
        notifyUrl: `${config.baseUrl}/api/payments/alipay/notify`, returnUrl: returnUrl.toString(),
        bizContent: { out_trade_no: order.id, product_code: 'FAST_INSTANT_TRADE_PAY', seller_id: order.seller_id,
            subject: order.title, total_amount: amount(order.amount_cents), timeout_express: `${remainingMinutes}m` }
    }) };
}
function applyResult(id, data, notification = true) {
    return db.transaction(() => {
        const order = findOrder(id);
        if (data.out_trade_no !== order.id || cents(data.total_amount) !== order.amount_cents
            || (notification && (data.app_id !== order.app_id || data.seller_id !== order.seller_id))
            || (!notification && data.seller_id && data.seller_id !== order.seller_id)
            || (!notification && data.app_id && data.app_id !== order.app_id)
            || typeof data.trade_no !== 'string' || !/^\d{10,64}$/.test(data.trade_no)
            || (order.trade_no && order.trade_no !== data.trade_no)) throw failure(400, '支付结果与订单不一致');
        const state = data.trade_status;
        if (!['WAIT_BUYER_PAY', 'TRADE_CLOSED', 'TRADE_SUCCESS', 'TRADE_FINISHED'].includes(state)) throw failure(400, '支付状态无效');
        if (order.status === 'paid') return view(order);
        if (state === 'TRADE_SUCCESS' || state === 'TRADE_FINISHED') {
            db.prepare(`UPDATE payment_orders SET status = 'paid', trade_no = ?, provider_status = ?, paid_at = ?, closed_at = NULL WHERE id = ?`)
                .run(data.trade_no, state, Date.now(), order.id);
        } else if (state === 'TRADE_CLOSED') {
            db.prepare(`UPDATE payment_orders SET status = 'closed', trade_no = ?, provider_status = ?, closed_at = ? WHERE id = ?`)
                .run(data.trade_no, state, Date.now(), order.id);
        }
        return view(findOrder(id));
    }).immediate();
}
function notification(body) {
    if (!body || body.sign_type !== 'RSA2' || typeof body.sign !== 'string' || body.sign.length > 2048
        || Object.values(body).some(value => typeof value !== 'string')) throw failure(400, '通知格式无效');
    const order = findOrder(body.out_trade_no);
    const config = runtime(order); // independent of the purchase toggle: settle existing orders after shutdown.
    if (!config.sdk.checkNotifySignV2(body)) throw failure(400, '通知验签失败');
    return applyResult(order.id, body);
}
async function refreshOrder(userId, id) {
    let order = findOrder(id, userId);
    if (order.status === 'paid') return view(order);
    const config = runtime(order);
    const now = Date.now();
    const lock = db.prepare('UPDATE payment_orders SET last_query_at = ? WHERE id = ? AND last_query_at <= ?').run(now, id, now - 5000);
    if (!lock.changes) return view(order);
    try {
        const result = await config.sdk.exec('alipay.trade.query', { bizContent: { out_trade_no: id } }, { validateSign: true });
        if (result.code === '10000') return applyResult(id, result, false);
        if (result.sub_code === 'ACQ.TRADE_NOT_EXIST') {
            if (order.expires_at <= now) db.prepare(`UPDATE payment_orders SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'pending'`).run(now, id);
            return view(findOrder(id, userId));
        }
    } catch (_) { /* SDK errors may embed signatures or response data; never expose or log them. */ }
    throw failure(502, '支付宝查单暂时失败，请稍后刷新');
}
function listOrders(userId, query = {}) {
    const page = Math.min(100000, Math.max(1, Number.parseInt(query.page, 10) || 1));
    const limit = 20;
    const status = ['pending', 'paid', 'closed'].includes(query.status) ? query.status : '';
    const where = ['1=1'], values = [];
    if (userId !== null) { where.push('user_id = ?'); values.push(userId); }
    if (status) { where.push('status = ?'); values.push(status); }
    const clause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS total FROM payment_orders WHERE ${clause}`).get(...values).total;
    const rows = db.prepare(`SELECT * FROM payment_orders WHERE ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...values, limit, (page - 1) * limit);
    return { items: rows.map(order => ({ ...view(order), ...(userId === null ? { userId: order.user_id, tradeNo: order.trade_no } : {}) })), page, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { settings, saveSettings, catalog, createOrder, checkout, findOrder, view, notification, refreshOrder, listOrders };
