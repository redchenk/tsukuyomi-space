const assert = require('node:assert/strict');
const { test } = require('node:test');

async function streamReader() {
  return import('../src/frontend/services/room/roomChatStream.mjs');
}

function streamedResponse(chunks, contentType = 'text/event-stream') {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    headers: { get: () => contentType },
    body: new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      }
    })
  };
}

test('Room proxy SSE reconstructs fragmented deltas without duplicating the final answer', async () => {
  const { readRoomChatStream } = await streamReader();
  const deltas = [];
  const response = streamedResponse([
    'event: delta\r\ndata: {"text":"你',
    '好"}\r\n\r\nevent: delta\ndata: {"text":"，八千代"}\n\n',
    'event: done\ndata: {"reply":"你好，八千代","model":"test-model"}\n\n'
  ]);
  const result = await readRoomChatStream(response, { provider: 'proxy', onDelta: (value) => deltas.push(value) });
  assert.equal(deltas.join(''), '你好，八千代');
  assert.equal(result.reply, '你好，八千代');
  assert.equal(result.model, 'test-model');
});

test('OpenAI-compatible, Anthropic, Responses and Ollama streams yield only visible text', async () => {
  const { readRoomChatStream } = await streamReader();
  const cases = [
    {
      provider: 'openai',
      chunks: ['data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"你好"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n']
    },
    {
      provider: 'anthropic',
      chunks: ['event: message_start\ndata: {"type":"message_start","message":{"model":"claude-test"}}\n\n', 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n']
    },
    {
      provider: 'responses',
      chunks: ['event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"你好"}\n\n', 'event: response.completed\ndata: {"type":"response.completed","response":{"output_text":"你好"}}\n\n']
    },
    {
      provider: 'ollama',
      chunks: ['{"message":{"content":"你"},"done":false}\n{"message":{"content":"好"},"done":false}\n', '{"done":true,"model":"ollama-test"}\n']
    }
  ];
  for (const { provider, chunks } of cases) {
    const response = streamedResponse(chunks, provider === 'ollama' ? 'application/x-ndjson' : 'text/event-stream');
    const deltas = [];
    const result = await readRoomChatStream(response, { provider, onDelta: (value) => deltas.push(value) });
    assert.equal(deltas.join(''), '你好', provider);
    assert.equal(result.reply, '你好', provider);
  }
});

test('stream errors and truncated responses never become successful saved replies', async () => {
  const { readRoomChatStream } = await streamReader();
  await assert.rejects(
    readRoomChatStream(streamedResponse(['event: error\ndata: {"message":"provider unavailable"}\n\n']), { provider: 'proxy' }),
    /provider unavailable/
  );
  await assert.rejects(
    readRoomChatStream(streamedResponse(['event: delta\ndata: {"text":"partial"}\n\n']), { provider: 'proxy' }),
    /before completion/
  );
  await assert.rejects(
    readRoomChatStream(streamedResponse(['data: {"choices":[{"delta":{"content":"半句"},"finish_reason":"length"}]}\n\n']), { provider: 'openai' }),
    /长度上限/
  );
});

test('non-streaming JSON fallback remains compatible with older providers', async () => {
  const { readRoomChatStream } = await streamReader();
  let delta = '';
  const result = await readRoomChatStream({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ choices: [{ message: { content: '旧接口回复' } }], model: 'legacy' })
  }, { onDelta: (value) => { delta += value; } });
  assert.equal(delta, '旧接口回复');
  assert.equal(result.reply, '旧接口回复');
});
