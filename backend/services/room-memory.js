const crypto = require('crypto');
const db = require('../db');
const roomChatRepository = require('../repositories/room-chat-repository');
const { chatTemperatureFor, normalizeChatUrl } = require('./llm');
const {
    LOCAL_EMBEDDING_VERSION,
    createEmbedding,
    createMemoryEmbedding,
    createMemoryEmbeddingDetailed,
    embeddingStatus
} = require('./room-embedding');
const milvusStore = require('./room-milvus-store');

const MAX_MEMORY_CONTENT_LENGTH = Math.max(4000, Number.parseInt(process.env.ROOM_MEMORY_CONTENT_LIMIT || '12000', 10) || 12000);
// Milvus stores at most 8192 UTF-8 bytes of a memory's text. Keeping automatic
// fragments below both limits leaves room for multibyte CJK and emoji text.
const MAX_AUTO_MEMORY_FRAGMENT_LENGTH = Math.min(MAX_MEMORY_CONTENT_LENGTH, 2500);
const MAX_AUTO_MEMORY_FRAGMENT_BYTES = 7500;
const MEMORY_TYPES = new Set(['profile', 'preference', 'project', 'episodic', 'semantic', 'conversation']);
const SENSITIVE_PATTERN = /(password|api[_-]?key|secret|token|bearer\s+[a-z0-9._-]+|sk-[a-z0-9._-]+|密码|密钥|令牌|身份证|银行卡)/i;
const LLM_EXTRACTOR_ENABLED = process.env.ROOM_MEMORY_EXTRACTOR === 'llm';

