import { dispatchRoomLive2D } from './live2dControl';
import { alignLive2DIntentToStreamingSpeech } from './live2dStreamingSpeechSession';

const CORE_SCRIPT = '/lib/live2dcubismcore-v5.min.js';
const ROOM_SCRIPT = '/lib/bundled/live2d-room-neuro-live.20260717-adaptive-perf-r6.iife.js';
const MODEL_BASE = '/models-v4/tsukimi-yachiyo';
const MODEL_RESOURCES = [
  { href: `${MODEL_BASE}/tsukimi-yachiyo.moc3`, as: 'fetch', type: 'application/octet-stream' },
  { href: `${MODEL_BASE}/textures/desktop/texture_00.webp`, as: 'image', type: 'image/webp' },
  { href: `${MODEL_BASE}/textures/desktop/texture_01.webp`, as: 'image', type: 'image/webp' }
];
const LIVE2D_READY_EVENT = 'tsukuyomi:live2d-ready';
const LIVE2D_ERROR_EVENT = 'tsukuyomi:live2d-error';
const LIVE2D_READY_TIMEOUT = 210000;

let loadingPromise = null;
let initialized = false;
let initPromise = null;
let speechFrameId = 0;
let speechEndsAt = 0;
let speechLastFrameAt = 0;

const LIVE2D_SPEECH_FRAME_INTERVAL_MS = 1000 / 60;

if (typeof window !== 'undefined') {
  window.TSUKUYOMI_EXTERNAL_LIVE2D = true;
  window.TSUKUYOMI_LIVE2D_DISABLE_POINTER = shouldDisableLive2DPointer();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-live2d-script="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.live2dScript = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.body.appendChild(script);
  });
}

function isMobileLive2DDevice() {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function shouldDisableLive2DPointer() {
  if (typeof window === 'undefined') return true;
  if (isMobileLive2DDevice()) return false;
  return !window.matchMedia?.('(pointer: coarse), (hover: none)')?.matches;
}

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function compactSpeechText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .replace(/[,.!?;:'"()[\]{}<>\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09\u3010\u3011\u300a\u300b~\-]/g, '')
    .trim();
}

function estimateSpeechDurationMs(options = {}) {
  const explicit = Number(options.durationMs);
  if (Number.isFinite(explicit) && explicit > 0) return clamp(explicit, 1200, 16000, explicit);
  const audioSeconds = Number(options.audioDuration);
  if (Number.isFinite(audioSeconds) && audioSeconds > 0) return clamp(audioSeconds * 1000, 1200, 16000, audioSeconds * 1000);
  const textLength = compactSpeechText(options.text).length;
  return clamp(1500 + textLength * 145, 1800, 12000, 3200);
}

function speechEmotion(options = {}) {
  const value = String(options.emotion || options.live2d?.emotion || options.live2d?.expression || '').trim();
  return value || 'happy';
}

function speechExpression(options = {}) {
  const value = String(
    options.expression ||
    options.live2d?.expression ||
    options.live2d?.expressionMix?.[0]?.expression ||
    options.live2d?.emotion ||
    ''
  ).trim();
  return value || 'smile';
}

function dispatchMouth(value) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-mouth', {
    detail: { value: clamp(value, 0, 1, 0) }
  }));
}

function dispatchCharacterState(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-character-state', { detail }));
}

function stopSyntheticSpeechMouth() {
  if (typeof window === 'undefined') return;
  if (speechFrameId) window.cancelAnimationFrame(speechFrameId);
  speechFrameId = 0;
  speechEndsAt = 0;
  speechLastFrameAt = 0;
  dispatchMouth(0);
}

function startSyntheticSpeechMouth(options = {}) {
  if (typeof window === 'undefined') return;
  stopSyntheticSpeechMouth();
  const durationMs = estimateSpeechDurationMs(options);
  const seed = Math.max(4, compactSpeechText(options.text).length);
  const audio = options.audio && typeof options.audio === 'object' ? options.audio : null;
  const startedAt = performance.now();
  speechEndsAt = startedAt + durationMs;

  const tick = (now = performance.now()) => {
    if (audio) {
      if (audio.paused || audio.ended) {
        stopSyntheticSpeechMouth();
        return;
      }
    } else if (!speechEndsAt || now >= speechEndsAt) {
      stopSyntheticSpeechMouth();
      return;
    }
    if (!speechLastFrameAt || now - speechLastFrameAt >= LIVE2D_SPEECH_FRAME_INTERVAL_MS - 1) {
      speechLastFrameAt = now;
      const t = audio ? (Number(audio.currentTime) || 0) : (now - startedAt) / 1000;
      const pulse = Math.max(0, Math.sin(t * 18 + seed * 0.07));
      const accent = Math.max(0, Math.sin(t * 7.3 + seed * 0.13));
      dispatchMouth(Math.min(0.95, 0.08 + pulse * 0.56 + accent * 0.2));
    }
    speechFrameId = window.requestAnimationFrame(tick);
  };
  speechFrameId = window.requestAnimationFrame(tick);
}

