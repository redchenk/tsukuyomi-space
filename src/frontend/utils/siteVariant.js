const COMPILED_ENGLISH_SITE = typeof __TSUKUYOMI_ENGLISH_SITE__ !== 'undefined'
  && __TSUKUYOMI_ENGLISH_SITE__;
const ENGLISH_SITE_HOSTS = new Set([
  'tsukuyomi-space.com',
  'www.tsukuyomi-space.com'
]);

function currentHostname() {
  if (typeof window === 'undefined') return '';
  return window.location?.hostname || '';
}

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

export function isEnglishSite(hostname = currentHostname()) {
  return Boolean(COMPILED_ENGLISH_SITE || ENGLISH_SITE_HOSTS.has(normalizeHostname(hostname)));
}

export function forcedSiteLanguage(hostname = currentHostname()) {
  return isEnglishSite(hostname) ? 'en' : '';
}
