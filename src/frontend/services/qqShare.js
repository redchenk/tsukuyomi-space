import { normalizedSharePayload } from './socialShare';
import qqSdkUrl from '../vendor/qq/qqapi.js?url';

// Public QQ Connect App ID already used by this site's QQ login.
const QQ_APP_ID = '1904951941';
let sdkLoading;

export function qqShareEnvironment(device = {}) {
  const ua = String(device.userAgent || '');
  const ios = /iPhone|iPad|iPod/i.test(ua)
    || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || ios;
  return { mobile, ios, insideQQ: mobile && /\bQQ\/[\d.]+/i.test(ua) };
}

export function qqSharePayload(value = {}) {
  const share = normalizedSharePayload(value);
  if (!share.url) return share;
  const url = new URL(share.url);
  // QQ receives the stable short URL; article canonical/OG URLs keep their slug.
  const id = url.pathname.match(/^\/articles\/(\d+)(?:\/|$)/)?.[1]
    || (url.pathname === '/article' ? url.searchParams.get('id') : '');
  if (id && /^\d+$/.test(id)) {
    url.pathname = `/articles/${id}`;
    url.search = '';
    url.hash = '';
  }
  return {
    ...share,
    url: url.href,
    title: Array.from(share.title).slice(0, 128).join(''),
    text: Array.from(share.text || share.title).slice(0, 50).join(''),
    imageUrl: share.imageUrl || new URL('/assets/icons/icon-512.png', url.origin).href
  };
}

function utf8Base64(value) {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildQQAppLink(value = {}) {
  const share = qqSharePayload(value);
  if (!share.url) return '';
  const params = new URLSearchParams({
    src_type: 'web', version: '1', file_type: 'news',
    share_id: QQ_APP_ID, req_type: '1', shareType: '0', cflag: '0',
    url: utf8Base64(share.url), title: utf8Base64(share.title),
    description: utf8Base64(share.text),
    image_url: utf8Base64(share.imageUrl), previewimageUrl: utf8Base64(share.imageUrl),
    thirdAppDisplayName: utf8Base64('月读空间'), app_name: utf8Base64('月读空间')
  });
  // Web shares carry their data in the URL, not a native app's pasteboard or
  // callback scheme. Supplying those native-only flags can lose the payload.
  return `mqqapi://share/to_fri?${params}`;
}

export function buildQQBridgePayload(value = {}) {
  const share = qqSharePayload(value);
  return {
    title: share.title, desc: share.text, share_url: share.url,
    image_url: share.imageUrl, share_type: 0, shareElement: 'news',
    appid: QQ_APP_ID, back: true
  };
}

export function buildQQSystemPayload(value = {}) {
  const share = qqSharePayload(value);
  // iOS QQ accepts URL items through its system extension. Extra text replaces
  // the article title in the card, so let QQ read the short URL's page metadata.
  return { title: share.title, url: share.url };
}

export function qqShareResult(result) {
  // Android's official SDK returns retCode; iOS versions may return ret.
  const code = result?.retCode ?? result?.ret;
  if (code === 0 || code === '0') return 'confirmed';
  if (code === 1 || code === '1') return 'cancelled';
  return 'failed';
}

export function loadQQShareSdk() {
  if (typeof window.mqq?.ui?.shareMessage === 'function') return Promise.resolve(window.mqq);
  if (sdkLoading) return sdkLoading;
  const loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = qqSdkUrl;
    script.async = true;
    const timer = window.setTimeout(() => finish(new Error('QQ SDK timed out')), 7000);
    function finish(error) {
      window.clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window.mqq);
    }
    script.onload = () => finish(typeof window.mqq?.ui?.shareMessage === 'function' ? null : new Error('QQ sharing unavailable'));
    script.onerror = () => finish(new Error('QQ SDK unavailable'));
    document.head.appendChild(script);
  });
  sdkLoading = loading.catch(error => { sdkLoading = null; throw error; });
  return sdkLoading;
}

export function launchQQApp(url, onUnavailable) {
  let handedOff = false;
  let timer;
  const cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('pagehide', markHandedOff);
  };
  const markHandedOff = () => { handedOff = true; cleanup(); };
  const visibilityChanged = () => { if (document.visibilityState === 'hidden') markHandedOff(); };
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('pagehide', markHandedOff);
  timer = window.setTimeout(() => {
    cleanup();
    if (!handedOff && document.visibilityState !== 'hidden') onUnavailable();
  }, 2500);
  // Keep the browser's click activation: do not await copying or SDK requests.
  try { window.location.assign(url); }
  catch (_) { cleanup(); onUnavailable(); }
  return cleanup;
}