function requireUserId(userId) {
    const value = String(userId || '').trim();
    if (!value || value.length > 128) {
        const error = new Error('A valid authenticated user is required');
        error.statusCode = 401;
        throw error;
    }
    return value;
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

function parseJsonArrayText(text) {
    const raw = String(text || '').trim();
    const json = raw.match(/```json\s*([\s\S]*?)```/i)?.[1]
        || raw.match(/```\s*([\s\S]*?)```/)?.[1]
        || raw.match(/\[[\s\S]*\]/)?.[0]
        || raw;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
}

function normalizeMemoryText(text) {
    return String(text || '')
        .replace(/<\|ACT:[\s\S]*?\|>/g, '')
        .replace(/<\|DELAY:\d+(?:\.\d+)?\|>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeEditedMemoryText(text) {
    return String(text ?? '')
        .replace(/<\|ACT:[\s\S]*?\|>/g, '')
        .replace(/<\|DELAY:\d+(?:\.\d+)?\|>/g, '');
}

function cleanText(text, limit = MAX_MEMORY_CONTENT_LENGTH) {
    return normalizeMemoryText(text).slice(0, limit);
}

function splitMemoryText(text, limit = MAX_AUTO_MEMORY_FRAGMENT_LENGTH) {
    const source = normalizeMemoryText(text);
    const parts = [];
    let start = 0;
    while (start < source.length) {
        let end = start;
        let bytes = 0;
        while (end < source.length) {
            const character = String.fromCodePoint(source.codePointAt(end));
            const nextBytes = Buffer.byteLength(character, 'utf8');
            if (end - start + character.length > limit || bytes + nextBytes > MAX_AUTO_MEMORY_FRAGMENT_BYTES) break;
            end += character.length;
            bytes += nextBytes;
        }
        if (end < source.length) {
            const lower = start + Math.floor((end - start) * 0.7);
            const window = source.slice(lower, end);
            const boundary = Math.max(window.lastIndexOf('。'), window.lastIndexOf('！'), window.lastIndexOf('？'), window.lastIndexOf('；'));
            if (boundary >= 0) end = lower + boundary + 1;
        }
        parts.push(source.slice(start, end));
        start = end;
    }
    return parts.filter(Boolean);
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

function toPublicMemory(row, score = undefined, options = {}) {
    const metadata = parseJson(row.metadata || '{}', {});
    const memory = {
        id: row.id,
        visitorName: row.visitor_name || '',
        type: row.memory_type || 'conversation',
        summary: row.summary,
        importance: Number(row.importance || 0),
        confidence: Number(metadata.confidence ?? 0.8),
        tags: uniqueTags(metadata.tags || []),
        metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAccessedAt: row.last_accessed_at,
        vectorSyncedAt: row.vector_synced_at || '',
        vectorPending: milvusStore.status().enabled
            ? !row.vector_synced_at || new Date(row.vector_synced_at).getTime() < new Date(row.updated_at).getTime()
            : false,
        ...(score == null ? {} : { score: Number(score.toFixed(4)) })
    };
    if (options.includeContent) memory.content = row.content;
    return memory;
}

function buildMemoryCandidate(payload = {}) {
    // Fragments have already been cleaned as a complete turn. Preserve spaces
    // at their boundaries so reassembling all fragments never drops words.
    const rawContent = payload.metadata?.fragmentGroupId
        ? String(payload.content || '')
        : normalizeMemoryText(payload.content || `用户：${payload.userMessage || ''}\n八千代：${payload.assistantReply || ''}`);
    if (rawContent.length > MAX_MEMORY_CONTENT_LENGTH) {
        const error = new Error(`单条记忆最多 ${MAX_MEMORY_CONTENT_LENGTH} 字，请拆分后保存`);
        error.statusCode = 413;
        throw error;
    }
    const explicitSummary = cleanText(payload.summary || '', 500);
    const summary = explicitSummary || summarizeMemory({ ...payload, content: rawContent });
    const type = normalizeType(payload.type || inferMemoryType(`${summary}\n${rawContent}`));
    if (SENSITIVE_PATTERN.test(`${summary}\n${rawContent}`)) return null;
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

async function extractMemoryCandidatesWithLLM(payload = {}) {
    if (!LLM_EXTRACTOR_ENABLED || !process.env.LLM_API_KEY) return [];
    const userMessage = cleanText(payload.userMessage || '', 4000);
    const assistantReply = cleanText(payload.assistantReply || '', 8000);
    const content = cleanText(payload.content || `用户：${userMessage}\n八千代：${assistantReply}`, MAX_MEMORY_CONTENT_LENGTH);
    if (!content || SENSITIVE_PATTERN.test(content)) return [];

    const systemPrompt = [
        '你是长期记忆提取器。只从对话中提取未来可能有用、相对稳定、非敏感的记忆。',
        '不要保存一次性闲聊、临时情绪、密码、密钥、token、身份证、银行卡等敏感信息。',
        '输出严格 JSON 数组，不要解释。每项字段：type, summary, content, importance, confidence, tags。',
        'type 只能是 profile, preference, project, episodic, semantic, conversation。',
        '如果没有值得长期保存的内容，输出 []。'
    ].join('\n');
    const model = process.env.LLM_MODEL || 'moonshot-v1-8k';
    const chatUrl = normalizeChatUrl(process.env.LLM_API_URL, model);
    const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.LLM_API_KEY}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content }
            ],
            temperature: chatTemperatureFor(chatUrl, model, 0.1),
            max_tokens: 1000,
            stream: false
        })
    });
    if (!response.ok) throw new Error(`Memory extractor LLM ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
    return parseJsonArrayText(text)
        .map(item => buildMemoryCandidate({
            ...payload,
            type: item.type,
            summary: item.summary,
            content: item.content || item.summary,
            importance: item.importance,
            confidence: item.confidence,
            metadata: {
                ...(payload.metadata || {}),
                tags: item.tags || [],
                source: 'llm-extractor'
            },
            force: true
        }))
        .filter(Boolean)
        .filter(item => !SENSITIVE_PATTERN.test(`${item.summary}\n${item.content}`))
        .slice(0, 4);
}

function mergeMemoryText(previous, next) {
    const a = normalizeMemoryText(previous);
    const b = normalizeMemoryText(next);
    if (!a) return b;
    if (!b || a.includes(b)) return a;
    if (b.includes(a)) return b;
    return `${a}；${b}`;
}

function tokenOverlapScore(a, b) {
    const meaningfulToken = token => /^[a-z0-9_]{2,}$/i.test(token) || /^[\u4e00-\u9fff]{2,}$/.test(token);
    const left = new Set(tokenize(a).filter(meaningfulToken));
    const right = new Set(tokenize(b).filter(meaningfulToken));
    if (!left.size || !right.size) return 0;
    let overlap = 0;
    left.forEach((token) => {
        if (right.has(token)) overlap += 1;
    });
    return overlap / Math.min(left.size, right.size);
}

function shouldMergeMemory(type, score, overlap) {
    const memoryType = normalizeType(type);
    if (memoryType === 'conversation' || memoryType === 'episodic') {
        return overlap >= 0.5 || (score >= 0.92 && overlap >= 0.2);
    }
    return overlap >= 0.4
        || (score >= 0.86 && overlap >= 0.1)
        || (score >= 0.68 && overlap >= 0.25);
}

function findMergeTarget(userId, candidate) {
    // A generated memory belongs to one exact chat turn. Merging it into a
    // hand-written memory (or a different turn) would make it impossible to
    // retire safely when that turn is edited.
    if (candidate.metadata?.fragmentGroupId || candidate.metadata?.sourceKind === 'chat-turn-auto') return null;
    const candidateText = `${candidate.summary}\n${candidate.content}`;
    const vector = candidate.vector || createEmbedding(candidateText);
    const rows = db.prepare(`
        SELECT * FROM room_memories
        WHERE user_id = ? AND memory_type = ?
        ORDER BY updated_at DESC
        LIMIT 300
    `).all(userId, candidate.type)
        .filter(row => parseJson(row.metadata || '{}', {}).sourceKind !== 'chat-turn-auto');
    return rows
        .map(row => ({
            row,
            score: similarity(vector, parseJson(row.embedding, [])),
            overlap: tokenOverlapScore(candidateText, `${row.summary}\n${row.content}`)
        }))
        .filter((item) => {
            // Event memories are individual turns, not ever-growing transcripts.
            if (candidate.type === 'conversation' || candidate.type === 'episodic') {
                return normalizeMemoryText(item.row.content) === candidate.content;
            }
            return shouldMergeMemory(candidate.type, item.score, item.overlap)
                && mergeMemoryText(item.row.content, candidate.content).length <= MAX_AUTO_MEMORY_FRAGMENT_LENGTH
                && mergeMemoryText(item.row.summary, candidate.summary).length <= 800;
        })
        .sort((a, b) => b.score - a.score)[0]?.row || null;
}

function memoryEmbeddingMetadata(metadata, embedding) {
    return {
        ...(metadata || {}),
        embeddingProvider: embedding.provider,
        embeddingModel: embedding.model,
        embeddingVersion: embedding.version
    };
}

function expectedEmbeddingVersion() {
    const status = embeddingStatus();
    return status.configuredProvider === 'remote'
        ? `remote:${status.configuredModel}`
        : LOCAL_EMBEDDING_VERSION;
}

function markVectorSync(userId, id, synced, error = '') {
    db.prepare(`
        UPDATE room_memories
        SET vector_synced_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,
            vector_sync_error = ?
        WHERE id = ? AND user_id = ?
    `).run(synced ? 1 : 0, String(error || '').slice(0, 500), id, userId);
}

async function syncMemoryRow(userId, row) {
    if (!milvusStore.status().enabled) return { synced: false, skipped: true };
    const synced = await milvusStore.upsertUserMemory({
        id: row.id,
        userId,
        type: row.memory_type,
        summary: row.summary,
        content: row.content,
        importance: Number(row.importance || 0),
        vector: parseJson(row.embedding, [])
    });
    // The vector write can finish after a chat edit has retired this memory.
    // Requeue deletion even if an earlier deletion request already ran, so a
    // late upsert cannot leave an orphaned vector behind.
    const current = db.prepare('SELECT summary, content, embedding, memory_type, importance, metadata FROM room_memories WHERE id = ? AND user_id = ?')
        .get(row.id, userId);
    if (!current) {
        if (synced) {
            queueVectorDeletion(userId, row.id);
            await flushPendingVectorDeletions(userId, 20);
        }
        return { synced: false, skipped: false, error: 'Memory was retired before vector sync completed' };
    }
    if (current.summary !== row.summary || current.content !== row.content || current.embedding !== row.embedding
        || current.memory_type !== row.memory_type || Number(current.importance) !== Number(row.importance)
        || current.metadata !== row.metadata) {
        markVectorSync(userId, row.id, false, 'Memory changed during vector sync');
        return { synced: false, skipped: false, error: 'Memory changed during vector sync' };
    }
    const error = synced ? '' : (milvusStore.status().lastError || 'Milvus is temporarily unavailable');
    markVectorSync(userId, row.id, synced, error);
    return { synced, skipped: false, error };
}

function queueVectorDeletion(userId, memoryId) {
    if (!milvusStore.status().enabled) return;
    db.prepare(`
        INSERT INTO room_memory_vector_deletions (user_id, memory_id)
        VALUES (?, ?)
        ON CONFLICT(user_id, memory_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `).run(userId, memoryId);
}

async function flushPendingVectorDeletions(userId, limit = 100) {
    if (!milvusStore.status().enabled) return { attempted: 0, deleted: 0, failed: 0 };
    const rows = db.prepare(`
        SELECT id, memory_id FROM room_memory_vector_deletions
        WHERE user_id = ?
        ORDER BY created_at ASC
        LIMIT ?
    `).all(userId, Math.max(1, Math.min(500, Number(limit) || 100)));
    let deleted = 0;
    let failed = 0;
    for (const row of rows) {
        const success = await milvusStore.deleteUserMemory(userId, row.memory_id);
        if (success) {
            db.prepare('DELETE FROM room_memory_vector_deletions WHERE id = ? AND user_id = ?').run(row.id, userId);
            deleted += 1;
        } else {
            db.prepare(`
                UPDATE room_memory_vector_deletions
                SET last_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `).run(milvusStore.status().lastError || 'Milvus is temporarily unavailable', row.id, userId);
            failed += 1;
        }
    }
    return { attempted: rows.length, deleted, failed };
}

async function syncPendingUserMemories(userId, { limit = 50, force = false } = {}) {
    const scopedUserId = requireUserId(userId);
    const vectorStatus = milvusStore.status();
    if (!vectorStatus.enabled) {
        return { enabled: false, attempted: 0, synced: 0, failed: 0, pending: 0 };
    }
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
    const deletions = await flushPendingVectorDeletions(scopedUserId, safeLimit);
    const rows = db.prepare(`
        SELECT * FROM room_memories
        WHERE user_id = ?
          AND (
            ? = 1
            OR vector_synced_at IS NULL
            OR vector_synced_at < updated_at
            OR COALESCE(vector_sync_error, '') <> ''
          )
        ORDER BY updated_at ASC
        LIMIT ?
    `).all(scopedUserId, force ? 1 : 0, safeLimit);
    let synced = 0;
    let failed = 0;
    for (const row of rows) {
        const metadata = parseJson(row.metadata || '{}', {});
        let nextRow = row;
        if (force || !Array.isArray(parseJson(row.embedding, null)) || metadata.embeddingVersion !== expectedEmbeddingVersion()) {
            const embedding = await createMemoryEmbeddingDetailed(`${row.summary}\n${row.content}`);
            const nextMetadata = memoryEmbeddingMetadata(metadata, embedding);
            const updated = db.prepare(`
                UPDATE room_memories
                SET embedding = ?, metadata = ?, vector_synced_at = NULL, vector_sync_error = ''
                WHERE id = ? AND user_id = ?
                  AND summary = ? AND content = ? AND metadata = ? AND embedding = ?
                  AND memory_type = ? AND importance = ?
            `).run(
                JSON.stringify(embedding.vector), JSON.stringify(nextMetadata), row.id, scopedUserId,
                row.summary, row.content, row.metadata, row.embedding, row.memory_type, row.importance
            );
            // Embedding may be remote and slow. A person could have edited the
            // memory while it was in flight; never restore its old provenance.
            if (!updated.changes) {
                failed += 1;
                continue;
            }
            nextRow = { ...row, embedding: JSON.stringify(embedding.vector), metadata: JSON.stringify(nextMetadata) };
        }
        const result = await syncMemoryRow(scopedUserId, nextRow);
        if (result.synced) synced += 1;
        else failed += 1;
    }
    const pending = db.prepare(`
        SELECT COUNT(*) AS count FROM room_memories
        WHERE user_id = ?
          AND (vector_synced_at IS NULL OR vector_synced_at < updated_at OR COALESCE(vector_sync_error, '') <> '')
    `).get(scopedUserId).count;
    return { enabled: true, attempted: rows.length, synced, failed, pending, deletions };
}

function matchesSavedAutoTurn(userId, autoTurn) {
    if (!autoTurn) return true;
    const saved = roomChatRepository.findOwnedTurn(userId, autoTurn.turnId);
    return Boolean(saved
        && saved.userMessage === autoTurn.userMessage
        && saved.assistantMessage === autoTurn.assistantReply);
}

async function upsertCandidate(userId, candidate, { autoTurn = null } = {}) {
    userId = requireUserId(userId);
    if (!candidate?.content || !candidate?.summary) {
        const error = new Error('Memory content is empty');
        error.statusCode = 400;
        throw error;
    }
    const embedding = candidate.vector
        ? {
            vector: candidate.vector,
            provider: candidate.metadata?.embeddingProvider || 'local',
            model: candidate.metadata?.embeddingModel || LOCAL_EMBEDDING_VERSION,
            version: candidate.metadata?.embeddingVersion || LOCAL_EMBEDDING_VERSION
        }
        : await createMemoryEmbeddingDetailed(`${candidate.summary}\n${candidate.content}`);
    const vector = embedding.vector;
    candidate.vector = vector;
    candidate.metadata = memoryEmbeddingMetadata(candidate.metadata, embedding);
    // Embedding and extraction can await remote services. Check immediately
    // before the synchronous SQLite write so a replaced turn cannot be
    // reintroduced by an older in-flight memory request.
    if (!matchesSavedAutoTurn(userId, autoTurn)) return null;
    if (autoTurn) {
        const duplicate = db.prepare(`
            SELECT * FROM room_memories WHERE user_id = ? AND memory_type = ?
            ORDER BY created_at DESC LIMIT 300
        `).all(userId, candidate.type).find(row => {
            const metadata = parseJson(row.metadata || '{}', {});
            return metadata.sourceKind === 'chat-turn-auto'
                && metadata.sourceTurnId === autoTurn.turnId
                && metadata.sourceRevision === autoTurn.revision
                && row.summary === candidate.summary
                && row.content === candidate.content;
        });
        if (duplicate) return { memory: toPublicMemory(duplicate, undefined, { includeContent: true }), action: 'merged' };
    }
    const target = findMergeTarget(userId, candidate);
    if (target) {
        const oldMetadata = parseJson(target.metadata || '{}', {});
        let metadata = {
            ...oldMetadata,
            ...candidate.metadata,
            tags: uniqueTags([...(oldMetadata.tags || []), ...(candidate.metadata.tags || [])]),
            confidence: Math.max(Number(oldMetadata.confidence || 0), Number(candidate.metadata.confidence || 0))
        };
        const eventDuplicate = candidate.type === 'conversation' || candidate.type === 'episodic';
        const summary = eventDuplicate ? target.summary : mergeMemoryText(target.summary, candidate.summary);
        const content = eventDuplicate ? target.content : mergeMemoryText(target.content, candidate.content);
        const importance = Math.max(Number(target.importance || 0), Number(candidate.importance || 0));
        const nextEmbedding = await createMemoryEmbeddingDetailed(`${summary}\n${content}`);
        const nextVector = nextEmbedding.vector;
        metadata = memoryEmbeddingMetadata(metadata, nextEmbedding);
        db.prepare(`
            UPDATE room_memories
            SET visitor_name = ?,
                summary = ?,
                content = ?,
                embedding = ?,
                importance = ?,
                metadata = ?,
                updated_at = CURRENT_TIMESTAMP,
                vector_synced_at = NULL,
                vector_sync_error = ''
            WHERE id = ? AND user_id = ?
        `).run(
            candidate.visitorName || target.visitor_name || '',
            summary,
            content,
            JSON.stringify(nextVector),
            importance,
            JSON.stringify(metadata),
            target.id,
            userId
        );
        await syncMemoryRow(userId, db.prepare('SELECT * FROM room_memories WHERE id = ? AND user_id = ?').get(target.id, userId));
        return { memory: getMemory(userId, target.id), action: 'merged' };
    }

    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO room_memories (
            id, user_id, visitor_name, memory_type, summary, content, embedding, importance, metadata,
            vector_synced_at, vector_sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '')
    `).run(
        id,
        userId,
        candidate.visitorName,
        candidate.type,
        candidate.summary,
        candidate.content,
        JSON.stringify(vector),
        candidate.importance,
        JSON.stringify(candidate.metadata)
    );
    await syncMemoryRow(userId, db.prepare('SELECT * FROM room_memories WHERE id = ? AND user_id = ?').get(id, userId));
    const memory = getMemory(userId, id);
    return memory ? { memory, action: 'created' } : null;
}

