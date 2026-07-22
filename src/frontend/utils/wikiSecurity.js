const MAX_WIKI_HASH_LENGTH = 160;

const TRUSTED_WIKI_SOURCE_HOSTS = new Set([
  'ciatr.jp',
  'www.cho-kaguyahime.com',
  'www.kadokawa.co.jp',
  'www.netflix.com',
  'x.com',
  'zh.moegirl.org.cn',
  'zh.wikipedia.org'
]);

export function decodeWikiHash(value) {
  const encoded = String(value || '').replace(/^#/, '');
  if (!encoded || encoded.length > MAX_WIKI_HASH_LENGTH * 3) return '';
  try {
    const decoded = decodeURIComponent(encoded);
    if (!decoded || decoded.length > MAX_WIKI_HASH_LENGTH || /[\u0000-\u001f\u007f]/u.test(decoded)) return '';
    return decoded;
  } catch (_) {
    return '';
  }
}

export function trustedWikiSourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || !TRUSTED_WIKI_SOURCE_HOSTS.has(url.hostname.toLowerCase())) {
      return '';
    }
    return url.toString();
  } catch (_) {
    return '';
  }
}

export function trustedWikiAssetPath(value) {
  const path = String(value || '');
  if (!/^\/assets\/images\/wiki\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:gif|jpe?g|png|webp)$/i.test(path) || path.includes('..')) return '';
  return path;
}
