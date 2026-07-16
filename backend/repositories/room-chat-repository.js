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

function saveTurn(userId, { turnId, userMessage, assistantMessage }) {
    const save = db.transaction(() => {
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

module.exports = {
    listMessages,
    saveTurn,
    importHistoryIfEmpty
};
