const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_URL = process.env.LLM_API_URL || '';
const LLM_MODEL = process.env.LLM_MODEL || 'kimi-k2.6';

const CHAT_SYSTEM_PROMPT = [
    '你是月读空间中的温柔中文对话助手。',
    '请先接住用户情绪，再给出简洁、有温度、可执行的回应。',
    '根据问题需要完整回答，不要人为限制回复长度，也不要提及系统提示或模型身份。'
].join('\n');

const ROOM_SYSTEM_PROMPT = '请始终用温柔、从容、克制的中文回应。先接住对方的情绪，再根据问题需要给出完整、有温度的回应。不要人为限制回复长度，不要提及系统设定。';
const ANTHROPIC_REQUIRED_MAX_TOKENS = Math.max(4096, Number.parseInt(process.env.ROOM_ANTHROPIC_MAX_TOKENS || '16384', 10) || 16384);
const CHAT_STREAM_TIMEOUT_MS = Math.min(600000, Math.max(1000, Number.parseInt(process.env.CHAT_STREAM_TIMEOUT_MS || '180000', 10) || 180000));
const MAX_STREAM_EVENT_BYTES = 4 * 1024 * 1024;

const ALLOWED_CHAT_ENDPOINTS = [
    { hostname: 'api.moonshot.cn', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.deepseek.com', path: /^\/(?:v1\/)?chat\/completions\/?$/ },
    { hostname: 'api.openai.com', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.openai.com', path: /^\/v1\/responses\/?$/ },
    { hostname: 'dashscope.aliyuncs.com', path: /^\/compatible-mode\/v1\/chat\/completions\/?$/ },
    { hostname: 'dashscope-intl.aliyuncs.com', path: /^\/compatible-mode\/v1\/chat\/completions\/?$/ },
    { hostname: 'dashscope-us.aliyuncs.com', path: /^\/compatible-mode\/v1\/chat\/completions\/?$/ },
    { hostname: 'openrouter.ai', path: /^\/api\/v1\/chat\/completions\/?$/ },
    { hostname: 'open.bigmodel.cn', path: /^\/api\/paas\/v4\/chat\/completions\/?$/ },
    { hostname: 'api.siliconflow.cn', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'ark.cn-beijing.volces.com', path: /^\/api\/v3\/chat\/completions\/?$/ },
    { hostname: 'api.minimaxi.com', path: /^\/anthropic\/v1\/messages\/?$/ },
    { hostname: 'api.anthropic.com', path: /^\/v1\/messages\/?$/ },
    { hostname: 'api.groq.com', path: /^\/openai\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.mistral.ai', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.together.xyz', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.perplexity.ai', path: /^\/chat\/completions\/?$/ },
    { hostname: 'api.x.ai', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.x.ai', path: /^\/v1\/responses\/?$/ },
    { hostname: 'generativelanguage.googleapis.com', path: /^\/v1beta\/openai\/chat\/completions\/?$/ },
    { hostname: 'api.xiaomimimo.com', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'token-plan-cn.xiaomimimo.com', path: /^\/v1\/chat\/completions\/?$/ }
];
const OLLAMA_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const OLLAMA_CHAT_PATHS = [/^\/api\/chat\/?$/, /^\/v1\/chat\/completions\/?$/];

class LLMEndpointError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LLMEndpointError';
        this.statusCode = 400;
    }
}

function normalizeChatUrl(apiUrl, model) {
    let url = normalizeLocalChatUrl(apiUrl || LLM_API_URL || 'https://api.moonshot.cn/v1/chat/completions');
    if (isOllamaCandidate(url)) {
        return validateChatUrl(normalizeOllamaChatUrl(url));
    }
    if (/(api\.openai\.com|api\.x\.ai)\/v1\/responses\/?$/i.test(url)) {
        return validateChatUrl(url.replace(/\/$/, ''));
    }
    if (/(api\.openai\.com|api\.x\.ai)\/v1\/?$/i.test(url)) {
        return validateChatUrl(url.replace(/\/$/, '') + '/responses');
    }
    if (/minimaxi\.com\/anthropic|\/anthropic\/v1\/messages|MiniMax-M2/i.test(`${url} ${model || ''}`)) {
        return validateChatUrl(url.replace(/\/$/, '').replace(/\/anthropic$/, '/anthropic/v1/messages'));
    }
    if (/anthropic/i.test(url + model) && !/\/v1\/messages\/?$/.test(url)) {
        url = url.replace(/\/$/, '') + '/v1/messages';
    }
    const needsChatPath = /deepseek|dashscope|aliyuncs|openai|openrouter|moonshot|bigmodel|zhipu|siliconflow|volces|ark|groq|mistral|together|perplexity|x\.ai|generativelanguage|xiaomimimo|token-plan-cn/i.test(url + model) && !/\/chat\/completions\/?$/.test(url);
    if (needsChatPath) url = url.replace(/\/$/, '') + '/chat/completions';
    return validateChatUrl(url);
}

function normalizeLocalChatUrl(url) {
    const value = String(url || '').trim();
    if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value)) return `http://${value}`;
    return value;
}

