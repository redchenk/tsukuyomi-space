const crypto = require('crypto');
const db = require('../db');

const VECTOR_SIZE = 96;
const MAX_MEMORIES_PER_USER = Number(process.env.ROOM_MEMORY_MAX_PER_USER || 500);

function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function tokenize(text) {
    const value = String(text || '').toLowerCase();
    const words = value.match(/[a-z0-9_]+|[\u4e00-\u9fff]/g) || [];
    const grams = [];
    for (let index = 0; index < words.length - 1; index += 1) {
        grams.push(`${words[index]}${words[index + 1]}`);
    }
    return words.concat(grams);
}

function createEmbedding(text) {
    const vector = Array(VECTOR_SIZE).fill(0);
    tokenize(text).forEach((token) => {
        const hash = hashString(token);
        const slot = hash % VECTOR_SIZE;
        vector[slot] += (hash & 1) ? 1 : -1;
    });
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map(value => Number((value / norm).toFixed(6)));
}

function similarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;
    let score = 0;
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
        score += Number(a[index] || 0) * Number(b[index] || 0);
    }
    return score;
}

function parseJson(value, fallback) {
    try {
        const parsed = JSON.parse(value);
        return parsed == null ? fallback : parsed;
    } catch (_) {
        return fallback;
    }
}

function summarizeMemory({ userMessage, assistantReply, content }) {
    const source = content || `用户：${userMessage || ''}\n八千代：${assistantReply || ''}`;
    return String(source)
        .replace(/<\|ACT:[\s\S]*?\|>/g, '')
        .replace(/<\|DELAY:\d+(?:\.\d+)?\|>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 280);
}

function estimateImportance(text) {
    const source = String(text || '');
    let score = 0.42;
    if (/喜欢|讨厌|偏好|记住|名字|生日|以后|下次|上次|重要|不要|别|习惯|常用|称呼/i.test(source)) score += 0.28;
    if (/难过|开心|害怕|焦虑|孤独|压力|失眠|生气|担心|希望/i.test(source)) score += 0.16;
    if (source.length > 120) score += 0.08;
    return Math.min(1, Number(score.toFixed(2)));
}

function toPublicMemory(row, score = undefined) {
    return {
        id: row.id,
        visitorName: row.visitor_name || '',
        type: row.memory_type || 'conversation',
        summary: row.summary,
        importance: Number(row.importance || 0),
        metadata: parseJson(row.metadata || '{}', {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAccessedAt: row.last_accessed_at,
        ...(score == null ? {} : { score: Number(score.toFixed(4)) })
    };
}

function pruneUserMemories(userId) {
    const extra = db.prepare('SELECT COUNT(*) AS count FROM room_memories WHERE user_id = ?').get(userId).count - MAX_MEMORIES_PER_USER;
    if (extra <= 0) return 0;
    const stale = db.prepare(`
        SELECT id FROM room_memories
        WHERE user_id = ?
        ORDER BY importance ASC, COALESCE(last_accessed_at, created_at) ASC
        LIMIT ?
    `).all(userId, extra);
    const remove = db.prepare('DELETE FROM room_memories WHERE id = ? AND user_id = ?');
    const tx = db.transaction(() => stale.forEach(item => remove.run(item.id, userId)));
    tx();
    return stale.length;
}

function recordMemory(userId, payload = {}) {
    const content = String(payload.content || `用户：${payload.userMessage || ''}\n八千代：${payload.assistantReply || ''}`).trim();
    const summary = String(payload.summary || summarizeMemory(payload)).trim();
    if (!content || !summary) {
        const error = new Error('Memory content is empty');
        error.statusCode = 400;
        throw error;
    }
    const id = crypto.randomUUID();
    const importance = Number.isFinite(Number(payload.importance))
        ? Math.max(0, Math.min(1, Number(payload.importance)))
        : estimateImportance(`${summary}\n${content}`);
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    db.prepare(`
        INSERT INTO room_memories (
            id, user_id, visitor_name, memory_type, summary, content, embedding, importance, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        userId,
        String(payload.visitorName || '').slice(0, 80),
        String(payload.type || 'conversation').slice(0, 40),
        summary.slice(0, 500),
        content.slice(0, 4000),
        JSON.stringify(createEmbedding(`${summary}\n${content}`)),
        importance,
        JSON.stringify(metadata)
    );
    pruneUserMemories(userId);
    return getMemory(userId, id);
}

function searchMemories(userId, query, limit = 5) {
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));
    const vector = createEmbedding(query);
    const rows = db.prepare(`
        SELECT * FROM room_memories
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 800
    `).all(userId);
    const matched = rows
        .map(row => ({ row, score: similarity(vector, parseJson(row.embedding, [])) + (Number(row.importance || 0) * 0.06) }))
        .filter(item => item.score > 0.08)
        .sort((a, b) => b.score - a.score || String(b.row.created_at).localeCompare(String(a.row.created_at)))
        .slice(0, safeLimit);

    if (matched.length) {
        const touch = db.prepare('UPDATE room_memories SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
        const tx = db.transaction(() => matched.forEach(item => touch.run(item.row.id, userId)));
        tx();
    }

    return matched.map(item => toPublicMemory(item.row, item.score));
}

function listMemories(userId, limit = 50) {
    const rows = db.prepare(`
        SELECT * FROM room_memories
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    `).all(userId, Math.max(1, Math.min(200, Number(limit) || 50)));
    return rows.map(row => toPublicMemory(row));
}

function getMemory(userId, id) {
    const row = db.prepare('SELECT * FROM room_memories WHERE id = ? AND user_id = ?').get(id, userId);
    return row ? toPublicMemory(row) : null;
}

function clearMemories(userId) {
    return db.prepare('DELETE FROM room_memories WHERE user_id = ?').run(userId).changes;
}

function memoryStats(userId) {
    const stats = db.prepare(`
        SELECT COUNT(*) AS count, COALESCE(AVG(importance), 0) AS avgImportance
        FROM room_memories
        WHERE user_id = ?
    `).get(userId);
    return {
        count: stats.count || 0,
        avgImportance: Number(Number(stats.avgImportance || 0).toFixed(3)),
        maxPerUser: MAX_MEMORIES_PER_USER
    };
}

module.exports = {
    createEmbedding,
    similarity,
    recordMemory,
    searchMemories,
    listMemories,
    clearMemories,
    memoryStats
};
