// Defaults shared by the settings preset and the one-click package handoff.
export const ONECLICK_TTS_DEFAULTS = Object.freeze({
  enabled: false,
  provider: 'gpt-sovits',
  apiUrl: 'http://localhost:9880/tts',
  apiKey: '',
  model: 'auto',
  voice: '',
  textLang: 'auto',
  promptLang: 'ja',
  refAudioPath: 'reference/cankao.wav',
  promptText: '八千年分の知識と経験で、どんなお悩み相談もお任せあれ。',
  gptWeightPath: 'GPT_weights_v2ProPlus/yachiyo-new-e20.ckpt',
  sovitsWeightPath: 'SoVITS_weights_v2ProPlus/yachiyo-new_e12_s684.pth',
  useProxy: false
});

const HASH_PREFIX = '#tsukuyomi-tts=v1.';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const isToken = value => typeof value === 'string' && value.length === 43 && TOKEN.test(value);
const ORIGINS = new Set([
  'https://yachiyo.hk', 'https://yachiyo.com.cn',
  'https://cho-kaguyahime.cn', 'https://tsukuyomi-space.com'
]);

export function makeOneclickTtsSettings(token) {
  if (!isToken(token)) throw new TypeError('Invalid one-click token');
  return {
    ...ONECLICK_TTS_DEFAULTS,
    enabled: true,
    apiUrl: `${ONECLICK_TTS_DEFAULTS.apiUrl}?oneclick_token=${token}`
  };
}

export function isOneclickApiUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'http://localhost:9880' && url.pathname === '/tts'
      && !url.username && !url.password && !url.hash
      && [...url.searchParams.keys()].length === 1
      && isToken(url.searchParams.get('oneclick_token'));
  } catch (_) { return false; }
}

export function buildGptSovitsControlRequest(endpoint, pathname, params = {}) {
  const url = new URL(endpoint);
  const token = isOneclickApiUrl(url) ? url.searchParams.get('oneclick_token') : '';
  url.pathname = pathname;
  url.search = '';
  if (token) url.searchParams.set('oneclick_token', token);
  Object.entries(params).forEach(([key, value]) => {
    if (String(value || '').trim()) url.searchParams.set(key, String(value).trim());
  });
  url.searchParams.set('_', String(Date.now()));
  return url.toString();
}

export function importOneclickTts(context = window) {
  const { location } = context;
  if (!ORIGINS.has(location.origin) || !/^\/room(?:\/|$)/.test(location.pathname)) return 'ignored';
  if (!location.hash.startsWith(HASH_PREFIX)) return 'ignored';
  const token = location.hash.slice(HASH_PREFIX.length);
  if (!isToken(token)) return 'invalid';
  try {
    // Modify only TTS. Account sessions, LLM keys, history and diary stay in their own keys.
    context.localStorage.setItem('roomTTSSettings', JSON.stringify(makeOneclickTtsSettings(token)));
  } catch (_) { return 'storage-error'; }
  // Remove the short-lived credential before router initialization / history capture.
  try { context.history.replaceState(context.history.state, '', location.pathname + location.search); }
  catch (_) { /* Settings are still usable if the browser disallows history updates. */ }
  return 'imported';
}

export function initializeOneclickTts(context = window) {
  const notify = result => {
    if (result === 'storage-error') context.alert('无法保存八千代语音连接，请允许此网站使用浏览器存储后重新打开。');
  };
  const initial = importOneclickTts(context);
  notify(initial);
  // Windows may reuse an existing tab. Reload after importing to refresh mounted settings.
  context.addEventListener('hashchange', () => {
    const result = importOneclickTts(context);
    notify(result);
    if (result === 'imported') context.location.reload();
  });
  return initial;
}
