const TTS_API_KEY = process.env.TTS_API_KEY || '';
const TTS_API_URL = process.env.TTS_API_URL || '';
const TTS_VOICE = process.env.TTS_VOICE || '';
const GPT_SOVITS_API_URL = process.env.GPT_SOVITS_API_URL || 'http://127.0.0.1:9880/tts';
const GPT_SOVITS_REF_AUDIO_PATH = process.env.GPT_SOVITS_REF_AUDIO_PATH || '';
const GPT_SOVITS_PROMPT_TEXT = process.env.GPT_SOVITS_PROMPT_TEXT || '';
const GPT_SOVITS_TEXT_LANG = process.env.GPT_SOVITS_TEXT_LANG || 'zh';
const GPT_SOVITS_PROMPT_LANG = process.env.GPT_SOVITS_PROMPT_LANG || 'zh';
const GPT_SOVITS_GPT_WEIGHT_PATH = process.env.GPT_SOVITS_GPT_WEIGHT_PATH || 'GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt';
const GPT_SOVITS_SOVITS_WEIGHT_PATH = process.env.GPT_SOVITS_SOVITS_WEIGHT_PATH || 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth';

const ALLOWED_TTS_ENDPOINTS = [
    { hostname: 'api.xiaomimimo.com', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.openai.com', path: /^\/v1\/audio\/speech\/?$/ },
    { hostname: 'api.minimax.chat', path: /^\/v1\/t2a_v2\/?$/ },
    { hostname: 'api.minimaxi.com', path: /^\/v1\/t2a_v2\/?$/ },
    { hostname: 'api.elevenlabs.io', path: /^\/v1\/text-to-speech(?:\/[^/?#]+)?\/?$/ }
];

const ALLOWED_GPT_SOVITS_ENDPOINTS = [
    { hostname: '127.0.0.1', path: /^\/tts\/?$/ },
    { hostname: 'localhost', path: /^\/tts\/?$/ }
];

function pickAudioBase64(data) {
    return data?.choices?.[0]?.message?.audio?.data
        || data?.choices?.[0]?.message?.audio
        || data?.audio?.data
        || data?.data?.audio;
}

function validateTtsUrl(url, provider) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (_) {
        const error = new Error('不支持的 TTS API 端点');
        error.status = 400;
        throw error;
    }
    if (provider === 'gpt-sovits') {
        if (parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
            const error = new Error('不支持的 GPT-SoVITS API 端点');
            error.status = 400;
            throw error;
        }
        const allowedLocal = ALLOWED_GPT_SOVITS_ENDPOINTS.some(endpoint => parsed.hostname.toLowerCase() === endpoint.hostname && endpoint.path.test(parsed.pathname));
        if (!allowedLocal) {
            const error = new Error('GPT-SoVITS 仅允许访问本机 /tts 端点');
            error.status = 400;
            throw error;
        }
        return parsed.toString();
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
        const error = new Error('不支持的 TTS API 端点');
        error.status = 400;
        throw error;
    }
    const allowed = ALLOWED_TTS_ENDPOINTS.some(endpoint => parsed.hostname.toLowerCase() === endpoint.hostname && endpoint.path.test(parsed.pathname));
    if (!allowed) {
        const error = new Error('不支持的 TTS API 端点');
        error.status = 400;
        throw error;
    }
    return parsed.toString();
}

function makeAudioBufferFromEncoded(value) {
    const text = String(value || '').replace(/^data:audio\/\w+;base64,/, '').trim();
    if (/^[0-9a-f]+$/i.test(text) && text.length % 2 === 0) {
        return Buffer.from(text, 'hex');
    }
    return Buffer.from(text, 'base64');
}

function makeProviderError(provider, status, body) {
    const detail = String(body || '').replace(/\s+/g, ' ').trim().substring(0, 240);
    const error = new Error(`${provider} TTS request failed (${status})${detail ? `: ${detail}` : ''}`);
    error.status = status;
    return error;
}

function detectTtsLanguage(text, textLang) {
    const configured = normalizeGptSovitsLang(textLang, '');
    if (configured && configured !== 'auto') return configured;
    const value = String(text || '');
    if (/[\u3040-\u30ff]/u.test(value)) return 'ja';
    if (/[\uac00-\ud7af]/u.test(value)) return 'ko';
    if (/[\u4e00-\u9fff]/u.test(value)) return 'zh';
    return 'en';
}

function ttsReadInstruction(text, textLang) {
    const lang = detectTtsLanguage(text, textLang);
    if (lang === 'ja') {
        return '以下の日本語テキストだけを、月見八千代らしい柔らかく自然な声で朗読してください。説明、翻訳、括弧内の動作指示、舞台指示は読まないでください。';
    }
    if (lang === 'en') {
        return 'Read only the following English text in a soft, natural voice. Do not read explanations, translations, action cues, or stage directions.';
    }
    if (lang === 'ko') {
        return '다음 한국어 텍스트만 부드럽고 자연스러운 목소리로 읽어 주세요. 설명, 번역, 괄호 안의 동작 지시나 무대 지시는 읽지 마세요.';
    }
    return '只朗读下面的文本，语气温柔自然。不要读解释、翻译、括号里的动作提示或舞台提示。';
}

function normalizeGptSovitsLang(value, fallback = 'zh') {
    const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
    const aliases = {
        cn: 'zh',
        'zh-cn': 'zh',
        'zh-hans': 'zh',
        chinese: 'zh',
        mandarin: 'zh',
        '中文': 'zh',
        '汉语': 'zh',
        '漢語': 'zh',
        jp: 'ja',
        jpn: 'ja',
        japanese: 'ja',
        '日语': 'ja',
        '日文': 'ja',
        '日本語': 'ja',
        english: 'en',
        '英语': 'en',
        '英文': 'en',
        cantonese: 'yue',
        '粤语': 'yue',
        '粵語': 'yue',
        korean: 'ko',
        '韩语': 'ko',
        '韓語': 'ko',
        '自动': 'auto'
    };
    const normalized = aliases[raw] || raw || fallback;
    return ['zh', 'ja', 'en', 'yue', 'ko', 'auto', 'all-zh', 'all-ja', 'all-yue', 'auto-yue'].includes(normalized)
        ? normalized.replace(/-/g, '_')
        : fallback;
}

async function loadGptSovitsWeights(baseUrl, gptWeightPath, sovitsWeightPath) {
    const url = new URL(baseUrl);
    const gptPath = gptWeightPath || GPT_SOVITS_GPT_WEIGHT_PATH;
    const sovitsPath = sovitsWeightPath || GPT_SOVITS_SOVITS_WEIGHT_PATH;
    if (gptPath) {
        url.pathname = '/set_gpt_weights';
        url.search = '';
        url.searchParams.set('weights_path', gptPath);
        const response = await fetch(url);
        if (!response.ok) throw makeProviderError('GPT-SoVITS set_gpt_weights', response.status, await response.text());
    }
    if (sovitsPath) {
        url.pathname = '/set_sovits_weights';
        url.search = '';
        url.searchParams.set('weights_path', sovitsPath);
        const response = await fetch(url);
        if (!response.ok) throw makeProviderError('GPT-SoVITS set_sovits_weights', response.status, await response.text());
    }
}

async function synthesizeSpeech({ text, apiKey, apiUrl, voice, model, provider, promptAudio, refAudioPath, promptText, textLang, promptLang, gptWeightPath, sovitsWeightPath }) {
    const useProvider = provider || process.env.TTS_PROVIDER || 'mimo';
    const useApiKey = apiKey || TTS_API_KEY;
    const useVoice = voice || TTS_VOICE || (useProvider === 'gpt-sovits' ? '' : useProvider === 'openai' || useProvider === 'openai-compatible' ? 'alloy' : 'mimo_default');
    const rawApiUrl = apiUrl || (useProvider === 'gpt-sovits' ? GPT_SOVITS_API_URL : TTS_API_URL) || (useProvider === 'openai' || useProvider === 'openai-compatible'
        ? 'https://api.openai.com/v1/audio/speech'
        : useProvider === 'minimax'
            ? 'https://api.minimax.chat/v1/t2a_v2'
            : useProvider === 'elevenlabs'
                ? 'https://api.elevenlabs.io/v1/text-to-speech'
                : useProvider === 'gpt-sovits'
                    ? GPT_SOVITS_API_URL
        : 'https://api.xiaomimimo.com/v1/chat/completions');
    const useApiUrl = validateTtsUrl(rawApiUrl, useProvider);
    const useModel = model || process.env.TTS_MODEL || (useProvider === 'openai' || useProvider === 'openai-compatible' ? 'tts-1' : useProvider === 'minimax' ? 'speech-02-hd' : useProvider === 'elevenlabs' ? 'eleven_multilingual_v2' : 'mimo-v2.5-tts');

    if (useProvider !== 'gpt-sovits' && !useApiKey) {
        const error = new Error('TTS API 未配置，请设置 TTS_API_KEY 或在请求中传入 apiKey');
        error.status = 400;
        throw error;
    }

    if (useProvider === 'gpt-sovits') {
        await loadGptSovitsWeights(useApiUrl, gptWeightPath, sovitsWeightPath);
        const useRefAudioPath = refAudioPath || useVoice || GPT_SOVITS_REF_AUDIO_PATH;
        if (!useRefAudioPath) {
            const error = new Error('GPT-SoVITS 需要填写参考音频路径');
            error.status = 400;
            throw error;
        }
        const response = await fetch(useApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: String(text),
                text_lang: normalizeGptSovitsLang(textLang || model || GPT_SOVITS_TEXT_LANG, 'zh'),
                ref_audio_path: useRefAudioPath,
                prompt_text: promptText || promptAudio || GPT_SOVITS_PROMPT_TEXT,
                prompt_lang: normalizeGptSovitsLang(promptLang || GPT_SOVITS_PROMPT_LANG, 'zh'),
                text_split_method: 'cut5',
                batch_size: 1,
                media_type: 'wav',
                streaming_mode: false,
                parallel_infer: true
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw makeProviderError('GPT-SoVITS', response.status, errorText);
        }
        return {
            audioBuffer: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get('content-type') || 'audio/wav'
        };
    }

    if (useProvider === 'mimo' || /xiaomimimo/i.test(useApiUrl)) {
        const requestBody = {
            model: useModel,
            messages: [
                { role: 'user', content: ttsReadInstruction(text, textLang) },
                { role: 'assistant', content: String(text) }
            ],
            modalities: ['audio'],
            audio: { format: 'wav', voice: useVoice }
        };
        if (promptAudio) requestBody.audio.prompt_audio = promptAudio;

        const response = await fetch(useApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': useApiKey
            },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw makeProviderError('MiMo', response.status, errorText);
        }

        const data = await response.json();
        const audioBase64 = pickAudioBase64(data);
        if (!audioBase64) throw new Error('无法解析 MiMo TTS 音频数据');
        return {
            audioBuffer: makeAudioBufferFromEncoded(audioBase64),
            contentType: 'audio/wav'
        };
    }

    if (useProvider === 'elevenlabs') {
        const baseUrl = useApiUrl.replace(/\/$/, '');
        const requestUrl = /\/text-to-speech\/[^/]+\/?$/i.test(baseUrl) ? baseUrl : `${baseUrl}/${encodeURIComponent(useVoice || '21m00Tcm4TlvDq8ikWAM')}`;
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': useApiKey },
            body: JSON.stringify({ text: String(text), model_id: useModel })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw makeProviderError('ElevenLabs', response.status, errorText);
        }
        return {
            audioBuffer: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get('content-type') || 'audio/mpeg'
        };
    }

    if (useProvider === 'minimax') {
        const response = await fetch(useApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${useApiKey}` },
            body: JSON.stringify({
                model: useModel,
                text: String(text),
                stream: false,
                voice_setting: { voice_id: useVoice || 'female-shaonv', speed: 1, vol: 1, pitch: 0 },
                audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw makeProviderError('MiniMax', response.status, errorText);
        }
        const data = await response.json();
        const audioBase64 = pickAudioBase64(data);
        if (!audioBase64) throw new Error('无法解析 MiniMax TTS 音频数据');
        return {
            audioBuffer: makeAudioBufferFromEncoded(audioBase64),
            contentType: 'audio/mpeg'
        };
    }

    const response = await fetch(useApiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${useApiKey}`
        },
        body: JSON.stringify({
            model: useModel,
            input: String(text),
            voice: useVoice,
            response_format: 'mp3',
            speed: 1.0
        })
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw makeProviderError('TTS', response.status, errorText);
    }

    return {
        audioBuffer: Buffer.from(await response.arrayBuffer()),
        contentType: 'audio/mpeg'
    };
}

module.exports = {
    synthesizeSpeech
};