function isOllamaCandidate(url) {
    try {
        const parsed = new URL(normalizeLocalChatUrl(url));
        return OLLAMA_LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) && (parsed.port || '11434') === '11434';
    } catch (_) {
        return false;
    }
}

function normalizeOllamaChatUrl(url) {
    const parsed = new URL(normalizeLocalChatUrl(url));
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/' || pathname === '/api') parsed.pathname = '/api/chat';
    else if (pathname === '/v1') parsed.pathname = '/v1/chat/completions';
    return parsed.toString();
}

function isAllowedOllamaUrl(parsed) {
    return parsed.protocol === 'http:'
        && !parsed.username
        && !parsed.password
        && !parsed.search
        && !parsed.hash
        && OLLAMA_LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())
        && (parsed.port || '11434') === '11434'
        && OLLAMA_CHAT_PATHS.some(path => path.test(parsed.pathname));
}

function isOllamaChatUrl(chatUrl) {
    try {
        return isAllowedOllamaUrl(new URL(chatUrl));
    } catch (_) {
        return false;
    }
}

function isOllamaNativeChatUrl(chatUrl) {
    try {
        const parsed = new URL(chatUrl);
        return isAllowedOllamaUrl(parsed) && /^\/api\/chat\/?$/.test(parsed.pathname);
    } catch (_) {
        return false;
    }
}

function validateChatUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (_) {
        throw new LLMEndpointError('不支持的 LLM API 端点');
    }

    if (isAllowedOllamaUrl(parsed)) return parsed.toString();

    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new LLMEndpointError('不支持的 LLM API 端点');
    }

    const hostname = parsed.hostname.toLowerCase();
    const allowed = ALLOWED_CHAT_ENDPOINTS.some(endpoint => (
        hostname === endpoint.hostname && endpoint.path.test(parsed.pathname)
    ));

    if (!allowed) {
        throw new LLMEndpointError('不支持的 LLM API 端点');
    }

    return parsed.toString();
}

function fallbackChatReply() {
    const presetReplies = [
        '我在这里，愿意慢慢听你说。',
        '今天也想和你聊聊天。',
        '不用着急，我们可以从这一刻开始。',
        '这里是属于我们的安静空间。'
    ];
    return presetReplies[Math.floor(Math.random() * presetReplies.length)];
}

