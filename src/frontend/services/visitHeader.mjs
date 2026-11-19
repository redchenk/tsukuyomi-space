const storageKey = 'tsukuyomi_growth_browser_v1';
let fallbackId = '';
function browserId() {
  try {
    let value = localStorage.getItem(storageKey);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(storageKey, value);
    }
    return value;
  } catch {
    return (fallbackId ||= globalThis.crypto?.randomUUID?.() || '');
  }
}
export function visitHeader() {
  if (
    typeof location === 'undefined' ||
    /^\/(?:terminal|admin|fushi\/astrbot\/callback|auth\/callback)(?:\/|$)/.test(location.pathname)
  )
    return '';
  const path = location.pathname;
  const article = /^\/articles\/(\d{1,12})(?:\/|$)/.exec(path);
  const page = article
    ? '/articles/' + article[1]
    : '/' + (path.split('/')[1] || '').replace(/[^a-z-]/gi, '').slice(0, 30);
  let referrer = '';
  try {
    const host = new URL(document.referrer).hostname;
    if (host !== location.hostname) referrer = host;
  } catch {
    /* Direct visit. */
  }
  const data = { browser: browserId(), path: page, referrer };
  const query = new URLSearchParams(location.search);
  for (const key of ['source', 'medium', 'campaign', 'content']) {
    const value = query.get('utm_' + key);
    if (value && /^[a-z0-9_.-]{1,64}$/i.test(value)) data[key] = value;
  }
  return encodeURIComponent(JSON.stringify(data));
}
