const { MilvusClient, DataType, MetricType, ErrorCode } = require('@zilliz/milvus2-sdk-node');
const { VECTOR_SIZE } = require('./room-embedding');

const COLLECTION_NAME = process.env.ROOM_MEMORY_MILVUS_COLLECTION || 'tsukuyomi_room_memories';
const PERSONA_USER_ID = '__yachiyo_persona__';
const MAX_SUMMARY_FIELD = 1024;
const MAX_TEXT_FIELD = 8192;
const RETRY_COOLDOWN_MS = Math.max(1000, Number.parseInt(process.env.ROOM_MEMORY_MILVUS_RETRY_COOLDOWN_MS || '30000', 10) || 30000);

let clientPromise = null;
let collectionPromise = null;
let lastError = '';
let lastReadyAt = '';
let unavailableUntil = 0;

function isEnabled() {
    return process.env.ROOM_MEMORY_VECTOR_BACKEND === 'milvus' || Boolean(process.env.MILVUS_ADDRESS);
}

function clientConfig() {
    const config = {
        address: process.env.MILVUS_ADDRESS || '127.0.0.1:19530',
        timeout: Number.parseInt(process.env.MILVUS_TIMEOUT_MS || '10000', 10) || 10000,
        logLevel: process.env.MILVUS_LOG_LEVEL || 'error'
    };
    if (process.env.MILVUS_TOKEN) config.token = process.env.MILVUS_TOKEN;
    if (process.env.MILVUS_USERNAME) config.username = process.env.MILVUS_USERNAME;
    if (process.env.MILVUS_PASSWORD) config.password = process.env.MILVUS_PASSWORD;
    if (process.env.MILVUS_DATABASE) config.database = process.env.MILVUS_DATABASE;
    if (process.env.MILVUS_SSL === 'true') config.ssl = true;
    return config;
}

function statusOk(result) {
    const code = result?.status?.error_code || result?.error_code;
    return !code || code === ErrorCode.SUCCESS || code === 'Success';
}

function assertOk(result, operation) {
    if (statusOk(result)) return result;
    const reason = result?.status?.reason || result?.reason || `${operation} failed`;
    throw new Error(reason);
}

function rememberError(error) {
    lastError = error?.message || String(error || '');
    unavailableUntil = Date.now() + RETRY_COOLDOWN_MS;
    return error;
}

function isTemporarilyUnavailable() {
    return unavailableUntil > Date.now();
}

async function getClient() {
    if (!isEnabled() || isTemporarilyUnavailable()) return null;
    if (!clientPromise) {
        clientPromise = (async () => {
            const client = new MilvusClient(clientConfig());
            if (client.connectPromise) await client.connectPromise;
            return client;
        })().catch((error) => {
            clientPromise = null;
            throw rememberError(error);
        });
    }
    return clientPromise;
}

function collectionFields({ partitionKey = true } = {}) {
    return [
        { name: 'id', data_type: DataType.VarChar, is_primary_key: true, max_length: 80 },
        { name: 'scope', data_type: DataType.VarChar, max_length: 24 },
        { name: 'user_id', data_type: DataType.VarChar, max_length: 128, ...(partitionKey ? { is_partition_key: true } : {}) },
        { name: 'memory_type', data_type: DataType.VarChar, max_length: 32 },
        { name: 'summary', data_type: DataType.VarChar, max_length: MAX_SUMMARY_FIELD },
        { name: 'content', data_type: DataType.VarChar, max_length: MAX_TEXT_FIELD },
        { name: 'importance', data_type: DataType.Float },
        { name: 'updated_ts', data_type: DataType.Int64 },
        { name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_SIZE }
    ];
}

