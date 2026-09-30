const db = require('../db');
const { publicAvatarUrl } = require('../utils/avatar');

function compactMessageRow(row) {
    const { avatar_updated_at: avatarUpdatedAt, ...message } = row;
    return {
        ...message,
        avatar: publicAvatarUrl({
            avatar: message.avatar,
            username: message.author,
            updatedAt: avatarUpdatedAt
        })
    };
}

const MESSAGE_SELECT_FIELDS = `
    SELECT m.id,
           COALESCE(u.username, m.author) AS author,
           COALESCE(NULLIF(u.nickname, ''), u.username, m.author) AS author_nickname,
           m.content,
           m.user_id,
           m.parent_id,
           m.reply_to_id,
           COALESCE(target_user.username, target.author, m.reply_to_author) AS reply_to_author,
           COALESCE(NULLIF(target_user.nickname, ''), target_user.username, target.author, m.reply_to_author) AS reply_to_nickname,
           m.like_count,
           m.article_id,
           m.status,
           m.created_at,
           m.updated_at,
           u.avatar,
           COALESCE(u.updated_at, u.created_at) AS avatar_updated_at
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN messages target ON m.reply_to_id = target.id
    LEFT JOIN users target_user ON target.user_id = target_user.id
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

function createMessage({ author, content, userId, articleId = null, parentId = null, replyToId = null, replyToAuthor = null, status = 'pending' }) {
    const normalizedStatus = status === 'approved' ? 'approved' : 'pending';
    const result = parentId
        ? db.prepare(`
            INSERT INTO messages (author, content, user_id, parent_id, article_id, reply_to_id, reply_to_author, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(author, content, userId, parentId, articleId, replyToId, replyToAuthor, normalizedStatus)
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

function findReplyThreadRoot(target) {
    const seen = new Set();
    let current = target;
    while (current?.parent_id) {
        if (seen.has(current.id) || seen.size >= 100) return null;
        seen.add(current.id);
        current = findApprovedMessageById(current.parent_id);
        if (!current || current.article_id !== target.article_id) return null;
    }
    return current;
}

function listUserMessages(userId, { limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    return db.prepare(`
        SELECT m.id,
               COALESCE(u.username, m.author) AS author,
               COALESCE(NULLIF(u.nickname, ''), u.username, m.author) AS author_nickname,
               m.content,
               m.user_id,
               m.parent_id,
               m.like_count,
               m.article_id,
               m.status,
               m.created_at,
               m.updated_at,
               u.avatar,
               COALESCE(u.updated_at, u.created_at) AS avatar_updated_at,
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
    findReplyThreadRoot,
    listUserMessages,
    findUserMessageById,
    updateUserMessage,
    deleteUserMessage,
    findMessageLike,
    listMessageLikeIds,
    likeMessage
};
