const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function loadTtsTransport() {
    const context = {
        fishAudio: require('../shared/fish-audio.cjs'),
        Blob,
        Error,
        JSON,
        Number,
        String,
        URL,
        Uint8Array,
        atob
    };
    const code = source('src/frontend/services/room/ttsTransport.js')
        .replace(/^import fishAudio .*;$/m, '')
        .replace(/export async function /g, 'async function ')
        .replace(/export function /g, 'function ')
        .concat('\nglobalThis.__transport = { buildDirectTtsRequest, requestTtsAudioBlob, ttsUsesProxy };\n');

    vm.runInNewContext(code, context, { filename: 'src/frontend/services/room/ttsTransport.js' });
    return context.__transport;
}

function response({ contentType, json, blob, status = 200, text = '' }) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : '' },
        json: async () => json,
        blob: async () => blob,
        text: async () => text
    };
}

describe('Room TTS transport selection', () => {
    it('honors the saved proxy choice during Room playback', () => {
        const roomChat = source('src/frontend/composables/room/useRoomChat.js');
        const live2dSpeech = source('src/frontend/services/room/live2dSpeech.js');
        const settingsPage = source('src/frontend/pages/RoomSettingsPage.vue');

        assert.match(roomChat, /requestTtsAudioBlob/);
        assert.match(live2dSpeech, /requestTtsAudioBlob/);
        assert.match(settingsPage, /requestTtsAudioBlob/);
        assert.doesNotMatch(roomChat, /\\u5f53\\u524d Vue \\u7248 TTS \\u5efa\\u8bae\\u5148\\u5f00\\u542f\\u670d\\u52a1\\u5668\\u4ee3\\u7406/);
        assert.match(roomChat, /settings\.useProxy = ttsUsesProxy\(settings\)/);
        assert.match(live2dSpeech, /settings\.provider === 'gpt-sovits' && !ttsUsesProxy\(settings\)/);
        assert.match(settingsPage, /tts\.useProxy = ttsUsesProxy\(tts\)/);
    });

    it('upgrades old remote GPT-SoVITS settings to proxy while keeping loopback direct', async () => {
        const { requestTtsAudioBlob, ttsUsesProxy } = loadTtsTransport();
        for (const apiUrl of ['http://localhost:9880/tts', 'http://127.0.0.1:9988/tts', 'http://[::1]:9880/tts']) {
            assert.equal(ttsUsesProxy({ provider: 'gpt-sovits', apiUrl, useProxy: true }), false);
        }
        for (const apiUrl of ['http://39.105.82.185:9880/tts', 'https://speech.example.test/tts']) {
            const settings = { provider: 'gpt-sovits', apiUrl, refAudioPath: 'E:\\声音\\参考.wav', useProxy: false };
            assert.equal(ttsUsesProxy(settings), true);
            let calls = 0;
            const expected = new Blob(['wave'], { type: 'audio/wav' });
            const result = await requestTtsAudioBlob('你好', settings, {
                fetchDirect: async () => { throw new Error('Remote GPT-SoVITS must not send mixed-content browser requests'); },
                fetchProxy: async (url, options) => {
                    calls++;
                    assert.equal(url, '/api/tts');
                    const body = JSON.parse(options.body);
                    assert.equal(body.apiUrl, apiUrl);
                    assert.equal(body.refAudioPath, settings.refAudioPath);
                    assert.equal(body.text, '你好');
                    return response({ contentType: 'audio/wav', blob: expected });
                }
            });
            assert.equal(result, expected);
            assert.equal(calls, 1);
        }
        await assert.rejects(requestTtsAudioBlob('你好', { provider: 'gpt-sovits' }), /local playback path/);
    });

    it('sends provider TTS directly when proxying is disabled', async () => {
        const { requestTtsAudioBlob } = loadTtsTransport();
        const calls = [];
        const audio = await requestTtsAudioBlob('hello', {
            provider: 'minimax',
            apiUrl: 'https://api.minimaxi.com/v1/t2a_v2',
            apiKey: 'test-key',
            model: 'speech-2.8-hd',
            voice: 'female-shaonv',
            textLang: 'en',
            useProxy: false
        }, {
            fetchDirect: async (url, options) => {
                calls.push({ kind: 'direct', url, options });
                return response({ contentType: 'application/json', json: { data: { audio: '4944' } } });
            },
            fetchProxy: async () => {
                throw new Error('proxy should not be used');
            }
        });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].kind, 'direct');
        assert.equal(calls[0].url, 'https://api.minimaxi.com/v1/t2a_v2');
        assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
        assert.equal(JSON.parse(calls[0].options.body).text, 'hello');
        assert.equal(audio.type, 'audio/mp3');
        assert.equal(audio.size, 2);
    });

    it('uses the restricted backend only when proxying is enabled', async () => {
        const { requestTtsAudioBlob } = loadTtsTransport();
        const calls = [];
        const expected = new Blob(['audio'], { type: 'audio/mpeg' });
        const audio = await requestTtsAudioBlob('hello', {
            provider: 'openai',
            apiUrl: 'https://api.openai.com/v1/audio/speech',
            apiKey: 'test-key',
            useProxy: true
        }, {
            fetchDirect: async () => {
                throw new Error('direct transport should not be used');
            },
            fetchProxy: async (url, options) => {
                calls.push({ kind: 'proxy', url, options });
                return response({ contentType: 'audio/mpeg', blob: expected });
            }
        });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].kind, 'proxy');
        assert.equal(calls[0].url, '/api/tts');
        assert.equal(JSON.parse(calls[0].options.body).useProxy, true);
        assert.equal(audio, expected);
    });
});

it('Fish Audio sends the same voice and resolved emotion in both transports', async () => {
    const { requestTtsAudioBlob } = loadTtsTransport();
    const settings = { provider: 'fish-audio', model: 's2.1-pro', voice: 'a'.repeat(32), apiKey: 'personal',
        fishStyle: 'auto', replyEmotion: 'shy' };
    const mp3 = new Blob(['ID3', 'sound'], { type: 'audio/mpeg' });
    await requestTtsAudioBlob('你好', settings, { fetchDirect: async (url, opts) => {
        assert.equal(url, 'https://api.fish.audio/v1/tts');
        assert.equal(opts.headers.Authorization, 'Bearer personal');assert.equal(opts.headers.model, 's2.1-pro');
        assert.deepEqual(JSON.parse(opts.body), {text:'[embarrassed] 你好',reference_id:settings.voice,format:'mp3'});
        return response({ blob: mp3 });
    }});
    await requestTtsAudioBlob('你好', {...settings, useProxy:true, fishStyle:'calm'}, { fetchProxy: async (url, opts) => {
        assert.equal(url,'/api/tts');const body=JSON.parse(opts.body);assert.equal(body.emotion,'calm');assert.equal(body.text,'你好');assert.equal(body.apiKey,'personal');
        return response({ blob: mp3 });
    }});
    await assert.rejects(requestTtsAudioBlob('你好',{...settings,apiUrl:'https://example.com/tts'}), /仅支持官方/);
    await assert.rejects(requestTtsAudioBlob('你好',settings,{fetchDirect:async()=>response({blob:new Blob(['oops'])})}),/有效的 MP3/);
});
