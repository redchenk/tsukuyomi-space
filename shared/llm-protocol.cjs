// One bounded wire decoder for the browser and the server. Independently
// implemented; AstrBot's provider/agent separation is the design reference.
const LIMIT = 1024 * 1024;
const bytes = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
const error = (code, message) => Object.assign(new Error(message), { code });
function bounded(value, limit = LIMIT) {
    if (bytes(value) > limit) throw error('LLM_SIZE_LIMIT', '模型响应过大，请缩短请求后重试');
    return value;
}
function text(content) {
    if (typeof content === 'string') return content;
    return Array.isArray(content) ? content.filter(p => ['text', 'output_text'].includes(p?.type)).map(p => p.text || '').join('') : '';
}
function visible(data) {
    if (typeof data?.reply === 'string') return data.reply;
    if (typeof data?.output_text === 'string') return data.output_text;
    if (Array.isArray(data?.output)) return data.output.filter(p => p.type === 'message').map(p => text(p.content)).join('');
    if (Array.isArray(data?.content)) return text(data.content);
    return text(data?.choices?.[0]?.message?.content) || data?.choices?.[0]?.text || data?.message?.content || data?.response || '';
}
function checkStatus(data) {
    const reason = data?.choices?.[0]?.finish_reason || data?.delta?.stop_reason || data?.stop_reason || data?.done_reason;
    if (['length', 'max_tokens'].includes(reason) || data?.type === 'response.incomplete' || data?.status === 'incomplete')
        throw error('LLM_INCOMPLETE', '模型输出达到长度上限，回复未保存，请重试');
    if (reason === 'content_filter' || data?.type === 'response.failed' || data?.status === 'failed')
        throw error('LLM_PROVIDER_FAILED', '模型没有完成可显示的回复，请重试');
    if (data?.error || data?.type === 'error') throw error('LLM_PROVIDER_FAILED', '模型服务返回错误，请稍后重试');
    return reason || '';
}
function call(id, name, args) {
    const value = { id: String(id || ''), name: String(name || ''), arguments: typeof args === 'string' ? args : JSON.stringify(args || {}) };
    if (!/^[\w-]{1,160}$/.test(value.id) || !/^[\w.-]{1,80}$/.test(value.name)) throw error('LLM_TOOL_INVALID', '模型工具调用标识无效');
    bounded(value.arguments, 32768);
    return value;
}
function finish(result, allowTools = false) {
    bounded(result);
    if (result.toolCalls?.length > 6) throw error('LLM_TOOL_LIMIT', '模型请求了过多工具');
    if (result.toolCalls?.length && !allowTools) throw error('LLM_TOOL_DISABLED', '模型没有完成可显示的回复，请重试');
    if (!result.reply && !result.toolCalls?.length) throw error('LLM_EMPTY', 'LLM response did not contain a reply');
    // Keep the established public text-only response shape.
    if (!result.toolCalls?.length) { delete result.toolCalls; delete result.continuation; }
    if (!result.usage) delete result.usage;
    return result;
}
function fromJson(data, { provider = 'openai', allowTools = false } = {}) {
    bounded(data); checkStatus(data);
    let toolCalls = [], continuation;
    if (provider === 'proxy') return finish({ ...data }, allowTools);
    if (provider === 'responses') {
        toolCalls = (data.output || []).filter(p => p.type === 'function_call').map(p => call(p.call_id, p.name, p.arguments));
        continuation = { protocol: provider, items: data.output || [] };
    } else if (provider === 'anthropic') {
        toolCalls = (data.content || []).filter(p => p.type === 'tool_use').map(p => call(p.id, p.name, p.input));
        continuation = { protocol: provider, items: data.content || [] };
    } else {
        const message = data.choices?.[0]?.message || data.message || {};
        toolCalls = (message.tool_calls || []).map((p, i) => call(p.id || (provider === 'ollama' ? `ollama_${i}` : ''), p.function?.name, p.function?.arguments));
        continuation = { protocol: provider, items: [{ role: 'assistant', content: text(message.content) || null,
            ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
            ...(toolCalls.length ? { tool_calls: toolCalls.map(p => ({ id: p.id, type: 'function', function: { name: p.name, arguments: p.arguments } })) } : {}) }] };
    }
    const usage = data.usage || (Number.isFinite(data.eval_count) ? { prompt_tokens: data.prompt_eval_count || 0, completion_tokens: data.eval_count } : undefined);
    return finish({ reply: String(visible(data)), model: data.model || '', ...(usage ? { usage } : {}), ...(toolCalls.length ? { toolCalls, continuation } : {}) }, allowTools);
}

