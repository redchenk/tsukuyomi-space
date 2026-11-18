const db = require('../db');
const growth = require('./user-growth');
const { reviewMessageContent } = require('./message-moderation');
const { publicAvatarUrl } = require('../utils/avatar');
const { createNotification } = require('../repositories/notification-repository');
const { mentionsYachiyo, dailyXp } = require('../../shared/community-chat.cjs');

function fail(status, message) { throw Object.assign(new Error(message), { status, expose: true }); }

// Use the avatar endpoint for inline pictures so history never copies a large data URL per row.
const selectMessage = `SELECT m.id,m.channel,m.user_id AS userId,m.content,m.reply_to AS replyTo,
    m.ai_status AS aiStatus,m.created_at AS createdAt,m.removed,u.username,
    COALESCE(NULLIF(u.nickname,''),u.username) AS nickname,
    CASE WHEN u.avatar LIKE 'data:%' THEN 'inline' ELSE u.avatar END AS avatar,u.updated_at AS updatedAt,
    g.total_xp AS xp,
    CASE WHEN parent.removed=0 THEN substr(parent.content,1,96) END AS quote
    FROM community_messages m LEFT JOIN users u ON u.id=m.user_id
    LEFT JOIN user_growth_profiles g ON g.user_id=u.id
    LEFT JOIN community_messages parent ON parent.id=m.reply_to`;

function view(row) {
    if (!row) return null;
    const { xp, updatedAt, avatar, ...rest } = row;
    return { ...rest, level: growth.levelForXp(xp || 0).level,
        avatar: avatar === 'inline' ? `/api/user/public/${encodeURIComponent(row.username)}/avatar?v=${encodeURIComponent(updatedAt || '')}` : publicAvatarUrl({avatar}),
        removed: Boolean(row.removed) };
}
function get(id) { return view(db.prepare(selectMessage + ' WHERE m.id=?').get(id)); }
function history(channel, before = Number.MAX_SAFE_INTEGER) {
    const rows = db.prepare(selectMessage + ' WHERE m.channel=? AND m.id<? ORDER BY m.id DESC LIMIT 41').all(channel,before);
    return { messages: rows.slice(0,40).reverse().map(view), hasOlder: rows.length > 40 };
}
function approvedContent(text) {
    const review = reviewMessageContent(text);
    if (!review.accepted) fail(422, '请发送 1 至 2000 字的纯文本。');
    if (review.status !== 'approved') fail(422, '这条消息含有需要审核的内容或站外链接，请修改后再发。');
    return review.content;
}

const save = db.transaction((channel, user, input) => {
    const { requestId, replyTo = null } = input;
    if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) fail(400, '发送标识无效。');
    if (replyTo !== null && (!Number.isSafeInteger(replyTo) || replyTo <= 0)) fail(400, '引用无效。');
    if (typeof input.content !== 'string') fail(422, '请发送纯文本消息。');
    const existing = db.prepare('SELECT * FROM community_messages WHERE request_id=?').get(requestId);
    if (existing) {
        if (existing.user_id !== user.id || existing.channel !== channel || existing.reply_to !== replyTo ||
            (!existing.removed && existing.content !== input.content.trim())) fail(409, '相同发送标识已用于其他消息。');
        return { message: get(existing.id), replay: true };
    }
    const now = Date.now();
    if (db.prepare('SELECT 1 FROM community_mutes WHERE user_id=? AND until_ms>?').get(user.id,now)) fail(403, '你暂时处于聊天室禁言中。');
    const content = approvedContent(input.content);
    const parent = replyTo && db.prepare('SELECT * FROM community_messages WHERE channel=? AND id=? AND removed=0').get(channel,replyTo);
    if (replyTo && !parent) fail(409, '引用的消息已撤回或不在当前频道。');
    const recent = db.prepare('SELECT COUNT(*) n, MAX(created_at) latest FROM community_messages WHERE user_id=? AND created_at>?').get(user.id,now-60000);
    if (recent.n >= 20 || now - (recent.latest || 0) < 1000) fail(429, '发言太快了，请稍等一下。');
    const summon = mentionsYachiyo(content) || Boolean(parent && parent.user_id === null);
    if (summon && db.prepare("SELECT 1 FROM community_messages WHERE user_id=? AND ai_status<>'' AND created_at>? LIMIT 1").get(user.id,now-10000)) fail(429, '请在上次呼叫八千代的十秒后再试。');
    const inserted = db.prepare('INSERT INTO community_messages(channel,user_id,request_id,content,reply_to,ai_status,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(channel,user.id,requestId,content,replyTo,summon?'pending':'',now);
    const id = Number(inserted.lastInsertRowid);
    growth.ensureProfile(user.id);
    const award = growth.insertEvent({ userId:user.id, eventDate:growth.hongKongDate(new Date(now)), eventKey:'daily_chatroom', xp:dailyXp });
    if (parent?.user_id && parent.user_id !== user.id) createNotification({ userId:parent.user_id, actorId:user.id, type:'reply', title:'有人回复了你的频道发言', link:`/chatroom?channel=${channel}` });
    return { message:get(id), growth:award.awarded ? { award, state:growth.getState(user.id) } : null };
});

function remove(id, user) {
    const target = get(id);
    if (!target || target.removed) fail(404, '这条消息已撤回。');
    if (target.userId !== user.id && !['super_admin','admin'].includes(user.role)) fail(403, '没有移除此消息的权限。');
    db.transaction(() => {
        db.prepare("UPDATE community_messages SET removed=1,content='',ai_status=CASE WHEN ai_status='' THEN '' ELSE 'removed' END WHERE id=?").run(id);
        db.prepare('DELETE FROM community_reports WHERE message_id=?').run(id);
    })();
    return get(id);
}

function publicTurns(message) {
    const rows = db.prepare(`SELECT m.content,m.user_id,COALESCE(NULLIF(u.nickname,''),u.username) AS name
        FROM community_messages m LEFT JOIN users u ON u.id=m.user_id
        WHERE m.channel=? AND m.id<=? AND m.removed=0 ORDER BY m.id DESC LIMIT 7`).all(message.channel,message.id).reverse();
    return rows.map((row,index) => ({ role: row.user_id ? 'user' : 'assistant',
        content: row.user_id ? (row.name || '成员').slice(0,40) + '：' + (index === rows.length-1 ? row.content : row.content.slice(0,350)) : row.content.slice(0,350) }));
}

function finishReply(message, reply) {
    return db.transaction(() => {
        const source = get(message.id);
        if (!source || source.removed || source.aiStatus !== 'pending') return [];
        db.prepare('UPDATE community_messages SET ai_status=? WHERE id=?').run(reply ? 'done' : 'failed',message.id);
        const updates = [get(message.id)];
        if (reply) {
            const result = db.prepare('INSERT INTO community_messages(channel,content,reply_to,created_at) VALUES(?,?,?,?)').run(message.channel,reply,message.id,Date.now());
            updates.push(get(result.lastInsertRowid));
        }
        return updates;
    })();
}

module.exports = { history, get, save, remove, publicTurns, approvedContent, finishReply, fail };
