const express = require('express');
const payments = require('../services/payments');
const configuration = require('../services/payment-config');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');

function sendError(res, error) {
    const known = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 600;
    return res.status(known ? error.statusCode : 500).json({ success: false, message: known ? error.message : '支付服务暂时不可用' });
}
const router = express.Router();
router.get('/catalog', (req, res) => {
    try { res.json({ success: true, data: payments.catalog() }); } catch (error) { sendError(res, error); }
});
router.use(authenticateToken);
router.get('/orders', (req, res) => {
    try { res.json({ success: true, data: payments.listOrders(req.user.id, req.query) }); } catch (error) { sendError(res, error); }
});
router.get('/orders/:id', (req, res) => {
    try { res.json({ success: true, data: payments.view(payments.findOrder(req.params.id, req.user.id)) }); } catch (error) { sendError(res, error); }
});
const writeLimit = createRateLimiter({ windowMs: 60000, max: 20, keyPrefix: 'payment-orders', keyGenerator: req => req.user.id });
router.post('/orders', writeLimit, (req, res) => {
    try { res.status(201).json({ success: true, data: payments.createOrder(req.user.id, req.body) }); } catch (error) { sendError(res, error); }
});
router.post('/orders/:id/checkout', writeLimit, (req, res) => {
    try { res.json({ success: true, data: payments.checkout(req.user.id, req.params.id) }); } catch (error) { sendError(res, error); }
});
router.post('/orders/:id/refresh', writeLimit, async (req, res) => {
    try { res.json({ success: true, data: await payments.refreshOrder(req.user.id, req.params.id) }); } catch (error) { sendError(res, error); }
});

const adminRouter = express.Router();
adminRouter.use(requireSuperAdmin);
adminRouter.get('/settings', (req, res) => {
    try { res.json({ success: true, data: { ...payments.settings(), readiness: configuration.readiness() } }); } catch (error) { sendError(res, error); }
});
adminRouter.put('/settings', (req, res) => {
    try { res.json({ success: true, data: { ...payments.saveSettings(req.body), readiness: configuration.readiness() } }); } catch (error) { sendError(res, error); }
});
adminRouter.get('/orders', (req, res) => {
    try { res.json({ success: true, data: payments.listOrders(null, req.query) }); } catch (error) { sendError(res, error); }
});
adminRouter.post('/orders/:id/refresh', createRateLimiter({ windowMs: 60000, max: 20, keyPrefix: 'payment-admin-query' }), async (req, res) => {
    try {
        const order = payments.findOrder(req.params.id);
        if (!order.user_id) throw Object.assign(new Error('该订单所属账号已注销，请通过支付宝商家平台核对'), { statusCode: 409 });
        res.json({ success: true, data: await payments.refreshOrder(order.user_id, order.id) });
    } catch (error) { sendError(res, error); }
});

// Only this exact POST endpoint bypasses browser CSRF. It authenticates every
// notification with RSA2 instead; normal order/admin writes retain the site guard.
const notifyRouter = express.Router({ strict: true });
notifyRouter.post('/alipay/notify',
    createRateLimiter({ windowMs: 60000, max: 120, keyPrefix: 'alipay-notify' }),
    (req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'Surrogate-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
        if (!req.is('application/x-www-form-urlencoded')) return res.status(400).type('text').send('fail');
        next();
    },
    express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 64, verify(req, res, buffer) {
        const seen = new Set();
        for (const [key] of new URLSearchParams(buffer.toString('utf8'))) {
            if (seen.has(key)) throw new Error('Duplicate notification parameter');
            seen.add(key);
        }
    } }),
    (req, res) => {
        try { payments.notification(req.body); res.type('text').send('success'); }
        catch (_) { res.status(400).type('text').send('fail'); }
    });
notifyRouter.use((error, req, res, next) => {
    if (req.method === 'POST' && req.path === '/alipay/notify') return res.status(error.type === 'entity.too.large' ? 413 : 400).type('text').send('fail');
    next(error);
});

module.exports = { router, adminRouter, notifyRouter };