function fallbackRoomReply(message) {
    const presets = [
        '嗯，我听见了。你可以慢慢说，我会在这里。',
        '别急，今晚的时间还很长。我们一点一点来。',
        '谢谢你把这句话交给我。它值得被认真对待。',
        '月读的灯还亮着。愿意的话，我们就从这一刻开始聊。'
    ];
    const index = Math.abs(String(message || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % presets.length;
    return presets[index];
}

function pickReply(data) {
    if (data.output_text) return String(data.output_text || '').trim();
    if (Array.isArray(data.output)) {
        return data.output
            .flatMap(item => Array.isArray(item?.content) ? item.content : [])
            .filter(block => block?.type === 'output_text' || block?.type === 'text')
            .map(block => block.text || '')
            .join('\n')
            .trim();
    }
    if (Array.isArray(data.content)) {
        return data.content.filter(block => block?.type === 'text').map(block => block.text || '').join('\n').trim();
    }
    return data.choices?.[0]?.message?.content
        || data.choices?.[0]?.text
        || data.message?.content
        || data.response
        || '';
}

function isAnthropicChatUrl(chatUrl, model) {
    return /\/anthropic\/v1\/messages\/?$|anthropic\.com\/v1\/messages\/?$/i.test(String(chatUrl || ''))
        || /MiniMax-M2/i.test(String(model || ''));
}

function isOpenAIResponsesUrl(chatUrl) {
    return /(api\.openai\.com|api\.x\.ai)\/v1\/responses\/?$/i.test(String(chatUrl || '').replace(/\/$/, ''));
}

function isOpenRouterUrl(chatUrl) {
    return /openrouter\.ai\/api\/v1\/chat\/completions\/?$/i.test(String(chatUrl || '').replace(/\/$/, ''));
}

function isKimiChatTarget(chatUrl, model) {
    return /api\.moonshot\.cn|moonshot|kimi/i.test(`${chatUrl || ''} ${model || ''}`);
}

function chatTemperatureFor(chatUrl, model, fallback) {
    return isKimiChatTarget(chatUrl, model) ? 1 : fallback;
}

function isMiniMaxAnthropicText(chatUrl, model) {
    return /minimaxi\.com\/anthropic|\/anthropic\/v1\/messages\/?$|MiniMax-M2/i.test(`${chatUrl || ''} ${model || ''}`);
}

function parseDataUrl(dataUrl = '') {
    const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) return null;
    return { mediaType: match[1], data: match[2] };
}

function buildAnthropicUserContent(message, image, allowImage) {
    const text = String(message || (image ? '请描述这张图片。' : ''));
    if (!image?.dataUrl || !allowImage) return text;
    const parsed = parseDataUrl(image.dataUrl);
    if (!parsed) return text;
    return [
        { type: 'text', text },
        {
            type: 'image',
            source: {
                type: 'base64',
                media_type: parsed.mediaType,
                data: parsed.data
            }
        }
    ];
}

function buildChatPayload({ chatUrl, model, systemPrompt, history, message, image }) {
    if (isOllamaNativeChatUrl(chatUrl)) {
        const userMessage = {
            role: 'user',
            content: String(message || (image ? '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\u3002' : ''))
        };
        const parsedImage = image?.dataUrl ? parseDataUrl(image.dataUrl) : null;
        if (parsedImage?.data) userMessage.images = [parsedImage.data];
        return {
            model: model || 'qwen2.5:7b',
            messages: [
                { role: 'system', content: systemPrompt },
                ...history.map(item => ({ role: item.role, content: String(item.content || '') })),
                userMessage
            ],
            stream: false,
            options: {
                temperature: chatTemperatureFor(chatUrl, model, 0.7)
            }
        };
    }
    if (isOpenAIResponsesUrl(chatUrl)) {
        const userContent = image?.dataUrl
            ? [
                { type: 'input_text', text: String(message || '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\u3002') },
                { type: 'input_image', image_url: image.dataUrl }
            ]
            : String(message || '');
        return {
            model: model || 'gpt-5.5',
            instructions: systemPrompt,
            input: [
                ...history.map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '') })),
                { role: 'user', content: userContent }
            ]
        };
    }
    if (isAnthropicChatUrl(chatUrl, model)) {
        const allowImage = !isMiniMaxAnthropicText(chatUrl, model);
        return {
            model,
            system: systemPrompt,
            messages: [
                ...history.map(item => ({ role: item.role, content: String(item.content || '') })),
                { role: 'user', content: buildAnthropicUserContent(message, image, allowImage) }
            ],
            temperature: 1,
            // Anthropic-compatible APIs require this protocol field. Keep it high so the app does not impose a short reply cap.
            max_tokens: ANTHROPIC_REQUIRED_MAX_TOKENS,
            stream: false
        };
    }
    const userContent = image?.dataUrl
        ? [
            { type: 'text', text: String(message || '请描述这张图片。') },
            { type: 'image_url', image_url: { url: image.dataUrl } }
        ]
        : String(message || '');
    return {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...history.map(item => ({ role: item.role, content: String(item.content || '') })),
            { role: 'user', content: userContent }
        ],
        temperature: chatTemperatureFor(chatUrl, model, 0.7),
        stream: false
    };
}

