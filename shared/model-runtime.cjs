// Independent Room implementation. Only predefined parameter paths can reach
// the provider; runtime metadata never contains credentials or request content.
const PARAMS = {
    temperature: { label: '温度', min: 0, max: 2, fields: ['temperature', 'options.temperature'] },
    topP: { label: 'Top P', min: 0.001, max: 1, fields: ['top_p', 'options.top_p'] },
    maxOutputTokens: { label: '最大输出 Token', min: 16, max: 131072, integer: true, fields: ['max_tokens', 'max_completion_tokens', 'max_output_tokens', 'options.num_predict'] },
    reasoningEffort: { label: '推理强度', values: ['low', 'medium', 'high'], fields: ['reasoning_effort', 'reasoning.effort'] },
    reasoningEnabled: { label: '思考模式', values: [true, false], fields: ['think', 'enable_thinking'] }
};
const CAPABILITIES = { text: '文本对话', image: '图片输入', tools: '工具调用', streaming: '流式输出' };
const SOURCE_LABELS = { unknown: '未声明', builtin: '内置声明', provider: '供应商声明', manual: '人工覆盖' };
const fail = message => Object.assign(new Error(message), { code: 'MODEL_RUNTIME_INVALID', statusCode: 400 });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function canonicalUrl(apiUrl) {
    const url = new URL(apiUrl);
    let path = url.pathname.replace(/\/$/, '') || '/';
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && (url.port || '11434') === '11434';
    if (local && ['/', '/api'].includes(path)) path = '/api/chat';
    else if (url.hostname === 'api.anthropic.com' && ['/', '/v1'].includes(path)) path = '/v1/messages';
    else if (path === '/v1') path += /^(api\.openai\.com|api\.x\.ai)$/.test(url.hostname) ? '/responses' : '/chat/completions';
    url.pathname = path;
    return url;
}
function protocolFor(apiUrl = '') {
    try {
        const path = canonicalUrl(apiUrl).pathname;
        if (/\/api\/chat\/?$/.test(path)) return 'ollama';
        if (/\/responses\/?$/.test(path)) return 'responses';
        if (/\/messages\/?$/.test(path) || /api\.anthropic\.com/.test(new URL(apiUrl).hostname)) return 'anthropic';
    } catch (_) { /* Incomplete settings are editable. */ }
    return 'openai';
}
function scopes(settings = {}) {
    let provider = '';
    try {
        const url = canonicalUrl(settings.apiUrl);
        if (!url.username && !url.password && !url.search && !url.hash && ['http:', 'https:'].includes(url.protocol))
            provider = `${url.origin}${url.pathname.replace(/\/$/, '')}`;
    } catch (_) { /* The save/transport boundary validates the endpoint. */ }
    const model = String(settings.model || '').trim();
    return { provider, model: provider && model ? `${provider}#${model}` : '' };
}
function normalizeCapabilities(input) {
    const result = {};
    for (const key of Object.keys(CAPABILITIES)) {
        const value = input?.[key];
        if (value === true || value === false) result[key] = value;
    }
    return result;
}
function normalizeLayer(input) {
    if (!object(input)) throw fail('模型配置格式无效');
    const result = { parameters: {}, mappings: {}, capabilities: normalizeCapabilities(input.capabilities) };
    for (const [key, spec] of Object.entries(PARAMS)) {
        const value = input.parameters?.[key];
        if (value !== undefined && value !== null && value !== '') {
            if (spec.values ? !spec.values.includes(value) : typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max || (spec.integer && !Number.isInteger(value)))
                throw fail(`${spec.label}的值无效`);
            result.parameters[key] = value;
        }
        const field = input.mappings?.[key];
        if (field && field !== 'inherit') {
            if (field !== 'omit' && !spec.fields.includes(field)) throw fail(`${spec.label}的映射字段无效`);
            result.mappings[key] = field;
        }
    }
    return result;
}
function normalizeRuntime(input) {
    const result = { version: 1, providers: {}, models: {}, declarations: {} };
    if (input === undefined || input === null) return result;
    if (!object(input) || (input.version !== undefined && input.version !== 1)) throw fail('模型配置版本无效');
    for (const group of ['providers', 'models', 'declarations']) {
        const entries = input[group] || {};
        if (!object(entries) || Object.keys(entries).length > 64) throw fail('模型配置条目过多或格式无效');
        for (const [key, value] of Object.entries(entries)) {
            if (!key || key.length > 640 || /[\x00-\x1f]/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw fail('模型配置标识无效');
            result[group][key] = group === 'declarations' ? normalizeCapabilities(value) : normalizeLayer(value);
        }
    }
    return result;
}
function defaultMappings(settings) {
    const protocol = protocolFor(settings.apiUrl), model = String(settings.model || '');
    const reasoning = /^(?:o[1-9](?:-|$)|gpt-(?:[5-9]|[1-9]\d)(?:[.-]|$))/i.test(model.split('/').at(-1));
    if (protocol === 'ollama') return { temperature: 'options.temperature', topP: 'options.top_p', maxOutputTokens: 'options.num_predict', reasoningEffort: 'omit', reasoningEnabled: 'think' };
    if (protocol === 'responses') return { temperature: reasoning ? 'omit' : 'temperature', topP: reasoning ? 'omit' : 'top_p', maxOutputTokens: 'max_output_tokens', reasoningEffort: 'reasoning.effort', reasoningEnabled: 'omit' };
    if (protocol === 'anthropic') return { temperature: 'temperature', topP: 'top_p', maxOutputTokens: 'max_tokens', reasoningEffort: 'omit', reasoningEnabled: 'omit' };
    let qwen = false;
    try { qwen = /^dashscope(?:-intl|-us)?\.aliyuncs\.com$/.test(new URL(settings.apiUrl).hostname); } catch (_) {}
    return { temperature: reasoning ? 'omit' : 'temperature', topP: reasoning ? 'omit' : 'top_p', maxOutputTokens: reasoning ? 'max_completion_tokens' : 'max_tokens', reasoningEffort: 'reasoning_effort', reasoningEnabled: qwen ? 'enable_thinking' : 'omit' };
}
function allowedMappings(settings, key) {
    const protocol = protocolFor(settings.apiUrl);
    const all = PARAMS[key]?.fields || [];
    return ['inherit', 'omit', ...all.filter(field => protocol === 'ollama' ? field.startsWith('options.') || field === 'think'
        : protocol === 'responses' ? ['temperature', 'top_p', 'max_output_tokens', 'reasoning.effort'].includes(field)
        : protocol === 'anthropic' ? ['temperature', 'top_p', 'max_tokens'].includes(field)
        : !field.startsWith('options.') && !['max_output_tokens', 'reasoning.effort', 'think'].includes(field))];
}
function resolveParameters(settings = {}) {
    const runtime = normalizeRuntime(settings.runtimeConfig), ids = scopes(settings);
    const provider = runtime.providers[ids.provider] || {}, model = runtime.models[ids.model] || {};
    const defaults = defaultMappings(settings), result = {};
    for (const [key, spec] of Object.entries(PARAMS)) {
        const modelValue = model.parameters?.[key], providerValue = provider.parameters?.[key];
        const field = model.mappings?.[key] || provider.mappings?.[key] || defaults[key];
        if (!allowedMappings(settings, key).includes(field)) throw fail(`${spec.label}的映射不适用于当前协议`);
        if (protocolFor(settings.apiUrl) === 'anthropic' && key === 'maxOutputTokens' && field === 'omit') throw fail('Messages 协议必须发送最大输出 Token');
        result[key] = { field, value: modelValue ?? providerValue,
            valueSource: modelValue !== undefined ? 'model' : providerValue !== undefined ? 'provider' : 'builtin',
            mappingSource: model.mappings?.[key] ? 'model' : provider.mappings?.[key] ? 'provider' : 'builtin' };
    }
    return result;
}
function builtinCapabilities(settings) {
    let hostname = '';
    try { hostname = new URL(settings.apiUrl).hostname; } catch (_) {}
    // Positive model declarations are deliberately narrow. A protocol or model
    // name alone is never proof that an unknown model supports a feature.
    if (hostname === 'api.openai.com' && /^gpt-4o(?:-mini)?(?:-\d{4}-\d{2}-\d{2})?$/i.test(settings.model || ''))
        return { text: true, image: true, tools: true, streaming: true };
    if (hostname === 'api.minimaxi.com' && protocolFor(settings.apiUrl) === 'anthropic') return { image: false };
    return {};
}
function resolveCapabilities(settings = {}, declaration) {
    const runtime = normalizeRuntime(settings.runtimeConfig), ids = scopes(settings);
    const remote = normalizeCapabilities(declaration ?? runtime.declarations[ids.model]);
    const builtin = builtinCapabilities(settings), manual = runtime.models[ids.model]?.capabilities || {};
    return Object.fromEntries(Object.keys(CAPABILITIES).map(key => {
        const source = Object.hasOwn(manual, key) ? 'manual' : Object.hasOwn(remote, key) ? 'provider' : Object.hasOwn(builtin, key) ? 'builtin' : 'unknown';
        return [key, { value: (source === 'manual' ? manual : source === 'provider' ? remote : builtin)[key] ?? null, source,
            declared: remote[key] ?? null, builtin: builtin[key] ?? null }];
    }));
}
function readPath(value, path) { return path.split('.').reduce((item, key) => item?.[key], value); }
function writePath(value, path, data) {
    const parts = path.split('.'); let target = value;
    for (const key of parts.slice(0, -1)) target = target[key] ||= {};
    target[parts.at(-1)] = data;
}
function deletePath(value, path) {
    const parts = path.split('.'), target = parts.length === 1 ? value : value[parts[0]];
    if (target) delete target[parts.at(-1)];
}
function applyParameters(payload, settings = {}) {
    const result = { ...payload, ...(payload.options ? { options: { ...payload.options } } : {}), ...(payload.reasoning ? { reasoning: { ...payload.reasoning } } : {}) };
    const resolved = resolveParameters(settings), warnings = [];
    for (const [key, spec] of Object.entries(PARAMS)) {
        const item = resolved[key];
        const existing = spec.fields.map(field => readPath(result, field)).find(value => value !== undefined);
        const value = item.value ?? existing;
        for (const field of spec.fields) deletePath(result, field);
        if (item.field !== 'omit' && value !== undefined) writePath(result, item.field, value);
        if (item.field === 'omit' && item.value !== undefined) warnings.push(`${spec.label}已配置，但当前映射不发送该参数`);
    }
    return { payload: result, parameters: resolved, warnings };
}
function requireCapability(settings, capability) {
    if (resolveCapabilities(settings)[capability]?.value === false)
        throw Object.assign(new Error(`当前模型声明不支持${CAPABILITIES[capability]}，请更换模型或调整能力覆盖`), { code: 'MODEL_CAPABILITY_UNSUPPORTED', statusCode: 400 });
}
function transportRuntime(settings = {}) {
    const config = normalizeRuntime(settings.runtimeConfig), ids = scopes(settings);
    return { version: 1,
        providers: config.providers[ids.provider] ? { [ids.provider]: config.providers[ids.provider] } : {},
        models: config.models[ids.model] ? { [ids.model]: config.models[ids.model] } : {},
        declarations: config.declarations[ids.model] ? { [ids.model]: config.declarations[ids.model] } : {} };
}
function catalogCapabilities(row) {
    const result = {};
    const input = row.architecture?.input_modalities || row.input_modalities || row.inputModalities;
    if (Array.isArray(input) && input.length) result.image = input.includes('image');
    if (typeof row.capabilities?.vision === 'boolean') result.image = row.capabilities.vision;
    if (typeof row.capabilities?.completion_chat === 'boolean') result.text = row.capabilities.completion_chat;
    if (typeof row.capabilities?.function_calling === 'boolean') result.tools = row.capabilities.function_calling;
    if (typeof row.capabilities?.streaming === 'boolean') result.streaming = row.capabilities.streaming;
    if (Array.isArray(row.supported_parameters)) result.tools = row.supported_parameters.includes('tools');
    return result;
}
module.exports = { PARAMS, CAPABILITIES, SOURCE_LABELS, protocolFor, scopes, normalizeRuntime, normalizeCapabilities,
    resolveParameters, resolveCapabilities, allowedMappings, applyParameters, requireCapability, transportRuntime, catalogCapabilities };
