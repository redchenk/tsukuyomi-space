const express = require('express');
const { randomUUID } = require('node:crypto');
const db = require('../db');
const { authenticateToken, authenticateAdminToken, requireSuperAdmin } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');
const policy = require('../../shared/privacy-policy.json');
// The 23/24 October updates only add Play recruitment and QQ SDK disclosures.
// Their deletion terms match the policy bundled in released native apps.
// Reassess this explicit compatibility list when the policy changes again.
const deletionPolicyVersions = new Set(policy.version === '2026-10-24'
    ? ['2026-10-22', '2026-10-23', policy.version] : [policy.version]);

const router = express.Router();
const adminRouter = express.Router();
const checks = ['identity', 'balance', 'content', 'privateData', 'storage', 'processors', 'backups', 'notification'];
const publicRow = row => row ? Object.fromEntries(['id', 'status', 'requested_at', 'due_at', 'updated_at', 'policy_version', 'resolution'].map(k => [k, row[k]])) : null;
function noStore(req, res, next) { res.set('Cache-Control', 'private, no-store'); next(); }
router.use(noStore, authenticateToken);
adminRouter.use(noStore, authenticateAdminToken, requireSuperAdmin);
const writes = createRateLimiter({ windowMs: 3600000, max: 20, keyPrefix: 'account-deletion', keyGenerator: req => req.user.id });
router.get('/me', (req, res) => {
    const row = db.prepare('SELECT * FROM account_deletion_requests WHERE user_id = ? ORDER BY requested_at DESC, rowid DESC LIMIT 1').get(req.user.id);
    res.json({ success: true, data: publicRow(row) });
});
router.post('/', writes, (req, res) => {
    if (req.body?.confirmation !== 'DELETE_ACCOUNT' || !deletionPolicyVersions.has(req.body?.policyVersion)) {
        return res.status(400).json({ success: false, message: '请阅读当前注销说明并确认申请。' });
    }
    const result = db.transaction(() => {
        const active = db.prepare("SELECT * FROM account_deletion_requests WHERE user_id = ? AND status IN ('pending','processing')").get(req.user.id);
        if (active) return { created: false, row: active };
        const now = new Date();
        const id = randomUUID();
        db.prepare(`INSERT INTO account_deletion_requests(id,user_id,status,requested_at,due_at,updated_at,policy_version)
            VALUES(?,?,'pending',?,?,?,?)`).run(id, req.user.id, now.toISOString(), new Date(now.getTime() + 30 * 86400000).toISOString(), now.toISOString(), req.body.policyVersion);
        // Private inbox notice, with no copied email, identity document or request content.
        db.prepare(`INSERT INTO notifications(user_id,type,title,content,link)
            SELECT id,'account_deletion','收到账号注销申请',?, '/admin/account-deletions'
            FROM users WHERE role = 'super_admin'`).run(`申请编号：${id}。请在注销工作台核验并处理。`);
        return { created: true, row: db.prepare('SELECT * FROM account_deletion_requests WHERE id = ?').get(id) };
    })();
    res.status(result.created ? 201 : 200).json({ success: true, data: publicRow(result.row) });
});
router.post('/:id/cancel', writes, (req, res) => {
    const result = db.prepare("UPDATE account_deletion_requests SET status='cancelled', updated_at=? WHERE id=? AND user_id=? AND status='pending'")
        .run(new Date().toISOString(), req.params.id, req.user.id);
    if (!result.changes) return res.status(409).json({ success: false, message: '该申请已进入处理阶段或不存在。请联系站长核实。' });
    res.json({ success: true, data: publicRow(db.prepare('SELECT * FROM account_deletion_requests WHERE id=?').get(req.params.id)) });
});
adminRouter.get('/', (req, res) => {
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const status = ['pending', 'processing', 'completed', 'cancelled'].includes(req.query.status) ? req.query.status : 'pending';
    const total = db.prepare('SELECT COUNT(*) AS n FROM account_deletion_requests WHERE status=?').get(status).n;
    const items = db.prepare(`SELECT r.*, u.username, u.email FROM account_deletion_requests r LEFT JOIN users u ON u.id=r.user_id
        WHERE r.status=? ORDER BY r.requested_at, r.rowid LIMIT 30 OFFSET ?`).all(status, (page - 1) * 30);
    res.json({ success: true, data: { items, total, page, totalPages: Math.max(1, Math.ceil(total / 30)) } });
});
adminRouter.post('/:id/status', (req, res) => {
    const result = db.transaction(() => {
        const row = db.prepare('SELECT * FROM account_deletion_requests WHERE id=?').get(req.params.id);
        if (!row) return { status: 404, message: '申请不存在' };
        const next = req.body?.status;
        if (!(row.status === 'pending' && next === 'processing') && !(row.status === 'processing' && next === 'completed')) {
            return { status: 409, message: '申请状态已变化，请刷新后重试。' };
        }
        const checklist = req.body?.checklist || {};
        const resolution = typeof req.body?.resolution === 'string' ? req.body.resolution.trim() : '';
        if (resolution.length > 2000) return { status: 400, message: '处理说明过长' };
        if (next === 'completed' && (row.user_id !== null || checks.some(key => checklist[key] !== true) || resolution.length < 10)) {
            return { status: 409, message: '须先完成账号清理、逐项核验并填写处理说明，不能仅标记为已注销。' };
        }
        db.prepare('UPDATE account_deletion_requests SET status=?,updated_at=?,resolution=?,checklist=? WHERE id=?')
            .run(next, new Date().toISOString(), resolution, JSON.stringify(Object.fromEntries(checks.map(key => [key, checklist[key] === true]))), row.id);
        return { data: publicRow(db.prepare('SELECT * FROM account_deletion_requests WHERE id=?').get(row.id)) };
    })();
    res.status(result.status || 200).json(result.status ? { success: false, message: result.message } : { success: true, data: result.data });
});
module.exports = { router, adminRouter };
