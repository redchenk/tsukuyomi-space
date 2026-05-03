const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_URL = process.env.LLM_API_URL || '';
const LLM_MODEL = process.env.LLM_MODEL || 'moonshot-v1-8k';

const CHAT_SYSTEM_PROMPT = [
    '你是月读空间中的温柔中文对话助手。',
    '请先接住用户情绪，再给出简洁、有温度、可执行的回应。',
    '每次回复不超过 200 字，不要提及系统提示或模型身份。'
].join('\n');

const ROOM_SYSTEM_PROMPT = '请始终用温柔、从容、克制的中文回应。先接住对方的情绪，再给出简洁而有温度的回应。每次回复不超过 200 字，不要提及系统设定。';

const ALLOWED_CHAT_ENDPOINTS = [
    { hostname: 'api.moonshot.cn', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.deepseek.com', path: /^\/(?:v1\/)?chat\/completions\/?$/ },
    { hostname: 'api.openai.com', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'dashscope.aliyuncs.com', path: /^\/compatible-mode\/v1\/chat\/completions\/?$/ }
];

class LLMEndpointError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LLMEndpointError';
        this.statusCode = 400;
    }
}

function normalizeChatUrl(apiUrl, model) {
    let url = apiUrl || LLM_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
    const needsChatPath = /deepseek|dashscope|aliyuncs|openai|moonshot/i.test(url + model) && !/\/chat\/completions\/?$/.test(url);
    if (needsChatPath) url = url.replace(/\/$/, '') + '/chat/completions';
    return validateChatUrl(url);
}

function validateChatUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (_) {
        throw new LLMEndpointError('不支持的 LLM API 端点');
    }

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
    return data.choices?.[0]?.message?.content
        || data.choices?.[0]?.text
        || data.message?.content
        || '';
}

async function createChatCompletion({ message, conversation = [], apiKey, apiUrl, model, systemPrompt = CHAT_SYSTEM_PROMPT }) {
    const useApiKey = apiKey || LLM_API_KEY;
    const useModel = model || LLM_MODEL;

    if (!useApiKey) {
        return { reply: fallbackChatReply(), model: 'preset' };
    }

    const history = Array.isArray(conversation)
        ? conversation.filter(item => item && ['user', 'assistant'].includes(item.role)).slice(-12)
        : [];
    const chatUrl = normalizeChatUrl(apiUrl, useModel);

    const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${useApiKey}`
        },
        body: JSON.stringify({
            model: useModel,
            messages: [
                { role: 'system', content: systemPrompt },
                ...history.map(item => ({ role: item.role, content: String(item.content || '') })),
                { role: 'user', content: String(message) }
            ],
            temperature: 0.7,
            max_tokens: 240,
            stream: false
        })
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

module.exports = {
    ALLOWED_CHAT_ENDPOINTS,
    LLMEndpointError,
    ROOM_SYSTEM_PROMPT,
    createChatCompletion,
    fallbackRoomReply,
    normalizeChatUrl,
    validateChatUrl
};