async function recordMemory(userId, payload = {}) {
    userId = requireUserId(userId);
    const metadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
        ? { ...payload.metadata }
        : {};
    // These fields are server-owned; callers must not be able to mark a
    // hand-written memory as disposable turn output.
    delete metadata.sourceKind;
    delete metadata.sourceTurnId;
    delete metadata.sourceRevision;
    const turnId = typeof payload.turnId === 'string' ? payload.turnId.trim() : '';
    const autoTurn = payload.captureChat === false && turnId
        && typeof payload.userMessage === 'string'
        && typeof payload.assistantReply === 'string'
        && !payload.content
        ? {
            turnId,
            userMessage: payload.userMessage,
            assistantReply: payload.assistantReply,
            revision: crypto.createHash('sha256')
                .update(JSON.stringify([payload.userMessage, payload.assistantReply]))
                .digest('hex')
        }
        : null;
    if (payload.captureChat === false && turnId && !autoTurn) return null;
    if (!matchesSavedAutoTurn(userId, autoTurn)) return null;
    if (autoTurn) {
        Object.assign(metadata, {
            sourceKind: 'chat-turn-auto',
            sourceTurnId: turnId,
            sourceRevision: autoTurn.revision
        });
    }
    payload = { ...payload, metadata };
    const source = normalizeMemoryText(payload.content || `用户：${payload.userMessage || ''}\n八千代：${payload.assistantReply || ''}`);
    if (SENSITIVE_PATTERN.test(source)) return null;
    let candidates = [];
    // The extractor has a bounded input. Never accept its partial reading as the
    // only saved copy of an oversized turn.
    if (source.length <= MAX_AUTO_MEMORY_FRAGMENT_LENGTH) {
        try {
            candidates = await extractMemoryCandidatesWithLLM(payload);
        } catch (error) {
            console.warn('Room memory LLM extractor fallback:', error.message);
        }
    }
    if (!candidates.length) {
        if (!hasLongTermValue(source) && !payload.force) return null;
        const fragments = splitMemoryText(source);
        const fragmentGroupId = fragments.length > 1 ? crypto.randomUUID() : '';
        candidates = fragments.map((content, index) => buildMemoryCandidate({
            ...payload,
            content,
            summary: fragments.length > 1
                ? `${cleanText(payload.summary || content, 240)}（片段 ${index + 1}/${fragments.length}）`
                : payload.summary,
            force: true,
            metadata: {
                ...(payload.metadata || {}),
                ...(fragmentGroupId ? { fragmentGroupId, fragmentIndex: index + 1, fragmentCount: fragments.length } : {})
            }
        })).filter(Boolean);
    }
    // An extractor may occasionally return a large candidate even from a
    // short input. Apply the same lossless fragment rules to its output.
    candidates = candidates.flatMap((candidate) => {
        if (candidate.content.length <= MAX_AUTO_MEMORY_FRAGMENT_LENGTH
            && Buffer.byteLength(candidate.content, 'utf8') <= MAX_AUTO_MEMORY_FRAGMENT_BYTES) return [candidate];
        const fragments = splitMemoryText(candidate.content);
        const fragmentGroupId = crypto.randomUUID();
        return fragments.map((content, index) => buildMemoryCandidate({
            ...candidate,
            content,
            summary: `${cleanText(candidate.summary || content, 240)}（片段 ${index + 1}/${fragments.length}）`,
            force: true,
            metadata: { ...candidate.metadata, fragmentGroupId, fragmentIndex: index + 1, fragmentCount: fragments.length }
        })).filter(Boolean);
    });
    if (!candidates.length) return null;
    const results = [];
    for (const candidate of candidates) {
        const result = await upsertCandidate(userId, candidate, { autoTurn });
        if (result) results.push(result);
    }
    if (!results.length) return null;
    return results.length === 1
        ? results[0]
        : { memory: results.map(item => item.memory), action: results.some(item => item.action === 'merged') ? 'merged' : 'created' };
}