function chatHeaders(chatUrl, apiKey, model) {
    if (isAnthropicChatUrl(chatUrl, model)) {
        return {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        };
    }
    const headers = {
        'Content-Type': 'application/json'
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (isOpenRouterUrl(chatUrl)) {
        headers['HTTP-Referer'] = process.env.PUBLIC_SITE_URL || 'https://yachiyo.hk';
        headers['X-OpenRouter-Title'] = process.env.OPENROUTER_APP_TITLE || 'Tsukuyomi Space';
    }
    return headers;
}

async function createChatCompletion({ message, conversation = [], apiKey, apiUrl, model, systemPrompt = CHAT_SYSTEM_PROMPT, image }) {
    const useApiKey = apiKey || LLM_API_KEY;
    const useModel = model || LLM_MODEL;

    const history = Array.isArray(conversation)
        ? conversation.filter(item => item && ['user', 'assistant'].includes(item.role)).slice(-12)
        : [];
    const chatUrl = normalizeChatUrl(apiUrl, useModel);

    if (!useApiKey && !isOllamaChatUrl(chatUrl)) {
        return { reply: fallbackChatReply(), model: 'preset' };
    }

    const response = await fetch(chatUrl, {
        method: 'POST',
        headers: chatHeaders(chatUrl, useApiKey, useModel),
        body: JSON.stringify(buildChatPayload({ chatUrl, model: useModel, systemPrompt, history, message, image }))
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM request failed (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const reply = pickReply(data);
    if (!reply) throw new Error('LLM response did not contain a reply');
    return { reply, model: data.model || useModel };
}

function streamDelta(data, event = '') {
    if (!data || typeof data !== 'object') return '';
    if (event === 'response.output_text.delta' || data.type === 'response.output_text.delta') {
        return typeof data.delta === 'string' ? data.delta : '';
    }
    if (event === 'content_block_delta' || data.type === 'content_block_delta') {
        return data.delta?.type === 'text_delta' && typeof data.delta.text === 'string' ? data.delta.text : '';
    }
    if (Array.isArray(data.choices)) {
        return data.choices.map(choice => {
            const content = choice?.delta?.content ?? choice?.delta?.text;
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) return content.filter(part => part?.type === 'text').map(part => part.text || '').join('');
            return '';
        }).join('');
    }
    if (typeof data.message?.content === 'string' && data.done !== true) return data.message.content;
    if (typeof data.response === 'string' && data.done !== true) return data.response;
    return '';
}

function streamUsage(data) {
    if (data?.usage && typeof data.usage === 'object') return data.usage;
    if (data?.response?.usage && typeof data.response.usage === 'object') return data.response.usage;
    if (Number.isFinite(data?.prompt_eval_count) || Number.isFinite(data?.eval_count)) {
        return {
            prompt_tokens: data.prompt_eval_count || 0,
            completion_tokens: data.eval_count || 0
        };
    }
    return null;
}

function streamError(data, event = '') {
    const finishReasons = Array.isArray(data?.choices)
        ? data.choices.map(choice => choice?.finish_reason).filter(Boolean)
        : [];
    if (finishReasons.includes('length') || data?.delta?.stop_reason === 'max_tokens'
        || data?.message?.stop_reason === 'max_tokens' || data?.type === 'response.incomplete') {
        return new Error('模型输出达到长度上限，回复未保存，请重试');
    }
    if (finishReasons.some(reason => ['content_filter', 'tool_calls', 'function_call'].includes(reason))
        || data?.delta?.stop_reason === 'tool_use' || data?.type === 'response.failed') {
        return new Error('模型没有完成可显示的回复，请重试');
    }
    if (event !== 'error' && data?.type !== 'error' && !data?.error) return null;
    const detail = data?.error?.message || data?.message;
    return new Error(typeof detail === 'string' ? detail.slice(0, 300) : '模型流式响应失败');
}

async function createChatCompletionStream({
    message, conversation = [], apiKey, apiUrl, model, systemPrompt = CHAT_SYSTEM_PROMPT, image,
    signal, onDelta = () => {}
}) {
    const useApiKey = apiKey || LLM_API_KEY;
    const useModel = model || LLM_MODEL;
    const history = Array.isArray(conversation)
        ? conversation.filter(item => item && ['user', 'assistant'].includes(item.role)).slice(-12)
        : [];
    const chatUrl = normalizeChatUrl(apiUrl, useModel);
    if (!useApiKey && !isOllamaChatUrl(chatUrl)) {
        const reply = fallbackChatReply();
        if (signal?.aborted) throw signal.reason || new Error('请求已取消');
        await onDelta(reply);
        return { reply, model: 'preset' };
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal.reason || new Error('请求已取消'));
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error('模型响应超时')), CHAT_STREAM_TIMEOUT_MS);
    let reader;
    try {
        const payload = { ...buildChatPayload({ chatUrl, model: useModel, systemPrompt, history, message, image }), stream: true };
        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: chatHeaders(chatUrl, useApiKey, useModel),
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        if (!response.ok) {
            const error = new Error(`模型请求失败（HTTP ${response.status}）`);
            error.statusCode = response.status;
            throw error;
        }
        if (!response.body?.getReader) throw new Error('模型没有返回可读取的流');

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        const isNdjson = isOllamaNativeChatUrl(chatUrl) || /(?:x-ndjson|ndjson)/i.test(response.headers?.get?.('content-type') || '');
        let buffer = '';
        let reply = '';
        let usage = null;
        let finalModel = useModel;
        let streamFinished = false;

        const applyPayload = async (data, event) => {
            if (data === '[DONE]') {
                streamFinished = true;
                return;
            }
            const parsed = JSON.parse(data);
            const providerError = streamError(parsed, event);
            if (providerError) throw providerError;
            const delta = streamDelta(parsed, event);
            if (delta) {
                reply += delta;
                await onDelta(delta);
            }
            usage = streamUsage(parsed) || usage;
            finalModel = parsed?.model || parsed?.response?.model || finalModel;
            if (event === 'message_stop' || parsed?.type === 'message_stop'
                || event === 'response.completed' || parsed?.type === 'response.completed'
                || (Array.isArray(parsed?.choices) && parsed.choices.some(choice => choice?.finish_reason != null))) {
                streamFinished = true;
            }
            if (!reply && (event === 'response.completed' || parsed?.type === 'response.completed')) {
                const finalText = pickReply(parsed.response || parsed);
                if (finalText) {
                    reply = finalText;
                    await onDelta(finalText);
                }
            }
            if (parsed?.done === true) streamFinished = true;
        };

        const applySsePacket = async (packet) => {
            let event = 'message';
            const lines = [];
            for (const line of packet.split(/\r?\n/)) {
                if (line.startsWith('event:')) event = line.slice(6).trim() || 'message';
                else if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
            }
            if (lines.length) await applyPayload(lines.join('\n'), event);
        };

        while (!streamFinished) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            if (isNdjson) {
                let end;
                while (!streamFinished && (end = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, end).trim();
                    buffer = buffer.slice(end + 1);
                    if (line) await applyPayload(line, 'message');
                }
            } else {
                let boundary;
                while (!streamFinished && (boundary = /\r?\n\r?\n/.exec(buffer))) {
                    const packet = buffer.slice(0, boundary.index);
                    buffer = buffer.slice(boundary.index + boundary[0].length);
                    await applySsePacket(packet);
                }
            }
            if (Buffer.byteLength(buffer, 'utf8') > MAX_STREAM_EVENT_BYTES) throw new Error('模型流式事件过大');
        }
        buffer += decoder.decode();
        if (!streamFinished && buffer.trim()) {
            if (isNdjson) await applyPayload(buffer.trim(), 'message');
            else await applySsePacket(buffer);
        }
        if (controller.signal.aborted) throw controller.signal.reason || new Error('请求已取消');
        if (!streamFinished) throw new Error('模型流式响应中断，请重试本轮对话');
        if (!reply) throw new Error('模型没有返回可显示的回复');
        return { reply, model: finalModel, ...(usage ? { usage } : {}) };
    } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason || error;
        throw error;
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abortFromCaller);
        if (reader) await reader.cancel().catch(() => {});
    }
}

module.exports = {
    ALLOWED_CHAT_ENDPOINTS,
    LLMEndpointError,
    ROOM_SYSTEM_PROMPT,
    createChatCompletion,
    createChatCompletionStream,
    fallbackRoomReply,
    buildChatPayload,
    chatTemperatureFor,
    isOllamaChatUrl,
    isOllamaNativeChatUrl,
    normalizeChatUrl,
    validateChatUrl
};
