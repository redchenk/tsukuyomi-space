// Only documented, read-only model-list endpoints. Model authors do not
// identify the service hosting them; keep provider IDs exactly as returned.
const MAX_MODELS = 2000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const PROVIDERS = {
    openai: { label: 'OpenAI', hosts: ['api.openai.com'], path: '/v1/models' },
    openrouter: { label: 'OpenRouter', hosts: ['openrouter.ai'], path: '/api/v1/models/user' },
    deepseek: { label: 'DeepSeek', hosts: ['api.deepseek.com'], path: '/models' },
    kimi: { label: 'Kimi', hosts: ['api.moonshot.cn', 'api.moonshot.ai'], path: '/v1/models' },
    siliconflow: { label: 'SiliconFlow', hosts: ['api.siliconflow.cn', 'api.siliconflow.com'], path: '/v1/models', query: { sub_type: 'chat' } },
    groq: { label: 'Groq', hosts: ['api.groq.com'], path: '/openai/v1/models' },
    mistral: { label: 'Mistral', hosts: ['api.mistral.ai'], path: '/v1/models' },
    together: { label: 'Together', hosts: ['api.together.xyz', 'api.together.ai'], path: '/v1/models' },
    xai: { label: 'Grok', hosts: ['api.x.ai', 'us.api.x.ai'], path: '/v1/models' },
    gemini: { label: 'Gemini', hosts: ['generativelanguage.googleapis.com'], path: '/v1beta/models' },
    aliyun: { label: '阿里云百炼', hosts: ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com', 'cn-hongkong.dashscope.aliyuncs.com'] },
    zhipu: { label: '智谱 GLM', hosts: ['open.bigmodel.cn'], reason: '智谱暂未提供已核验的模型列表接口；预设仅作示例，请以控制台模型 ID 为准。' },
    volcengine: { label: '火山方舟', hosts: ['ark.cn-beijing.volces.com'], reason: '火山方舟的接入点列表需要独立管理权限；请填写控制台的接入点 ID，本页不会索取管理密钥。' },
    minimax: { label: 'MiniMax', hosts: ['api.minimaxi.com', 'api.minimax.io'], reason: 'MiniMax 暂未提供已核验的模型列表接口；预设仅作示例，支持手动填写模型 ID。' },
    mimo: { label: 'MiMo', hosts: ['api.xiaomimimo.com', 'token-plan-cn.xiaomimimo.com'], reason: 'MiMo 暂未提供已核验的模型列表接口；请按标准模式或 Token Plan 的控制台填写模型 ID。' },
    perplexity: { label: 'Perplexity', hosts: ['api.perplexity.ai'], reason: 'Perplexity 暂未提供已核验的模型列表接口；预设仅作示例，支持手动填写模型 ID。' }
};
const WORKSPACE_HOST = /^[a-z0-9][a-z0-9-]{0,63}\.(cn-beijing|us-east-1|ap-southeast-1|ap-northeast-1|eu-central-1|cn-hongkong)\.maas\.aliyuncs\.com$/;
const fail = (code, message) => Object.assign(new Error(message), { code });
function parseEndpoint(value) {
    try {
        const url = new URL(String(value || '').trim());
        if (url.username || url.password || url.search || url.hash || (url.port && url.port !== '443')) return null;
        return url;
    } catch (_) { return null; }
}
function detectProvider(value) {
    // Local Ollama is separate from the cloud relay and never reaches it.
    try {
        const local = new URL(value);
        if (['localhost', '127.0.0.1', '[::1]'].includes(local.hostname) && local.port === '11434') return 'ollama';
    } catch (_) { /* Invalid/incomplete form input. */ }
    const url = parseEndpoint(value);
    if (!url || url.protocol !== 'https:') return 'custom';
    if (WORKSPACE_HOST.test(url.hostname)) return 'aliyun';
    return Object.keys(PROVIDERS).find(id => PROVIDERS[id].hosts.includes(url.hostname)) || 'custom';
}
function catalogPlan({ apiUrl, apiKey = '', workspaceId = '', cursor = '' } = {}) {
    const provider = detectProvider(apiUrl);
    const spec = PROVIDERS[provider];
    if (!spec) throw fail('UNSUPPORTED', provider === 'ollama' ? '本机模型请填写已下载的模型名称。' : '自定义端点不自动转发密钥；请手动填写完整模型 ID。');
    if (spec.reason) throw fail('UNSUPPORTED', spec.reason);
    const chat = parseEndpoint(apiUrl);
    if (!/\/(?:chat\/completions|responses|messages)\/?$/.test(chat.pathname)) throw fail('INVALID_ENDPOINT', '请填写服务商的完整聊天 API 端点。');
    let host = chat.hostname;
    let path = spec.path;
    if (provider === 'aliyun') {
        path = '/api/v1/models';
        if (['dashscope.aliyuncs.com', 'dashscope-us.aliyuncs.com'].includes(host)) {
            if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(workspaceId)) throw fail('WORKSPACE_REQUIRED', '此地域的百炼模型列表需要工作空间 ID，可在高级设置填写；原聊天端点和模型保持不变。');
            host = `${workspaceId}.${host === 'dashscope.aliyuncs.com' ? 'cn-beijing' : 'us-east-1'}.maas.aliyuncs.com`;
        }
    }
    const publicList = provider === 'openrouter' && !String(apiKey).trim();
    if (publicList) path = '/api/v1/models';
    if (!publicList && !String(apiKey).trim()) throw fail('KEY_REQUIRED', '填写当前服务商的 API 密钥后会自动更新模型列表。');
    if (typeof apiKey !== 'string' || apiKey.length > 2048 || /[\r\n\x00-\x1f\x7f]/.test(apiKey)) throw fail('INVALID_KEY', 'API 密钥格式无效。');
    const url = new URL(`https://${host}${path}`);
    const headers = { Accept: 'application/json' };
    if (apiKey.trim()) headers[provider === 'gemini' ? 'x-goog-api-key' : 'Authorization'] = provider === 'gemini' ? apiKey.trim() : `Bearer ${apiKey.trim()}`;
    if (typeof cursor !== 'string' || cursor.length > 1024 || /[\x00-\x1f\x7f]/.test(cursor)) throw fail('INVALID_CURSOR', '模型列表分页游标无效。');
    for (const [key, value] of Object.entries(spec.query || {})) url.searchParams.set(key, value);
    if (provider === 'gemini') { url.searchParams.set('pageSize', '1000'); if (cursor) url.searchParams.set('pageToken', cursor); }
    else if (provider === 'aliyun') {
        if (cursor && !/^[1-9]\d{0,2}$/.test(cursor)) throw fail('INVALID_CURSOR', '模型列表分页游标无效。');
        url.searchParams.set('page_no', cursor || '1'); url.searchParams.set('page_size', '100'); url.searchParams.set('capabilities', 'TG');
    } else if (provider === 'openrouter') {
        if (cursor && !/^\d{1,5}$/.test(cursor)) throw fail('INVALID_CURSOR', '模型列表分页游标无效。');
        url.searchParams.set('offset', cursor || '0'); url.searchParams.set('limit', '500');
    } else if (cursor) throw fail('INVALID_CURSOR', '此服务商不支持该分页游标。');
    return { provider, label: spec.label, url: url.toString(), headers, publicList };
}
function modalities(values) { return Array.isArray(values) ? values.filter(v => typeof v === 'string').slice(0, 8).map(v => v.toLowerCase()) : []; }
function normalizePage(payload, plan, cursor = '') {
    if (!payload || typeof payload !== 'object' || payload.error || payload.success === false) throw fail('INVALID_RESPONSE', '服务商返回的模型列表无效。');
    const rows = plan.provider === 'gemini' ? payload.models : plan.provider === 'aliyun' ? payload.output?.models : Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows) || rows.length > MAX_MODELS) throw fail('INVALID_RESPONSE', '服务商返回的模型列表格式或大小不符合要求。');
    const models = [];
    const seen = new Set();
    for (const row of rows) {
        if (!row || typeof row !== 'object' || row.active === false || row.archived === true) continue;
        let id = plan.provider === 'gemini' ? row.name?.replace(/^models\//, '') : row.id || row.model;
        if (typeof id !== 'string' || !id.trim() || id.length > 240 || /[\x00-\x20\x7f]/.test(id) || seen.has(id)) continue;
        if (row.shutdown_date && Date.parse(row.shutdown_date) <= Date.now()) continue;
        // Prefer explicit capabilities. Unknown metadata is not proof that a
        // multimodal chat model cannot chat; exclude only clear non-chat IDs.
        if (plan.provider === 'gemini' && !row.supportedGenerationMethods?.includes('generateContent')) continue;
        if (plan.provider === 'mistral' && row.capabilities?.completion_chat === false) continue;
        if (plan.provider === 'together' && row.type && row.type !== 'chat') continue;
        const input = modalities(row.architecture?.input_modalities || row.input_modalities || row.inference_metadata?.request_modality);
        const output = modalities(row.architecture?.output_modalities || row.output_modalities || row.inference_metadata?.response_modality);
        if (output.length && !output.includes('text')) continue;
        if (/(?:embedding|embed-|rerank|moderation|whisper|(?:^|[-/])tts(?:[-/]|$)|dall-e|image-generation|speech|(?:^|[-/])guard(?:[-/]|$))/i.test(id)) continue;
        seen.add(id);
        const created = Number(row.created) || (row.published_time ? Date.parse(row.published_time.replace(' ', 'T') + '+08:00') / 1000 : 0);
        const vision = row.capabilities?.vision === true;
        models.push({ id, nativeId: id, label: String(row.displayName || row.display_name || row.name || id).slice(0, 160),
            contextLength: Math.max(0, Number(row.context_length || row.context_window || row.max_context_length || row.inputTokenLimit || row.model_info?.max_input_tokens) || 0),
            created: Number.isFinite(created) ? created : 0, inputModalities: input.length ? input : vision ? ['text', 'image'] : ['text'],
            outputModalities: output.length ? output : ['text'], source: 'provider' });
    }
    let nextCursor = '';
    if (plan.provider === 'gemini') nextCursor = String(payload.nextPageToken || '');
    if (plan.provider === 'aliyun' && Number(payload.output?.total) > (Number(cursor) || 1) * 100) nextCursor = String((Number(cursor) || 1) + 1);
    if (plan.provider === 'openrouter' && rows.length === 500) nextCursor = String((Number(cursor) || 0) + 500);
    if (nextCursor.length > 1024) throw fail('INVALID_RESPONSE', '服务商返回了无效的分页游标。');
    return { models, nextCursor };
}
function statusError(status) {
    const table = { 401: ['AUTH_FAILED', '密钥无效或已过期，请检查当前服务商和地域。'], 403: ['ACCESS_DENIED', '当前密钥没有模型列表权限，请检查账号授权和地域。'],
        404: ['NOT_SUPPORTED', '此服务商端点暂不支持模型列表，仍可手动填写模型。'], 429: ['RATE_LIMIT', '服务商请求限流，请稍后手动刷新。'] };
    const [code, message] = table[status] || ['UPSTREAM_FAILED', `模型列表服务暂不可用（HTTP ${status}），请稍后重试。`];
    return Object.assign(fail(code, message), { status });
}
module.exports = { PROVIDERS, MAX_MODELS, MAX_PAGE_BYTES, detectProvider, catalogPlan, normalizePage, statusError };
