// One-time, explicitly scoped delivery of verified historical recharge orders.
// Run with the host's private runtime environment, never paste credentials here.
const db = require('../backend/db');
const payments = require('../backend/services/payments');
const wallet = require('../backend/services/site-wallet');
const configuration = require('../backend/services/payment-config');
const args = process.argv.slice(2), apply = args.includes('--apply');
const ids = args.filter(x => x !== '--apply');
if (!ids.length || ids.some(x => !/^[A-Za-z0-9_-]{1,40}$/.test(x))) throw new Error('Specify the approved existing product IDs; add --apply after review');
const config = configuration.readConfig(), saved = payments.settings();
if (!config.configured || config.environment !== 'production') throw new Error('Verified production payment configuration is required');
if (ids.some(id => !saved.products.some(p => p.id === id))) throw new Error('An approved product no longer exists');
const selected = db.prepare(`SELECT * FROM payment_orders WHERE product_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
if (selected.some(o => o.app_id !== config.appId || o.seller_id !== config.sellerId || o.environment !== config.environment || o.status === 'paid' && !o.trade_no)) throw new Error('Order merchant identity or payment evidence mismatch');
let credited = 0, atoms = 0n;
if (apply) db.transaction(() => {
    payments.saveSettings({ enabled: saved.enabled, products: saved.products.map(p => ids.includes(p.id) ? { ...p, walletCredit: true } : p) });
    for (const old of selected) {
        db.prepare('UPDATE payment_orders SET wallet_credit_cents=amount_cents WHERE id=? AND wallet_credit_cents=0').run(old.id);
        const order = payments.findOrder(old.id);
        if (wallet.creditOrder(order)) { credited++; atoms += BigInt(order.wallet_credit_cents) * 10000000n; }
    }
}).immediate();
console.log(JSON.stringify({ applied: apply, products: ids, reviewed_orders: selected.length, paid_orders: selected.filter(o => o.status === 'paid').length, newly_credited_orders: credited, credited_atoms: String(atoms) }));
db.close();