function invalidateAutoTurnMemories(userId, turnId) {
    userId = requireUserId(userId);
    const scopedTurnId = String(turnId || '').trim();
    if (!scopedTurnId) return [];
    const rows = db.prepare('SELECT id, metadata FROM room_memories WHERE user_id = ?').all(userId);
    const ids = rows.filter(row => {
        const metadata = parseJson(row.metadata || '{}', {});
        return metadata.sourceKind === 'chat-turn-auto' && metadata.sourceTurnId === scopedTurnId;
    }).map(row => row.id);
    const remove = db.prepare('DELETE FROM room_memories WHERE id = ? AND user_id = ?');
    ids.forEach(id => {
        remove.run(id, userId);
        queueVectorDeletion(userId, id);
    });
    return ids;
}

function touchMemories(userId, ids) {
    const safeIds = [...new Set(ids.filter(Boolean))];
    if (!safeIds.length) return;
    const touch = db.prepare('UPDATE room_memories SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
    const tx = db.transaction(() => safeIds.forEach(id => touch.run(id, userId)));
    tx();
}

function rowsForMemoryIds(userId, ids) {
    const safeIds = [...new Set(ids.filter(Boolean))];
    if (!safeIds.length) return [];
    const placeholders = safeIds.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT * FROM room_memories
        WHERE user_id = ? AND id IN (${placeholders})
    `).all(userId, ...safeIds);
    const byId = new Map(rows.map(row => [row.id, row]));
    return safeIds.map(id => byId.get(id)).filter(Boolean);
}

function searchSqliteMemories(userId, query, vector, limit = 5, { touch = true } = {}) {
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));
    const queryType = inferMemoryType(query);
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

    if (touch) touchMemories(userId, matched.map(item => item.row.id));

    return matched.map(item => toPublicMemory(item.row, item.score));
}

async function searchMemories(userId, query, limit = 5) {
    userId = requireUserId(userId);
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));
    const vector = await createMemoryEmbedding(query);
    if (milvusStore.status().enabled) {
        await syncPendingUserMemories(userId, { limit: 20 }).catch(() => {});
    }
    const candidateLimit = Math.min(20, Math.max(safeLimit, safeLimit * 3));
    const sqliteResults = searchSqliteMemories(userId, query, vector, candidateLimit, { touch: false });
    const milvusResults = await milvusStore.searchUserMemories({ userId, vector, limit: candidateLimit });
    if (!Array.isArray(milvusResults) || !milvusResults.length) {
        const fallback = sqliteResults.slice(0, safeLimit);
        touchMemories(userId, fallback.map(item => item.id));
        return fallback;
    }

    const localScore = new Map(sqliteResults.map(item => [String(item.id), Number(item.score || 0)]));
    const vectorScore = new Map(milvusResults.map((item) => {
        const raw = Number(item.score || 0);
        return [String(item.id), Math.max(0, Math.min(1, (raw + 1) / 2))];
    }));
    const ids = [...new Set([...vectorScore.keys(), ...localScore.keys()])];
    const matched = rowsForMemoryIds(userId, ids)
        .map((row) => {
            const semantic = vectorScore.get(row.id);
            const local = localScore.get(row.id) || 0;
            const score = semantic == null ? local : (semantic * 0.68) + (local * 0.32);
            return { row, score };
        })
        .filter(item => item.score > 0.16)
        .sort((a, b) => b.score - a.score || String(b.row.updated_at).localeCompare(String(a.row.updated_at)))
        .slice(0, safeLimit);
    touchMemories(userId, matched.map(item => item.row.id));
    return matched.map(item => toPublicMemory(item.row, item.score));
}

async function listMemories(userId, { limit = 50, type = '', q = '' } = {}) {
    userId = requireUserId(userId);
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

function listMemoriesForManagement(userId, { limit = 80, offset = 0, type = '', q = '' } = {}) {
    userId = requireUserId(userId);
    const safeLimit = Math.max(1, Math.min(200, Number.parseInt(limit, 10) || 80));
    const safeOffset = Math.max(0, Math.min(1000000, Number.parseInt(offset, 10) || 0));
    const query = cleanText(q, 500);
    const conditions = ['user_id = ?'];
    const params = [userId];
    const safeType = String(type || '').trim().toLowerCase();
    if (MEMORY_TYPES.has(safeType)) {
        conditions.push('memory_type = ?');
        params.push(safeType);
    }
    if (query) {
        conditions.push('(instr(lower(summary), lower(?)) > 0 OR instr(lower(content), lower(?)) > 0)');
        params.push(query, query);
    }
    const where = conditions.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS count FROM room_memories WHERE ${where}`).get(...params).count;
    const rows = db.prepare(`
        SELECT * FROM room_memories
        WHERE ${where}
        ORDER BY created_at DESC, rowid DESC
        LIMIT ? OFFSET ?
    `).all(...params, safeLimit, safeOffset);
    return {
        items: rows.map(row => toPublicMemory(row)),
        total,
        hasMore: safeOffset + rows.length < total
    };
}

