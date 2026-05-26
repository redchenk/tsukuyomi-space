import { assetUrl } from '../../utils/assetUrl';

const CORE_SCRIPT = '/lib/live2dcubismcore-v5.min.js';
const ROOM_SCRIPT = '/lib/bundled/live2d-room-neuro-live.iife.js';
const LIVE2D_READY_EVENT = 'tsukuyomi:live2d-ready';
const LIVE2D_READY_TIMEOUT = 20000;

let loadingPromise = null;
let initialized = false;
let initPromise = null;

if (typeof window !== 'undefined') {
  window.TSUKUYOMI_EXTERNAL_LIVE2D = true;
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

export function isMobileLive2DDevice() {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function isConstrainedMobileLive2DDevice() {
  if (!isMobileLive2DDevice()) return false;
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  return (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
}

function readRoomModelSettings() {
  try {
    return JSON.parse(localStorage.getItem('roomModelSettings') || '{}') || {};
  } catch (_) {
    return {};
  }
}

export function live2DPerformanceMode() {
  if (readRoomModelSettings().lowQualityModel) return 'lite';
  if (!isMobileLive2DDevice()) return 'standard';
  if (isConstrainedMobileLive2DDevice()) return 'lite';
  return 'low';
}

function live2DModelJson(mode = live2DPerformanceMode()) {
  if (mode === 'lite') return '/models/tsukimi-yachiyo/tsukimi-yachiyo-lite.model3.json';
  if (mode === 'low') return '/models/tsukimi-yachiyo/tsukimi-yachiyo-mobile.model3.json';
  return '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json';
}

export function preloadLive2DResources() {
  const mode = live2DPerformanceMode();
  const modelJson = live2DModelJson(mode);
  if (mode !== 'standard') {
    [
      { href: assetUrl(CORE_SCRIPT), as: 'script' },
      {
        href: assetUrl(modelJson),
        as: 'fetch',
        type: 'application/json'
      }
    ].forEach((resource) => {
      if (document.head.querySelector(`link[data-room-preload="${resource.href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = resource.href;
      link.as = resource.as;
      link.dataset.roomPreload = resource.href;
      if (resource.type) link.type = resource.type;
      if (resource.as === 'fetch') link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
    return;
  }
  [
    { href: assetUrl(CORE_SCRIPT), as: 'script' },
    { href: assetUrl(ROOM_SCRIPT), as: 'script' },
      {
        href: assetUrl(modelJson),
        as: 'fetch',
        type: 'application/json'
    },
    { href: assetUrl('/models/tsukimi-yachiyo/tsukimi-yachiyo.moc3'), as: 'fetch', type: 'application/octet-stream' }
  ].forEach((resource) => {
    if (document.head.querySelector(`link[data-room-preload="${resource.href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = resource.href;
    link.as = resource.as;
    link.dataset.roomPreload = resource.href;
    if (resource.type) link.type = resource.type;
    if (resource.as === 'fetch') link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

export async function ensureLive2DScripts() {
  if (!loadingPromise) {
    window.TSUKUYOMI_EXTERNAL_LIVE2D = true;
    window.TSUKUYOMI_LIVE2D_PERFORMANCE = live2DPerformanceMode();
    loadingPromise = loadScript(assetUrl(CORE_SCRIPT)).then(() => loadScript(assetUrl(ROOM_SCRIPT)));
  }
  return loadingPromise;
}

function waitForLive2DReady() {
  if (window.TSUKUYOMI_LIVE2D_READY) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener(LIVE2D_READY_EVENT, onReady);
      reject(new Error('Live2D 加载超时，请刷新页面重试'));
    }, LIVE2D_READY_TIMEOUT);

    function onReady() {
      window.clearTimeout(timeoutId);
      resolve();
    }

    window.addEventListener(LIVE2D_READY_EVENT, onReady, { once: true });
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

export function speakLive2D() {
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-speak'));
}
