const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const fishAudio = require('../../shared/fish-audio.cjs');

const file = path.join(config.dataDir, 'official-tts.json');
function readPrivate() {
    let fd;
    try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || (stat.mode & 0o077) || stat.size > 16384) throw new Error('Unsafe configuration');
        const data = JSON.parse(fs.readFileSync(fd, 'utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid configuration');
        return data;
    } finally { fs.closeSync(fd); }
}
function environment(stored) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('OFFICIAL_TTS_')));
    for (const [key, value] of Object.entries(stored)) if (key.startsWith('OFFICIAL_TTS_')) env[key] = String(value);
    return env;
}
function settings(engine = 'default', env = environment(readPrivate())) {
    const alternate = engine === 'fish-audio';
    const prefix = alternate ? 'OFFICIAL_TTS_FISH_' : 'OFFICIAL_TTS_';
    if (env[prefix + 'ENABLED'] !== 'true') return null;
    if (alternate || env.OFFICIAL_TTS_PROTOCOL === 'fish-audio') {
        const voice = (env[prefix + 'VOICE'] || fishAudio.yachiyoVoice).trim();
        const model = env[prefix + 'MODEL'] || fishAudio.models[0];
        const key = (env[prefix + 'API_KEY'] || '').trim();
        const language = env[prefix + 'LANGUAGE'] || 'auto';
        if (!key || !voice || !['auto','zh','ja','en','ko','yue'].includes(language)) throw new Error('Missing Fish Audio configuration');
        fishAudio.validate(model, voice);
        const publicModels = Array.from(new Set([model, ...(env[prefix + 'MODELS'] || '').split(',').map(id => id.trim()).filter(Boolean)]));
        for (const id of publicModels) fishAudio.validate(id, voice);
        return { engine, protocol: 'fish-audio', endpoint: fishAudio.endpoint, key, voice, model, publicModels, language };
    }
    const endpoint = new URL(env.OFFICIAL_TTS_URL);
    const protocol = env.OFFICIAL_TTS_PROTOCOL || 'gpt-sovits';
    const healthUrl = new URL(env.OFFICIAL_TTS_HEALTH_URL || endpoint.href);
    for (const url of [endpoint, healthUrl]) {
        if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid TTS configuration');
        // Plain HTTP is only for a deliberately provisioned local tunnel.
        if (url.protocol === 'http:' && !['127.0.0.1', '[::1]'].includes(url.hostname) && env.OFFICIAL_TTS_ALLOW_HTTP !== 'true') throw new Error('HTTPS required');
    }
    if (healthUrl.origin !== endpoint.origin || !['gpt-sovits', 'openai'].includes(protocol)) throw new Error('Invalid TTS configuration');
    const key = env.OFFICIAL_TTS_API_KEY || '';
    if (endpoint.protocol === 'http:' && key && !['127.0.0.1','[::1]'].includes(endpoint.hostname)) throw new Error('Do not send keys over public HTTP');
    const language = env.OFFICIAL_TTS_LANGUAGE || 'auto';
    if (!['auto','zh','ja','en','ko','yue'].includes(language)) throw new Error('Invalid language');
    const reference = env.OFFICIAL_TTS_REF_AUDIO_PATH || '';
    if (protocol === 'gpt-sovits' && !reference) throw new Error('Missing reference audio');
    return { engine, endpoint: endpoint.href, healthUrl: healthUrl.href, protocol, key, language, reference,
        nativeProbe: protocol === 'gpt-sovits' && !env.OFFICIAL_TTS_HEALTH_URL,
        gptWeight: env.OFFICIAL_TTS_GPT_WEIGHT_PATH || '', sovitsWeight: env.OFFICIAL_TTS_SOVITS_WEIGHT_PATH || '',
        promptText: env.OFFICIAL_TTS_PROMPT_TEXT || '', promptLang: env.OFFICIAL_TTS_PROMPT_LANG || 'ja',
        model: env.OFFICIAL_TTS_MODEL || 'tts-1', voice: env.OFFICIAL_TTS_VOICE || 'alloy' };
}

const languages = ['auto', 'ja', 'zh', 'en', 'ko', 'yue'];
function view(stored = readPrivate()) {
    const env = environment(stored);
    const model = env.OFFICIAL_TTS_FISH_MODEL || fishAudio.models[0];
    return {
        revision: crypto.createHmac('sha256', config.jwtSecret).update(JSON.stringify(env)).digest('hex'),
        primary: { enabled: env.OFFICIAL_TTS_ENABLED === 'true', protocol: env.OFFICIAL_TTS_PROTOCOL || 'gpt-sovits',
            language: env.OFFICIAL_TTS_LANGUAGE || 'auto' },
        fish: { enabled: env.OFFICIAL_TTS_FISH_ENABLED === 'true', hasKey: Boolean(env.OFFICIAL_TTS_FISH_API_KEY?.trim()),
            voice: env.OFFICIAL_TTS_FISH_VOICE || fishAudio.yachiyoVoice, language: env.OFFICIAL_TTS_FISH_LANGUAGE || 'auto', model,
            models: [...new Set([model, ...(env.OFFICIAL_TTS_FISH_MODELS || '').split(',').map(id => id.trim()).filter(Boolean)])] },
        availableModels: fishAudio.models, languages
    };
}
function reject(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function save(input) {
    return db.transaction(() => {
        const stored = readPrivate();
        if (!input || typeof input !== 'object' || Array.isArray(input)) reject('语音配置无效');
        if (input.revision !== view(stored).revision) reject('语音配置已更新，请重新读取后再保存', 409);
        const fish = input.engine === 'fish-audio';
        const allowed = ['revision','engine','enabled','language', ...(fish ? ['voice','model','models','apiKey'] : [])];
        if ((!fish && input.engine !== 'default') || Object.keys(input).some(key => !allowed.includes(key))
            || typeof input.enabled !== 'boolean' || !languages.includes(input.language)) reject('语音配置无效');
        const prefix = fish ? 'OFFICIAL_TTS_FISH_' : 'OFFICIAL_TTS_';
        const next = { ...stored, [prefix + 'ENABLED']: input.enabled, [prefix + 'LANGUAGE']: input.language };
        if (fish) {
            if (typeof input.voice !== 'string' || !/^[a-f\d]{32}$/i.test(input.voice) || !fishAudio.models.includes(input.model)
                || !Array.isArray(input.models) || input.models.length > fishAudio.models.length || !input.models.includes(input.model)
                || input.models.some(id => !fishAudio.models.includes(id))) reject('请检查 Fish 音色和开放模型');
            next[prefix + 'VOICE'] = input.voice;
            next[prefix + 'MODEL'] = input.model;
            next[prefix + 'MODELS'] = [...new Set(input.models)].join(',');
            if (input.apiKey !== undefined) {
                if (typeof input.apiKey !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(input.apiKey)) reject('Fish API 密钥格式无效');
                next[prefix + 'API_KEY'] = input.apiKey;
            }
        }
        try { settings(input.engine, environment(next)); }
        catch { reject('音源配置不完整，请检查服务器配置或 Fish 密钥'); }
        const body = JSON.stringify(next);
        if (Buffer.byteLength(body) > 16384) reject('语音配置过大');
        const temp = file + '.' + crypto.randomUUID();
        const fd = fs.openSync(temp, 'wx', 0o600);
        try {
            try { fs.writeFileSync(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
            if (view().revision !== input.revision) reject('语音配置已更新，请重新读取后再保存', 409);
            fs.renameSync(temp, file);
        } finally { fs.rmSync(temp, { force: true }); }
        return view(next);
    }).immediate();
}
module.exports = { settings, view, save };
