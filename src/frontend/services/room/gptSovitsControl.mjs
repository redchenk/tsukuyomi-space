import { ONECLICK_TTS_DEFAULTS } from './oneclickTts.mjs';

export function normalizeLocalGptSovitsUrl(url) {
  const parsed = new URL(url || ONECLICK_TTS_DEFAULTS.apiUrl);
  if (window.location.protocol === 'https:' && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1') {
    parsed.hostname = 'localhost';
  }
  return parsed;
}

export function requestLocalGptSovitsControl(url, timeout = 70000) {
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
