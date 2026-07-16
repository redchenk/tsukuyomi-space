const db = require('../db');
const { compactAvatar } = require('../utils/avatar');

function compactMessageRow(row) {
    return {
        ...row,
        avatar: compactAvatar(row.avatar)
    };
}

const MESSAGE_SELECT_FIELDS = `
    SELECT m.id,
           COALESCE(u.username, m.author) AS author,
           m.content,
           m.user_id,
           m.parent_id,
           m.like_count,
           m.article_id,
           m.status,
           m.created_at,
           m.updated_at,
           u.avatar
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
`;

function listMessages({ articleId, includePending = false } = {}) {
    const statusFilter = includePending ? '' : "AND COALESCE(m.status, 'approved') = 'approved'";
    const query = articleId
        ? `
            ${MESSAGE_SELECT_FIELDS}
            WHERE m.article_id = ?
              ${statusFilter}
            ORDER BY m.created_at ASC
        `
        : `
            ${MESSAGE_SELECT_FIELDS}
            WHERE m.article_id IS NULL
              ${statusFilter}
            ORDER BY m.created_at DESC
        `;
    const rows = articleId ? db.prepare(query).all(articleId) : db.prepare(query).all();
    return rows.map(compactMessageRow);
}

function listRecentPublicMessages(limit = 8) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 8, 30));
    return db.prepare(`
        ${MESSAGE_SELECT_FIELDS}
        WHERE m.article_id IS NULL
          AND m.parent_id IS NULL
          AND COALESCE(m.status, 'approved') = 'approved'
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?
    `).all(safeLimit).map(compactMessageRow);
}

function createMessage({ author, content, userId, articleId = null, parentId = null, status = 'pending' }) {
    const normalizedStatus = status === 'approved' ? 'approved' : 'pending';
    const result = parentId
        ? db.prepare(`
            INSERT INTO messages (author, content, user_id, parent_id, article_id, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(author, content, userId, parentId, articleId, normalizedStatus)
        : db.prepare(`
            INSERT INTO messages (author, content, user_id, article_id, status)
            VALUES (?, ?, ?, ?, ?)
        `).run(author, content, userId, articleId, normalizedStatus);
    return findMessageById(result.lastInsertRowid);
}

function findMessageById(id) {
    const row = db.prepare(`${MESSAGE_SELECT_FIELDS} WHERE m.id = ?`).get(id);
    return row ? compactMessageRow(row) : null;
}

function findApprovedMessageById(id) {
    const row = db.prepare(`${MESSAGE_SELECT_FIELDS} WHERE m.id = ? AND COALESCE(m.status, 'approved') = 'approved'`).get(id);
    return row ? compactMessageRow(row) : null;
}

function listUserMessages(userId, { limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    return db.prepare(`
        SELECT m.id,
               COALESCE(u.username, m.author) AS author,
               m.content,
               m.user_id,
               m.parent_id,
               m.like_count,
               m.article_id,
               m.status,
               m.created_at,
               m.updated_at,
               u.avatar,
               a.title AS article_title,
               a.slug AS article_slug,
               (SELECT COUNT(*) FROM messages reply WHERE reply.parent_id = m.id) AS reply_count
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN articles a ON m.article_id = a.id
        WHERE m.user_id = ?
        ORDER BY COALESCE(m.updated_at, m.created_at) DESC
        LIMIT ? OFFSET ?
    `).all(userId, safeLimit, safeOffset).map(compactMessageRow);
}

function findUserMessageById(id, userId) {
    const row = db.prepare(`${MESSAGE_SELECT_FIELDS} WHERE m.id = ? AND m.user_id = ?`).get(id, userId);
    return row ? compactMessageRow(row) : null;
}

function updateUserMessage(id, userId, { content, status }) {
    const normalizedStatus = status === 'approved' ? 'approved' : 'pending';
    const changed = db.prepare(`
        UPDATE messages
        SET content = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    `).run(content, normalizedStatus, id, userId).changes;
    return changed ? findUserMessageById(id, userId) : null;
}

function deleteUserMessage(id, userId) {
    return db.transaction(() => {
        const message = db.prepare(`
            SELECT id, parent_id, article_id
            FROM messages
            WHERE id = ? AND user_id = ?
        `).get(id, userId);
        if (!message) return null;

        db.prepare('UPDATE messages SET parent_id = ? WHERE parent_id = ?').run(message.parent_id || null, message.id);
        db.prepare('DELETE FROM notifications WHERE related_message_id = ?').run(message.id);
        db.prepare('DELETE FROM message_likes WHERE message_id = ?').run(message.id);
        db.prepare('DELETE FROM message_mentions WHERE message_id = ?').run(message.id);
        db.prepare('DELETE FROM messages WHERE id = ? AND user_id = ?').run(message.id, userId);
        return message;
    })();
}

function findMessageLike(messageId, userId) {
    return db.prepare('SELECT id FROM message_likes WHERE message_id = ? AND user_id = ?').get(messageId, userId);
}

function listMessageLikeIds(userId) {
    return db.prepare(`
        SELECT message_id
        FROM message_likes
        WHERE user_id = ?
        ORDER BY id DESC
    `).all(userId).map(row => row.message_id);
}

function likeMessage(messageId, userId) {
    const tx = db.transaction(() => {
        db.prepare('INSERT INTO message_likes (message_id, user_id) VALUES (?, ?)').run(messageId, userId);
        db.prepare('UPDATE messages SET like_count = like_count + 1 WHERE id = ?').run(messageId);
    });
    tx();
    return findMessageById(messageId);
}

module.exports = {
    listMessages,
    listRecentPublicMessages,
    createMessage,
    findMessageById,
    findApprovedMessageById,
    listUserMessages,
    findUserMessageById,
    updateUserMessage,
    deleteUserMessage,
    findMessageLike,
    listMessageLikeIds,
    likeMessage
};
