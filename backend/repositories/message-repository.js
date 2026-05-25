const db = require('../db');

const INLINE_AVATAR_LIMIT = 256 * 1024;

function compactAvatar(avatar) {
    if (!avatar) return '';
    const value = String(avatar);
    if (!value.startsWith('data:')) return value;
    return value.length <= INLINE_AVATAR_LIMIT ? value : '';
}

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

function findMessageLike(messageId, userId) {
    return db.prepare('SELECT id FROM message_likes WHERE message_id = ? AND user_id = ?').get(messageId, userId);
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
    createMessage,
    findMessageById,
    findApprovedMessageById,
    findMessageLike,
    likeMessage
};
