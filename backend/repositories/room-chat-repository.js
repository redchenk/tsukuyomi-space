const crypto = require('crypto');
const db = require('../db');
const roomImages = require('../services/room-chat-images');

const MAX_STORED_MESSAGES = 100;
const MAX_ACTIVE_MESSAGES = 10000;
const DIARY_PAGE_SIZE = 200;

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
    `).all(userId, normalizeLimit(limit)).map(row => ({ ...compactMessage(row),
        ...(row.role === 'user' ? { image: roomImages.descriptor(roomImages.find(userId, row.turn_id)) } : {})
    }));
}

// The chat window is a short tail; the diary reads the whole active cloud
// conversation. Message IDs identify a stable snapshot across devices, even
// when timestamps coincide. Never accept another owner's cursor.
function snapshotBoundary(userId, snapshot) {
    if (!snapshot || typeof snapshot.lastId !== 'string' || snapshot.lastId.length > 128 || typeof snapshot.digest !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.digest))
        throw conflict('日记对话快照无效，请重新读取会话');
    const last = db.prepare('SELECT rowid AS position FROM room_chat_messages WHERE user_id=? AND id=?').get(userId, snapshot.lastId);
    if (!last) throw conflict('会话已在其他设备结束，请重新读取会话');
    const digest = crypto.createHash('sha256');
    for (const row of db.prepare('SELECT id,role,content FROM room_chat_messages WHERE user_id=? AND rowid<=? ORDER BY rowid').iterate(userId, last.position))
        digest.update(JSON.stringify([row.id, row.role, row.content]));
    if (digest.digest('hex') !== snapshot.digest) throw conflict('对话已在其他设备修改，请重新读取后生成日记');
    return last.position;
}

function listDiaryMessages(userId, { cursor = '', snapshot = null } = {}) {
    return db.transaction(() => {
        if (!snapshot) {
            const last = db.prepare('SELECT id FROM room_chat_messages WHERE user_id=? ORDER BY rowid DESC LIMIT 1').get(userId);
            if (!last) return { userId, messages: [], snapshot: null, total: 0, nextCursor: null };
            const digest = crypto.createHash('sha256');
            for (const row of db.prepare('SELECT id,role,content FROM room_chat_messages WHERE user_id=? ORDER BY rowid').iterate(userId))
                digest.update(JSON.stringify([row.id, row.role, row.content]));
            snapshot = { lastId: last.id, digest: digest.digest('hex') };
        }
        const boundary = snapshotBoundary(userId, snapshot);
        const after = cursor ? db.prepare('SELECT rowid AS position FROM room_chat_messages WHERE user_id=? AND id=? AND rowid<=?').get(userId, cursor, boundary)?.position : 0;
        if (after == null) throw conflict('日记分页位置已失效，请重新读取会话');
        const rows = db.prepare('SELECT id,turn_id,role,content,created_at FROM room_chat_messages WHERE user_id=? AND rowid>? AND rowid<=? ORDER BY rowid LIMIT ?')
            .all(userId, after, boundary, DIARY_PAGE_SIZE + 1);
        const page = rows.slice(0, DIARY_PAGE_SIZE);
        return { userId, messages: page.map(compactMessage), snapshot,
            total: db.prepare('SELECT COUNT(*) AS n FROM room_chat_messages WHERE user_id=? AND rowid<=?').get(userId, boundary).n,
            nextCursor: rows.length > DIARY_PAGE_SIZE ? page.at(-1).id : null };
    })();
}

function clearDiarySnapshot(userId, snapshot) {
    return db.transaction(() => {
        const boundary = snapshotBoundary(userId, snapshot);
        // A message sent by another device during generation belongs to the
        // next diary. Keep both it and its private image reference.
        db.prepare(`UPDATE room_chat_images SET deleted=1 WHERE user_id=? AND turn_id IN
            (SELECT turn_id FROM room_chat_messages WHERE user_id=? AND rowid<=?)`).run(userId, userId, boundary);
        const deletedCount = db.prepare('DELETE FROM room_chat_messages WHERE user_id=? AND rowid<=?').run(userId, boundary).changes;
        const remainingCount = db.prepare('SELECT COUNT(*) AS n FROM room_chat_messages WHERE user_id=?').get(userId).n;
        return { deletedCount, remainingCount };
    })();
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

function requireCapacity(userId, additional) {
    const count = db.prepare('SELECT COUNT(*) AS n FROM room_chat_messages WHERE user_id=?').get(userId).n;
    if (count + additional > MAX_ACTIVE_MESSAGES) throw conflict('当前会话已达到 10000 条记录，请先结束会话并写日记；已有记录不会删除');
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

        requireCapacity(userId, opener ? 1 : 2);
        const messageIds = [
            !opener && insertMessage({ userId, turnId, role: 'user', content: userMessage }),
            insertMessage({ userId, turnId, role: 'assistant', content: assistantMessage })
        ].filter(Boolean);
        if (messageIds.length && typeof onSaved === 'function') onSaved();
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
    listDiaryMessages,
    clearDiarySnapshot,
    saveTurn,
    replaceLatestTurn,
    importHistoryIfEmpty
};
