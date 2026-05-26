import { readJson } from './roomStorage';

const DEFAULT_GPT_SOVITS_GPT_WEIGHT = 'GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt';
const DEFAULT_GPT_SOVITS_SOVITS_WEIGHT = 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth';

function defaultTtsUrl(provider) {
  return provider === 'gpt-sovits' ? 'http://localhost:9880/tts' : '';
}

function normalizeLocalGptSovitsUrl(url) {
  const parsed = new URL(url || defaultTtsUrl('gpt-sovits'));
  if (window.location.protocol === 'https:' && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1') {
    parsed.hostname = 'localhost';
  }
  return parsed;
}

function normalizeGptSovitsLang(value, fallback = 'zh') {
  const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  const aliases = {
    cn: 'zh',
    'zh-cn': 'zh',
    chinese: 'zh',
    mandarin: 'zh',
    jp: 'ja',
    jpn: 'ja',
    japanese: 'ja',
    english: 'en',
    korean: 'ko',
    auto: 'auto'
  };
  const normalized = aliases[raw] || raw || fallback;
  return ['zh', 'ja', 'en', 'ko', 'yue', 'auto', 'all-zh', 'all-ja', 'all-yue', 'auto-yue'].includes(normalized)
    ? normalized.replace(/-/g, '_')
    : fallback;
}

function detectTextLang(text) {
  const value = String(text || '');
  if (/[\u3040-\u30ff]/u.test(value)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(value)) return 'ko';
  if (/[\u4e00-\u9fff]/u.test(value)) return 'zh';
  return 'en';
}

function compactSpeechText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .replace(/[,.!?;:'"()[\]{}<>\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09\u3010\u3011\u300a\u300b~\-]/g, '')
    .trim();
}

function pickSplitMethod(text) {
  return compactSpeechText(text).length <= 4 ? 'cut0' : 'cut5';
}

function buildGptSovitsControlUrl(settings, pathname, params) {
  const url = normalizeLocalGptSovitsUrl(settings.apiUrl || defaultTtsUrl(settings.provider));
  url.pathname = pathname;
  url.search = '';
  Object.entries(params || {}).forEach(([key, value]) => {
    if (String(value || '').trim()) url.searchParams.set(key, String(value).trim());
  });
  url.searchParams.set('_', String(Date.now()));
  return url.toString();
}

function requestLocalGptSovitsControl(url, timeout = 70000) {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(false), timeout);
    const done = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    image.onload = done;
    image.onerror = done;
    image.src = url;
  });
}

async function ensureGptSovitsWeights(settings) {
  await requestLocalGptSovitsControl(buildGptSovitsControlUrl(settings, '/set_gpt_weights', {
    weights_path: settings.gptWeightPath || DEFAULT_GPT_SOVITS_GPT_WEIGHT
  }));
  await requestLocalGptSovitsControl(buildGptSovitsControlUrl(settings, '/set_sovits_weights', {
    weights_path: settings.sovitsWeightPath || DEFAULT_GPT_SOVITS_SOVITS_WEIGHT
  }));
}

function buildGptSovitsAudioUrl(text, settings) {
  const url = normalizeLocalGptSovitsUrl(settings.apiUrl || defaultTtsUrl(settings.provider));
  const speechText = String(text || '').trim() || 'OK.';
  const configuredLang = normalizeGptSovitsLang(settings.textLang || settings.model, 'auto');
  url.searchParams.set('text', speechText);
  url.searchParams.set('text_lang', configuredLang === 'auto' ? detectTextLang(speechText) : configuredLang);
  url.searchParams.set('ref_audio_path', settings.refAudioPath || settings.voice || '');
  url.searchParams.set('prompt_text', settings.promptText || '');
  url.searchParams.set('prompt_lang', normalizeGptSovitsLang(settings.promptLang, 'ja'));
  url.searchParams.set('text_split_method', pickSplitMethod(speechText));
  url.searchParams.set('batch_size', '1');
  url.searchParams.set('media_type', 'wav');
  url.searchParams.set('streaming_mode', 'false');
  url.searchParams.set('parallel_infer', 'true');
  url.searchParams.set('_', String(Date.now()));
  return url.toString();
}