async function createCollection(client, partitionKey = true) {
    return assertOk(await client.createCollection({
        collection_name: COLLECTION_NAME,
        fields: collectionFields({ partitionKey }),
        index_params: [{
            field_name: 'vector',
            index_type: process.env.ROOM_MEMORY_MILVUS_INDEX || 'HNSW',
            metric_type: MetricType.COSINE,
            params: { M: 16, efConstruction: 256 }
        }],
        enable_dynamic_field: false,
        ...(partitionKey ? { num_partitions: Number.parseInt(process.env.ROOM_MEMORY_MILVUS_PARTITIONS || '64', 10) || 64 } : {})
    }), 'createCollection');
}

async function ensureCollection() {
    if (!isEnabled() || isTemporarilyUnavailable()) return null;
    if (!collectionPromise) {
        collectionPromise = (async () => {
            const client = await getClient();
            const exists = await client.hasCollection({ collection_name: COLLECTION_NAME });
            if (!exists?.value) {
                try {
                    await createCollection(client, true);
                } catch (error) {
                    if (process.env.ROOM_MEMORY_MILVUS_REQUIRE_PARTITION_KEY === 'true') throw error;
                    console.warn('Milvus partition key create failed, retrying without partition key:', error.message);
                    await createCollection(client, false);
                }
            }
            await client.loadCollection({ collection_name: COLLECTION_NAME }).catch((error) => {
                if (!/already loaded|loaded/i.test(String(error?.message || ''))) throw error;
            });
            lastReadyAt = new Date().toISOString();
            unavailableUntil = 0;
            return client;
        })().catch((error) => {
            collectionPromise = null;
            throw rememberError(error);
        });
    }
    return collectionPromise;
}

