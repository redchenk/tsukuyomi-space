const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

const code = buildSync({
    stdin: { contents: `
        export * from './src/frontend/services/room/gptSovitsControl.mjs';
        export * from './src/frontend/services/room/localOllamaTransport.js';
        export * from './src/frontend/services/room/roomStorage.js';
    `, resolveDir: path.resolve(__dirname, '..') },
    bundle: true, write: false, platform: 'node', format: 'cjs'
}).outputFiles[0].text;

function fixture(protocol = 'https:') {
    const images = [], timers = new Map(), values = new Map();
    let nextTimer = 0, failRead = false, failWrite = false;
    const context = {
        module: { exports: {} }, URL,
        Image: class { constructor() { images.push(this); } },
        window: {
            location: { protocol },
            setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
            clearTimeout(id) { timers.delete(id); }
        },
        localStorage: {
            getItem(key) { if (failRead) throw new Error('storage denied'); return values.get(key) ?? null; },
            setItem(key, value) { if (failWrite) throw new Error('quota exceeded'); values.set(key, value); }
        }
    };
    vm.runInNewContext(code, context);
    return { api: context.module.exports, images, timers, values,
        failRead: () => { failRead = true; }, failWrite: () => { failWrite = true; } };
}

test('Ollama endpoints retain native, compatible, query, IPv6 and remote behavior', () => {
    const { api } = fixture();
    for (const [input, output, local, native] of [
        ['', 'http://localhost:11434/api/chat', false, false],
        ['127.0.0.1:11434', 'http://localhost:11434/api/chat', true, true],
        ['http://[::1]:11434/api', 'http://localhost:11434/api/chat', true, true],
        ['https://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions', true, false],
        ['http://localhost:11434/api/chat?keep=1#state', 'http://localhost:11434/api/chat?keep=1#state', true, true],
        ['https://models.example.test/v1', 'https://models.example.test/v1/chat/completions', false, false],
        ['http://localhost:8080/api', 'http://localhost:8080/api/chat', false, false]
    ]) {
        assert.equal(api.normalizeOllamaUrl(input), output, input);
        assert.equal(api.isOllamaApi(input), local, input);
        assert.equal(api.isOllamaNativeApi(input), native, input);
    }
    assert.equal(api.isOllamaApi('not a URL'), false);
    assert.equal(api.isOllamaNativeApi('not a URL'), false);
    assert.throws(() => api.normalizeOllamaUrl('not a URL'));
});

test('GPT-SoVITS normalization preserves the token and only rewrites HTTP IPv4 on HTTPS pages', () => {
    const https = fixture().api, http = fixture('http:').api;
    assert.equal(https.normalizeLocalGptSovitsUrl('').href, 'http://localhost:9880/tts');
    const endpoint = 'http://127.0.0.1:9880/tts?oneclick_token=fixture';
    assert.equal(https.normalizeLocalGptSovitsUrl(endpoint).href, endpoint.replace('127.0.0.1', 'localhost'));
    assert.equal(http.normalizeLocalGptSovitsUrl(endpoint).href, endpoint);
    for (const endpoint of ['https://speech.example.test/tts?token=fixture', 'http://[::1]:9880/tts']) {
        assert.equal(https.normalizeLocalGptSovitsUrl(endpoint).href, endpoint);
    }
});

test('weight control preserves receipt, timeout and late-response behavior', async () => {
    for (const event of ['onload', 'onerror']) {
        const f = fixture();
        const request = f.api.requestLocalGptSovitsControl('/set_gpt_weights?oneclick_token=fixture');
        assert.equal(f.images.length, 1);
        assert.equal(f.images[0].src, '/set_gpt_weights?oneclick_token=fixture');
        assert.equal([...f.timers.values()][0].delay, 70000);
        f.images[0][event]();
        assert.equal(await request, true);
        assert.equal(f.timers.size, 0);
    }
    const f = fixture();
    const request = f.api.requestLocalGptSovitsControl('/set_sovits_weights', 25);
    assert.equal([...f.timers.values()][0].delay, 25);
    [...f.timers.values()][0].callback();
    assert.equal(await request, false);
    f.images[0].onload();
    assert.equal(await request, false, 'a late receipt cannot reverse a timeout');
    assert.equal(f.timers.size, 0);
});

test('shared storage preserves falsy values, recovers reads and exposes failed writes', () => {
    const f = fixture();
    for (const value of [false, 0, '', 'saved']) {
        f.api.writeJson('key', value);
        assert.equal(f.api.readJson('key', 'fallback'), value);
    }
    for (const value of ['null', '{broken']) {
        f.values.set('key', value);
        assert.equal(f.api.readJson('key', 'fallback'), 'fallback');
    }
    assert.equal(f.api.readJson('missing', 'fallback'), 'fallback');
    f.failRead();
    assert.equal(f.api.readJson('key', 'fallback'), 'fallback');
    f.failWrite();
    assert.throws(() => f.api.writeJson('key', 'new'), /quota exceeded/);
});
