import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import runtime from '../shared/model-runtime.cjs';
import protocol from '../shared/llm-protocol.cjs';
import * as official from '../src/frontend/services/room/roomOfficialApi.mjs';
import * as localTransport from '../src/frontend/services/room/localOllamaTransport.js';
import { readRoomChatStream } from '../src/frontend/services/room/roomChatStream.mjs';
import * as oneclickTts from '../src/frontend/services/room/oneclickTts.mjs';

const origin = 'https://example.test';
const dashboard = { enabled: true, me: { account_id: 'site-user' }, models: [{ id: 'site-model', provider: 'deepseek', enabled: true, max_output_tokens: 512 }] };
const settings = { apiUrl: official.officialChatUrl(origin), model: 'site-model', apiKey: official.OFFICIAL_SESSION_MARKER, useProxy: true };

test('same-origin site identity marker cannot be reused as a remote API key', () => {
  assert.equal(official.roomChatConfigured(settings, origin), true);
  for (const apiUrl of ['https://evil.test/official-api/v1/chat/completions', origin + official.OFFICIAL_CHAT_PATH + '?key=x', 'https://example.test.evil.test' + official.OFFICIAL_CHAT_PATH]) {
    assert.equal(official.isOfficialRoomApi(apiUrl, origin), false);
    assert.equal(official.roomChatConfigured({ ...settings, apiUrl }, origin), false);
  }
  assert.equal(official.roomChatConfigured({}, origin), false);
  assert.equal(official.roomChatConfigured({ apiUrl: 'https://provider.test/v1/chat/completions', model: 'm' }, origin), false);
  assert.equal(official.roomChatConfigured({ apiUrl: 'http://localhost:11434/api/chat', model: 'm' }, origin), true);
});

test('official settings preserve unrelated model layers and clamp inherited limits to current server cap', () => {
  const scope = runtime.scopes(settings);
  const input = { ...settings, apiKey: 'old-private-key', runtimeConfig: { providers: { [scope.provider]: { parameters: { maxOutputTokens: 8000 } } }, models: { unrelated: { parameters: { temperature: 0.7 } } } } };
  const actual = official.officialRoomSettings(input, dashboard, origin);
  assert.equal(actual.apiKey, official.OFFICIAL_SESSION_MARKER);
  assert.equal(actual.useProxy, false);
  assert.equal(runtime.resolveParameters(actual).maxOutputTokens.value, 512);
  assert.equal(runtime.resolveParameters(actual).maxOutputTokens.field, 'max_tokens');
  assert.equal(runtime.resolveCapabilities(actual).image.value, false);
  assert.equal(actual.runtimeConfig.models.unrelated.parameters.temperature, 0.7);
  assert.equal(input.apiKey, 'old-private-key');
  assert.throws(() => official.officialRoomSettings(input, { ...dashboard, enabled: false }, origin), /暂未开放/);
  assert.throws(() => official.officialRoomSettings({ ...input, model: 'retired' }, dashboard, origin), /暂不可用/);
});

test('model discovery uses only authenticated no-store GET and filters disabled models', async () => {
  const result = await official.fetchOfficialRoomDashboard({ request: async (url, options) => {
    assert.equal(url, '/official-api/api/dashboard');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.body, undefined);
    return { ok: true, json: async () => ({ ...dashboard, models: [...dashboard.models, { id: 'disabled', enabled: false, max_output_tokens: 512 }] }) };
  } });
  assert.equal(result.models.length, 1);
  await assert.rejects(official.fetchOfficialRoomDashboard({ request: async () => ({ ok: false, status: 401, json: async () => ({}) }) }), /请先登录/);
});

function transport(request) {
  const code = fs.readFileSync('src/frontend/composables/room/useRoomChat.js', 'utf8').replace(/^import [\s\S]*?from '[^']*';$/gm, '').replace(/^export /gm, '');
  const context = { URL, AbortController, ReadableStream, isEnglishSite: () => false, llmProtocol: protocol, ...localTransport, ...official, ...oneclickTts,
    roomChatConfigured: value => official.roomChatConfigured(value, origin),
    isOfficialRoomApi: value => official.isOfficialRoomApi(value, origin),
    officialRoomSettings: (value, data) => official.officialRoomSettings(value, data, origin),
    fetchOfficialRoomDashboard: async () => dashboard,
    agentProtocol: { wireOptions: () => ({ tools: [], turns: [] }) },
    fetchWithLocalOllamaGuidance: request, readRoomChatStream };
  vm.runInNewContext(code + '\nglobalThis.request = requestRoomReply;', context);
  return context.request;
}
test('missing configuration produces no provider request, delta or fake reply', async () => {
  const request = transport(() => { throw new Error('must not call upstream'); });
  let delta = '';
  await assert.rejects(request({ settings: {}, message: 'hi', onDelta: text => { delta += text; } }), { code: 'ROOM_MODEL_NOT_CONFIGURED' });
  assert.equal(delta, '');
});
test('real Room transport handles an imported legacy site config and surfaces insufficient funds without retry', async () => {
  let count = 0;
  const request = transport(async (url, options) => {
    count++;
    assert.equal(url, settings.apiUrl);
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 512);
    assert.equal(body.thinking.type, 'disabled');
    assert.equal(body.stream_options.include_usage, true);
    assert.equal(options.headers.Authorization, `Bearer ${official.OFFICIAL_SESSION_MARKER}`);
    return { ok: false, status: 402, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ error: { message: 'insufficient' } }) };
  });
  await assert.rejects(request({ settings, message: 'hi', systemPrompt: 'test' }), /余额不足/);
  assert.equal(count, 1);
});