function escapeFilterValue(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function filterEquals(field, value) {
    return `${field} == "${escapeFilterValue(value)}"`;
}

function scopeFilter(scope, userId, type = '') {
    const filters = [filterEquals('scope', scope), filterEquals('user_id', userId)];
    if (type) filters.push(filterEquals('memory_type', type));
    return filters.join(' AND ');
}

function truncateUtf8(value, maxBytes) {
    const text = String(value || '');
    const safeLimit = Math.max(0, Number(maxBytes) || 0);
    if (Buffer.byteLength(text, 'utf8') <= safeLimit) return text;

    const characters = [];
    let bytes = 0;
    for (const character of text) {
        const characterBytes = Buffer.byteLength(character, 'utf8');
        if (bytes + characterBytes > safeLimit) break;
        characters.push(character);
        bytes += characterBytes;
    }
    return characters.join('');
}

function rowForMemory({ id, userId, type, summary, content, importance, vector, scope = 'user' }) {
    return {
        id: truncateUtf8(id, 80),
        scope: truncateUtf8(scope, 24),
        user_id: truncateUtf8(userId, 128),
        memory_type: truncateUtf8(type || 'conversation', 32),
        summary: truncateUtf8(summary, MAX_SUMMARY_FIELD),
        content: truncateUtf8(content || summary, MAX_TEXT_FIELD),
        importance: Number.isFinite(Number(importance)) ? Number(importance) : 0.5,
        updated_ts: Date.now(),
        vector
    };
}

async function upsertRow(row) {
    const client = await ensureCollection();
    if (!client) return false;
    try {
        assertOk(await client.upsert({
            collection_name: COLLECTION_NAME,
            data: [row]
        }), 'upsert');
    } catch (error) {
        await client.delete({
            collection_name: COLLECTION_NAME,
            filter: `${scopeFilter(row.scope, row.user_id)} AND ${filterEquals('id', row.id)}`
        }).catch(() => {});
        assertOk(await client.insert({
            collection_name: COLLECTION_NAME,
            data: [row]
        }), 'insert');
    }
    lastError = '';
    unavailableUntil = 0;
    return true;
}

async function upsertUserMemory(payload) {
    if (!isEnabled()) return false;
    return upsertRow(rowForMemory({ ...payload, scope: 'user' })).catch((error) => {
        rememberError(error);
        console.warn('Milvus user memory upsert failed:', error.message);
        return false;
    });
}

async function upsertPersonaMemory(payload) {
    if (!isEnabled()) return false;
    return upsertRow(rowForMemory({
        ...payload,
        userId: PERSONA_USER_ID,
        type: payload.type || 'persona',
        scope: 'persona'
    })).catch((error) => {
        rememberError(error);
        console.warn('Milvus persona memory upsert failed:', error.message);
        return false;
    });
}

function flattenSearchResults(results) {
    if (!Array.isArray(results)) return [];
    return Array.isArray(results[0]) ? results.flat() : results;
}

async function search({ scope, userId, vector, limit = 5, type = '', outputFields = ['id', 'memory_type', 'summary', 'content', 'importance', 'updated_ts'] }) {
    if (!isEnabled()) return null;
    const client = await ensureCollection();
    if (!client) return null;
    const response = await client.search({
        collection_name: COLLECTION_NAME,
        data: [vector],
        anns_field: 'vector',
        limit: Math.max(1, Math.min(50, Number(limit) || 5)),
        filter: scopeFilter(scope, userId, type),
        output_fields: outputFields,
        metric_type: MetricType.COSINE,
        consistency_level: process.env.ROOM_MEMORY_MILVUS_CONSISTENCY || 'Strong',
        params: { ef: Number.parseInt(process.env.ROOM_MEMORY_MILVUS_SEARCH_EF || '64', 10) || 64 }
    });
    assertOk(response, 'search');
    return flattenSearchResults(response.results);
}

async function searchUserMemories({ userId, vector, limit = 5, type = '' }) {
    return search({ scope: 'user', userId, vector, limit, type }).catch((error) => {
        rememberError(error);
        console.warn('Milvus user memory search failed:', error.message);
        return null;
    });
}

async function searchPersonaMemories({ vector, limit = 5 }) {
    return search({
        scope: 'persona',
        userId: PERSONA_USER_ID,
        vector,
        limit,
        type: ''
    }).catch((error) => {
        rememberError(error);
        console.warn('Milvus persona search failed:', error.message);
        return null;
    });
}

async function deleteByFilter(filter) {
    if (!isEnabled()) return false;
    const client = await ensureCollection();
    if (!client) return false;
    assertOk(await client.delete({ collection_name: COLLECTION_NAME, filter }), 'delete');
    return true;
}

async function deleteUserMemory(userId, id) {
    return deleteByFilter(`${scopeFilter('user', userId)} AND ${filterEquals('id', id)}`).catch((error) => {
        rememberError(error);
        return false;
    });
}

async function clearUserMemories(userId) {
    return deleteByFilter(scopeFilter('user', userId)).catch((error) => {
        rememberError(error);
        return false;
    });
}

async function clearPersonaMemories(source = '') {
    const filter = source
        ? `${scopeFilter('persona', PERSONA_USER_ID)} AND ${filterEquals('memory_type', source)}`
        : scopeFilter('persona', PERSONA_USER_ID);
    return deleteByFilter(filter).catch((error) => {
        rememberError(error);
        return false;
    });
}

function status() {
    return {
        enabled: isEnabled(),
        backend: isEnabled() ? 'milvus' : 'sqlite-fallback',
        collection: COLLECTION_NAME,
        dimension: VECTOR_SIZE,
        address: process.env.MILVUS_ADDRESS || '',
        readyAt: lastReadyAt,
        cooldownUntil: unavailableUntil > Date.now() ? new Date(unavailableUntil).toISOString() : '',
        consistency: process.env.ROOM_MEMORY_MILVUS_CONSISTENCY || 'Strong',
        lastError
    };
}

module.exports = {
    PERSONA_USER_ID,
    COLLECTION_NAME,
    status,
    ensureCollection,
    upsertUserMemory,
    upsertPersonaMemory,
    searchUserMemories,
    searchPersonaMemories,
    deleteUserMemory,
    clearUserMemories,
    clearPersonaMemories,
    scopeFilter,
    truncateUtf8
};