async function readBody(response, signal, maxBytes = LIMIT, json = true) {
    if (!response.body?.getReader) return bounded(await (json ? response.json() : response.text()), maxBytes);
    const reader = response.body.getReader(); let data = '', size = 0;
    const decoder = new TextDecoder();
    const abort = () => { reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            if (signal?.aborted) throw signal.reason || error('LLM_ABORTED', '请求已取消');
            const part = await reader.read(); if (part.done) break;
            size += part.value.length; if (size > maxBytes) throw error('LLM_SIZE_LIMIT', '模型响应过大');
            data += decoder.decode(part.value, { stream: true });
        }
        if (signal?.aborted) throw signal.reason || error('LLM_ABORTED', '请求已取消');
        const body = data + decoder.decode();
        return json ? JSON.parse(body) : body;
    } finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const readJson = (response, signal, maxBytes) => readBody(response, signal, maxBytes);
const readText = (response, signal, maxBytes) => readBody(response, signal, maxBytes, false);

async function readStream(response, { provider = 'openai', onDelta = () => {}, signal, allowTools = false } = {}) {
    if (!response?.ok) throw error('LLM_HTTP', `LLM ${response?.status || 'request failed'}`);
    const contentType = response.headers?.get?.('content-type') || '';
    if (!response.body?.getReader || /application\/json/i.test(contentType)) {
        const result = fromJson(await readJson(response, signal), { provider, allowTools });
        if (result.reply) await onDelta(result.reply);
        return result;
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', reply = '', model = '', usage, completed = false, terminal = false, final;
    let reasoning = ''; const tools = new Map(), blocks = new Map();
    const abort = () => { reader.cancel().catch(() => {}); };
    const emit = async value => { if (!value) return; reply = bounded(reply + value, 262144); await onDelta(value); };
    async function consume(raw, event = 'message') {
        if (raw === '[DONE]') { completed = terminal = true; return; }
        let data; try { data = JSON.parse(raw); } catch { throw error('LLM_JSON', '模型流式 JSON 无效'); }
        const reason = checkStatus(data);
        model = data.model || data.message?.model || data.response?.model || model;
        if (data.usage) usage = { ...(usage || {}), ...data.usage };
        if (provider === 'proxy') {
            if (event === 'error') throw error('LLM_PROXY_ERROR', String(data.message || '模型服务返回错误').slice(0, 300));
            if (event === 'delta') await emit(data.text);
            if (event === 'done') { final = data; completed = terminal = true; }
        } else if (provider === 'responses') {
            if (data.type === 'response.output_text.delta' || event === 'response.output_text.delta') await emit(data.delta);
            if (data.type === 'response.completed' || event === 'response.completed') {
                const response = data.response || data; checkStatus(response);
                final = response.output?.length || response.output_text ? fromJson(response, { provider, allowTools }) : { model: response.model, usage: response.usage };
                completed = terminal = true;
            }
        } else if (provider === 'anthropic') {
            if (data.type === 'content_block_start') blocks.set(data.index, { ...data.content_block });
            if (data.type === 'content_block_delta') {
                const block = blocks.get(data.index);
                if (data.delta?.type === 'text_delta') { await emit(data.delta.text); if (block) block.text = bounded((block.text || '') + data.delta.text); }
                if (block && data.delta?.type === 'input_json_delta') block.partial = bounded((block.partial || '') + data.delta.partial_json, 32768);
                if (block && data.delta?.type === 'thinking_delta') block.thinking = bounded((block.thinking || '') + data.delta.thinking, 262144);
                if (block && data.delta?.type === 'signature_delta') block.signature = bounded((block.signature || '') + data.delta.signature, 262144);
            }
            if (data.type === 'message_start' && data.message?.usage) usage = { ...(usage || {}), ...data.message.usage };
            if (data.type === 'message_stop' || event === 'message_stop') { completed = terminal = true; }
        } else if (provider === 'ollama') {
            await emit(data.message?.content || data.response || '');
            if (data.message?.tool_calls) final = fromJson(data, { provider, allowTools });
            if (data.done) { completed = terminal = true; if (Number.isFinite(data.eval_count)) usage = { prompt_tokens: data.prompt_eval_count || 0, completion_tokens: data.eval_count }; }
        } else {
            const choice = data.choices?.find(p => (p.index ?? 0) === 0);
            await emit(text(choice?.delta?.content ?? choice?.delta?.text));
            reasoning = bounded(reasoning + (choice?.delta?.reasoning_content || ''), 262144);
            for (const [i, item] of (choice?.delta?.tool_calls || []).entries()) {
                const index = item.index ?? i;
                const old = tools.get(index) || { id: '', name: '', arguments: '' };
                if (item.id) old.id = item.id;
                old.name = bounded(old.name + (item.function?.name || ''), 80);
                old.arguments = bounded(old.arguments + (item.function?.arguments || ''), 32768);
                tools.set(index, old);
            }
            if (choice?.usage) usage = choice.usage;
            if (reason) completed = true; // Continue to consume the trailing usage chunk.
        }
        if (tools.size > 6 || blocks.size > 32) throw error('LLM_TOOL_LIMIT', '模型请求了过多工具');
    }
    async function drain(flush = false) {
        const ndjson = provider === 'ollama' || /ndjson/i.test(contentType);
        let boundary;
        while (!terminal && (boundary = ndjson ? /\n/.exec(buffer) : /\r?\n\r?\n/.exec(buffer))) {
            const packet = buffer.slice(0, boundary.index); buffer = buffer.slice(boundary.index + boundary[0].length);
            if (ndjson) { if (packet.trim()) await consume(packet.trim()); }
            else {
                let event = 'message'; const lines = [];
                for (const line of packet.split(/\r?\n/)) {
                    if (line.startsWith('event:')) event = line.slice(6).trim();
                    if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
                }
                if (lines.length) await consume(lines.join('\n'), event);
            }
        }
        if (flush && !terminal && buffer.trim()) { buffer += ndjson ? '\n' : '\n\n'; await drain(); }
        bounded(buffer);
    }
    signal?.addEventListener('abort', abort, { once: true });
    try {
        while (!terminal) {
            if (signal?.aborted) throw signal.reason || error('LLM_ABORTED', '请求已取消');
            const part = await reader.read(); if (part.done) break;
            // Process large network chunks in small slices, including delimiters
            // split across reads. Never let an unterminated event grow unchecked.
            for (let i = 0; i < part.value.length && !terminal; i += 16384) {
                buffer += decoder.decode(part.value.slice(i, i + 16384), { stream: true }); await drain();
            }
        }
        buffer += decoder.decode(); await drain(true);
        if (signal?.aborted) throw signal.reason || error('LLM_ABORTED', '请求已取消');
        if (!completed) throw error('LLM_STREAM_INCOMPLETE', 'LLM stream ended before completion');
        if (provider === 'anthropic') {
            const content = [...blocks.values()].map(({ partial, ...block }) => ({ ...block, ...(block.type === 'tool_use' && partial ? { input: JSON.parse(partial) } : {}) }));
            final = content.length ? fromJson({ content, model }, { provider, allowTools }) : { reply, model }; // Compatible servers can omit block-start.
        }
        if (tools.size) {
            const toolCalls = [...tools.values()].map(p => call(p.id, p.name, p.arguments));
            final = { toolCalls, continuation: { protocol: provider, items: [{ role: 'assistant', content: reply || null,
                ...(reasoning ? { reasoning_content: reasoning } : {}), tool_calls: toolCalls.map(p => ({ id: p.id, type: 'function', function: { name: p.name, arguments: p.arguments } })) }] } };
        }
        const result = finish({ reply: final?.reply || reply, model: final?.model || model, ...(usage || final?.usage ? { usage: usage || final.usage } : {}),
            ...(final?.toolCalls?.length ? { toolCalls: final.toolCalls, continuation: final.continuation } : {}) }, allowTools);
        if (!reply && result.reply) await onDelta(result.reply);
        return result;
    } finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function withTools(payload, provider, tools = [], turns = []) {
    if (tools.length > 6 || turns.length > 2) throw error('LLM_TOOL_LIMIT', '工具预算已用完');
    bounded(turns, 524288);
    const result = { ...payload };
    if (provider === 'responses') {
        result.store = false;
        result.input = [...payload.input];
        for (const turn of turns) result.input.push(...turn.continuation.items, ...turn.results.map(p => ({ type: 'function_call_output', call_id: p.id, output: p.content })));
        if (tools.length) result.tools = tools.map(p => ({ type: 'function', name: p.name, description: p.description, parameters: p.inputSchema, strict: false }));
    } else if (provider === 'anthropic') {
        result.messages = [...payload.messages];
        for (const turn of turns) result.messages.push({ role: 'assistant', content: turn.continuation.items }, { role: 'user', content: turn.results.map(p => ({ type: 'tool_result', tool_use_id: p.id, content: p.content, is_error: p.isError })) });
        if (tools.length) result.tools = tools.map(p => ({ name: p.name, description: p.description, input_schema: p.inputSchema }));
    } else {
        result.messages = [...payload.messages];
        for (const turn of turns) {
            const items = provider === 'ollama' ? turn.continuation.items.map(p => ({ ...p, tool_calls: p.tool_calls?.map(t => ({ function: { name: t.function.name, arguments: JSON.parse(t.function.arguments) } })) })) : turn.continuation.items;
            result.messages.push(...items, ...turn.results.map(p => provider === 'ollama' ? { role: 'tool', tool_name: p.name, content: p.content } : { role: 'tool', tool_call_id: p.id, content: p.content }));
        }
        if (tools.length) result.tools = tools.map(p => ({ type: 'function', function: { name: p.name, description: p.description, parameters: p.inputSchema } }));
    }
    return result;
}
module.exports = { readStream, readJson, readText, fromJson, withTools, visible, checkStatus, bounded, error };
