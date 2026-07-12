const DEFAULT_VECTOR_SIZE = Math.max(8, Math.min(4096, Number.parseInt(process.env.ROOM_MEMORY_VECTOR_DIM || '96', 10) || 96));
const EMBEDDING_TIMEOUT_MS = Math.max(1000, Number.parseInt(process.env.ROOM_MEMORY_EMBEDDING_TIMEOUT_MS || '10000', 10) || 10000);
const LOCAL_EMBEDDING_VERSION = 'feature-hash-v2';

let lastProvider = '';
let lastModel = '';
let lastError = '';
let lastEmbeddedAt = '';

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
    const features = words.map(token => ({ token: `t:${token}`, weight: 1 }));
    for (let index = 0; index < words.length - 1; index += 1) {
        features.push({ token: `b:${words[index]}${words[index + 1]}`, weight: 1.35 });
    }
    for (let index = 0; index < words.length - 2; index += 1) {
        features.push({ token: `g:${words[index]}${words[index + 1]}${words[index + 2]}`, weight: 0.85 });
    }
    return features;
}

function normalizeVector(vector, dimension = DEFAULT_VECTOR_SIZE) {
    const values = Array.from({ length: dimension }, (_, index) => {
        const value = Number(Array.isArray(vector) ? vector[index] : 0);
        return Number.isFinite(value) ? value : 0;
    });
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
    return values.map(value => Number((value / norm).toFixed(6)));
}

function createEmbedding(text, dimension = DEFAULT_VECTOR_SIZE) {
    const vector = Array(dimension).fill(0);
    tokenize(text).forEach(({ token, weight }) => {
        const hash = hashString(token);
        const slot = hash % dimension;
        vector[slot] += (hash & 1) ? weight : -weight;
        const secondarySlot = ((hash >>> 8) ^ hash) % dimension;
        vector[secondarySlot] += (hash & 2) ? weight * 0.35 : -weight * 0.35;
    });
    return normalizeVector(vector, dimension);
}

function embeddingConfig() {
    const apiUrl = String(process.env.ROOM_MEMORY_EMBEDDING_API_URL || '').trim();
    const apiKey = String(process.env.ROOM_MEMORY_EMBEDDING_API_KEY || process.env.LLM_API_KEY || '').trim();
    const model = String(process.env.ROOM_MEMORY_EMBEDDING_MODEL || 'text-embedding-3-small').trim();
    return { apiUrl, apiKey, model };
}

async function createRemoteEmbedding(text) {
    const { apiUrl, apiKey, model } = embeddingConfig();
    if (!apiUrl || !apiKey || typeof fetch !== 'function') return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
    try {
        const body = {
            model,
            input: String(text || '').slice(0, 8000)
        };
        if (process.env.ROOM_MEMORY_EMBEDDING_SEND_DIMENSIONS !== 'false') {
            body.dimensions = DEFAULT_VECTOR_SIZE;
        }
        const response = await fetch(apiUrl, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`embedding HTTP ${response.status}`);
        const data = await response.json();
        const vector = data?.data?.[0]?.embedding || data?.embedding || data?.embeddings?.[0];
        return Array.isArray(vector) ? normalizeVector(vector, DEFAULT_VECTOR_SIZE) : null;
    } finally {
        clearTimeout(timeout);
    }
}

async function createMemoryEmbedding(text) {
    return (await createMemoryEmbeddingDetailed(text)).vector;
}

async function createMemoryEmbeddingDetailed(text) {
    const { apiUrl, model } = embeddingConfig();
    try {
        const remote = await createRemoteEmbedding(text);
        if (remote) {
            lastProvider = 'remote';
            lastModel = model;
            lastError = '';
            lastEmbeddedAt = new Date().toISOString();
            return { vector: remote, provider: 'remote', model, version: `remote:${model}` };
        }
    } catch (error) {
        if (process.env.ROOM_MEMORY_EMBEDDING_STRICT === 'true') throw error;
        lastError = error.message;
        console.warn('Room memory embedding fallback:', error.message);
    }
    lastProvider = 'local';
    lastModel = LOCAL_EMBEDDING_VERSION;
    lastEmbeddedAt = new Date().toISOString();
    return {
        vector: createEmbedding(text, DEFAULT_VECTOR_SIZE),
        provider: 'local',
        model: LOCAL_EMBEDDING_VERSION,
        version: LOCAL_EMBEDDING_VERSION,
        ...(apiUrl && lastError ? { fallbackReason: lastError } : {})
    };
}

function embeddingStatus() {
    const config = embeddingConfig();
    return {
        configuredProvider: config.apiUrl && config.apiKey ? 'remote' : 'local',
        configuredModel: config.apiUrl && config.apiKey ? config.model : LOCAL_EMBEDDING_VERSION,
        activeProvider: lastProvider || (config.apiUrl && config.apiKey ? 'remote' : 'local'),
        activeModel: lastModel || (config.apiUrl && config.apiKey ? config.model : LOCAL_EMBEDDING_VERSION),
        dimension: DEFAULT_VECTOR_SIZE,
        lastEmbeddedAt,
        lastError
    };
}

module.exports = {
    VECTOR_SIZE: DEFAULT_VECTOR_SIZE,
    LOCAL_EMBEDDING_VERSION,
    createEmbedding,
    createMemoryEmbedding,
    createMemoryEmbeddingDetailed,
    embeddingStatus,
    normalizeVector
};
