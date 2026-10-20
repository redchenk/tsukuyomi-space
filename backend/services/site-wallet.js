const db = require('../db');
const { BillingLedger } = require('./site-wallet-ledger');
const { priceUsage } = require('./site-wallet-pricing');
const auth = require('../repositories/auth-repository');
// Acknowledged payment and wallet commits must survive a host power loss.
db.pragma('synchronous = FULL');
const ledger = new BillingLedger(db);
const fail = (code, message, statusCode = 400) => { throw Object.assign(new Error(message), { code, statusCode }); };
function user(id) {
    const row = db.prepare('SELECT id,role FROM users WHERE id=?').get(id);
    if (!row || row.role === 'banned') fail('ACCOUNT_DISABLED', '账号已停用', 403);
    ledger.createWallet({ user_id: id, currency: 'CNY' });
}
function wallet(id) { user(id); return { ...ledger.getWallet(id), unlimited: auth.hasOfficialApiUnlimited(id), source: 'site' }; }
function creditOrder(order) {
    if (order.status !== 'paid' || !order.user_id || !order.wallet_credit_cents || process.env.NODE_ENV === 'production' && order.environment !== 'production') return false;
    // Runs inside the existing verified payment transaction. Browser return
    // parameters and ordinary service products cannot grant wallet money.
    ledger.createWallet({ user_id: order.user_id, currency: 'CNY' });
    return ledger.creditVerifiedEvent({ verified: true, source_id: `site-alipay-${order.environment}`,
        event_id: order.id, order_id: order.id, user_id: order.user_id, currency: 'CNY',
        money_atoms: (BigInt(order.wallet_credit_cents) * 10000000n).toString() }).credited;
}
function creditedOrder(order) {
    return Boolean(order.wallet_credit_cents && db.prepare('SELECT order_id FROM billing_payment_orders WHERE source_id=? AND order_id=?').get(`site-alipay-${order.environment}`, order.id));
}
function request(id) {
    if (typeof id !== 'string' || !/^req_[a-zA-Z0-9_-]{1,100}$/.test(id)) fail('INVALID_REQUEST', '请求编号无效');
    return ledger.getRequest(id);
}
function statement(id, month) {
    user(id);
    if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) fail('INVALID_MONTH', '月份格式无效');
    const start = `${month}-01T00:00:00.000Z`, end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
    const entries = db.prepare("SELECT operation,balance_delta_atoms FROM billing_wallet_entries WHERE user_id=? AND created_at>=? AND created_at<? AND operation IN ('credit','settle')").safeIntegers(true).all(id, start, end.toISOString());
    let charged = 0n, credited = 0n;
    for (const row of entries) { if (row.operation === 'credit') credited += row.balance_delta_atoms; else charged -= row.balance_delta_atoms; }
    const held = db.prepare("SELECT COALESCE(SUM(hold_atoms),0) n FROM billing_requests WHERE user_id=? AND created_at>=? AND created_at<? AND state IN ('reserved','unknown','needs_review')").safeIntegers(true).get(id, start, end.toISOString()).n;
    return { month, timezone: 'UTC', currency: 'CNY', charged_atoms: String(charged), credited_atoms: String(credited), pending_hold_atoms: String(held) };
}
function admission(input) {
    return db.transaction(() => {
        user(input.user_id);
        if (typeof input.sponsored !== 'boolean' || input.sponsored !== auth.hasOfficialApiUnlimited(input.user_id)) fail('ROLE_CHANGED', '账号权限已变化，请刷新后重试', 409);
        if (!/^req_[a-zA-Z0-9_-]{1,100}$/.test(input.request_id || '')) fail('INVALID_REQUEST', '请求编号无效');
        if (typeof input.hold_atoms !== 'string' || !/^\d{1,12}$/.test(input.hold_atoms) || BigInt(input.hold_atoms) > 10000000000n || input.sponsored && input.hold_atoms !== '0') fail('INVALID_HOLD', '预留金额超出限制');
        const old = db.prepare('SELECT sponsored FROM site_wallet_admissions WHERE request_id=?').get(input.request_id);
        if (old && Boolean(old.sponsored) !== input.sponsored) fail('IDEMPOTENCY_CONFLICT', '请求扣费方式冲突', 409);
        if (!old && db.prepare("SELECT count(*) n FROM billing_requests WHERE user_id=? AND state IN ('reserved','unknown','needs_review')").get(input.user_id).n >= 8) fail('ACCOUNT_REQUEST_LIMIT', '账号仍有待处理请求', 429);
        const result = ledger.reserve({ request_id: input.request_id, user_id: input.user_id, request_fingerprint: input.request_fingerprint, hold_atoms: input.hold_atoms, pricing_snapshot: input.pricing_snapshot });
        db.prepare('INSERT OR IGNORE INTO site_wallet_admissions(request_id,sponsored) VALUES(?,?)').run(input.request_id, input.sponsored ? 1 : 0);
        return result;
    }).immediate();
}
function settle(input) {
    const current = request(input.request_id);
    const mode = db.prepare('SELECT sponsored FROM site_wallet_admissions WHERE request_id=?').get(input.request_id);
    if (!mode) fail('INVALID_REQUEST', '缺少主站预留记录', 409);
    const amount = mode.sponsored ? '0' : priceUsage(current.pricing_snapshot, input.usage).money_atoms;
    return ledger.settle({ request_id: current.request_id, request_fingerprint: input.request_fingerprint,
        money_atoms: amount, pricing_snapshot: current.pricing_snapshot, usage: input.usage, usage_status: 'final_usage_observed' });
}
function release(input) {
    const current = request(input.request_id);
    return ledger.releaseWithNoConsumptionProof({ request_id: current.request_id, request_fingerprint: input.request_fingerprint,
        verified_no_consumption: true, reason: input.reason, proof_ref: input.proof_ref });
}
module.exports = { ledger, wallet, creditOrder, creditedOrder, statement, admission, settle, release, request };
