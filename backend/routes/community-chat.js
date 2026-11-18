const express = require('express');
const db = require('../db');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');
const chat = require('../services/community-chat');
const live = require('../services/community-live');
const yachiyo = require('../services/community-yachiyo');

const router = express.Router();
const replyLimiter = createRateLimiter({ windowMs:60000, max:40, keyPrefix:'community-action', keyGenerator:req => req.user.id });
const ok = (res,data) => res.json({success:true,data});

async function generate(message) {
    let reply;
    try { reply = chat.approvedContent(await yachiyo.ask(message.id,chat.publicTurns(message))); }
    catch { reply = null; }
    for (const update of chat.finishReply(message,reply)) live.publish(update, update.id !== message.id);
}
router.get('/live',optionalAuth,live.events);
router.get('/reports',authenticateToken,requireAdmin,(req,res) => {
    const rows = db.prepare('SELECT message_id,COUNT(*) AS reports FROM community_reports GROUP BY message_id ORDER BY message_id DESC LIMIT 50').all();
    const { hongKongDate } = require('../services/user-growth');
    const start = Date.parse(hongKongDate() + 'T00:00:00+08:00');
    const activeToday = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM community_messages WHERE created_at>=?').get(start).n;
    ok(res,{items:rows.map(row => ({...chat.get(row.message_id),reports:row.reports})),activeToday});
});
router.post('/messages/:id/report',authenticateToken,replyLimiter,(req,res) => {
    const message = chat.get(req.params.id);
    if (!message || message.removed) chat.fail(404,'消息不存在。');
    if (message.userId === req.user.id) chat.fail(400,'这是你自己发送的消息。');
    db.prepare('INSERT OR IGNORE INTO community_reports(message_id,reporter_id) VALUES(?,?)').run(message.id,req.user.id);
    ok(res,{reported:true});
});
router.delete('/messages/:id/report',authenticateToken,requireAdmin,(req,res) => {
    db.prepare('DELETE FROM community_reports WHERE message_id=?').run(req.params.id);
    ok(res,{dismissed:true});
});
router.post('/messages/:id/mute',authenticateToken,requireAdmin,(req,res) => {
    const message = chat.get(req.params.id);
    const target = message?.userId && db.prepare('SELECT role FROM users WHERE id=?').get(message.userId);
    if (!target || target.role !== 'user') chat.fail(400,'这位成员无法被禁言。');
    db.prepare('INSERT OR REPLACE INTO community_mutes(user_id,until_ms) VALUES(?,?)').run(message.userId,Date.now()+3600000);
    ok(res,{muted:true});
});
router.delete('/messages/:id',authenticateToken,replyLimiter,(req,res) => {
    const message = chat.remove(req.params.id,req.user);
    live.publish(message);
    ok(res,message);
});
router.param('channel',(req,res,next,channel) => live.knownChannel(channel) ? next() : res.sendStatus(404));
router.get('/:channel/sync',optionalAuth,live.sync);
router.get('/:channel/history',(req,res) => {
    const before = req.query.before === undefined ? Number.MAX_SAFE_INTEGER : Number(req.query.before);
    if (!Number.isSafeInteger(before) || before < 1) chat.fail(400,'消息游标无效。');
    ok(res,chat.history(req.params.channel,before));
});
router.post('/:channel/messages',authenticateToken,replyLimiter,(req,res) => {
    const result = chat.save.immediate(req.params.channel,req.user,req.body || {});
    if (!result.replay) {
        live.publish(result.message,true);
        if (result.message.aiStatus === 'pending') generate(result.message).catch(() => console.error('Channel reply could not be saved'));
    }
    ok(res,result);
});

module.exports = router;
