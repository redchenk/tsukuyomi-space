const MINIMAX_DEFAULT_VOICE_ID = 'female-shaonv';

function defaultTtsUrl(provider) {
  if (provider === 'openai' || provider === 'openai-compatible' || provider === 'custom') {
    return 'https://api.openai.com/v1/audio/speech';
  }
  if (provider === 'elevenlabs') return 'https://api.elevenlabs.io/v1/text-to-speech';
  if (provider === 'minimax') return 'https://api.minimaxi.com/v1/t2a_v2';
  return 'https://api.xiaomimimo.com/v1/chat/completions';
}

function detectTtsLanguage(text, configuredLanguage) {
  const configured = String(configuredLanguage || '').trim().toLowerCase().replace(/-/g, '_');
  if (configured && configured !== 'auto') return configured;
  const value = String(text || '');
  if (/\u3040-\u30ff/u.test(value)) return 'ja';
  if (/\uac00-\ud7af/u.test(value)) return 'ko';
  if (/\u4e00-\u9fff/u.test(value)) return 'zh';
  return 'en';
}

function ttsReadInstruction(text, configuredLanguage) {
  const language = detectTtsLanguage(text, configuredLanguage);
  if (language === 'ja') return '\u4ee5\u4e0b\u306e\u65e5\u672c\u8a9e\u30c6\u30ad\u30b9\u30c8\u3060\u3051\u3092\u3001\u67d4\u3089\u304b\u304f\u81ea\u7136\u306a\u58f0\u3067\u6717\u8aad\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u8aac\u660e\u3001\u7ffb\u8a33\u3001\u62ec\u5f27\u5185\u306e\u52d5\u4f5c\u6307\u793a\u3001\u821e\u53f0\u6307\u793a\u306f\u8aad\u307e\u306a\u3044\u3067\u304f\u3060\u3055\u3044\u3002';
  if (language === 'en') return 'Read only the following English text in a soft, natural voice. Do not read explanations, translations, action cues, or stage directions.';
  if (language === 'ko') return '\ub2e4\uc74c\u0020\ud55c\uad6d\uc5b4\u0020\ud14d\uc2a4\ud2b8\ub9cc\u0020\ubd80\ub4dc\ub7fd\uace0\u0020\uc790\uc5f0\uc2a4\ub7ec\uc6b4\u0020\ubaa9\uc18c\ub9ac\ub85c\u0020\uc77d\uc5b4\u0020\uc8fc\uc138\uc694\u002e\u0020\uc124\uba85\u002c\u0020\ubc88\uc5ed\u002c\u0020\uad04\ud638\u0020\uc548\uc758\u0020\ub3d9\uc791\u0020\uc9c0\uc2dc\ub098\u0020\ubb34\ub300\u0020\uc9c0\uc2dc\ub294\u0020\uc77d\uc9c0\u0020\ub9c8\uc138\uc694\u002e';
  return '\u53ea\u6717\u8bfb\u4e0b\u9762\u7684\u4e2d\u6587\u6587\u672c\uff0c\u8bed\u6c14\u6e29\u67d4\u81ea\u7136\u3002\u4e0d\u8981\u7ffb\u8bd1\uff0c\u4e0d\u8981\u89e3\u91ca\uff0c\u4e0d\u8981\u8bfb\u62ec\u53f7\u91cc\u7684\u52a8\u4f5c\u63d0\u793a\u6216\u821e\u53f0\u63d0\u793a\u3002';
}

function minimaxLanguageBoost(configuredLanguage) {
  const language = String(configuredLanguage || 'ja').trim().toLowerCase().replace(/-/g, '_');
  const values = {
    ja: 'Japanese',
    all_ja: 'Japanese',
    en: 'English',
    zh: 'Chinese',
    all_zh: 'Chinese',
    yue: 'Chinese,Yue',
    all_yue: 'Chinese,Yue',
    auto_yue: 'Chinese,Yue',
    ko: 'Korean',
    auto: 'auto'
  };
  return values[language] || 'Japanese';
}

function pickAudioPayload(data) {
  return data?.choices?.[0]?.message?.audio?.data
    || data?.choices?.[0]?.message?.audio
    || data?.audio?.data
    || data?.data?.audio;
}

