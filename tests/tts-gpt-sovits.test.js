const assert = require('node:assert/strict');
const { test } = require('node:test');
const outbound = require('../backend/services/outbound-url-security');

function service(responseFor) {
    const originalFetch = outbound.fetchPinnedUrl;
    const calls = [];
    outbound.fetchPinnedUrl = async (url, options) => {
        await outbound.resolvePublicUrl(url, options);
        calls.push({ url: new URL(url), options });
        return responseFor ? responseFor(url, options) : new Response(
            new URL(url).pathname === '/tts' ? 'wave-data' : '{}',
            { headers: { 'Content-Type': new URL(url).pathname === '/tts' ? 'audio/wav' : 'application/json' } }
        );
    };
    delete require.cache[require.resolve('../backend/services/tts')];
    const { synthesizeSpeech } = require('../backend/services/tts');
    outbound.fetchPinnedUrl = originalFetch;
    return { synthesizeSpeech, calls };
}

const settings = {
    provider: 'gpt-sovits', apiUrl: 'http://39.105.82.185:9880/tts',
    text: '你好，八千代', textLang: 'auto', promptLang: 'ja',
    refAudioPath: 'E:\\声音\\月见八千代.wav', promptText: 'お帰りなさい。'
};

test('public GPT-SoVITS uses pinned requests and preserves remote reference paths', async () => {
    const h = service();
    const result = await h.synthesizeSpeech(settings);
    assert.equal(result.audioBuffer.toString(), 'wave-data');
    assert.equal(result.contentType, 'audio/wav');
    assert.deepEqual(h.calls.map(call => call.url.pathname), ['/set_gpt_weights', '/set_sovits_weights', '/tts']);
    for (const call of h.calls) {
        assert.equal(call.url.origin, 'http://39.105.82.185:9880');
        assert.deepEqual(call.options.protocols, ['http:', 'https:']);
        assert.equal(call.options.redirect, 'error');
        assert.equal(call.options.timeoutMs, 60000);
        assert.ok(call.options.signal instanceof AbortSignal);
    }
    const body = JSON.parse(h.calls[2].options.body);
    assert.equal(body.ref_audio_path, settings.refAudioPath);
    assert.equal(body.text_lang, 'zh');
    assert.equal(body.prompt_lang, 'ja');
    assert.equal(body.streaming_mode, false);
    await h.synthesizeSpeech({ ...settings, apiUrl: 'https://8.8.8.8:9880/tts', text: 'お帰りなさい。' });
    assert.deepEqual(h.calls.slice(3).map(call => call.url.pathname), ['/set_gpt_weights', '/set_sovits_weights', '/tts']);
    assert.equal(JSON.parse(h.calls[5].options.body).text_lang, 'ja');
});

test('public GPT-SoVITS rejects private targets and unsafe paths before any remote request', async () => {
    const h = service();
    for (const apiUrl of ['http://10.1.1.1:9880/tts', 'http://169.254.169.254/tts', 'http://192.168.1.2:9880/tts', 'http://39.105.82.185:9880/control', 'http://user:password@39.105.82.185:9880/tts']) {
        await assert.rejects(h.synthesizeSpeech({ ...settings, apiUrl }), error => error.status === 400);
    }
    for (const refAudioPath of ['../../secret.wav', 'http://internal/secret.wav', 'E:\\声音\\..\\secret.wav']) {
        await assert.rejects(h.synthesizeSpeech({ ...settings, refAudioPath }), error => error.status === 400);
    }
    await assert.rejects(h.synthesizeSpeech({ ...settings, gptWeightPath: '../payload.ckpt' }), error => error.status === 400);
    assert.equal(h.calls.length, 0);
});

test('public GPT-SoVITS reports upstream failures and cancels oversized audio', async () => {
    for (const mode of ['provider-error', 'wrong-type', 'large-audio', 'network-error']) {
        let cancelled = false;
        const h = service((url) => {
            if (new URL(url).pathname !== '/tts') return new Response('{}');
            if (mode === 'network-error') throw new Error('Connection refused');
            if (mode === 'provider-error') return new Response('{"message":"reference not found"}', { status: 400 });
            if (mode === 'wrong-type') return new Response('<html>wrong service</html>', { headers: { 'Content-Type': 'text/html' } });
            return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
                headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(33 * 1024 * 1024) }
            });
        });
        await assert.rejects(h.synthesizeSpeech(settings), error => {
            assert.match(error.message, mode === 'provider-error' ? /reference not found/
                : mode === 'wrong-type' ? /未返回音频/ : mode === 'large-audio' ? /响应过大/ : /无法连接公网/);
            return true;
        });
        if (mode === 'large-audio') assert.equal(cancelled, true);
    }
});
