const crypto = require('crypto');
const db = require('../db');

const VECTOR_SIZE = 96;
const MAX_MEMORIES_PER_USER = Number(process.env.ROOM_MEMORY_MAX_PER_USER || 500);
const MEMORY_TYPES = new Set(['profile', 'preference', 'project', 'episodic', 'semantic', 'conversation']);
const SENSITIVE_PATTERN = /(password|api[_-]?key|secret|token|bearer\s+[a-z0-9._-]+|sk-[a-z0-9._-]+|密码|密钥|令牌|身份证|银行卡)/i;

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

function cleanText(text, limit = 4000) {
    return String(text || '')
        .replace(/<\|ACT:[\s\S]*?\|>/g, '')
        .replace(/<\|DELAY:\d+(?:\.\d+)?\|>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
}

function normalizeType(type) {
    const value = String(type || '').trim().toLowerCase();
    return MEMORY_TYPES.has(value) ? value : 'conversation';
}

function uniqueTags(tags) {
    const values = Array.isArray(tags) ? tags : String(tags || '').split(',');
    return [...new Set(values.map(item => String(item || '').trim()).filter(Boolean))].slice(0, 12);
}

function extractTags(text, type) {
    const source = String(text || '').toLowerCase();
    const tags = [type].filter(Boolean);
    const pairs = [
        [/vue|前端|页面|css|ui|界面|组件/, 'frontend'],
        [/github|部署|服务器|ci|测试|数据库|sqlite|迁移/, 'project'],
        [/喜欢|偏好|希望|倾向|风格|主题|颜色/, 'preference'],
        [/名字|称呼|我是|生日|身份|专业|职业/, 'profile'],
        [/上次|继续|进度|计划|任务|后续/, 'episodic'],
        [/天气|图片|tts|mcp|agent|live2d|llm/, 'room-agent']
    ];
    pairs.forEach(([pattern, tag]) => {
        if (pattern.test(source)) tags.push(tag);
    });
    return uniqueTags(tags);
}

function inferMemoryType(text) {
    const source = String(text || '');
    if (/我叫|叫我|我的名字|称呼我|我是.+(学生|老师|开发|设计|作者)|生日|邮箱|头像/.test(source)) return 'profile';
    if (/喜欢|讨厌|偏好|希望你|以后.*(用|不要|记得)|倾向|风格|主题|颜色|语气/.test(source)) return 'preference';
    if (/项目|网站|room|terminal|hub|部署|github|数据库|测试|功能|后续|计划|开发/.test(source)) return 'project';
    if (/上次|昨天|今天|刚才|已经|完成|遇到|报错|失败|成功|继续/.test(source)) return 'episodic';
    if (/说明|结论|知识|规则|设定|架构|文档/.test(source)) return 'semantic';
    return 'conversation';
}

function hasLongTermValue(text) {
    const source = String(text || '').trim();
    if (source.length < 12) return false;
    if (SENSITIVE_PATTERN.test(source)) return false;
    return /记住|以后|下次|上次|喜欢|讨厌|偏好|希望|不要|名字|叫我|我是|项目|网站|计划|正在|功能|风格|习惯|设定|继续|完成|报错|使用|开发/.test(source)
        || source.length > 80;
}

function summarizeMemory({ userMessage, assistantReply, content }) {
    const source = content || `用户：${userMessage || ''}\n八千代：${assistantReply || ''}`;
    return cleanText(source, 280);
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
    const metadata = parseJson(row.metadata || '{}', {});
    return {
        id: row.id,
        visitorName: row.visitor_name || '',
        type: row.memory_type || 'conversation',
        summary: row.summary,
        content: row.content,
        importance: Number(row.importance || 0),
        confidence: Number(metadata.confidence ?? 0.8),
        tags: uniqueTags(metadata.tags || []),
        metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAccessedAt: row.last_accessed_at,
        ...(score == null ? {} : { score: Number(score.toFixed(4)) })
    };
}

function buildMemoryCandidate(payload = {}) {
    const rawContent = cleanText(payload.content || `用户：${payload.userMessage || ''}\n八千代：${payload.assistantReply || ''}`);
    const explicitSummary = cleanText(payload.summary || '', 500);
    const summary = explicitSummary || summarizeMemory({ ...payload, content: rawContent });
    const type = normalizeType(payload.type || inferMemoryType(`${summary}\n${rawContent}`));
    if (!hasLongTermValue(`${summary}\n${rawContent}`) && !payload.force) return null;
    const importance = Number.isFinite(Number(payload.importance))
        ? Math.max(0, Math.min(1, Number(payload.importance)))
        : estimateImportance(`${summary}\n${rawContent}`);
    const confidence = Number.isFinite(Number(payload.confidence))
        ? Math.max(0, Math.min(1, Number(payload.confidence)))
        : 0.78;
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    const tags = uniqueTags([...(metadata.tags || []), ...extractTags(`${summary}\n${rawContent}`, type)]);
    return {
        visitorName: String(payload.visitorName || '').slice(0, 80),
        type,
        summary,
        content: rawContent,
        importance,
        metadata: {
            ...metadata,
            confidence,
            tags,
            source: metadata.source || 'room-memory',
            extractedAt: metadata.extractedAt || new Date().toISOString()
        }
    };
}

function mergeMemoryText(previous, next) {
    const a = cleanText(previous, 360);
    const b = cleanText(next, 360);
    if (!a) return b;
    if (!b || a.includes(b)) return a;
    if (b.includes(a)) return b;
    return `${a}；${b}`.slice(0, 500);
}

function findMergeTarget(userId, candidate) {
    const vector = createEmbedding(`${candidate.summary}\n${candidate.content}`);
    const rows = db.prepare(`
        SELECT * FROM room_memories
        WHERE user_id = ? AND memory_type = ?
        ORDER BY updated_at DESC
        LIMIT 300
    `).all(userId, candidate.type);
    return rows
        .map(row => ({ row, score: similarity(vector, parseJson(row.embedding, [])) }))
        .filter(item => item.score >= 0.62)
        .sort((a, b) => b.score - a.score)[0]?.row || null;
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

function upsertCandidate(userId, candidate) {
    if (!candidate?.content || !candidate?.summary) {
        const error = new Error('Memory content is empty');
        error.statusCode = 400;
        throw error;
    }
    const target = findMergeTarget(userId, candidate);
    if (target) {
        const oldMetadata = parseJson(target.metadata || '{}', {});
        const metadata = {
            ...oldMetadata,
            ...candidate.metadata,
            tags: uniqueTags([...(oldMetadata.tags || []), ...(candidate.metadata.tags || [])]),
            confidence: Math.max(Number(oldMetadata.confidence || 0), Number(candidate.metadata.confidence || 0))
        };
        const summary = mergeMemoryText(target.summary, candidate.summary);
        const content = mergeMemoryText(target.content, candidate.content).slice(0, 4000);
        const importance = Math.max(Number(target.importance || 0), Number(candidate.importance || 0));
        db.prepare(`
            UPDATE room_memories
            SET visitor_name = ?,
                summary = ?,
                content = ?,
                embedding = ?,
                importance = ?,
                metadata = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(
            candidate.visitorName || target.visitor_name || '',
            summary,
            content,
            JSON.stringify(createEmbedding(`${summary}\n${content}`)),
            importance,
            JSON.stringify(metadata),
            target.id,
            userId
        );
        return { memory: getMemory(userId, target.id), action: 'merged' };
    }

    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO room_memories (
            id, user_id, visitor_name, memory_type, summary, content, embedding, importance, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        userId,
        candidate.visitorName,
        candidate.type,
        candidate.summary.slice(0, 500),
        candidate.content.slice(0, 4000),
        JSON.stringify(createEmbedding(`${candidate.summary}\n${candidate.content}`)),
        candidate.importance,
        JSON.stringify(candidate.metadata)
    );
    pruneUserMemories(userId);
    return { memory: getMemory(userId, id), action: 'created' };
}

function recordMemory(userId, payload = {}) {
    const candidate = buildMemoryCandidate(payload);
    if (!candidate) return null;
    return upsertCandidate(userId, candidate);
}

function searchMemories(userId, query, limit = 5) {
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));
    const queryType = inferMemoryType(query);
    const vector = createEmbedding(query);
    const now = Date.now();
    const rows = db.prepare(`
        SELECT * FROM room_memories
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 800
    `).all(userId);
    const matched = rows
        .map((row) => {
            const sim = similarity(vector, parseJson(row.embedding, []));
            const ageDays = Math.max(0, (now - new Date(row.updated_at || row.created_at).getTime()) / 86400000);
            const recency = Math.exp(-ageDays / 30);
            const metadata = parseJson(row.metadata || '{}', {});
            const access = row.last_accessed_at ? 0.8 : 0.2;
            const typeMatch = row.memory_type === queryType || (metadata.tags || []).includes(queryType) ? 1 : 0;
            const score = (0.45 * sim)
                + (0.25 * Number(row.importance || 0))
                + (0.15 * recency)
                + (0.10 * access)
                + (0.05 * typeMatch);
            return { row, score };
        })
        .filter(item => item.score > 0.16)
        .sort((a, b) => b.score - a.score || String(b.row.created_at).localeCompare(String(a.row.created_at)))
        .slice(0, safeLimit);

    if (matched.length) {
        const touch = db.prepare('UPDATE room_memories SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
        const tx = db.transaction(() => matched.forEach(item => touch.run(item.row.id, userId)));
        tx();
    }

    return matched.map(item => toPublicMemory(item.row, item.score));
}

function listMemories(userId, { limit = 50, type = '', q = '' } = {}) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const safeType = normalizeType(type);
    const hasType = type && MEMORY_TYPES.has(String(type).trim().toLowerCase());
    const query = String(q || '').trim();
    if (query) return searchMemories(userId, query, safeLimit);
    const where = hasType ? 'WHERE user_id = ? AND memory_type = ?' : 'WHERE user_id = ?';
    const params = hasType ? [userId, safeType, safeLimit] : [userId, safeLimit];
    const rows = db.prepare(`
        SELECT * FROM room_memories
        ${where}
        ORDER BY created_at DESC
        LIMIT ?
    `).all(...params);
    return rows.map(row => toPublicMemory(row));
}

function getMemory(userId, id) {
    const row = db.prepare('SELECT * FROM room_memories WHERE id = ? AND user_id = ?').get(id, userId);
    return row ? toPublicMemory(row) : null;
}

function clearMemories(userId) {
    return db.prepare('DELETE FROM room_memories WHERE user_id = ?').run(userId).changes;
}

function updateMemory(userId, id, payload = {}) {
    const existing = db.prepare('SELECT * FROM room_memories WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return null;
    const oldMetadata = parseJson(existing.metadata || '{}', {});
    const type = normalizeType(payload.type || existing.memory_type);
    const summary = cleanText(payload.summary || existing.summary, 500);
    const content = cleanText(payload.content || existing.content, 4000);
    const tags = payload.tags ? uniqueTags(payload.tags) : uniqueTags(oldMetadata.tags || []);
    const importance = Number.isFinite(Number(payload.importance))
        ? Math.max(0, Math.min(1, Number(payload.importance)))
        : Number(existing.importance || 0.5);
    const confidence = Number.isFinite(Number(payload.confidence))
        ? Math.max(0, Math.min(1, Number(payload.confidence)))
        : Number(oldMetadata.confidence || 0.8);
    const metadata = { ...oldMetadata, tags, confidence, editedAt: new Date().toISOString() };
    db.prepare(`
        UPDATE room_memories
        SET memory_type = ?, summary = ?, content = ?, embedding = ?, importance = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    `).run(type, summary, content, JSON.stringify(createEmbedding(`${summary}\n${content}`)), importance, JSON.stringify(metadata), id, userId);
    return getMemory(userId, id);
}

function deleteMemory(userId, id) {
    return db.prepare('DELETE FROM room_memories WHERE id = ? AND user_id = ?').run(id, userId).changes;
}

function memoryStats(userId) {
    const stats = db.prepare(`
        SELECT COUNT(*) AS count, COALESCE(AVG(importance), 0) AS avgImportance
        FROM room_memories
        WHERE user_id = ?
    `).get(userId);
    const byType = db.prepare(`
        SELECT memory_type AS type, COUNT(*) AS count
        FROM room_memories
        WHERE user_id = ?
        GROUP BY memory_type
    `).all(userId);
    return {
        count: stats.count || 0,
        avgImportance: Number(Number(stats.avgImportance || 0).toFixed(3)),
        maxPerUser: MAX_MEMORIES_PER_USER,
        byType
    };
}

module.exports = {
    createEmbedding,
    similarity,
    buildMemoryCandidate,
    recordMemory,
    searchMemories,
    listMemories,
    updateMemory,
    deleteMemory,
    clearMemories,
    memoryStats
};