function makeAudioBlobFromEncoded(value, type) {
  let encoded = String(value || '').trim();
  const dataUrl = encoded.match(/^data:[^;,]+;base64,(.+)$/i);
  if (dataUrl) encoded = dataUrl[1];
  if (!encoded) throw new Error('TTS provider returned no audio data');

  if (/^[0-9a-f]+$/i.test(encoded) && encoded.length % 2 === 0) {
    const bytes = new Uint8Array(encoded.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16);
    }
    return new Blob([bytes], { type });
  }

  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return new Blob([bytes], { type });
}

export function buildDirectTtsRequest(text, settings = {}) {
  const provider = settings.provider || 'mimo';
  const apiUrl = String(settings.apiUrl || defaultTtsUrl(provider)).trim();
  const voice = settings.voice || (provider === 'minimax'
    ? MINIMAX_DEFAULT_VOICE_ID
    : provider === 'openai' || provider === 'openai-compatible' || provider === 'custom'
      ? 'alloy'
      : 'mimo_default');

  if (provider === 'mimo' || /xiaomimimo/i.test(apiUrl)) {
    return {
      apiUrl,
      jsonAudioType: 'audio/wav',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': settings.apiKey || '' },
        body: JSON.stringify({
          model: settings.model || 'mimo-v2.5-tts',
          messages: [
            { role: 'user', content: ttsReadInstruction(text, settings.textLang) },
            { role: 'assistant', content: String(text) }
          ],
          modalities: ['audio'],
          audio: { format: 'wav', voice }
        })
      }
    };
  }

  if (provider === 'elevenlabs') {
    const baseUrl = apiUrl.replace(/\/$/, '');
    const requestUrl = /\/text-to-speech\/[^/]+\/?$/i.test(baseUrl)
      ? baseUrl
      : `${baseUrl}/${encodeURIComponent(voice || '21m00Tcm4TlvDq8ikWAM')}`;
    return {
      apiUrl: requestUrl,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': settings.apiKey || '' },
        body: JSON.stringify({ text: String(text), model_id: settings.model || 'eleven_multilingual_v2' })
      }
    };
  }

  if (provider === 'minimax') {
    return {
      apiUrl,
      jsonAudioType: 'audio/mp3',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey || ''}` },
        body: JSON.stringify({
          model: settings.model || 'speech-2.8-hd',
          text: String(text),
          stream: false,
          language_boost: minimaxLanguageBoost(settings.textLang || 'ja'),
          voice_setting: { voice_id: voice || MINIMAX_DEFAULT_VOICE_ID, speed: 1, vol: 1, pitch: 0 },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
        })
      }
    };
  }

  return {
    apiUrl,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey || ''}` },
      body: JSON.stringify({
        model: settings.model || 'tts-1',
        input: String(text),
        voice,
        response_format: 'mp3'
      })
    }
  };
}

async function responseError(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.message || payload?.error || payload?.base_resp?.status_msg;
    if (detail) return String(detail).slice(0, 240);
  }
  return String(await response.text().catch(() => '')).slice(0, 240) || `TTS ${response.status}`;
}

async function responseToAudioBlob(response, jsonAudioType) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    return makeAudioBlobFromEncoded(pickAudioPayload(await response.json()), jsonAudioType || 'audio/mp3');
  }
  return response.blob();
}

export async function requestTtsAudioBlob(text, settings = {}, transports = {}) {
  if (settings.provider === 'gpt-sovits') {
    throw new Error('Local GPT-SoVITS must use the local playback path');
  }

  const directRequest = buildDirectTtsRequest(text, settings);
  const useProxy = Boolean(settings.useProxy);
  const fetchDirect = transports.fetchDirect || globalThis.fetch;
  const fetchProxy = transports.fetchProxy;
  let response;

  if (useProxy) {
    if (typeof fetchProxy !== 'function') throw new Error('TTS proxy transport is unavailable');
    response = await fetchProxy('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, text })
    });
  } else {
    if (typeof fetchDirect !== 'function') throw new Error('Direct TTS transport is unavailable');
    response = await fetchDirect(directRequest.apiUrl, directRequest.options);
  }

  if (!response.ok) throw new Error(await responseError(response));
  return responseToAudioBlob(response, useProxy ? '' : directRequest.jsonAudioType);
}
