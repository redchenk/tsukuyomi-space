/**
 * Convert the streaming formats used by Room's supported model endpoints into
 * plain reply deltas. This module deliberately has no Vue or DOM dependency so
 * transports can be tested with fragmented network chunks.
 */

function replyFromPayload(data) {
  if (typeof data?.reply === 'string') return data.reply;
  if (typeof data?.output_text === 'string') return data.output_text;
  if (Array.isArray(data?.output)) {
    return data.output.flatMap((item) => item?.content || [])
      .filter((item) => item?.type === 'output_text' || item?.type === 'text')
      .map((item) => item.text || '').join('');
  }
  if (Array.isArray(data?.content)) {
    return data.content.filter((item) => item?.type === 'text').map((item) => item.text || '').join('');
  }
  if (Array.isArray(data?.choices)) {
    return data.choices.map((item) => item?.message?.content || item?.text || '').join('');
  }
  if (typeof data?.message?.content === 'string') return data.message.content;
  return '';
}

function contentDelta(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((part) => part?.type === 'text').map((part) => part.text || '').join('');
  }
  return '';
}

function parseSseEvent(block) {
  const lines = block.split('\n');
  let event = 'message';
  const data = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return { event, data: data.join('\n') };
}

function completionError(payload) {
  const reasons = Array.isArray(payload?.choices)
    ? payload.choices.map((choice) => choice?.finish_reason).filter(Boolean)
    : [];
  if (reasons.includes('length') || payload?.delta?.stop_reason === 'max_tokens'
    || payload?.message?.stop_reason === 'max_tokens' || payload?.type === 'response.incomplete') {
    return new Error('模型输出达到长度上限，回复未保存，请重试');
  }
  if (reasons.some((reason) => ['content_filter', 'tool_calls', 'function_call'].includes(reason))
    || payload?.delta?.stop_reason === 'tool_use' || payload?.type === 'response.failed') {
    return new Error('模型没有完成可显示的回复，请重试');
  }
  return null;
}

export async function readRoomChatStream(response, { provider = 'openai', onDelta = () => {}, signal } = {}) {
  if (!response?.ok) throw new Error(`LLM ${response?.status || 'request failed'}`);
  const contentType = response.headers?.get?.('content-type') || '';
  if (!response.body || /application\/json/i.test(contentType)) {
    const data = await response.json();
    if (data?.error) throw new Error(data.error.message || String(data.error));
    const incomplete = completionError(data);
    if (incomplete) throw incomplete;
    const reply = replyFromPayload(data);
    if (!reply) throw new Error('LLM response did not contain a reply');
    onDelta(reply);
    return { reply, model: data.model || '', usage: data.usage || null };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reply = '';
  let finalReply = '';
  let model = '';
  let usage = null;
  let completed = false;

  function addDelta(value) {
    const delta = String(value || '');
    if (!delta) return;
    reply += delta;
    onDelta(delta);
  }

  function consume(data, event = 'message') {
    if (!data || data === '[DONE]') {
      if (data === '[DONE]') completed = true;
      return;
    }
    let payload;
    try {
      payload = JSON.parse(data);
    } catch (_) {
      return;
    }
    if (event === 'error' || payload?.type === 'error' || payload?.error) {
      throw new Error(payload?.message || payload?.error?.message || 'LLM streaming request failed');
    }
    const incomplete = completionError(payload);
    if (incomplete) throw incomplete;
    if (payload?.model) model = payload.model;
    if (payload?.usage) usage = payload.usage;

    if (provider === 'proxy') {
      if (event === 'delta') addDelta(payload.text);
      if (event === 'done') {
        finalReply = String(payload.reply || '');
        completed = true;
      }
      return;
    }
    if (provider === 'ollama') {
      addDelta(payload?.message?.content || payload?.response || '');
      if (payload?.done) completed = true;
      return;
    }
    if (provider === 'anthropic') {
      if (payload?.type === 'message_start') model = payload.message?.model || model;
      if (payload?.type === 'content_block_delta' && payload.delta?.type === 'text_delta') addDelta(payload.delta.text);
      if (payload?.type === 'message_stop') completed = true;
      if (payload?.type === 'message_delta' && payload.usage) usage = payload.usage;
      return;
    }
    if (provider === 'responses') {
      if (payload?.type === 'response.output_text.delta') addDelta(payload.delta);
      if (payload?.type === 'response.completed') {
        finalReply = replyFromPayload(payload.response);
        usage = payload.response?.usage || usage;
        model = payload.response?.model || model;
        completed = true;
      }
      return;
    }
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    for (const choice of choices) addDelta(contentDelta(choice?.delta?.content));
    if (choices.some((choice) => choice?.finish_reason)) completed = true;
  }

  function consumeBuffered(flush = false) {
    if (provider === 'ollama') {
      let boundary;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 1);
        if (line) consume(line);
      }
      if (flush && buffer.trim()) consume(buffer.trim());
      return;
    }
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseEvent(block);
      if (event.data) consume(event.data, event.event);
    }
    if (flush && buffer.trim()) {
      const event = parseSseEvent(buffer);
      if (event.data) consume(event.data, event.event);
    }
  }

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Generation stopped', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      consumeBuffered();
    }
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n');
    consumeBuffered(true);
  } finally {
    reader.releaseLock();
  }
  const result = finalReply || reply;
  if (!result) throw new Error('LLM response did not contain a reply');
  if (!completed) throw new Error('LLM stream ended before completion');
  return { reply: result, model, usage };
}