function speechBehaviorIntent(options = {}) {
  const durationMs = estimateSpeechDurationMs(options);
  if (options.live2d && typeof options.live2d === 'object') {
    return alignLive2DIntentToStreamingSpeech({
      ...options.live2d,
      source: 'streaming-speech',
      emotion: options.live2d.emotion || speechEmotion(options),
      expression: options.live2d.expression || speechExpression(options),
      intensity: clamp(options.live2d.intensity ?? options.intensity, 0.35, 1, 0.62),
      durationMs: Math.max(Number(options.live2d.durationMs) || 0, durationMs),
      priority: clamp(options.live2d.priority ?? options.priority, 0, 10, 5.6),
      interruptPolicy: options.live2d.interruptPolicy || {
        mode: 'blend',
        priority: clamp(options.priority, 0, 10, 5.6),
        minHoldMs: Math.min(1200, Math.max(420, durationMs * 0.28)),
        blendInMs: 360,
        blendOutMs: 620
      }
    }, durationMs);
  }
  const tiltSide = compactSpeechText(options.text).length % 2 === 0 ? 'right' : 'left';
  return {
    source: 'streaming-speech',
    emotion: speechEmotion(options),
    expression: speechExpression(options),
    intensity: clamp(options.intensity, 0.35, 1, 0.62),
    durationMs,
    priority: clamp(options.priority, 0, 10, 5.6),
    interruptPolicy: {
      mode: 'blend',
      priority: clamp(options.priority, 0, 10, 5.6),
      minHoldMs: Math.min(1200, Math.max(420, durationMs * 0.28)),
      blendInMs: 360,
      blendOutMs: 620
    },
    behaviorActions: [
      { type: 'look_at_chat', durationMs: Math.min(1800, Math.max(900, durationMs * 0.34)), delayMs: 0, intensity: 0.72 },
      { type: 'sway', durationMs: Math.max(1600, durationMs), delayMs: 120, intensity: 0.42 },
      { type: 'head_tilt', side: tiltSide, durationMs: Math.min(2600, Math.max(1200, durationMs * 0.46)), delayMs: 360, intensity: 0.48 },
      { type: 'breathe', durationMs: Math.max(1600, durationMs), delayMs: 0, intensity: 0.58 }
    ]
  };
}

export function live2DPerformanceMode() {
  return 'standard';
}

function live2DModelJson() {
  return '/models-v4/tsukimi-yachiyo/tsukimi-yachiyo.model3.json';
}

export function preloadLive2DResources() {
  const modelJson = live2DModelJson();
  [
    { href: CORE_SCRIPT, as: 'script' },
    { href: ROOM_SCRIPT, as: 'script' },
      {
        href: modelJson,
        as: 'fetch',
        type: 'application/json'
      },
    ...MODEL_RESOURCES
  ].forEach((resource) => {
    if (document.head.querySelector(`link[data-room-preload="${resource.href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = resource.href;
    link.as = resource.as;
    link.dataset.roomPreload = resource.href;
    if (resource.type) link.type = resource.type;
    if (resource.as === 'fetch' || resource.as === 'image') link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

export async function ensureLive2DScripts() {
  if (!loadingPromise) {
    window.TSUKUYOMI_EXTERNAL_LIVE2D = true;
    window.TSUKUYOMI_LIVE2D_DISABLE_POINTER = shouldDisableLive2DPointer();
    window.TSUKUYOMI_LIVE2D_PERFORMANCE = live2DPerformanceMode();
    loadingPromise = loadScript(CORE_SCRIPT).then(() => loadScript(ROOM_SCRIPT));
  }
  return loadingPromise;
}

function waitForLive2DReady() {
  if (window.TSUKUYOMI_LIVE2D_READY) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(LIVE2D_READY_EVENT, onReady);
      window.removeEventListener(LIVE2D_ERROR_EVENT, onError);
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Live2D 加载超时，请刷新页面重试'));
    }, LIVE2D_READY_TIMEOUT);

    function onReady() {
      cleanup();
      resolve();
    }

    function onError(event) {
      cleanup();
      reject(new Error(event?.detail?.message || 'Live2D texture loading failed'));
    }

    window.addEventListener(LIVE2D_READY_EVENT, onReady, { once: true });
    window.addEventListener(LIVE2D_ERROR_EVENT, onError, { once: true });
  });
}

export async function initLive2DRoom() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await ensureLive2DScripts();
    window.TSUKUYOMI_LIVE2D_READY = false;
    if (initialized) window.destroyTsukuyomiLive2DRoom?.();
    if (typeof window.initTsukuyomiLive2DRoom !== 'function') {
      throw new Error('Live2D 初始化入口不存在');
    }
    const readyPromise = waitForLive2DReady();
    window.initTsukuyomiLive2DRoom();
    initialized = true;
    await readyPromise;
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

export function destroyLive2DRoom() {
  window.destroyTsukuyomiLive2DRoom?.();
  initialized = false;
  initPromise = null;
}

export function speakLive2D(options = {}) {
  const durationMs = estimateSpeechDurationMs(options);
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-speak', { detail: options }));
  dispatchRoomLive2D(speechBehaviorIntent({ ...options, durationMs }));
  dispatchCharacterState({
    mode: 'speaking',
    holdMs: durationMs + 760,
    emotionHoldMs: durationMs + 960,
    emotion: speechEmotion(options),
    attention: 0.9,
    arousal: speechEmotion(options) === 'sad' || speechEmotion(options) === 'crying' ? 0.5 : 0.68
  });
  startSyntheticSpeechMouth({ ...options, durationMs });
}

export function stopLive2DSpeech() {
  stopSyntheticSpeechMouth();
  dispatchCharacterState({
    mode: 'listening',
    holdMs: 900,
    attention: 0.52,
    arousal: 0.34
  });
}
