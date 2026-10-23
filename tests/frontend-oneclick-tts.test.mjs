import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  ONECLICK_TTS_DEFAULTS, makeOneclickTtsSettings, isOneclickApiUrl,
  importOneclickTts, initializeOneclickTts, buildGptSovitsControlRequest
} from '../src/frontend/services/room/oneclickTts.mjs';

const token = 'A'.repeat(43);
const prefix = '#tsukuyomi-tts=v1.';
function fakeWindow(href = 'https://yachiyo.hk/room' + prefix + token) {
  const values = new Map([['login-session', 'keep-login'], ['roomLLMSettings', '{"apiKey":"keep-llm"}'],
    ['roomTTSSettings', '{"provider":"mimo"}']]);
  const location = new URL(href);
  const listeners = new Map();
  const context = {
    location, values, listeners,
    localStorage: { setItem: (key, value) => values.set(key, value) },
    history: { state: { keep: true }, replaceState: (state, _, url) => {
      assert.deepEqual(state, { keep: true });
      location.href = new URL(url, location).href;
    } },
    addEventListener: (name, fn) => listeners.set(name, fn),
    alert: () => { context.alerted = true; }
  };
  location.reload = () => { context.reloaded = true; };
  return context;
}

test('imports before room mount; removes credential; preserves non-TTS data and query', () => {
  const context = fakeWindow('https://yachiyo.hk/room?lang=ja' + prefix + token);
  assert.equal(importOneclickTts(context), 'imported');
  assert.deepEqual(JSON.parse(context.values.get('roomTTSSettings')), makeOneclickTtsSettings(token));
  assert.equal(context.values.get('login-session'), 'keep-login');
  assert.equal(context.values.get('roomLLMSettings'), '{"apiKey":"keep-llm"}');
  assert.equal(context.location.href, 'https://yachiyo.hk/room?lang=ja');
  assert.equal(importOneclickTts(context), 'ignored');
});

test('each launch replaces expired credentials without copying other settings', () => {
  const context = fakeWindow();
  initializeOneclickTts(context);
  context.location.hash = prefix + 'B'.repeat(43);
  context.listeners.get('hashchange')();
  assert.equal(context.reloaded, true);
  assert.equal(context.location.hash, '');
  assert.equal(JSON.parse(context.values.get('roomTTSSettings')).apiUrl,
    'http://localhost:9880/tts?oneclick_token=' + 'B'.repeat(43));
});

test('rejects wrong origins, paths, malformed credentials and unrelated anchors', () => {
  for (const href of [
    'https://example.invalid/room' + prefix + token,
    'http://yachiyo.hk/room' + prefix + token,
    'https://yachiyo.hk/room-evil' + prefix + token,
    'https://yachiyo.hk/hub' + prefix + token,
    'https://yachiyo.hk/room' + prefix + token + '&apiUrl=https://example.invalid',
    'https://yachiyo.hk/room' + prefix + token.slice(1),
    'https://yachiyo.hk/room#chapter-1'
  ]) {
    const context = fakeWindow(href);
    assert.notEqual(importOneclickTts(context), 'imported');
    assert.equal(context.values.get('roomTTSSettings'), '{"provider":"mimo"}');
  }
  assert.throws(() => makeOneclickTtsSettings('bad'));
  assert.throws(() => makeOneclickTtsSettings(token + '\n'));
});

test('storage failure retains the connection URL and reports a useful message', () => {
  const context = fakeWindow();
  context.localStorage.setItem = () => { throw new Error('Blocked storage'); };
  assert.equal(initializeOneclickTts(context), 'storage-error');
  assert.equal(context.alerted, true);
  assert.equal(context.location.hash, prefix + token);
  assert.equal(context.values.get('roomTTSSettings'), '{"provider":"mimo"}');
});

test('connected endpoint recognizer rejects remote hosts, alternate ports and extra fields', () => {
  const connected = makeOneclickTtsSettings(token).apiUrl;
  assert.equal(isOneclickApiUrl(connected), true);
  for (const invalid of [ONECLICK_TTS_DEFAULTS.apiUrl, connected.replace('9880', '9881'),
    connected.replace('localhost', 'example.invalid'), connected + '&other=1', connected + '#fragment']) {
    assert.equal(isOneclickApiUrl(invalid), false);
  }
});

test('official room pages accept a launch without affecting ordinary saved settings', () => {
  for (const origin of ['https://yachiyo.hk', 'https://yachiyo.com.cn', 'https://cho-kaguyahime.cn', 'https://tsukuyomi-space.com']) {
    const context = fakeWindow(origin + '/room/settings' + prefix + token);
    assert.equal(importOneclickTts(context), 'imported');
    assert.equal(context.location.hash, '');
  }
  const ordinary = fakeWindow('https://yachiyo.hk/room');
  assert.equal(importOneclickTts(ordinary), 'ignored');
  assert.equal(ordinary.values.get('roomTTSSettings'), '{"provider":"mimo"}');
});

test('weight controls retain launch authentication in settings, chat and Live2D playback', () => {
  for (const path of ['src/frontend/pages/RoomSettingsPage.vue', 'src/frontend/composables/room/useRoomChat.js', 'src/frontend/services/room/live2dSpeech.js']) {
    const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    const shared = fs.readFileSync(new URL('../src/frontend/services/room/gptSovitsControl.mjs', import.meta.url), 'utf8')
      .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
    const code = shared + '\n' + source.match(/^function buildGptSovitsControlUrl\([\s\S]*?^}/m)[0];
    const build = vm.runInNewContext(code + '\nbuildGptSovitsControlUrl;', {
      URL, Date, ONECLICK_TTS_DEFAULTS, buildGptSovitsControlRequest, window: { location: { protocol: 'https:' } }
    });
    for (const [pathname, weights_path] of [
      ['/set_gpt_weights', ONECLICK_TTS_DEFAULTS.gptWeightPath],
      ['/set_sovits_weights', ONECLICK_TTS_DEFAULTS.sovitsWeightPath]
    ]) {
      const request = new URL(build(makeOneclickTtsSettings(token), pathname, { weights_path }));
      assert.equal(request.origin, 'http://localhost:9880', path);
      assert.equal(request.pathname, pathname);
      assert.equal(request.searchParams.get('oneclick_token'), token, path);
      assert.equal(request.searchParams.get('weights_path'), weights_path);
      assert.ok(request.searchParams.has('_'));
    }
    const remote = new URL(build({ apiUrl: 'https://speech.example.test/tts?oneclick_token=' + token }, '/set_gpt_weights', {}));
    assert.equal(remote.searchParams.has('oneclick_token'), false);
  }
});

test('default settings match the one-click package field reference', () => {
  const reference = JSON.parse(fs.readFileSync(new URL('./fixtures/oneclick-tts-defaults.json', import.meta.url), 'utf8'));
  assert.deepEqual(ONECLICK_TTS_DEFAULTS, reference);
});
