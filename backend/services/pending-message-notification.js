const crypto = require('crypto');
const db = require('../db');
const notificationRepository = require('../repositories/notification-repository');
const { moderationEmailPreference } = require('./notification-settings');
const { reviewMessageContent, messageModerationFeedback } = require('./message-moderation');
const { sendNotificationEmail } = require('./mailer');

// A persisted notification claims each message/content/recipient combination.
// Pending edits do not enqueue again; a later new review can notify once for
// changed content. This also prevents duplicates across process restarts.
const claimNotification = db.transaction((notification, digest) => {
    const existing = db.prepare(`SELECT metadata FROM notifications
        WHERE user_id = ? AND type = 'moderation' AND related_message_id = ?`)
        .all(notification.userId, notification.relatedMessageId);
    if (existing.some(row => {
        try { return JSON.parse(row.metadata).reviewContentDigest === digest; } catch (_) { return false; }
    })) return null;
    return notificationRepository.createNotification({ ...notification, metadata: { reviewContentDigest: digest } });
});

function notifyPendingMessage(messageId, { send = sendNotificationEmail, schedule = setImmediate } = {}) {
    try {
        const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        if (message?.status !== 'pending') return 0;
        const digest = crypto.createHash('sha256').update(message.content).digest('hex');
        const noun = message.parent_id ? '回复' : message.article_id ? '评论' : '留言';
        const reasons = messageModerationFeedback(reviewMessageContent(message.content)).reasons.map(reason => reason.message);
        const event = {
            type: 'moderation', title: `有${noun}需要审核 #${message.id}`,
            content: `审核原因：${reasons.join('；') || '需要人工确认'}。内容尚未公开，请登录后台核对完整内容。`,
            link: `/terminal?panel=messages&review=${message.id}`,
            actorName: message.author || '访客'
        };
        const recipients = db.prepare("SELECT id FROM users WHERE role IN ('admin', 'super_admin')").all();
        let queued = 0;
        for (const { id } of recipients) {
            const notification = claimNotification({
                userId: id, ...event, relatedMessageId: message.id, relatedArticleId: message.article_id || null
            }, digest);
            if (!notification) continue;
            const preference = moderationEmailPreference(id);
            if (!preference.emailNotifyModeration || !preference.canReceive) continue;
            schedule(() => {
                Promise.resolve().then(() => {
                    // Opt-outs, role changes, approval and deletion take effect
                    // even if they happen after the event has been queued.
                    const current = moderationEmailPreference(id);
                    const pending = db.prepare('SELECT status FROM messages WHERE id = ?').get(message.id);
                    if (current.emailNotifyModeration && current.canReceive && pending?.status === 'pending') {
                        return send(current.email, event);
                    }
                }).catch(error => console.error('Moderation email send failed:', error.message));
            });
            queued += 1;
        }
        return queued;
    } catch (error) {
        // A mail failure must never change the outcome of a saved submission.
        console.error('Moderation email queue failed:', error.message);
        return 0;
    }
}

module.exports = { notifyPendingMessage };
