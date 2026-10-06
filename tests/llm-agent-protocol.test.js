const assert = require('node:assert/strict');
const { test } = require('node:test');
const protocol = require('../shared/llm-protocol.cjs');
const agent = require('../shared/agent-protocol.cjs');
const { createChatCompletion, createChatCompletionStream, buildChatPayload } = require('../backend/services/llm');
const sse = items => new Response(items.map(p => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\r\n\r\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const tool = (id = 'call_1', query = '现在天气') => ({ id, name: 'web_search', arguments: JSON.stringify({ query }) });
const completion = calls => ({ reply: '', toolCalls: calls, continuation: { protocol: 'openai', items: [{ role: 'assistant', content: null, tool_calls: calls.map(p => ({ id: p.id, type: 'function', function: { name: p.name, arguments: p.arguments } })) }] } });

test('direct and proxy Qwen settings are controlled without exporting vendor fields or stored reasoning', () => {
  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  assert.deepEqual(protocol.chatOptions(url, 'qwen3.8-flash'), { temperature: 0.6, preserve_thinking: false });
  const payload = buildChatPayload({ chatUrl: url, model: 'qwen3.8-flash', systemPrompt: 'persona',
    history: [{ role: 'assistant', content: 'visible history', reasoning_content: 'not stored history' }], message: 'current question' });
  assert.equal(payload.temperature, 0.6);
  assert.equal(payload.preserve_thinking, false);
  assert.equal(payload.messages.at(-1).content, 'current question');
  assert.equal(payload.messages[1].reasoning_content, undefined);
  assert.equal(protocol.chatOptions('https://openrouter.ai/api/v1/chat/completions', 'qwen3.8-flash').preserve_thinking, undefined);
  assert.deepEqual(protocol.chatOptions('https://api.openai.com/v1/chat/completions', 'o3'), {});
  assert.deepEqual(protocol.chatOptions('https://api.openai.com/v1/responses', 'gpt-5.5'), {});
  assert.deepEqual(protocol.chatOptions('https://api.moonshot.cn/v1/chat/completions', 'kimi-k2.6'), { temperature: 1 });
  const continued = protocol.withTools(payload, 'openai', [], [{
    continuation: { items: [{ role: 'assistant', reasoning_content: 'current turn opaque state', tool_calls: [] }] },
    results: []
  }]);
  assert.equal(continued.preserve_thinking, true);
  assert.equal(continued.messages.at(-1).reasoning_content, 'current turn opaque state');
});

test('OpenAI split calls preserve IDs, arguments, reasoning and post-finish usage without showing internals', async () => {
  const deltas = [];
  const result = await protocol.readStream(sse([
    { choices: [{ delta: { reasoning_content: 'private protocol state', tool_calls: [{ index: 0, id: 'call_1', function: { name: 'web_', arguments: '{"query":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'search', arguments: '"今天"}' } }] }, finish_reason: 'tool_calls' }] },
    { choices: [], usage: { prompt_tokens: 4, completion_tokens: 3 } }, '[DONE]'
  ]), { allowTools: true, onDelta: p => deltas.push(p) });
  assert.deepEqual(result.toolCalls, [{ id: 'call_1', name: 'web_search', arguments: '{"query":"今天"}' }]);
  assert.equal(result.usage.completion_tokens, 3); assert.deepEqual(deltas, []);
  assert.equal(result.continuation.items[0].reasoning_content, 'private protocol state');
});

test('Responses retains opaque reasoning and pairs output using call_id rather than item ID', async () => {
  const output = [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'synthetic-encrypted', summary: [] }, { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'web_search', arguments: '{"query":"今天"}' }];
  const result = await protocol.readStream(sse([{ type: 'response.completed', response: { model: 'test', output } }]), { provider: 'responses', allowTools: true });
  assert.equal(result.toolCalls[0].id, 'call_1');
  const turns = [{ continuation: result.continuation, results: [{ id: 'call_1', name: 'web_search', content: 'synthetic result', isError: false }] }];
  const body = protocol.withTools({ input: [], model: 'test' }, 'responses', agent.READ_TOOLS, turns);
  assert.equal(body.input[0].encrypted_content, 'synthetic-encrypted');
  assert.deepEqual(body.input.at(-1), { type: 'function_call_output', call_id: 'call_1', output: 'synthetic result' });
  assert.equal(body.tools[0].type, 'function'); assert.equal(body.store, false);
  assert.equal(agent.wireOptions(agent.READ_TOOLS, turns, 'responses').turns.length, 1);
});

test('Anthropic fragmented input and thinking signatures remain provider state, never visible speech', async () => {
  const result = await protocol.readStream(sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'private thought' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'synthetic-signature' } },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'call_1', name: 'web_search', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"今天"}' } },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 6 } },
    { type: 'message_stop' }
  ]), { provider: 'anthropic', allowTools: true });
  assert.equal(result.reply, ''); assert.equal(result.continuation.items[0].signature, 'synthetic-signature');
  const turns = [{ continuation: result.continuation, results: [{ id: 'call_1', name: 'web_search', content: 'failed', isError: true }] }];
  const body = protocol.withTools({ messages: [], system: 'persona' }, 'anthropic', agent.READ_TOOLS, turns);
  assert.equal(body.messages[1].content[0].tool_use_id, 'call_1'); assert.equal(body.messages[1].content[0].is_error, true);
});

test('Ollama final done chunk text is retained and native arguments stay objects', async () => {
  const result = await protocol.readStream(new Response('{"message":{"content":"你好"},"done":true,"eval_count":2}\n', { headers: { 'Content-Type': 'application/x-ndjson' } }), { provider: 'ollama' });
  assert.equal(result.reply, '你好'); assert.equal(result.usage.completion_tokens, 2);
  const called = protocol.fromJson({ message: { tool_calls: [{ function: { name: 'web_search', arguments: { query: '今天' } } }] } }, { provider: 'ollama', allowTools: true });
  const turns = [{ continuation: called.continuation, results: [{ id: called.toolCalls[0].id, name: 'web_search', content: 'result', isError: false }] }];
  const body = protocol.withTools({ messages: [] }, 'ollama', agent.READ_TOOLS, turns);
  assert.deepEqual(body.messages[0].tool_calls[0].function.arguments, { query: '今天' });
  assert.equal(body.messages[1].tool_name, 'web_search');
});

test('arbitrary byte boundaries and split CRLF do not lose data or duplicate final text', async () => {
  const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  const response = new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
  let text = ''; const result = await protocol.readStream(response, { onDelta: p => { text += p; } });
  assert.equal(text, '你好'); assert.equal(result.reply, '你好');
});

test('malformed JSON, oversized data and incomplete JSON completions cannot be saved', async () => {
  await assert.rejects(protocol.readStream(sse(['{broken'])), { code: 'LLM_JSON' });
  await assert.rejects(protocol.readStream(new Response('data: '+ 'x'.repeat(1024 * 1024 + 1), { headers: { 'Content-Type': 'text/event-stream' } })), { code: 'LLM_SIZE_LIMIT' });
  assert.throws(() => protocol.fromJson({ choices: [{ message: { content: '半句' }, finish_reason: 'length' }] }), { code: 'LLM_INCOMPLETE' });
  await assert.rejects(protocol.readStream(sse([{ type: 'response.completed', response: { status: 'incomplete', output_text: '半句' } }]), { provider: 'responses' }), { code: 'LLM_INCOMPLETE' });
});

test('caller abort after response headers cancels a stalled reader', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"半句"}}]}\n\n')); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const controller = new AbortController();
  const reading = protocol.readStream(response, { signal: controller.signal });
  setTimeout(() => controller.abort(new Error('synthetic abort')), 20);
  await assert.rejects(reading, /synthetic abort/); assert.equal(cancelled, true);
});

