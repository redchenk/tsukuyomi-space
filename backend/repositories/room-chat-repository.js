const crypto = require('crypto');
const db = require('../db');

const MAX_STORED_MESSAGES = 100;

function normalizeLimit(value, fallback = 24) {
    return Math.max(1, Math.min(Number.parseInt(value, 10) || fallback, MAX_STORED_MESSAGES));
}

function compactMessage(row) {
    return {
        id: row.id,
        turnId: row.turn_id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at
    };
}

function listMessages(userId, limit = 24) {
    return db.prepare(`
        SELECT id, turn_id, role, content, created_at
        FROM (
            SELECT rowid AS sort_id, id, turn_id, role, content, created_at
            FROM room_chat_messages
            WHERE user_id = ?
            ORDER BY sort_id DESC
            LIMIT ?
        ) recent
        ORDER BY sort_id ASC
    `).all(userId, normalizeLimit(limit)).map(compactMessage);
}

function findOwnedTurn(userId, turnId) {
    const rows = db.prepare(`
        SELECT id, turn_id, role, content, created_at
        FROM room_chat_messages
        WHERE user_id = ? AND turn_id = ?
        ORDER BY CASE role WHEN 'user' THEN 0 ELSE 1 END
    `).all(userId, turnId);
    if (rows.length !== 2 || rows[0].role !== 'user' || rows[1].role !== 'assistant') return null;
    return {
        turnId,
        userMessage: rows[0].content,
        assistantMessage: rows[1].content,
        createdAt: rows[0].created_at
    };
}

function pruneMessages(userId) {
    db.prepare(`
        DELETE FROM room_chat_messages
        WHERE user_id = ?
          AND rowid NOT IN (
              SELECT rowid
              FROM room_chat_messages
              WHERE user_id = ?
              ORDER BY rowid DESC
              LIMIT ?
          )
    `).run(userId, userId, MAX_STORED_MESSAGES);
}

function insertMessage({ userId, turnId, role, content }) {
    const id = crypto.randomUUID();
    const result = db.prepare(`
        INSERT OR IGNORE INTO room_chat_messages (id, user_id, turn_id, role, content)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, turnId, role, content);
    return result.changes ? id : null;
}

function findRecentMatchingTurn(userId, userMessage, assistantMessage) {
    return db.prepare(`
        SELECT user_message.turn_id
        FROM room_chat_messages AS user_message
        JOIN room_chat_messages AS assistant_message
          ON assistant_message.user_id = user_message.user_id
         AND assistant_message.turn_id = user_message.turn_id
         AND assistant_message.role = 'assistant'
        WHERE user_message.user_id = ?
          AND user_message.role = 'user'
          AND user_message.content = ?
          AND assistant_message.content = ?
          AND user_message.created_at >= datetime('now', '-2 minutes')
        ORDER BY user_message.rowid DESC
        LIMIT 1
    `).get(userId, userMessage, assistantMessage)?.turn_id || '';
}

function saveTurn(userId, { turnId, userMessage, assistantMessage }) {
    const save = db.transaction(() => {
        const matchingTurnId = findRecentMatchingTurn(userId, userMessage, assistantMessage);
        if (matchingTurnId && matchingTurnId !== turnId) return [];

        const messageIds = [
            insertMessage({ userId, turnId, role: 'user', content: userMessage }),
            insertMessage({ userId, turnId, role: 'assistant', content: assistantMessage })
        ].filter(Boolean);
        pruneMessages(userId);
        return messageIds;
    });
    return save();
}

function importHistoryIfEmpty(userId, messages) {
    const importHistory = db.transaction(() => {
        const existing = db.prepare('SELECT 1 FROM room_chat_messages WHERE user_id = ? LIMIT 1').get(userId);
        if (existing) return [];

        const batchId = crypto.randomUUID();
        const messageIds = [];
        messages.forEach((message, index) => {
            const id = insertMessage({
                userId,
                turnId: `import-${batchId}-${index}`,
                role: message.role,
                content: message.content
            });
            if (id) messageIds.push(id);
        });
        pruneMessages(userId);
        return messageIds;
    });
    return importHistory();
}

function clearMessages(userId) {
    return db.prepare('DELETE FROM room_chat_messages WHERE user_id = ?').run(userId).changes;
}

module.exports = {
    clearMessages,
    findOwnedTurn,
    listMessages,
    saveTurn,
    importHistoryIfEmpty
};