async function searchPersonaMemories(query, limit = 5) {
    const text = cleanText(query, 1000);
    if (!text) return [];
    const vector = await createMemoryEmbedding(text);
    const results = await milvusStore.searchPersonaMemories({
        vector,
        limit: Math.max(1, Math.min(12, Number(limit) || 5))
    });
    if (!Array.isArray(results)) return [];
    return results.map(item => ({
        id: String(item.id || ''),
        type: item.memory_type || 'persona',
        summary: item.summary || '',
        content: item.content || '',
        importance: Number(item.importance || 0),
        score: Number(Number(item.score || 0).toFixed(4))
    })).filter(item => item.id && (item.summary || item.content));
}

function getMemory(userId, id) {
    userId = requireUserId(userId);
    const row = db.prepare('SELECT * FROM room_memories WHERE id = ? AND user_id = ?').get(id, userId);
    return row ? toPublicMemory(row, undefined, { includeContent: true }) : null;
}

async function clearMemories(userId) {
    userId = requireUserId(userId);
    const ids = db.prepare('SELECT id FROM room_memories WHERE user_id = ?').all(userId).map(row => row.id);
    const count = db.prepare('DELETE FROM room_memories WHERE user_id = ?').run(userId).changes;
    ids.forEach(id => queueVectorDeletion(userId, id));
    if (milvusStore.status().enabled) {
        const cleared = await milvusStore.clearUserMemories(userId);
        if (cleared) db.prepare('DELETE FROM room_memory_vector_deletions WHERE user_id = ?').run(userId);
    }
    return count;
}