test('native model-call → authorized tool → tool result → final reply completes once and deduplicates execution', async () => {
  let calls = 0, rounds = 0, rendered = '';
  const result = await agent.runAgent({ tools: agent.READ_TOOLS, onDelta: p => { rendered += p; }, execute: async () => { calls++; return { content: 'synthetic result', isError: false }; }, complete: async ({ agentTurns, tools }) => {
    rounds++;
    if (rounds === 1) return completion([tool()]);
    if (rounds === 2) { assert.equal(agentTurns[0].results[0].id, 'call_1'); return completion([tool('call_2')]); }
    assert.equal(tools.length, 0); return { reply: '我查到了～', model: 'test' };
  } });
  assert.equal(calls, 1); assert.equal(rounds, 3); assert.equal(result.reply, rendered); assert.equal(result.agent.calls, 1);
});

test('unknown tools, malicious arguments and tool failures become explicit errors instead of actions', async () => {
  let executed = 0;
  await agent.runAgent({ tools: agent.READ_TOOLS, execute: async () => { executed++; throw new Error('secret provider body'); }, complete: async ({ agentTurns }) => {
    if (!agentTurns.length) return completion([{ ...tool(), name: 'delete_user' }, { ...tool('call_2'), arguments: '{"query":"今天","__proto__":{}}' }, tool('call_3')]);
    assert.ok(agentTurns[0].results.every(p => p.isError));
    assert.doesNotMatch(JSON.stringify(agentTurns), /secret provider body/); return { reply: '工具暂不可用。' };
  } });
  assert.equal(executed, 1);
});

