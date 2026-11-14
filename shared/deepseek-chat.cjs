// DeepSeek application API contract (2026-11-13). The chat-demo lifecycle is
// the reference; Chat Completions keeps Room's existing tool runner compatible.
const protocol = require('./llm-protocol.cjs');
const MODEL = 'deepseek-flash';
const FILE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const fail = (code, message) => Object.assign(new Error(message), { code });
function supported(settings = {}) {
  try {
    const url = new URL(settings.apiUrl);
    return /^deepseek-(?:flash|v4(?:\.1)?-flash)(?:-|$)/.test(settings.model || '') &&
      (url.hostname === 'api.deepseek.com' || url.pathname === '/official-api/v1/chat/completions' || settings.deepseekApps === true);
  } catch { return false; }
}
function options(value = {}) {
  return { thinking: value.thinking === true, search: value.search === true, readUrl: value.readUrl !== false };
}
function endpoint(settings, path = '/chat/completions') {
  const url = new URL(settings.apiUrl);
  if (url.pathname === '/official-api/v1/chat/completions') return `${url.origin}/official-api/v1/deepseek${path}`;
  // Preserve compatible gateway prefixes, but never append to /messages or /responses.
  const prefix = url.hostname === 'api.deepseek.com' ? '' : url.pathname.replace(/\/(?:anthropic\/v1\/messages|chat\/completions|responses)\/?$/, '').replace(/\/$/, '');
  const suffix = prefix.endsWith('/v1') && path.startsWith('/v1/') ? path.slice(3) : path;
  return `${url.origin}${prefix}${suffix}`;
}
function metadata(value) {
  if (!value || value.provider !== 'deepseek') return null;
  if (JSON.stringify(value).length > 512_000) throw fail('DEEPSEEK_METADATA_LIMIT', '搜索或文件上下文过大，请新建会话。');
  const files = (Array.isArray(value.files) ? value.files : []).slice(0, 20).filter(f => FILE_ID.test(f.id || '')).map(f => ({
    id: f.id, name: String(f.name || '文件').slice(0, 200), size: Math.max(0, Number(f.size) || 0), purpose: String(f.purpose || 'user_data').slice(0, 30)
  }));
  return { provider: 'deepseek', endpoint: String(value.endpoint || '').slice(0, 500), files,
    server_tool_calls: Array.isArray(value.server_tool_calls) ? JSON.parse(JSON.stringify(value.server_tool_calls)).slice(0, 128) : [],
    annotations: Array.isArray(value.annotations) ? JSON.parse(JSON.stringify(value.annotations)).slice(0, 100) : [],
    title: String(value.title || '').slice(0, 160), truncated: value.truncated === true };
}
function buildRequest({ settings, systemPrompt = '', conversation = [], message = '', image, files = [], features, stream = true, tools = [], agentTurns = [] }) {
  const active = options(features), target = endpoint(settings);
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const item of conversation) {
    const saved = metadata(item.deepseek);
    const previous = { role: item.role, content: String(item.content || '') };
    if (saved?.endpoint === target) {
      if (item.role === 'user' && saved.files.length) previous.content = [...saved.files.map(f => ({ type: 'file', file_id: f.id })), { type: 'text', text: previous.content }];
      if (item.role === 'assistant' && saved.server_tool_calls.length) previous.server_tool_calls = saved.server_tool_calls;
    }
    messages.push(previous);
  }
  const content = [];
  for (const file of files) {
    if (!FILE_ID.test(file.id || '')) throw fail('DEEPSEEK_FILE_INVALID', '附件尚未上传完成，请重试。');
    content.push({ type: 'file', file_id: file.id });
  }
  if (image?.dataUrl) content.push({ type: 'image_url', image_url: { url: image.dataUrl } });
  content.push({ type: 'text', text: message || (files.length ? '请阅读这些文件。' : image ? '请看这张图片。' : '') });
  messages.push({ role: 'user', content: content.length === 1 ? content[0].text : content });
  const max = protocol.runtime.resolveParameters(settings).maxOutputTokens.value;
  let body = { model: new URL(settings.apiUrl).hostname === 'api.deepseek.com' ? MODEL : settings.model, messages, max_tokens: max || 4096, stream,
    thinking: { type: active.thinking ? 'enabled' : 'disabled' }, safety_check: { level: 'high' }, title: { enabled: true } };
  if (tools.length || agentTurns.length) body = protocol.withTools(body, 'openai', tools, agentTurns);
  const serverTools = [...(active.search ? [{ type: 'deepseek_web_search' }] : []), ...(active.readUrl ? [{ type: 'deepseek_read_url' }] : [])];
  if (serverTools.length) body.tools = [...(body.tools || []), ...serverTools];
  if (stream) body.stream_options = { include_usage: true };
  return body;
}
const safeLink = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
function sources(value) {
  const found = new Map();
  for (const a of value?.annotations || []) {
    const c = a.url_citation || a, url = safeLink(c.url);
    if (url) found.set(url, { url, title: String(c.title || url).slice(0, 240) });
  }
  return [...found.values()];
}
// Stops, network errors and refusals are distinct. No automatic retries after
// response bytes: each retry is an explicit new user action and may be billed.
async function readReply(response, { signal, onDelta = () => {}, onUpdate = () => {}, target = '' } = {}) {
  if (!response.ok) {
    const data = await protocol.readJson(response, signal, 8192).catch(() => ({}));
    throw Object.assign(fail(data.error?.code || 'DEEPSEEK_HTTP', data.error?.message || data.message || `DeepSeek ${response.status}`), { statusCode: response.status });
  }
  let reply = '', reasoning = '', usage, model = '', done = false, finishReason = '', toolCalls = new Map();
  let meta = { provider: 'deepseek', endpoint: target, files: [], server_tool_calls: [], annotations: [], title: '' };
  const events = new Map();
  function consume(data) {
    if (data.error) throw fail('DEEPSEEK_PROVIDER_ERROR', String(data.error.message || 'DeepSeek 未完成回复').slice(0, 400));
    model = data.model || model; usage = data.usage || usage;
    const choice = data.choices?.find(c => (c.index || 0) === 0), delta = choice?.delta || choice?.message || {};
    if (choice?.finish_reason === 'content_filter') {
      reply = ''; reasoning = ''; onUpdate({ reasoning: '', refused: true, sources: [], events: [] });
      throw fail('DEEPSEEK_REFUSED', '这次内容未通过模型安全检查，请换个说法再试。');
    }
    if (typeof delta.content === 'string') { reply += delta.content; protocol.bounded(reply, 524288); onDelta(delta.content); }
    if (typeof delta.reasoning_content === 'string') { reasoning += delta.reasoning_content; protocol.bounded(reasoning, 524288); }
    for (const call of delta.tool_calls || []) {
      const index = call.index || 0, prior = toolCalls.get(index) || { id: '', name: '', arguments: '' };
      if (call.id) prior.id = call.id;
      prior.name += call.function?.name || ''; prior.arguments += call.function?.arguments || '';
      protocol.bounded(prior, 32768); toolCalls.set(index, prior);
      if (toolCalls.size > 6) throw fail('DEEPSEEK_TOOL_LIMIT', '工具调用数量超过限制。');
    }
    const event = choice?.server_tool_event;
    if (event?.call) { events.set(`${event.step}:${event.call.index}`, event.call); if (events.size > 128) throw fail('DEEPSEEK_TOOL_LIMIT', '搜索步骤过多。'); }
    if (delta.server_tool_calls) meta.server_tool_calls = delta.server_tool_calls;
    if (delta.annotations) meta.annotations = delta.annotations;
    if (delta.title) meta.title = delta.title;
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    meta = metadata({ ...meta, truncated: finishReason === 'length' });
    onUpdate({ reasoning, events: [...events.values()], sources: sources(meta), title: meta.title, truncated: meta.truncated });
  }
  if (/application\/json/i.test(response.headers.get('content-type') || '')) {
    consume(await protocol.readJson(response, signal)); done = true;
  } else {
    if (!/text\/event-stream/i.test(response.headers.get('content-type') || '') || !response.body?.getReader) throw fail('DEEPSEEK_PROTOCOL', '接口没有返回流式对话。');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '', total = 0;
    const abort = () => { reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      while (!done) {
        signal?.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength; if (total > 16 * 1024 * 1024) throw fail('DEEPSEEK_SIZE', '模型回复超过限制。');
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, boundary.index); buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = frame.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
          if (!data) continue;
          if (data === '[DONE]') { done = true; break; }
          consume(JSON.parse(data));
        }
        protocol.bounded(buffer);
      }
      signal?.throwIfAborted();
    } finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  if (!done || !finishReason) throw fail('DEEPSEEK_INTERRUPTED', '连接中断，回复尚未完成，可以重试。');
  if (!reply && !toolCalls.size) throw fail('DEEPSEEK_EMPTY', '模型没有返回正文，请重试。');
  const calls = [...toolCalls.values()];
  return { reply, model, usage, deepseek: meta, ...(calls.length ? { toolCalls: calls, continuation: { protocol: 'openai', items: [{ role: 'assistant', content: reply || null, reasoning_content: reasoning,
    tool_calls: calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })), ...(meta.server_tool_calls.length ? { server_tool_calls: meta.server_tool_calls } : {}) }] } } : {}) };
}
module.exports = { MODEL, supported, options, endpoint, metadata, buildRequest, readReply, sources, safeLink };
