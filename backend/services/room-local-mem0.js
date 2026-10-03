const crypto = require('node:crypto');
const local = require('./room-local-client');
const { unicodeSlice } = require('../../shared/unicode-slice.cjs');
let instance;
let inFlight = 0;

// Mem0's generic LangChain vector wrapper drops filters. This adapter implements
// the native store contract instead, requiring owner filtering on every query.
function adapter() {
    return {
        async initialize() {},
        async insert(vectors, ids, payloads) {
            for (let i = 0; i < vectors.length; i++) {
                const payload = payloads[i];
                if (!payload.user_id || !payload.sourceId || !payload.chunkId) throw new Error('Missing owned source');
                const id = crypto.createHash('sha256').update(JSON.stringify([payload.user_id, payload.sourceId, payload.chunkId])).digest('hex');
                await local.request('/upsert', { id, userId: payload.user_id, vector: local.vector(vectors[i]), payload }, 10000);
            }
        },
        async search(query, topK, filters) {
            if (!filters?.user_id) throw new Error('Owner filter required');
            return (await local.request('/search', { userId: String(filters.user_id), vector: local.vector(query), limit: Math.min(40, topK || 20) })).results;
        },
        async list(filters, topK = 100) {
            if (!filters?.user_id) throw new Error('Owner filter required');
            const result = await local.request('/list', { userId: String(filters.user_id), limit: Math.min(100, topK) });
            return [result.results, result.results.length];
        },
        async get() { throw new Error('Unscoped get is disabled'); },
        async update() { throw new Error('Use owned source replacement'); },
        async delete() { throw new Error('Use owned source deletion'); },
        async deleteCol() { throw new Error('Collection deletion is disabled'); }
    };
}

function memory() {
    if (!instance) {
        process.env.MEM0_TELEMETRY = 'false';
        process.env.DOTENV_CONFIG_QUIET = 'true';
        const { Memory } = require('mem0ai/oss');
        instance = new Memory({ disableHistory: true,
            embedder: { provider: 'langchain', config: { model: {
                embedQuery: async text => local.vector((await local.request('/embed', { text, query: true })).vector),
                embedDocuments: async texts => {
                    const vectors = [];
                    for (const text of texts) vectors.push(local.vector((await local.request('/embed', { text }, 10000)).vector));
                    return vectors;
                }
            } } },
            vectorStore: { provider: 'memory', config: { dimension: 512, dbPath: ':memory:' } },
            llm: { provider: 'openai', config: { apiKey: 'unused-local-verbatim-mode', baseURL: 'http://127.0.0.1:9/v1' } }
        });
        instance.vectorStore = adapter();
        // The SDK's LangChain embedder ignores the action argument. Preserve
        // BGE's query-only instruction explicitly in the native embed contract.
        instance.embedder = {
            embed: async (text, action) => local.vector((await local.request('/embed', { text, query: action === 'search' }, action === 'search' ? 1800 : 10000)).vector)
        };
    }
    return instance;
}

async function search(userId, query, getRows, limit) {
    const fallback = reason => ({ results: [], backend: 'sqlite', fallback: true, reason });
    if (inFlight >= 2) return fallback('local_busy');
    inFlight++;
    try {
        const sdk = memory();
        const embedding = await sdk.embedder.embed(unicodeSlice(query, 0, 700), 'search');
        // Room performs its own relevance/evidence ranking. Use Mem0's native
        // vector contract directly: no unused entity graph, duplicate hybrid
        // reranking, extra embedding work, or graph-provider fallback.
        const found = await sdk.vectorStore.search(embedding, limit, { user_id: userId });
        const current = new Map(getRows(found.map(item => item.payload?.sourceId)).map(row => [row.id, row]));
        const bySource = new Map();
        for (const item of found) {
            const row = current.get(item.payload?.sourceId);
            if (!row || item.payload.sourceHash !== local.sourceHash(row)) continue;
            const entry = { id: row.id, score: item.score, context: item.payload.data || item.payload.chunkText };
            if (!bySource.has(row.id) || entry.score > bySource.get(row.id).score) bySource.set(row.id, entry);
        }
        return { results: [...bySource.values()], backend: 'mem0-local-semantic', fallback: false };
    } catch (error) {
        return fallback(error.code === 'LOCAL_TIMEOUT' ? 'local_timeout' : 'local_unavailable');
    } finally { inFlight--; }
}

async function index(row) {
    const hash = local.sourceHash(row);
    const chunks = [];
    for (let offset = 0; offset < row.content.length; offset += 350) chunks.push(unicodeSlice(row.content, offset, offset + 400));
    let facts = [];
    try { facts = JSON.parse(row.metadata || '{}').analysis?.evidence || []; } catch {}
    for (const fact of facts.filter(item => item.confidence >= 0.5)) {
        const label = { health: '健康与安全、饮食与身体反应', preference: '用户的长期偏好', name: '用户姓名与称呼', birthday: '用户生日', plan: '计划与约定', project: '项目与工作' }[fact.attribute];
        if (label) chunks.push(`${label}，用户原话：${fact.quote}`);
    }
    for (let i = 0; i < chunks.length; i++) {
        await memory().add(chunks[i], { userId: row.user_id, infer: false, metadata: {
            sourceId: row.id, sourceHash: hash, chunkId: String(i), chunkText: chunks[i], sourceDate: row.created_at
        } });
    }
    await local.request('/retire', { userId: row.user_id, sourceId: row.id, keepHash: hash, chunkCount: chunks.length }, 10000);
    return hash;
}

module.exports = { search, index, adapter, memory };
