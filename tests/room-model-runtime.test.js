const assert = require('node:assert/strict');
const { test } = require('node:test');
const runtime = require('../shared/model-runtime.cjs');
const catalog = require('../shared/model-catalog.cjs');
const protocol = require('../shared/llm-protocol.cjs');
const { buildChatPayload, createChatCompletion, createChatCompletionStream } = require('../backend/services/llm');

const settings = { apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', apiKey: 'fixture-secret-key' };
function configured(base = settings) {
  const ids = runtime.scopes(base);
  return { ...base, runtimeConfig: { version: 1, providers: { [ids.provider]: { parameters: { temperature: 0.8, maxOutputTokens: 256 }, mappings: {} } },
    models: { [ids.model]: { parameters: { temperature: 0.3 }, mappings: { maxOutputTokens: 'max_completion_tokens' }, capabilities: { image: false } } },
    declarations: { [ids.model]: { image: true, tools: true } } } };
}
test('parameter value and mapping precedence are independent, including false/zero and omit', () => {
  const value = configured(), ids = runtime.scopes(value);
  value.runtimeConfig.models[ids.model].parameters.temperature = 0;
  const resolved = runtime.resolveParameters(value);
  assert.deepEqual(resolved.temperature, { value: 0, field: 'temperature', valueSource: 'model', mappingSource: 'builtin' });
  assert.equal(resolved.maxOutputTokens.valueSource, 'provider');
  const payload = { model: 'deepseek-chat', temperature: 1, max_tokens: 100, messages: [] };
  const actual = runtime.applyParameters(payload, value).payload;
  assert.equal(actual.temperature, 0); assert.equal(actual.max_completion_tokens, 256); assert.equal(actual.max_tokens, undefined);
  assert.equal(payload.max_tokens, 100);
  value.runtimeConfig.models[ids.model].mappings.temperature = 'omit';
  assert.equal(runtime.applyParameters(payload, value).payload.temperature, undefined);
  assert.equal(runtime.applyParameters(payload, value).warnings.length, 1);
});
test('protocol mappings handle nested Ollama/Responses fields and required Messages token limits', () => {
  for (const [apiUrl, expected] of [['http://localhost:11434/api/chat', 'options.num_predict'], ['https://api.openai.com/v1/responses', 'max_output_tokens'], ['https://api.anthropic.com/v1/messages', 'max_tokens']]) {
    const base = { apiUrl, model: 'test-model' }, ids = runtime.scopes(base);
    const value = { ...base, runtimeConfig: { models: { [ids.model]: { parameters: { maxOutputTokens: 512 } } } } };
    const result = runtime.applyParameters({ max_tokens: 100, options: { temperature: 0.4 } }, value).payload;
    assert.equal(expected.includes('.') ? result.options.num_predict : result[expected], 512);
    if (expected !== 'max_tokens') assert.equal(result.max_tokens, undefined);
  }
  const base = { apiUrl: 'http://localhost:11434/api/chat', model: 'qwen' }, ids = runtime.scopes(base);
  assert.equal(runtime.applyParameters({}, { ...base, runtimeConfig: { models: { [ids.model]: { parameters: { reasoningEnabled: false } } } } }).payload.think, false);
  const responses = { apiUrl: 'https://api.openai.com/v1/responses', model: 'gpt-5.5' }, rids = runtime.scopes(responses);
  assert.deepEqual(runtime.applyParameters({ temperature: 1 }, { ...responses, runtimeConfig: { models: { [rids.model]: { parameters: { reasoningEffort: 'low' } } } } }).payload, { reasoning: { effort: 'low' } });
  const messages = { apiUrl: 'https://api.anthropic.com/v1/messages', model: 'claude' }, mids = runtime.scopes(messages);
  assert.throws(() => runtime.resolveParameters({ ...messages, runtimeConfig: { models: { [mids.model]: { mappings: { maxOutputTokens: 'omit' } } } } }), { code: 'MODEL_RUNTIME_INVALID' });
});
test('base URLs and full endpoints share overrides; other models and endpoints stay isolated', () => {
  assert.deepEqual(runtime.scopes({ apiUrl: 'https://api.openai.com/v1', model: 'm' }), runtime.scopes({ apiUrl: 'https://api.openai.com/v1/responses', model: 'm' }));
  assert.deepEqual(runtime.scopes({ apiUrl: 'http://localhost:11434', model: 'm' }), runtime.scopes({ apiUrl: 'http://localhost:11434/api/chat', model: 'm' }));
  assert.deepEqual(runtime.scopes({ apiUrl: settings.apiUrl, model: ' deepseek-chat ' }), runtime.scopes(settings));
  assert.equal(runtime.resolveParameters({ ...configured(), model: 'another-model' }).temperature.value, 0.8);
  assert.equal(runtime.resolveParameters({ ...configured(), apiUrl: 'https://api.moonshot.cn/v1/chat/completions' }).temperature.value, undefined);
});
test('unknown catalog metadata stays unknown; explicit declarations and manual false survive normalization', () => {
  assert.deepEqual(runtime.catalogCapabilities({ id: 'unknown-vision-model' }), {});
  const row = catalog.normalizePage({ data: [{ id: 'unknown-vision-model' }] }, { provider: 'deepseek' }).models[0];
  assert.deepEqual(row.capabilities, {});
  assert.equal(runtime.resolveCapabilities(settings).image.value, null);
  assert.equal(runtime.resolveCapabilities({ apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o' }).image.value, true);
  assert.equal(runtime.resolveCapabilities({ apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o-audio-preview' }).tools.value, null);
  assert.deepEqual(runtime.catalogCapabilities({ input_modalities: ['text'], supported_parameters: ['temperature'] }), { image: false, tools: false });
  const value = configured();
  assert.equal(runtime.resolveCapabilities(value).image.source, 'manual');
  assert.equal(runtime.resolveCapabilities(value).image.value, false);
  assert.equal(runtime.resolveCapabilities(value, { image: true }).image.value, false);
  delete value.runtimeConfig.models[runtime.scopes(value).model].capabilities.image;
  assert.equal(runtime.resolveCapabilities(value).image.source, 'provider');
  assert.equal(runtime.resolveCapabilities(value).image.value, true);
});
test('only numeric/enum values and predefined protocol paths cross the transport boundary', () => {
  const value = configured(), ids = runtime.scopes(value);
  value.runtimeConfig.models[ids.model].apiKey = 'never-forward-this';
  value.runtimeConfig.models['another-private-model'] = { parameters: {} };
  const transport = JSON.stringify(runtime.transportRuntime(value));
  assert.doesNotMatch(transport, /never-forward|another-private|fixture-secret/);
  value.runtimeConfig.models[ids.model].mappings.temperature = 'headers.Authorization';
  assert.throws(() => runtime.resolveParameters(value), { code: 'MODEL_RUNTIME_INVALID' });
  for (const input of [NaN, Infinity, -1, 4, '0.8']) {
    value.runtimeConfig.models[ids.model] = { parameters: { temperature: input } };
    assert.throws(() => runtime.resolveParameters(value), { code: 'MODEL_RUNTIME_INVALID' });
  }
  assert.throws(() => runtime.normalizeRuntime(JSON.parse('{"models":{"__proto__":{}}}')), { code: 'MODEL_RUNTIME_INVALID' });
  assert.equal({}.parameters, undefined);
});
test('backend applies the shared configuration and rejects an unsupported image before any network call', async () => {
  const value = configured();
  const body = buildChatPayload({ chatUrl: value.apiUrl, model: value.model, systemPrompt: 'hello', history: [], message: 'test', runtimeConfig: value.runtimeConfig });
  assert.equal(body.temperature, 0.3); assert.equal(body.max_completion_tokens, 256);
  const original = global.fetch; let calls = 0;
  let captured;
  global.fetch = async (_, options) => { calls++; captured = JSON.parse(options.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { headers: { 'Content-Type': 'application/json' } }); };
  try {
    await assert.rejects(createChatCompletion({ ...value, message: 'image', image: { dataUrl: 'data:image/png;base64,AA==' } }), { code: 'MODEL_CAPABILITY_UNSUPPORTED' });
    assert.equal(calls, 0);
    await createChatCompletion({ ...value, message: 'text' }); assert.equal(calls, 1);
    value.runtimeConfig.models[runtime.scopes(value).model].capabilities.streaming = false;
    await createChatCompletionStream({ ...value, message: 'text' }); assert.equal(captured.stream, false);
  } finally { global.fetch = original; }
});
test('HTTP proxy paths validate before outbound requests and expose only safe diagnostic metadata', async () => {
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/api/chat', require('../backend/routes/chat'));
  const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  const base = `http://127.0.0.1:${server.address().port}`, original = global.fetch;
  const captured = [];
  global.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return original(url, options);
    const body = JSON.parse(options.body); captured.push(body);
    if (body.stream) return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    return new Response('{"choices":[{"message":{"content":"ok"}}]}', { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const invalid = configured(); invalid.runtimeConfig.models[runtime.scopes(invalid).model].mappings.temperature = 'Authorization';
    const rejected = await fetch(base + '/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...invalid, message: 'test' }) });
    assert.equal(rejected.status, 400); assert.equal(captured.length, 0);
    for (const path of ['/api/chat', '/api/chat/stream']) {
      const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...configured(), message: 'private-prompt', diagnostic: true }) });
      assert.equal(response.status, 200);
      const data = path.endsWith('/stream') ? await protocol.readStream(response, { provider: 'proxy' }) : (await response.json()).data;
      assert.equal(data.diagnostics.httpStatus, 200);
      assert.doesNotMatch(JSON.stringify(data.diagnostics), /fixture-secret|private-prompt|Authorization/);
      assert.equal(captured.at(-1).temperature, 0.3); assert.equal(captured.at(-1).max_completion_tokens, 256);
    }
  } finally { global.fetch = original; await new Promise(resolve => server.close(resolve)); }
});
test('proxy stream preserves safe upstream diagnostic metadata and counts only event envelopes', async () => {
  let events = 0;
  const response = new Response('event: done\ndata: ' + JSON.stringify({ reply: 'hello', diagnostics: { httpStatus: 200, contentType: 'application/json', eventCount: 0 } }) + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  const result = await protocol.readStream(response, { provider: 'proxy', onEvent: () => events++ });
  assert.equal(events, 1); assert.equal(result.diagnostics.contentType, 'application/json');
  const failed = new Response('event: error\ndata: {"message":"模型请求失败（HTTP 401）","statusCode":401}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  await assert.rejects(protocol.readStream(failed, { provider: 'proxy' }), { statusCode: 401 });
});
test('diagnostics track streaming timings/usage but exported reports omit credentials, prompts, replies and images', async () => {
  const { runModelDiagnostic, exportDiagnosticReport, safeDiagnosticText } = await import('../src/frontend/services/room/roomModelDiagnostics.mjs');
  assert.doesNotMatch(safeDiagnosticText('x'.repeat(1990) + 'boundary-secret-key', 'boundary-secret-key'), /boundary/);
  let tick = 0;
  const result = await runModelDiagnostic({ settings, prompt: 'private-test-prompt', mode: 'stream', now: () => tick += 10,
    request: async options => { options.onDiagnostic({ type: 'response', httpStatus: 200, contentType: 'text/event-stream' }); options.onDiagnostic({ type: 'event' }); options.onDelta('private-reply fixture-secret-key');
      return { reply: 'private-reply', usage: { completion_tokens: 4, sensitive: 'secret' } }; } });
  assert.equal(result.status, 'success'); assert.equal(result.observed.streaming, true); assert.equal(result.eventCount, 1);
  assert.ok(result.firstTokenMs > 0); assert.ok(result.durationMs > result.firstTokenMs);
  assert.doesNotMatch(result.preview, /fixture-secret-key/);
  assert.doesNotMatch(exportDiagnosticReport(result), /private-test-prompt|private-reply|fixture-secret-key|sensitive/);
  assert.deepEqual(result.usage, { completion_tokens: 4 });
});
test('one-shot fallback never claims streaming; unsafe provider errors are not reflected', async () => {
  const { runModelDiagnostic, exportDiagnosticReport } = await import('../src/frontend/services/room/roomModelDiagnostics.mjs');
  const result = await runModelDiagnostic({ settings, mode: 'stream', request: async options => { options.onDiagnostic({ type: 'response', httpStatus: 200, contentType: 'application/json' }); return { reply: 'ok' }; } });
  assert.equal(result.status, 'warning'); assert.equal(result.observed.streaming, false);
  const failed = await runModelDiagnostic({ settings, request: async () => { throw new Error('fixture-secret-key private request text HTTP 401'); } });
  assert.equal(failed.error.status, 401); assert.match(failed.error.message, /密钥无效/);
  assert.doesNotMatch(exportDiagnosticReport(failed), /fixture-secret-key|private request/);
  const proxyFailure = await runModelDiagnostic({ settings: { ...settings, useProxy: true }, request: async options => {
    options.onDiagnostic({ type: 'response', httpStatus: 200, contentType: 'text/event-stream' });
    throw Object.assign(new Error('untrusted-response-text'), { statusCode: 401 });
  } });
  assert.equal(proxyFailure.httpStatus, 401);
});
test('tool diagnostics use a local fixture and complete the real paired continuation contract', async () => {
  const { runModelDiagnostic } = await import('../src/frontend/services/room/roomModelDiagnostics.mjs');
  let calls = 0;
  const result = await runModelDiagnostic({ settings, mode: 'tools', request: async options => {
    calls++;
    if (calls === 1) return { reply: '', toolCalls: [{ id: 'call_test', name: 'web_search', arguments: '{"query":"test"}' }], continuation: { protocol: 'openai', items: [] } };
    assert.equal(options.agentTurns[0].results[0].id, 'call_test');
    assert.match(options.agentTurns[0].results[0].content, /固定测试结果/);
    return { reply: '协议正常', usage: { completion_tokens: 5 } };
  } });
  assert.equal(calls, 2); assert.equal(result.status, 'success'); assert.equal(result.observed.toolCalls, 1);
});
test('declared unsupported tests make no request; timeout and user cancellation are distinct', async () => {
  const { runModelDiagnostic } = await import('../src/frontend/services/room/roomModelDiagnostics.mjs');
  const value = configured(); let calls = 0;
  const blocked = await runModelDiagnostic({ settings: value, mode: 'image', image: { dataUrl: 'private-image' }, request: async () => { calls++; } });
  assert.equal(blocked.error.code, 'MODEL_CAPABILITY_UNSUPPORTED'); assert.equal(calls, 0);
  for (const code of ['TIMEOUT', 'CANCELLED']) {
    const controller = new AbortController(); controller.abort(Object.assign(new Error('secret'), { code }));
    const report = await runModelDiagnostic({ settings, signal: controller.signal, request: async () => { throw controller.signal.reason; } });
    assert.equal(report.error.code, code); assert.equal(report.status, code === 'TIMEOUT' ? 'error' : 'cancelled');
  }
});