test('stop during a tool never advances to a follow-up model or successful reply', async () => {
  const controller = new AbortController(); let rounds = 0;
  await assert.rejects(agent.runAgent({ tools: agent.READ_TOOLS, signal: controller.signal, complete: async () => { rounds++; return completion([tool()]); }, execute: async () => { controller.abort(new Error('stop')); throw new Error('network closed'); } }), /stop/);
  assert.equal(rounds, 1);
});

test('orphaned results, cross-protocol context and write tools are rejected before creating payloads', () => {
  assert.throws(() => agent.wireOptions([{ name: 'delete_user' }], [], 'openai'), { code: 'AGENT_TOOL_DENIED' });
  const turns = [{ continuation: completion([tool()]).continuation, results: [{ id: 'wrong', name: 'web_search', content: 'x', isError: false }] }];
  assert.throws(() => agent.wireOptions(agent.READ_TOOLS, turns, 'openai'), { code: 'AGENT_ARGUMENTS' });
  assert.throws(() => agent.wireOptions(agent.READ_TOOLS, turns, 'anthropic'), { code: 'AGENT_ARGUMENTS' });
});

test('hosted MiniMax model names do not change an OpenAI-compatible endpoint into Anthropic wire format', () => {
  const body = buildChatPayload({ chatUrl: 'https://openrouter.ai/api/v1/chat/completions', model: 'minimax/MiniMax-M2.7', systemPrompt: 'persona', history: [], message: 'hi' });
  assert.equal(body.messages[0].role, 'system'); assert.equal(body.system, undefined);
});

test('API streaming and JSON paths share the same normalized tool contract and redact provider errors', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', function: { name: 'web_search', arguments: '{"query":"今天"}' } }] }, finish_reason: 'tool_calls' }] }), { headers: { 'Content-Type': 'application/json' } });
    for (const complete of [createChatCompletion, createChatCompletionStream]) {
      const result = await complete({ message: 'hi', apiUrl: 'https://api.deepseek.com/chat/completions', apiKey: 'synthetic', tools: agent.READ_TOOLS });
      assert.equal(result.toolCalls[0].name, 'web_search');
    }
    global.fetch = async () => new Response('sensitive upstream body', { status: 401 });
    await assert.rejects(createChatCompletion({ message: 'hi', apiUrl: 'https://api.deepseek.com/chat/completions', apiKey: 'synthetic' }), error => error.statusCode === 401 && !error.message.includes('sensitive'));
  } finally { global.fetch = original; }
});
