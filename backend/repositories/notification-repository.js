const db = require('../db');
const { safeJsonParse } = require('../validators');

function normalizeNotification(row) {
    if (!row) return null;
    return {
        ...row,
        metadata: safeJsonParse(row.metadata, {}),
        unread: !row.read_at
    };
}

function createNotification({
    userId,
    actorId = null,
    type,
    title,
    content = '',
    link = '',
    relatedMessageId = null,
    relatedArticleId = null,
    metadata = {}
}) {
    if (!userId || !type || !title) return null;
    if (actorId && actorId === userId) return null;

    const result = db.prepare(`
        INSERT INTO notifications (
            user_id, actor_id, type, title, content, link,
            related_message_id, related_article_id, metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        userId,
        actorId,
        type,
        title,
        content || '',
        link || '',
        relatedMessageId,
        relatedArticleId,
        JSON.stringify(metadata || {})
    );

    return findNotificationById(result.lastInsertRowid, userId);
}

function listNotifications(userId, { limit = 50, offset = 0 } = {}) {
    return db.prepare(`
        SELECT n.*, u.username AS actor_username, u.avatar AS actor_avatar
        FROM notifications n
        LEFT JOIN users u ON n.actor_id = u.id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ? OFFSET ?
    `).all(userId, limit, offset).map(normalizeNotification);
}

function notificationCounts(userId) {
    const row = db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread
        FROM notifications
        WHERE user_id = ?
    `).get(userId);
    return {
        total: Number(row?.total || 0),
        unread: Number(row?.unread || 0)
    };
}

function unreadCount(userId) {
    return db.prepare(`
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE user_id = ? AND read_at IS NULL
    `).get(userId).count;
}

function findNotificationById(id, userId) {
    return normalizeNotification(db.prepare(`
        SELECT n.*, u.username AS actor_username, u.avatar AS actor_avatar
        FROM notifications n
        LEFT JOIN users u ON n.actor_id = u.id
        WHERE n.id = ? AND n.user_id = ?
    `).get(id, userId));
}

function markNotificationRead(id, userId) {
    db.prepare(`
        UPDATE notifications
        SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND user_id = ?
    `).run(id, userId);
    return findNotificationById(id, userId);
}

function markAllRead(userId) {
    return db.prepare(`
        UPDATE notifications
        SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE user_id = ? AND read_at IS NULL
    `).run(userId).changes;
}

module.exports = {
    createNotification,
    listNotifications,
    notificationCounts,
    unreadCount,
    findNotificationById,
    markNotificationRead,
    markAllRead
};
