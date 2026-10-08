const assert = require('node:assert/strict');
const { test } = require('node:test');
const { webcrypto } = require('node:crypto');
const registry = require('../shared/model-catalog.cjs');
const { createModelCatalogService } = require('../backend/services/room-model-catalog');
const silicon = { apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', apiKey: 'fixture-provider-key' };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let frontend;
test.before(async () => { frontend = await import('../src/frontend/services/room/roomModelCatalog.mjs'); });

test('hosting endpoint identifies providers regardless of model author or malicious hostname lookalikes', () => {
    assert.equal(registry.detectProvider(silicon.apiUrl, 'deepseek-ai/DeepSeek-V3'), 'siliconflow');
    assert.equal(registry.detectProvider('https://api.groq.com/openai/v1/chat/completions', 'qwen/qwen3'), 'groq');
    for (const url of ['https://api.openai.com.attacker.test/v1/chat/completions', 'http://api.openai.com/v1/chat/completions', 'https://key@api.openai.com/v1/chat/completions', 'https://api.openai.com:8443/v1/chat/completions'])
        assert.throws(() => registry.catalogPlan({ ...silicon, apiUrl: url }), { code: 'UNSUPPORTED' });
});
test('plans retain regions, fixed paths, Gemini header auth and workspace validation', () => {
    const gemini = registry.catalogPlan({ ...silicon, apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' });
    assert.equal(gemini.headers['x-goog-api-key'], silicon.apiKey);
    assert.ok(!gemini.url.includes(silicon.apiKey));
    assert.throws(() => registry.catalogPlan({ ...silicon, apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' }), { code: 'WORKSPACE_REQUIRED' });
    const cn = registry.catalogPlan({ ...silicon, apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', workspaceId: 'workspace-123' });
    assert.equal(new URL(cn.url).hostname, 'workspace-123.cn-beijing.maas.aliyuncs.com');
    assert.throws(() => registry.catalogPlan({ ...silicon, cursor: 'https://attacker.test' }), { code: 'INVALID_CURSOR' });
    assert.throws(() => registry.catalogPlan({ ...silicon, apiKey: 'key\r\nInjected: bad' }), { code: 'INVALID_KEY' });
});
test('normalization preserves exact organization IDs, deduplicates and excludes explicit non-chat models', () => {
    const page = registry.normalizePage({ data: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek', created: 100 }, { id: 'Qwen/Qwen3-VL' },
        { id: 'Qwen/Qwen3-VL' }, { id: 'vendor/rerank-v2' }, { id: 'vendor/closed', active: false }] }, registry.catalogPlan(silicon));
    assert.deepEqual(page.models.map(m => m.nativeId), ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-VL']);
    const mistral = registry.catalogPlan({ ...silicon, apiUrl: 'https://api.mistral.ai/v1/chat/completions' });
    assert.equal(registry.normalizePage({ data: [{ id: 'vision-chat', capabilities: { vision: true, completion_chat: true } }, { id: 'fim', capabilities: { completion_chat: false } }] }, mistral).models.length, 1);
});
test('cache is scoped by key, endpoint, region and workspace without storing raw keys', async () => {
    const map = new Map(), storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
    const a = await frontend.catalogScope(silicon, { crypto: webcrypto, storage });
    const b = await frontend.catalogScope({ ...silicon, apiKey: 'other-fixture-key' }, { crypto: webcrypto, storage });
    assert.notEqual(a, b);
    const entry = { models: registry.normalizePage({ data: [{ id: 'vendor/chat' }] }, registry.catalogPlan(silicon)).models, updatedAt: new Date().toISOString(), apiKey: silicon.apiKey };
    frontend.writeCatalogCache(a, entry, storage);
    assert.ok(frontend.readCatalogCache(a, storage).fresh);
    assert.equal(frontend.readCatalogCache(b, storage), null);
    assert.ok(![...map.values()].join('').includes(silicon.apiKey));
    assert.equal(frontend.readCatalogCache(a, storage, Date.now() + 7 * 3600000).fresh, false);
    assert.equal(frontend.readCatalogCache(a, storage, Date.now() + 8 * 86400000), null);
    frontend.writeCatalogCache(a, entry, { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } });
});
test('Gemini pagination follows tokens with exact chat model IDs and cannot repeat a cursor', async () => {
    const calls = [];
    const settings = { ...silicon, apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' };
    const result = await frontend.fetchModelCatalog(settings, { fetch: async url => {
        calls.push(new URL(url)); return response(calls.length === 1 ? { models: [{ name: 'models/gemini-chat', supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'next' }
            : { models: [{ name: 'models/gemini-new-chat', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }] });
    } });
    assert.equal(calls[1].searchParams.get('pageToken'), 'next');
    assert.deepEqual(result.models.map(m => m.id), ['gemini-chat', 'gemini-new-chat']);
    await assert.rejects(frontend.fetchModelCatalog(settings, { fetch: async () => response({ models: [], nextPageToken: 'same' }) }), { code: 'INVALID_RESPONSE' });
});
test('direct CORS failure falls back once to a read-only relay with no browser credentials', async () => {
    let direct = 0, relayed = 0;
    const service = createModelCatalogService({ fetch: async (url, options) => {
        assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
        assert.deepEqual(options.allowedHostnames, ['api.siliconflow.cn']);
        return response({ data: [{ id: 'vendor/new-chat' }] });
    } });
    const result = await frontend.fetchModelCatalog(silicon, { fetch: async (_, options) => {
        direct++; assert.equal(options.credentials, 'omit'); throw new TypeError('CORS');
    }, relay: async body => { relayed++; return response({ success: true, data: await service.page(body) }); } });
    assert.equal(direct, 1); assert.equal(relayed, 1); assert.equal(result.models[0].id, 'vendor/new-chat');
});
test('auth and limit failures are explicit, do not read error secrets and never retry through relay', async () => {
    for (const [status, code] of [[401, 'AUTH_FAILED'], [403, 'ACCESS_DENIED'], [429, 'RATE_LIMIT']]) {
        let relayed = false;
        await assert.rejects(frontend.fetchModelCatalog(silicon, { fetch: async () => response({ secret: 'upstream-secret' }, status), relay: () => { relayed = true; } }), e => e.code === code && !e.message.includes('upstream-secret'));
        assert.equal(relayed, false);
    }
});
test('server bounds headers and full body including stalled body, malformed and oversized JSON', async () => {
    for (const data of ['invalid-json', JSON.stringify({ data: 'invalid' }), 'x'.repeat(registry.MAX_PAGE_BYTES + 1)]) {
        const service = createModelCatalogService({ fetch: async () => new Response(data) });
        await assert.rejects(service.page(silicon), e => ['INVALID_RESPONSE', 'RESPONSE_TOO_LARGE'].includes(e.code));
    }
    for (const mode of ['headers', 'body']) {
        const service = createModelCatalogService({ timeoutMs: 20, fetch: () => mode === 'headers' ? new Promise(() => {})
            : Promise.resolve(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"data":')); } }))) });
        await assert.rejects(service.page(silicon), { code: 'TIMEOUT' });
    }
});
test('client whole-operation timeout covers stalled response bodies', async () => {
    await assert.rejects(frontend.fetchModelCatalog(silicon, { timeoutMs: 20, fetch: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } })) }), { code: 'TIMEOUT' });
});
test('server concurrency is capped and socket errors redact secret-bearing messages', async () => {
    let finish;
    const service = createModelCatalogService({ maxActive: 1, fetch: () => new Promise(resolve => { finish = resolve; }) });
    const first = service.page(silicon);
    await assert.rejects(service.page(silicon), { code: 'BUSY' });
    finish(response({ data: [] })); await first;
    for (const code of ['ETIMEDOUT', 'ENOTFOUND', 'CERT_HAS_EXPIRED', 'REDIRECT_BLOCKED']) {
        const failed = createModelCatalogService({ fetch: async () => { throw Object.assign(new Error('secret ' + silicon.apiKey), { code }); } });
        await assert.rejects(failed.page(silicon), e => !e.message.includes(silicon.apiKey));
    }
});
test('only public OpenRouter catalogue is single-flighted, never personal lists', async () => {
    let calls = 0;
    const service = createModelCatalogService({ fetch: async () => { calls++; return response({ data: [{ id: 'vendor/chat' }] }); } });
    await Promise.all([service.publicOpenRouter(), service.publicOpenRouter()]);
    assert.equal(calls, 1);
    await service.publicOpenRouter(); assert.equal(calls, 1);
    await service.page(silicon); await service.page(silicon); assert.equal(calls, 3);
});
