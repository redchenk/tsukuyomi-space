const { tlds } = require('../data/domain-tlds.json');
// A local IANA snapshot avoids DNS/network requests on the message write path.
// Reserved/test and non-public names still need review when shared as domains.
const DOMAIN_TLDS = new Set([...tlds, 'example', 'test', 'invalid', 'localhost', 'local', 'onion']);
const TRUSTED_MESSAGE_HOSTS = [
    'yachiyo.hk',
    'tsukuyomi-space.com',
    'yachiyo.com.cn',
    'cho-kaguyahime.cn'
];

const DOMAIN_LABEL = String.raw`(?:xn--[a-z0-9-]{1,59}|[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)`;
const DOMAIN_SUFFIX = String.raw`(?:xn--[a-z0-9-]{1,59}|[a-z\p{L}]{2,63})`;
const LINK_CANDIDATE_PATTERN = new RegExp([
    String.raw`(?:https?|hxxps?|ftp):\/\/[^\s<>"'\x60]+`,
    String.raw`\/\/[a-z0-9\p{L}\p{N}][^\s<>"'\x60]+`,
    String.raw`www\.[^\s<>"'\x60]+`,
    String.raw`(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/[^\s<>"'\x60]*)?`,
    String.raw`(?:${DOMAIN_LABEL}\.)+${DOMAIN_SUFFIX}(?::\d{1,5})?(?:\/[^\s<>"'\x60]*)?`
].join('|'), 'giu');

function normalizeForLinkInspection(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
        .replace(/[\u3002\uff0e\uff61]/g, '.')
        .replace(/\s*[([{]\s*(?:\.|dot|d0t|\u70b9)\s*[)\]}]\s*/gi, '.')
        .replace(/\s+(?:dot|d0t|\u70b9)\s+/gi, '.')
        // Preserve the word boundary in ordinary prose such as "Hello. Today".
        .replace(/[^\S\r\n]+\.[^\S\r\n]*/g, '.')
        .replace(/\s*([:/\\])\s*/g, '$1')
        .replace(/\\/g, '/');
}

function trimLinkCandidate(value) {
    return String(value || '').replace(/[),.;:!?\]\}]+$/u, '');
}

function candidateUrl(value) {
    let candidate = trimLinkCandidate(value);
    candidate = candidate.replace(/^hxxp/i, 'http');
    if (candidate.startsWith('//')) candidate = `https:${candidate}`;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    // A reaction immediately after a host is prose, not part of its TLD. Do not
    // remove emoji inside a host (which could disguise a different destination).
    candidate = candidate.replace(/^([a-z]+:\/\/)([^/?#]+)/i, (_, scheme, authority) =>
        scheme + authority.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\uFE0E\u200D]+$/gu, ''));
    try {
        const url = new URL(candidate);
        if (!['http:', 'https:', 'ftp:'].includes(url.protocol)) return null;
        const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
        if (!hostname) return null;
        return { url, hostname };
    } catch (_) {
        return null;
    }
}

function isTrustedMessageHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return TRUSTED_MESSAGE_HOSTS.some(root => host === root || host.endsWith(`.${root}`));
}

function inspectMessageLinks(value) {
    const original = String(value || '');
    const normalized = normalizeForLinkInspection(original);
    // Inspect a scheme at a token boundary, not "data:" inside "metadata:".
    // Spacing inside an actual scheme is still detected.
    const dangerousScheme = /(?<![a-z0-9_+.-])(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t|d\s*a\s*t\s*a|f\s*i\s*l\s*e)\s*:/iu.test(normalized);
    const links = [];
    const seen = new Set();

    // A second view retains Chinese sentence boundaries, so "evil.com。谢谢"
    // still exposes the actual link even though the whole phrase is not a host.
    const views = new Set([normalized, normalizeForLinkInspection(original.replace(/[\u3002\uff61]/g, ' '))]);
    for (const view of views) {
      LINK_CANDIDATE_PATTERN.lastIndex = 0;
      for (const match of view.matchAll(LINK_CANDIDATE_PATTERN)) {
        const raw = trimLinkCandidate(match[0]);
        const parsed = candidateUrl(raw);
        if (!parsed) continue;
        const explicitAddress = /^(?:(?:https?|hxxps?|ftp):\/\/|\/\/|www\.)/i.test(raw);
        const ipAddress = /^\d+(?:\.\d+){3}$/.test(parsed.hostname);
        if (!explicitAddress && !ipAddress && !DOMAIN_TLDS.has(parsed.hostname.split('.').at(-1))) continue;
        const key = `${parsed.url.protocol}//${parsed.url.host}${parsed.url.pathname}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const hasCredentials = Boolean(parsed.url.username || parsed.url.password);
        links.push({
            raw,
            hostname: parsed.hostname,
            external: hasCredentials || !isTrustedMessageHost(parsed.hostname),
            obfuscated: /^hxxp/i.test(raw) || normalized !== original
        });
      }
    }

    return {
        dangerousScheme,
        links,
        externalLinks: links.filter(link => link.external)
    };
}

module.exports = {
    TRUSTED_MESSAGE_HOSTS,
    normalizeForLinkInspection,
    isTrustedMessageHost,
    inspectMessageLinks
};
