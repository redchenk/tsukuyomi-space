const TTS_API_KEY = process.env.TTS_API_KEY || '';
const TTS_API_URL = process.env.TTS_API_URL || '';
const TTS_VOICE = process.env.TTS_VOICE || '';

function pickAudioBase64(data) {
    return data?.choices?.[0]?.message?.audio?.data
        || data?.choices?.[0]?.message?.audio
        || data?.audio?.data
        || data?.data?.audio;
}

async function synthesizeSpeech({ text, apiKey, apiUrl, voice, model, provider, promptAudio }) {
    const useProvider = provider || process.env.TTS_PROVIDER || 'mimo';
    const useApiKey = apiKey || TTS_API_KEY;
    const useVoice = voice || TTS_VOICE || (useProvider === 'openai' ? 'alloy' : 'mimo_default');
    const useApiUrl = apiUrl || TTS_API_URL || (useProvider === 'openai'
        ? 'https://api.openai.com/v1/audio/speech'
        : 'https://api.xiaomimimo.com/v1/chat/completions');
    const useModel = model || process.env.TTS_MODEL || (useProvider === 'openai' ? 'tts-1' : 'mino-v2.5-tts');

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
            audioBuffer: Buffer.from(String(audioBase64).replace(/^data:audio\/\w+;base64,/, ''), 'base64'),
            contentType: 'audio/wav'
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