function dispatchMouth(value) {
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-mouth', {
    detail: { value: Math.min(Math.max(Number(value) || 0, 0), 1) }
  }));
}

function stopAnimationFrame(id) {
  if (id) window.cancelAnimationFrame(id);
}

export function createLive2DSpeechPlayer({ onState } = {}) {
  let currentAudio = null;
  let objectUrl = '';
  let frameId = 0;
  let audioContext = null;
  let sourceNode = null;
  let analyser = null;

  function setState(patch) {
    onState?.(patch);
  }

  function stopMouth() {
    stopAnimationFrame(frameId);
    frameId = 0;
    dispatchMouth(0);
  }

  function stop() {
    stopMouth();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onplay = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio = null;
    }
    sourceNode = null;
    analyser = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    setState({ status: 'idle', error: '' });
  }

  function startSyntheticMouth(text, audio) {
    const seed = Math.max(4, compactSpeechText(text).length);
    const tick = () => {
      if (!currentAudio || currentAudio !== audio || audio.paused || audio.ended) {
        stopMouth();
        return;
      }
      const t = audio.currentTime || 0;
      const pulse = Math.max(0, Math.sin(t * 18 + seed * 0.07));
      const accent = Math.max(0, Math.sin(t * 7.3 + seed * 0.13));
      dispatchMouth(Math.min(0.95, 0.08 + pulse * 0.58 + accent * 0.22));
      frameId = window.requestAnimationFrame(tick);
    };
    tick();
  }

  function startAnalysedMouth(text, audio) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        startSyntheticMouth(text, audio);
        return;
      }
      audioContext ||= new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      sourceNode = audioContext.createMediaElementSource(audio);
      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!currentAudio || currentAudio !== audio || audio.paused || audio.ended || !analyser) {
          stopMouth();
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) {
          const centered = sample - 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length) / 128;
        dispatchMouth(Math.min(1, rms * 3.2));
        frameId = window.requestAnimationFrame(tick);
      };
      tick();
    } catch (_) {
      startSyntheticMouth(text, audio);
    }
  }

  async function makeAudio(text, settings) {
    const directLocalGptSovits = settings.provider === 'gpt-sovits' && !settings.useProxy;
    if (directLocalGptSovits) {
      await ensureGptSovitsWeights(settings);
      const audio = new Audio(buildGptSovitsAudioUrl(text, settings));
      audio.dataset.mouthMode = 'synthetic';
      return audio;
    }

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, text, textLang: settings.textLang || 'auto' })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || `TTS ${response.status}`);
    }
    objectUrl = URL.createObjectURL(await response.blob());
    return new Audio(objectUrl);
  }

  async function play(text) {
    const speechText = String(text || '').trim();
    if (!speechText) return;
    const settings = readJson('roomTTSSettings', {});
    if (!settings.enabled) {
      setState({ status: 'disabled', error: '' });
      return;
    }
    stop();
    setState({ status: 'loading', error: '' });
    try {
      const audio = await makeAudio(speechText, settings);
      currentAudio = audio;
      audio.preload = 'auto';
      audio.onplay = () => {
        setState({ status: 'playing', error: '' });
        if (audio.dataset.mouthMode === 'synthetic') {
          startSyntheticMouth(speechText, audio);
        } else {
          startAnalysedMouth(speechText, audio);
        }
      };
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(new Error('Audio playback failed'));
        audio.play().catch(reject);
      });
      if (currentAudio === audio) stop();
    } catch (error) {
      stop();
      setState({ status: 'error', error: error.message || 'TTS failed' });
      throw error;
    }
  }

  function destroy() {
    stop();
    if (audioContext) {
      audioContext.close?.().catch(() => {});
      audioContext = null;
    }
  }

  return { play, stop, destroy };
}
