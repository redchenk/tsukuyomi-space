const TTS_API_KEY = process.env.TTS_API_KEY || '';
const TTS_API_URL = process.env.TTS_API_URL || '';
const TTS_VOICE = process.env.TTS_VOICE || '';

const ALLOWED_TTS_ENDPOINTS = [
    { hostname: 'api.xiaomimimo.com', path: /^\/v1\/chat\/completions\/?$/ },
    { hostname: 'api.openai.com', path: /^\/v1\/audio\/speech\/?$/ },
    { hostname: 'api.minimax.chat', path: /^\/v1\/t2a_v2\/?$/ },
    { hostname: 'api.minimaxi.com', path: /^\/v1\/t2a_v2\/?$/ },
    { hostname: 'api.elevenlabs.io', path: /^\/v1\/text-to-speech(?:\/[^/?#]+)?\/?$/ }
];

function pickAudioBase64(data) {
    return data?.choices?.[0]?.message?.audio?.data
        || data?.choices?.[0]?.message?.audio
        || data?.audio?.data
        || data?.data?.audio;
}

function validateTtsUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (_) {
        const error = new Error('不支持的 TTS API 端点');
        error.status = 400;
        throw error;
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

async function synthesizeSpeech({ text, apiKey, apiUrl, voice, model, provider, promptAudio }) {
    const useProvider = provider || process.env.TTS_PROVIDER || 'mimo';
    const useApiKey = apiKey || TTS_API_KEY;
    const useVoice = voice || TTS_VOICE || (useProvider === 'openai' || useProvider === 'openai-compatible' ? 'alloy' : 'mimo_default');
    const rawApiUrl = apiUrl || TTS_API_URL || (useProvider === 'openai' || useProvider === 'openai-compatible'
        ? 'https://api.openai.com/v1/audio/speech'
        : useProvider === 'minimax'
            ? 'https://api.minimax.chat/v1/t2a_v2'
            : useProvider === 'elevenlabs'
                ? 'https://api.elevenlabs.io/v1/text-to-speech'
        : 'https://api.xiaomimimo.com/v1/chat/completions');
    const useApiUrl = validateTtsUrl(rawApiUrl);
    const useModel = model || process.env.TTS_MODEL || (useProvider === 'openai' || useProvider === 'openai-compatible' ? 'tts-1' : useProvider === 'minimax' ? 'speech-02-hd' : useProvider === 'elevenlabs' ? 'eleven_multilingual_v2' : 'mimo-v2.5-tts');

    if (!useApiKey) {
        const error = new Error('TTS API 未配置，请设置 TTS_API_KEY 或在请求中传入 apiKey');
        error.status = 400;
        throw error;
    }

    if (useProvider === 'mimo' || /xiaomimimo/i.test(useApiUrl)) {
        const requestBody = {
            model: useModel,
            messages: [
                { role: 'user', content: '请用温柔自然的语气朗读。' },
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
            throw new Error(`MiMo TTS request failed (${response.status}): ${errorText.substring(0, 200)}`);
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
            throw new Error(`ElevenLabs TTS request failed (${response.status}): ${errorText.substring(0, 200)}`);
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
            throw new Error(`MiniMax TTS request failed (${response.status}): ${errorText.substring(0, 200)}`);
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
        throw new Error(`TTS request failed (${response.status}): ${errorText.substring(0, 200)}`);
    }

    return {
        audioBuffer: Buffer.from(await response.arrayBuffer()),
        contentType: 'audio/mpeg'
    };
}

module.exports = {
    synthesizeSpeech
};
