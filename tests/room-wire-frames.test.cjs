const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readRoomFrames } = require('../shared/room-wire-frames.cjs');

function bytesByOne(text) {
  return new ReadableStream({ start(controller) {
    for (const byte of new TextEncoder().encode(text)) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
}
async function collect(text, options) {
  const items = [];
  for await (const item of readRoomFrames(bytesByOne(text), options)) items.push(item);
  return items;
}
test('SSE respects split UTF-8, CRLF, lone CR, comments, multiple data lines and incomplete EOF', async () => {
  assert.deepEqual(await collect(': heartbeat\r\nevent: delta\rdata: 月🌙\r\ndata:  光\r\rdata: incomplete\n'), [
    { event: 'delta', data: '月🌙\n 光' }
  ]);
  assert.deepEqual(await collect('data: [DONE]'), []);
});
test('NDJSON accepts the final line, and byte limits include unfinished lines', async () => {
  assert.deepEqual(await collect('  月\r\n\n末行', { ndjson: true }), [{ event: 'message', data: '月' }, { event: 'message', data: '末行' }]);
  await assert.rejects(collect('月光', { maxEventBytes: 5 }), { code: 'LLM_SIZE_LIMIT' });
  await assert.rejects(collect('月光', { maxWireBytes: 5 }), { code: 'LLM_SIZE_LIMIT' });
});
test('stopping an idle stream cancels the source and releases its reader', async () => {
  let cancelled = 0;
  const source = new ReadableStream({ cancel() { cancelled++; } });
  const controller = new AbortController();
  const frame = readRoomFrames(source, { signal: controller.signal }).next();
  controller.abort();
  await assert.rejects(frame, { name: 'AbortError' });
  assert.equal(cancelled, 1);
  assert.equal(source.locked, false);
});

test('UTF-8 limits count a single emoji even when JSON splits its surrogate pair', () => {
  const account = require('../shared/llm-protocol.cjs').textBudget(4);
  account('\ud83c');
  account('');
  account('\udf19');
  assert.throws(() => account('x'), { code: 'LLM_SIZE_LIMIT' });
});
