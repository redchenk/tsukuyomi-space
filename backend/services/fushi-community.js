const db = require('../db');
const messages = require('../repositories/message-repository');
const articles = require('../repositories/article-repository');
const { articlePath } = require('../seo/render-article');
const { readConfig } = require('./fushi-config');
const { hash } = require('./fushi-auth');
const { submitReply } = require('./message-submission');
function denied() { const e = new Error('内容不存在或不在助手授权范围内'); e.code = 'CONTENT_UNAVAILABLE'; throw e; }
function iso(value) { return new Date(String(value).includes('T') ? value : `${value.replace(' ', 'T')}Z`).toISOString(); }
function publicContext(messageId) {
    const message = messages.findApprovedMessageById(messageId);
    if (!message) return null;
    const root = messages.findReplyThreadRoot(message);
    const article = message.article_id ? articles.findPublishedArticleById(message.article_id) : null;
    if (!root || (message.article_id && !article)) return null;
    return { message, root, article };
}
function relevantNotification(userId, id) {
    const row = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND id = ? AND type = 'reply' AND actor_id != user_id").get(userId, id);
    const context = row && publicContext(row.related_message_id);
    if (!context || context.message.user_id === userId) return null;
    // Recheck the current public target, rather than trusting stale notification metadata.
    const target = context.message.parent_id
        ? messages.findApprovedMessageById(context.message.reply_to_author ? context.message.reply_to_id : context.message.parent_id)
        : null;
    if (context.message.parent_id ? target?.user_id !== userId : context.article?.author_id !== userId) return null;
    return { ...context, notification: row };
}
function link(context, messageId = context.message.id) {
    return `${readConfig().origin}${context.article ? articlePath(context.article) : '/plaza'}#${context.article ? 'comment' : 'msg'}-${messageId}`;
}
function messageView(message, context) {
    return { id: String(message.id), thread_id: String(context.root.id), content: message.content,
        author: { id: message.user_id, username: message.author, nickname: message.author_nickname || message.author },
        timestamp: iso(message.created_at), reply_to_id: message.reply_to_id ? String(message.reply_to_id) : null,
        url: link(context, message.id) };
}
function listNotifications(userId, { cursor = '0', limit = 20 } = {}) {
    const rows = db.prepare(`SELECT n.id, e.event_id FROM notifications n
        LEFT JOIN fushi_events e ON e.message_id = n.related_message_id AND e.owner_id = n.user_id
        WHERE n.user_id = ? AND n.type = 'reply' AND n.id > ? ORDER BY n.id LIMIT ?`).all(userId, Number(cursor), limit + 1);
    const page = rows.slice(0, limit);
    const items = page.flatMap(row => {
        const context = relevantNotification(userId, row.id);
        if (!context) return [];
        const submission = db.prepare('SELECT result,event_id FROM fushi_reply_submissions WHERE owner_id = ? AND source_message_id = ?').get(userId, context.message.id);
        const eventId = row.event_id || submission?.event_id || `notification:${row.id}`;
        return [{ id: String(row.id), event_id: eventId, kind: context.article ? 'article' : 'plaza',
            ...messageView(context.message, context), notification_id: String(row.id), notification_timestamp: iso(context.notification.created_at),
            processed: Boolean(submission), processing_status: submission ? result(userId, JSON.parse(submission.result).idempotency_key).status : 'unprocessed' }];
    });
    const next = page.length ? String(page.at(-1).id) : String(cursor);
    return { items, cursor: next, next_cursor: rows.length > limit ? next : null };
}
function readThread(userId, { notification_id, thread_id, cursor = '0', limit = 20 }) {
    const context = relevantNotification(userId, Number(notification_id));
    if (!context || String(context.root.id) !== thread_id) denied();
    const rows = db.prepare(`WITH RECURSIVE thread(id) AS (
        SELECT id FROM messages WHERE id=? AND status='approved'
        UNION SELECT m.id FROM messages m JOIN thread t ON m.parent_id=t.id WHERE m.status='approved'
        ) SELECT id FROM thread WHERE id>? ORDER BY id LIMIT ?`).all(context.root.id, Number(cursor), limit + 1);
    const page = rows.slice(0, limit);
    const next = page.length ? String(page.at(-1).id) : String(cursor);
    return { thread_id, kind: context.article ? 'article' : 'plaza', url: link(context, context.root.id),
        root: messageView(context.root, context), triggering_reply: messageView(context.message, context),
        article: context.article ? { id: String(context.article.id), title: context.article.title,
            excerpt: context.article.excerpt, content: String(context.article.content || '').slice(0, 16000),
            content_truncated: String(context.article.content || '').length > 16000,
            url: `${readConfig().origin}${articlePath(context.article)}` } : null,
        items: page.map(row => messageView(messages.findApprovedMessageById(row.id), context)),
        cursor: next, next_cursor: rows.length > limit ? next : null };
}
function result(userId, key) {
    const row = db.prepare('SELECT * FROM fushi_reply_submissions WHERE owner_id = ? AND idempotency_key = ?').get(userId, key);
    if (!row) return { status: 'not_found', idempotency_key: key };
    const stored = JSON.parse(row.result);
    const message = row.message_id ? messages.findMessageById(row.message_id) : null;
    return { ...stored, status: !message ? 'removed' : message.status === 'approved' ? 'published' : 'pending_review' };
}
function reply(user, args) {
    const requestHash = hash(JSON.stringify([args.notification_id, args.target_id, args.content]));
    return db.transaction(() => {
        const existing = db.prepare('SELECT request_hash FROM fushi_reply_submissions WHERE owner_id = ? AND idempotency_key = ?').get(user.id, args.idempotency_key);
        if (existing) {
            if (existing.request_hash !== requestHash) { const e = new Error('幂等键已用于其他内容'); e.code = 'IDEMPOTENCY_CONFLICT'; throw e; }
            return result(user.id, args.idempotency_key);
        }
        const context = relevantNotification(user.id, Number(args.notification_id));
        if (!context) denied();
        const target = publicContext(Number(args.target_id));
        if (!target || target.root.id !== context.root.id || target.message.user_id === user.id) denied();
        const event = db.prepare('SELECT event_id FROM fushi_events WHERE owner_id = ? AND message_id = ?').get(user.id, context.message.id);
        const eventId = event?.event_id || `notification:${context.notification.id}`;
        const handled = db.prepare('SELECT idempotency_key FROM fushi_reply_submissions WHERE owner_id = ? AND source_message_id = ?').get(user.id, context.message.id);
        if (handled) return { ...result(user.id, handled.idempotency_key), already_processed: true };
        const count = db.prepare('SELECT count(*) AS n FROM fushi_reply_submissions WHERE owner_id = ? AND created_at > ?').get(user.id, Date.now() - 600000).n;
        if (count >= 12) { const e = new Error('回复过于频繁，请稍后查询结果再重试'); e.code = 'RATE_LIMITED'; throw e; }
        const saved = submitReply({ user, targetId: args.target_id, content: args.content });
        const response = { status: saved.message.status === 'approved' ? 'published' : 'pending_review',
            idempotency_key: args.idempotency_key, event_id: eventId, message_id: String(saved.message.id),
            thread_id: String(context.root.id), url: link(context, saved.message.id), moderation: saved.moderation };
        db.prepare('INSERT INTO fushi_reply_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(user.id, args.idempotency_key, requestHash, eventId, context.notification.id, context.message.id, saved.message.id, JSON.stringify(response), Date.now());
        return response;
    })();
}
module.exports = { publicContext, relevantNotification, link, listNotifications, readThread, reply, result, iso };