async function updateMemory(userId, id, payload = {}) {
    userId = requireUserId(userId);
    const existing = db.prepare('SELECT * FROM room_memories WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return null;
    const oldMetadata = parseJson(existing.metadata || '{}', {});
    const type = normalizeType(payload.type || existing.memory_type);
    const summary = payload.summary == null ? existing.summary : normalizeEditedMemoryText(payload.summary);
    const content = payload.content == null ? existing.content : normalizeEditedMemoryText(payload.content);
    if (!summary.trim() || !content.trim()) {
        const error = new Error('记忆摘要和内容不能为空');
        error.statusCode = 400;
        throw error;
    }
    if (summary.length > 800 || content.length > MAX_MEMORY_CONTENT_LENGTH) {
        const error = new Error(`单条记忆摘要最多 800 字、内容最多 ${MAX_MEMORY_CONTENT_LENGTH} 字；原记录未修改`);
        error.statusCode = 413;
        throw error;
    }
    const tags = payload.tags ? uniqueTags(payload.tags) : uniqueTags(oldMetadata.tags || []);
    const importance = Number.isFinite(Number(payload.importance))
        ? Math.max(0, Math.min(1, Number(payload.importance)))
        : Number(existing.importance ?? 0.5);
    const confidence = Number.isFinite(Number(payload.confidence))
        ? Math.max(0, Math.min(1, Number(payload.confidence)))
        : Number(oldMetadata.confidence ?? 0.8);
    // Once a person edits a generated memory it becomes intentional content:
    // replacing the source chat turn must not delete their edit.
    delete oldMetadata.sourceKind;
    delete oldMetadata.sourceTurnId;
    delete oldMetadata.sourceRevision;
    // Commit the edit before any remote embedding await. Otherwise a turn
    // replacement can retire this row while the user's PATCH is in flight.
    // Vector sync will upgrade the local embedding when configured.
    const vector = createEmbedding(`${summary}\n${content}`);
    const metadata = memoryEmbeddingMetadata({ ...oldMetadata, tags, confidence, source: 'manual-edit', editedAt: new Date().toISOString() }, {
        provider: 'local', model: LOCAL_EMBEDDING_VERSION, version: LOCAL_EMBEDDING_VERSION
    });
    const vectorJson = JSON.stringify(vector);
    const metadataJson = JSON.stringify(metadata);
    db.prepare(`
        UPDATE room_memories
        SET memory_type = ?, summary = ?, content = ?, embedding = ?, importance = ?, metadata = ?,
            updated_at = CURRENT_TIMESTAMP, vector_synced_at = NULL, vector_sync_error = ''
        WHERE id = ? AND user_id = ?
    `).run(type, summary, content, vectorJson, importance, metadataJson, id, userId);
    if (embeddingStatus().configuredProvider === 'remote') {
        // Upgrade the immediately saved local vector without holding up PATCH.
        // Compare against the edit we just wrote so a later edit or sync cannot
        // be overwritten by this older embedding request.
        createMemoryEmbeddingDetailed(`${summary}\n${content}`).then((remoteEmbedding) => {
            if (remoteEmbedding.provider !== 'remote') return;
            const remoteMetadata = memoryEmbeddingMetadata(metadata, remoteEmbedding);
            db.prepare(`
                UPDATE room_memories
                SET embedding = ?, metadata = ?, vector_synced_at = NULL, vector_sync_error = ''
                WHERE id = ? AND user_id = ?
                  AND summary = ? AND content = ? AND metadata = ? AND embedding = ?
            `).run(
                JSON.stringify(remoteEmbedding.vector), JSON.stringify(remoteMetadata), id, userId,
                summary, content, metadataJson, vectorJson
            );
        }).catch((error) => console.warn('Room memory edited embedding refresh:', error.message));
    }
    // A vector store is optional. The edit is complete once SQLite commits;
    // status and search retry rows marked as pending without delaying PATCH.
    return getMemory(userId, id);
}

async function deleteMemory(userId, id) {
    userId = requireUserId(userId);
    const count = db.prepare('DELETE FROM room_memories WHERE id = ? AND user_id = ?').run(id, userId).changes;
    if (count) {
        queueVectorDeletion(userId, id);
        await flushPendingVectorDeletions(userId, 20);
    }
    return count;
}

function memoryStats(userId) {
    userId = requireUserId(userId);
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
    const vectorStore = milvusStore.status();
    const vectorSync = vectorStore.enabled
        ? db.prepare(`
            SELECT
                SUM(CASE WHEN vector_synced_at IS NULL OR vector_synced_at < updated_at THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN COALESCE(vector_sync_error, '') <> '' THEN 1 ELSE 0 END) AS failed,
                MAX(vector_synced_at) AS lastSyncedAt
            FROM room_memories
            WHERE user_id = ?
        `).get(userId)
        : { pending: 0, failed: 0, lastSyncedAt: null };
    const pendingDeletions = vectorStore.enabled
        ? db.prepare('SELECT COUNT(*) AS count FROM room_memory_vector_deletions WHERE user_id = ?').get(userId).count
        : 0;
    return {
        count: stats.count || 0,
        avgImportance: Number(Number(stats.avgImportance || 0).toFixed(3)),
        maxPerUser: null,
        maxContentLength: MAX_MEMORY_CONTENT_LENGTH,
        vectorStore,
        embedding: embeddingStatus(),
        vectorSync: {
            pending: Number(vectorSync.pending || 0),
            failed: Number(vectorSync.failed || 0),
            pendingDeletions: Number(pendingDeletions || 0),
            lastSyncedAt: vectorSync.lastSyncedAt || ''
        },
        byType
    };
}

module.exports = {
    createEmbedding,
    similarity,
    buildMemoryCandidate,
    recordMemory,
    invalidateAutoTurnMemories,
    searchMemories,
    searchPersonaMemories,
    listMemories,
    listMemoriesForManagement,
    getMemory,
    updateMemory,
    deleteMemory,
    clearMemories,
    memoryStats,
    syncPendingUserMemories,
    requireUserId
};
