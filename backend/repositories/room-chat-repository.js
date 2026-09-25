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

function conflict(message) {
    const error = new Error(message);
    error.statusCode = 409;
    return error;
}

function turnRows(userId, turnId) {
    return db.prepare(`
        SELECT id, role, content FROM room_chat_messages
        WHERE user_id = ? AND turn_id = ?
        ORDER BY CASE role WHEN 'user' THEN 0 ELSE 1 END
    `).all(userId, turnId);
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

function findRecentMatchingLegacyTurn(userId, userMessage, assistantMessage) {
    return db.prepare(`
        SELECT user_message.turn_id
        FROM room_chat_messages AS user_message
        JOIN room_chat_messages AS assistant_message
          ON assistant_message.user_id = user_message.user_id
         AND assistant_message.turn_id = user_message.turn_id
         AND assistant_message.role = 'assistant'
        WHERE user_message.user_id = ?
          AND user_message.role = 'user'
          AND user_message.turn_id LIKE 'memory-%'
          AND user_message.content = ?
          AND assistant_message.content = ?
          AND user_message.created_at >= datetime('now', '-2 minutes')
        ORDER BY user_message.rowid DESC
        LIMIT 1
    `).get(userId, userMessage, assistantMessage)?.turn_id || '';
}

function saveTurn(userId, { turnId, userMessage, assistantMessage, opener = false }, onSaved = null) {
    const save = db.transaction(() => {
        const existing = turnRows(userId, turnId);
        if (existing.length) {
            const expected = opener
                ? [{ role: 'assistant', content: assistantMessage }]
                : [{ role: 'user', content: userMessage }, { role: 'assistant', content: assistantMessage }];
            if (existing.length !== expected.length || existing.some((row, index) => (
                row.role !== expected[index].role || row.content !== expected[index].content
            ))) throw conflict('此轮对话已由其他内容保存，请刷新后重试');
            return [];
        }
        // Legacy clients can save a turn through the memory endpoint first,
        // then retry it through the modern chat endpoint under a new ID.
        // Distinct modern turn IDs may legitimately have identical text.
        const matchingTurnId = findRecentMatchingLegacyTurn(userId, userMessage, assistantMessage);
        if (matchingTurnId && matchingTurnId !== turnId) return [];

        const messageIds = [
            !opener && insertMessage({ userId, turnId, role: 'user', content: userMessage }),
            insertMessage({ userId, turnId, role: 'assistant', content: assistantMessage })
        ].filter(Boolean);
        if (messageIds.length && typeof onSaved === 'function') onSaved();
        pruneMessages(userId);
        return messageIds;
    });
    return save();
}

function replaceLatestTurn(userId, { turnId, expectedUserMessage, expectedAssistantMessage, userMessage, assistantMessage }, onReplaced = null) {
    const replace = db.transaction(() => {
        const latest = db.prepare(`
            SELECT turn_id FROM room_chat_messages WHERE user_id = ? ORDER BY rowid DESC LIMIT 1
        `).get(userId);
        if (!latest || latest.turn_id !== turnId) throw conflict('只能修改当前最新一轮对话');
        const rows = turnRows(userId, turnId);
        const opener = rows.length === 1 && rows[0].role === 'assistant';
        if (!opener && (rows.length !== 2 || rows[0].role !== 'user' || rows[1].role !== 'assistant')) {
            throw conflict('当前对话记录不完整，请刷新后重试');
        }
        if (opener && (expectedUserMessage || userMessage)) throw conflict('开场白不能包含用户消息');
        const actualUser = opener ? '' : rows[0].content;
        const actualAssistant = rows.at(-1).content;
        if (actualUser === userMessage && actualAssistant === assistantMessage) {
            return { changed: false, messageIds: [] };
        }
        if (actualUser !== expectedUserMessage || actualAssistant !== expectedAssistantMessage) {
            throw conflict('该轮对话已在其他设备更新，请刷新后重试');
        }
        if (!opener) {
            db.prepare('UPDATE room_chat_messages SET content = ? WHERE id = ? AND user_id = ?')
                .run(userMessage, rows[0].id, userId);
        }
        db.prepare('UPDATE room_chat_messages SET content = ? WHERE id = ? AND user_id = ?')
            .run(assistantMessage, rows.at(-1).id, userId);
        // Keep chat replacement and retirement of its generated memories in
        // the same SQLite transaction. A failed edit cannot erase memories.
        const invalidatedMemoryIds = typeof onReplaced === 'function' ? onReplaced() : [];
        return { changed: true, messageIds: rows.map(row => row.id), invalidatedMemoryIds };
    });
    return replace();
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
    replaceLatestTurn,
    importHistoryIfEmpty
};
