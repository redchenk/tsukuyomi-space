const TRUSTED_MESSAGE_HOSTS = [
    'yachiyo.hk',
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
        .replace(/\s*([.:/\\])\s*/g, '$1')
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
    const compact = normalized.replace(/\s+/g, '');
    const dangerousScheme = /(?:javascript|vbscript|data|file):/i.test(compact);
    const links = [];
    const seen = new Set();

    LINK_CANDIDATE_PATTERN.lastIndex = 0;
    for (const match of normalized.matchAll(LINK_CANDIDATE_PATTERN)) {
        const raw = trimLinkCandidate(match[0]);
        const parsed = candidateUrl(raw);
        if (!parsed) continue;
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
