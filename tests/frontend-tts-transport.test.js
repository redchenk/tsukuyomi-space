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
        Blob,
        Error,
        JSON,
        Number,
        String,
        Uint8Array,
        atob
    };
    const code = source('src/frontend/services/room/ttsTransport.js')
        .replace(/export async function /g, 'async function ')
        .replace(/export function /g, 'function ')
        .concat('\nglobalThis.__transport = { buildDirectTtsRequest, requestTtsAudioBlob };\n');

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
        assert.match(roomChat, /if \(settings\.provider === 'gpt-sovits'\) settings\.useProxy = false/);
        assert.match(live2dSpeech, /const directLocalGptSovits = settings\.provider === 'gpt-sovits'/);
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
