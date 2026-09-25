const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../config');
const { VECTOR_SIZE, createMemoryEmbeddingDetailed, embeddingStatus } = require('./room-embedding');

// Mem0 runs locally. Do not send usage events or private memory to its cloud.
process.env.MEM0_TELEMETRY = 'false';
process.env.DOTENV_CONFIG_QUIET = 'true';
const queues = new Map();
let instance;
let initialized = false;
let lastError = '';
let lastSyncedAt = '';
const enabled = process.env.ROOM_MEMORY_BACKEND !== 'sqlite';

function embeddingVersion() {
    const status = embeddingStatus();
    return `${status.configuredProvider}:${status.configuredModel}:${VECTOR_SIZE}`;
}

function sourceHash(row) {
    return crypto.createHash('sha256').update(JSON.stringify([row.summary, row.content, embeddingVersion()])).digest('hex');
}

async function embed(text) {
    const expected = embeddingStatus();
    const result = await createMemoryEmbeddingDetailed(text);
    // A remote outage must not mix feature-hash vectors with semantic vectors.
    if (result.provider !== expected.configuredProvider || result.model !== expected.configuredModel) {
        throw new Error('Configured memory embedding is unavailable');
    }
    return result.vector;
}

function memory() {
    if (!enabled) throw new Error('Mem0 is disabled');
    if (!instance) {
        const { Memory } = require('mem0ai/oss');
        instance = new Memory({
            disableHistory: true,
            embedder: { provider: 'langchain', config: { model: {
                embedQuery: embed,
                embedDocuments: texts => Promise.all(texts.map(embed))
            } } },
            vectorStore: { provider: 'memory', config: {
                collectionName: 'room_user_memories',
                dimension: VECTOR_SIZE,
                dbPath: process.env.ROOM_MEM0_DB_PATH || path.join(path.dirname(config.dbPath), 'room-mem0.db')
            } },
            // add(infer:false) preserves the complete source without an LLM.
            // This unused client cannot contact a cloud provider accidentally.
            llm: { provider: 'openai', config: { apiKey: 'unused-local-verbatim-mode', baseURL: 'http://127.0.0.1:9/v1' } }
        });
    }
    return instance;
}

function serialized(userId, work) {
    const prior = queues.get(userId) || Promise.resolve();
    const pending = prior.catch(() => {}).then(work);
    queues.set(userId, pending);
    pending.finally(() => { if (queues.get(userId) === pending) queues.delete(userId); }).catch(() => {});
    return pending;
}

// SQLite remains authoritative for ownership, edits and deletion. Index records
// are only references: search callers must hydrate them from owned source rows.
async function sync(userId, getRows, indexNew = true) {
    const sdk = memory();
    const rows = getRows();
    const sources = new Map(rows.map(row => [row.id, row]));
    const existing = await sdk.getAll({ filters: { user_id: userId }, topK: 1_000_000 });
    const bySource = new Map();
    for (const item of existing.results || []) {
        const sourceId = item.metadata?.sourceId;
        if (!sources.has(sourceId) || bySource.has(sourceId)
            || (!indexNew && item.metadata?.sourceHash !== sourceHash(sources.get(sourceId)))) await sdk.delete(item.id);
        else bySource.set(sourceId, item);
    }
    let written = 0;
    const deadline = Date.now() + 4000;
    for (const row of indexNew ? rows : []) {
        const hash = sourceHash(row);
        const previous = bySource.get(row.id);
        if (previous?.metadata?.sourceHash === hash) continue;
        if (Date.now() > deadline) throw new Error('Mem0 index catch-up pending');
        const metadata = { sourceId: row.id, sourceHash: hash, sourceDate: row.created_at, type: row.memory_type };
        // Replace the index entry so a changed embedder cannot leave stale text.
        if (previous) await sdk.delete(previous.id);
        await sdk.add(row.content, { userId, infer: false, metadata });
        written++;
    }
    initialized = true;
    lastError = '';
    lastSyncedAt = new Date().toISOString();
    return { indexed: rows.length, written };
}

async function search(userId, query, getRows, limit = 20) {
    if (!enabled) return { results: [], backend: 'sqlite', fallback: true };
    return serialized(userId, async () => {
        try {
            const index = await sync(userId, getRows);
            const found = await memory().search(query, { filters: { user_id: userId }, topK: limit, threshold: 0.05 });
            // Re-read after every await: an edit/deletion during embedding must
            // never inject the old index text into a subsequent model request.
            const current = new Map(getRows().map(row => [row.id, row]));
            const results = (found.results || []).flatMap(item => {
                const row = current.get(item.metadata?.sourceId);
                return row && item.metadata?.sourceHash === sourceHash(row)
                    ? [{ id: row.id, score: Number(item.score) || 0 }] : [];
            });
            return { results, backend: 'mem0', fallback: false, ...index };
        } catch (error) {
            lastError = error?.code || error?.name || 'Mem0Unavailable';
            // Never log private text, provider responses or credentials.
            console.warn('Room Mem0 unavailable; using source-memory retrieval:', lastError);
            return { results: [], backend: 'sqlite', fallback: true };
        }
    });
}

function reconcile(userId, getRows) {
    if (!enabled) return Promise.resolve();
    // Editing/deletion retires stale index text immediately; embedding new text
    // is deferred to retrieval so an offline remote embedder cannot block edits.
    return serialized(userId, () => sync(userId, getRows, false)).catch(error => {
        lastError = error?.code || error?.name || 'Mem0Unavailable';
        throw error;
    });
}

function status() {
    return { enabled, backend: enabled ? 'mem0' : 'sqlite', initialized, storage: 'local-sqlite', mode: 'verbatim', lastError, lastSyncedAt };
}

module.exports = { search, reconcile, status };
