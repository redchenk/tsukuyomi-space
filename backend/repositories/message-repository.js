const db = require('../db');

function listMessages({ articleId } = {}) {
    const query = articleId
        ? `
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
            WHERE m.article_id = ?
            ORDER BY m.created_at ASC
        `
        : `
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
            WHERE m.article_id IS NULL
            ORDER BY m.created_at DESC
        `;
    return articleId ? db.prepare(query).all(articleId) : db.prepare(query).all();
}

function createMessage({ author, content, userId, articleId = null, parentId = null }) {
    const result = parentId
        ? db.prepare(`
            INSERT INTO messages (author, content, user_id, parent_id, article_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(author, content, userId, parentId, articleId)
        : db.prepare(`
            INSERT INTO messages (author, content, user_id, article_id)
            VALUES (?, ?, ?, ?)
        `).run(author, content, userId, articleId);
    return findMessageById(result.lastInsertRowid);
}

function findMessageById(id) {
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
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
    findMessageLike,
    likeMessage
};
