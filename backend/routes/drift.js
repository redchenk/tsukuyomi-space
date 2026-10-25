const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');
const { reviewMessageContent } = require('../services/message-moderation');
const { createNotification } = require('../repositories/notification-repository');
const router = express.Router();
const adminRouter = express.Router();
const writeLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 12, keyPrefix: 'drift-write', keyGenerator: req => req.user.id });
const pickLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, keyPrefix: 'drift-pick', keyGenerator: req => req.user.id });
const blocked = (a, b) => Boolean(db.prepare('SELECT 1 FROM drift_blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)').get(a,b,b,a));
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const ok = (res, data) => res.json({ success: true, data });
const id = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const language = value => ['zh','ja','en'].includes(value) ? value : 'zh';
function access(bottleId, userId) {
    return db.prepare(`SELECT b.*, u.username, COALESCE(NULLIF(u.nickname,''),u.username) AS nickname
        FROM drift_bottles b JOIN users u ON u.id=b.user_id
        WHERE b.id=? AND (b.user_id=? OR (b.recipient_id=? AND b.status='approved'))`).get(bottleId,userId,userId);
}
function notify(b, actorId) {
    const target = actorId === b.user_id ? b.recipient_id : b.user_id;
    if (target) createNotification({ userId: target, actorId, type: 'reply', title: '漂流瓶有了新回信', link: `/drift?bottle=${b.id}` });
}
router.use(authenticateToken);
router.get('/', (req,res) => {
    const before = id(req.query.before) || Number.MAX_SAFE_INTEGER;
    ok(res, db.prepare(`SELECT b.id,b.content,b.language,b.status,b.closed,b.created_at,b.recipient_id,
        b.user_id,u.username,COALESCE(NULLIF(u.nickname,''),u.username) AS nickname
        FROM drift_bottles b JOIN users u ON u.id=b.user_id
        WHERE b.id < ? AND (b.user_id=? OR (b.recipient_id=? AND b.status='approved')) ORDER BY b.id DESC LIMIT 30`).all(before,req.user.id,req.user.id));
});
router.post('/', writeLimiter, (req,res) => {
    const review = reviewMessageContent(req.body?.content);
    if (!review.accepted) return fail(res,422,'内容无效，请使用不超过 2000 字的纯文本');
    const result = db.prepare('INSERT INTO drift_bottles(user_id,content,language,status,review) VALUES(?,?,?,?,?)')
        .run(req.user.id,review.content,language(req.body?.language),review.status,JSON.stringify(review));
    res.status(201).json({ success:true, data: { id: Number(result.lastInsertRowid), status: review.status } });
});
router.post('/pick', pickLimiter, (req,res) => {
    const picked = db.transaction(() => {
        const b = db.prepare(`SELECT b.id FROM drift_bottles b JOIN users u ON u.id=b.user_id
            WHERE b.status='approved' AND b.closed=0 AND b.recipient_id IS NULL AND b.user_id!=? AND u.role!='banned'
            AND NOT EXISTS(SELECT 1 FROM drift_blocks d WHERE (d.user_id=? AND d.blocked_id=b.user_id) OR (d.user_id=b.user_id AND d.blocked_id=?))
            ORDER BY random() LIMIT 1`).get(req.user.id,req.user.id,req.user.id);
        if (!b) return null;
        const result = db.prepare("UPDATE drift_bottles SET recipient_id=?,picked_at=CURRENT_TIMESTAMP WHERE id=? AND recipient_id IS NULL AND status='approved'").run(req.user.id,b.id);
        return result.changes ? access(b.id,req.user.id) : null;
    }).immediate();
    ok(res,picked && { id: picked.id });
});
router.get('/:id', (req,res) => {
    const b = access(id(req.params.id),req.user.id);
    if (!b) return fail(res,404,'漂流瓶不存在');
    // Audit records stay on the server.
    delete b.review;
    const peerId = req.user.id === b.user_id ? b.recipient_id : b.user_id;
    const peer = peerId ? db.prepare("SELECT id,username,COALESCE(NULLIF(nickname,''),username) AS nickname FROM users WHERE id=?").get(peerId) : null;
    const replies = db.prepare(`SELECT r.id,r.user_id,r.content,r.language,r.status,r.created_at
        FROM drift_replies r WHERE bottle_id=? AND (r.status='approved' OR r.user_id=?) ORDER BY r.id DESC LIMIT 100`).all(b.id,req.user.id).reverse();
    ok(res,{ bottle:b, peer, blocked: peerId ? blocked(req.user.id,peerId) : false, replies });
});
router.post('/:id/replies', writeLimiter, (req,res) => {
    const bottleId = id(req.params.id);
    const canReply = () => {
        const b = access(bottleId,req.user.id);
        return b && b.status==='approved' && b.recipient_id && !b.closed && !blocked(b.user_id,b.recipient_id) ? b : null;
    };
    if (!canReply()) return fail(res,403,'此漂流瓶暂不能回信');
    const review = reviewMessageContent(req.body?.content);
    if (!review.accepted) return fail(res,422,'内容无效，请使用不超过 2000 字的纯文本');
    const saved = db.transaction(() => {
        const b = canReply();
        if (!b) return false;
        db.prepare('INSERT INTO drift_replies(bottle_id,user_id,content,language,status,review) VALUES(?,?,?,?,?,?)')
            .run(b.id,req.user.id,review.content,language(req.body?.language),review.status,JSON.stringify(review));
        if (review.status==='approved') notify(b,req.user.id);
        return true;
    })();
    if (!saved) return fail(res,403,'此漂流瓶暂不能回信');
    res.status(201).json({ success:true, data:{ status:review.status } });
});
// Only an untouched bottle can return to the public pool. Private correspondence
// must never be inherited by a later recipient, including pending/rejected replies.
router.post('/:id/return', pickLimiter, (req,res) => {
    const returned = db.transaction(() => {
        const bottleId = id(req.params.id);
        const b = db.prepare("SELECT * FROM drift_bottles WHERE id=? AND recipient_id=? AND status='approved' AND closed=0").get(bottleId,req.user.id);
        if (!b) return { status:404, message:'漂流瓶不存在或无法放回海里' };
        if (db.prepare('SELECT 1 FROM drift_replies WHERE bottle_id=? LIMIT 1').get(bottleId)) {
            return { status:409, message:'已开始通信的瓶子不能重新漂流，可以收好瓶子或结束对话' };
        }
        db.prepare('UPDATE drift_bottles SET recipient_id=NULL,picked_at=NULL WHERE id=? AND recipient_id=?').run(bottleId,req.user.id);
        return { status:200 };
    }).immediate();
    if (returned.status !== 200) return fail(res,returned.status,returned.message);
    ok(res,null);
});
router.post('/:id/close', (req,res) => {
    const b = access(id(req.params.id),req.user.id);
    if (!b) return fail(res,404,'漂流瓶不存在');
    db.prepare('UPDATE drift_bottles SET closed=1 WHERE id=?').run(b.id);
    ok(res,null);
});
router.post('/:id/block', (req,res) => {
    const b = access(id(req.params.id),req.user.id);
    const peerId = b && (req.user.id===b.user_id ? b.recipient_id : b.user_id);
    if (!peerId) return fail(res,404,'用户不存在');
    db.prepare('INSERT OR IGNORE INTO drift_blocks VALUES(?,?)').run(req.user.id,peerId);
    ok(res,null);
});
router.post('/:id/report', writeLimiter, (req,res) => {
    const b = access(id(req.params.id),req.user.id);
    if (!b) return fail(res,404,'漂流瓶不存在');
    // Quarantine the entire conversation until an administrator reviews it.
    db.prepare("UPDATE drift_bottles SET closed=1,status='pending',review=? WHERE id=?").run(JSON.stringify({ reason:'user_report', reporterId:req.user.id, previousStatus:b.status }),b.id);
    ok(res,null);
});
adminRouter.use(authenticateToken,requireAdmin);
adminRouter.get('/', (req,res) => ok(res,{
    bottles: db.prepare("SELECT * FROM drift_bottles WHERE status='pending' ORDER BY id LIMIT 50").all(),
    replies: db.prepare("SELECT * FROM drift_replies WHERE status='pending' ORDER BY id LIMIT 50").all()
}));
adminRouter.post('/:kind/:id', (req,res) => {
    const tables = { bottles:'drift_bottles', replies:'drift_replies' };
    const table = Object.hasOwn(tables,req.params.kind) ? tables[req.params.kind] : null;
    if (!table || !['approved','rejected'].includes(req.body?.status)) return fail(res,400,'审核参数无效');
    const changed = db.transaction(() => {
        const row = db.prepare(`SELECT * FROM ${table} WHERE id=? AND status='pending'`).get(id(req.params.id));
        if (!row) return false;
        db.prepare(`UPDATE ${table} SET status=? WHERE id=? AND status='pending'`).run(req.body.status,row.id);
        if (table==='drift_replies' && req.body.status==='approved') {
            const b = db.prepare('SELECT * FROM drift_bottles WHERE id=?').get(row.bottle_id);
            if (b && !b.closed && b.status==='approved' && !blocked(b.user_id,b.recipient_id)) notify(b,row.user_id);
        }
        return true;
    })();
    if (!changed) return fail(res,409,'内容已被审核');
    ok(res,null);
});
module.exports = { router, adminRouter };
