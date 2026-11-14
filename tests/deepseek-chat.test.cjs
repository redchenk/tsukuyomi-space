const test = require('node:test');
const assert = require('node:assert/strict');
const ds = require('../shared/deepseek-chat.cjs');
const price = require('../shared/deepseek-pricing.cjs');
const settings = { apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', apiKey: 'fixture-only-key' };
const frame = data => `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\r\n\r\n`;
const chunk = (delta, finish_reason = null) => ({ id: 'fixture', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason }] });
function stream(frames, width = 7) {
  const bytes = new TextEncoder().encode(frames.map(frame).join(''));
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += width) c.enqueue(bytes.slice(i, i + width)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
}
test('stream handles split UTF-8, reasoning, citations and signed link context without showing signatures', async () => {
  const updates = [], deltas = [];
  const calls = [{ index: 0, calls: [{ id: 'read', kind: 'read_link', signature: 'opaque-fixture', page: { url: 'https://example.com', title: '资料' } }] }];
  const result = await ds.readReply(stream([chunk({ reasoning_content: '查询资料' }), chunk({ content: '你好，🌸。' }), chunk({ server_tool_calls: calls, annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.com', title: '来源' } }], title: '春日' }, 'stop'), '[DONE]']), { onDelta: d => deltas.push(d), onUpdate: u => updates.push(u), target: ds.endpoint(settings) });
  assert.equal(result.reply, '你好，🌸。'); assert.equal(deltas.join(''), result.reply);
  assert.equal(result.deepseek.server_tool_calls[0].calls[0].signature, 'opaque-fixture');
  assert.equal(updates.at(-1).reasoning, '查询资料'); assert.equal(ds.sources(result.deepseek)[0].title, '来源');
  assert.ok(!JSON.stringify(updates).includes('opaque-fixture'));
});
test('document references and signed results survive the next turn only on the same provider endpoint', () => {
  const conversation = [{ role: 'user', content: '阅读文档', deepseek: { provider: 'deepseek', endpoint: ds.endpoint(settings), files: [{ id: 'file-1', name: '资料.pdf' }] } }, { role: 'assistant', content: '摘要', deepseek: { provider: 'deepseek', endpoint: ds.endpoint(settings), server_tool_calls: [{ calls: [{ kind: 'read_link', signature: 'opaque' }] }] } }];
  const body = ds.buildRequest({ settings, conversation, message: '继续', features: { search: true } });
  assert.equal(body.messages[1].content[0].file_id, 'file-1'); assert.equal(body.messages[2].server_tool_calls[0].calls[0].signature, 'opaque');
  assert.deepEqual(body.tools, [{ type: 'deepseek_web_search' }, { type: 'deepseek_read_url' }]); assert.equal(body.safety_check.level, 'high');
  const other = ds.buildRequest({ settings: { ...settings, apiUrl: 'https://other.test/v1/chat/completions' }, conversation, message: '继续' });
  assert.equal(other.messages[1].content, '阅读文档'); assert.equal(other.messages[2].server_tool_calls, undefined);
});
test('truncated transport and refusal fail; max-token response remains explicitly truncated', async () => {
  await assert.rejects(ds.readReply(stream([chunk({ content: '半句' })])), { code: 'DEEPSEEK_INTERRUPTED' });
  const updates = [];
  await assert.rejects(ds.readReply(stream([chunk({ content: '不得留存的文本' }), chunk({}, 'content_filter'), '[DONE]']), { onUpdate: x => updates.push(x) }), { code: 'DEEPSEEK_REFUSED' });
  assert.equal(updates.at(-1).refused, true);
  const result = await ds.readReply(stream([chunk({ content: '已有文本' }, 'length'), '[DONE]'])); assert.equal(result.deepseek.truncated, true);
});
test('abort cancels the reader and does not complete a reply', async () => {
  const controller = new AbortController(); let cancelled = false;
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(frame(chunk({ content: '开始' })))); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(ds.readReply(response, { signal: controller.signal, onDelta() { controller.abort(); } }), { name: 'AbortError' }); assert.equal(cancelled, true);
});
test('dangerous citation URLs never become links', () => {
  assert.deepEqual(ds.sources({ annotations: [{ url_citation: { url: 'javascript:alert(1)' } }, { url_citation: { url: 'https://user:pass@example.com' } }] }), []);
});
test('tool billing uses exact rational rates and one final rounding; unknown units fail closed', () => {
  const rates = Object.fromEntries(price.DIMENSIONS.map(k => [k, { numerator: '0', denominator: '1' }]));
  rates.asr_seconds = { numerator: '780000000', denominator: '3600' }; rates.search = { numerator: '10000000', denominator: '1' };
  const snapshot = { id: 'fixture-two-times', currency: 'CNY', unit: price.UNIT, rates };
  assert.equal(price.price(snapshot, { ...price.zero(), asr_seconds: '3', search: '1' }).money_atoms, '10650000');
  assert.throws(() => price.price(snapshot, { ...price.zero(), tool_calls: '1' }));
  assert.throws(() => price.price({ ...snapshot, rates: { ...rates, asr_seconds: { numerator: '1', denominator: '0' } } }, price.zero()));
});
