const { Parser } = require('htmlparser2');
const { fetchPinnedUrl, resolvePublicUrl } = require('./outbound-url-security');
const { normalizeFriendLinkAvatarUrl, normalizeFriendLinkUrl } = require('./friend-links');

const MAX_HTML_BYTES = 256 * 1024;
const MAX_AVATAR_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;
const ACCEPTED_IMAGE_TYPES = new Set([
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/vnd.microsoft.icon',
    'image/webp',
    'image/x-icon'
]);

function cleanContentType(value = '') {
    return String(value || '').split(';')[0].trim().toLowerCase();
}

async function cancelBody(response) {
    try {
        await response?.body?.cancel();
    } catch (_) {
        // The body may already be closed by the remote server.
    }
}

async function readBodyLimited(response, maxBytes) {
    const declaredLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
    if (declaredLength > maxBytes) {
        await cancelBody(response);
        throw new Error('远程内容过大');
    }

    const reader = response.body?.getReader();
    if (!reader) return Buffer.alloc(0);

    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) throw new Error('远程内容过大');
            chunks.push(Buffer.from(value));
        }
    } catch (error) {
        try {
            await reader.cancel();
        } catch (_) {
            // Ignore cancellation errors and report the original failure.
        }
        throw error;
    }
    return Buffer.concat(chunks, total);
}

async function fetchWithSafeRedirects(value, {
    fetchUrl = fetchPinnedUrl,
    protocols = ['https:'],
    signal,
    headers = {}
} = {}) {
    let currentUrl = String(value || '');

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const response = await fetchUrl(currentUrl, {
            headers,
            signal,
            timeoutMs: FETCH_TIMEOUT_MS,
            redirect: 'manual',
            protocols
        });
        if (response.status < 300 || response.status >= 400) {
            return { response, url: currentUrl };
        }

        const location = response.headers.get('location');
        await cancelBody(response);
        if (!location || redirectCount === MAX_REDIRECTS) throw new Error('外部地址重定向过多');
        currentUrl = new URL(location, currentUrl).toString();
    }

    throw new Error('外部地址重定向过多');
}

function iconPriority(rel, sizes = '') {
    const size = Math.max(...String(sizes || '').match(/\d+/g)?.map(Number) || [0]);
    if (rel.includes('apple-touch-icon')) return 4000 + size;
    if (rel.includes('mask-icon')) return 3000 + size;
    if (rel.includes('icon')) return 2000 + size;
    return size;
}

function extractIconCandidates(html, documentUrl) {
    const candidates = [];
    let baseUrl = documentUrl;
    const parser = new Parser({
        onopentag(name, attributes) {
            if (name === 'base' && attributes.href) {
                try {
                    baseUrl = new URL(attributes.href, documentUrl).toString();
                } catch (_) {
                    // Ignore malformed base elements.
                }
                return;
            }
            if (name !== 'link' || !attributes.href) return;
            const rel = String(attributes.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
            if (!rel.some(value => value === 'icon' || value === 'shortcut' || value === 'apple-touch-icon' || value === 'mask-icon')) return;
            try {
                candidates.push({
                    url: new URL(attributes.href, baseUrl).toString(),
                    priority: iconPriority(rel.join(' '), attributes.sizes)
                });
            } catch (_) {
                // Ignore malformed icon URLs and continue looking.
            }
        }
    }, { decodeEntities: true, lowerCaseAttributeNames: true, lowerCaseTags: true });
    parser.end(String(html || ''));

    return candidates
        .sort((left, right) => right.priority - left.priority)
        .map(item => item.url);
}

function httpsCandidate(value) {
    try {
        const url = new URL(value);
        if (url.protocol === 'http:') url.protocol = 'https:';
        return normalizeFriendLinkAvatarUrl(url.toString());
    } catch (_) {
        return null;
    }
}

async function verifyAvatarCandidate(value, options = {}) {
    const avatarUrl = httpsCandidate(value);
    if (!avatarUrl) return '';

    try {
        const { response, url } = await fetchWithSafeRedirects(avatarUrl, {
            ...options,
            protocols: ['https:'],
            headers: {
                Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/x-icon;q=0.9,*/*;q=0.1',
                'User-Agent': 'TsukuyomiSpace-FriendLinkAvatar/1.0'
            }
        });
        if (!response.ok) {
            await cancelBody(response);
            return '';
        }
        const contentType = cleanContentType(response.headers.get('content-type'));
        if (!ACCEPTED_IMAGE_TYPES.has(contentType)) {
            await cancelBody(response);
            return '';
        }
        const content = await readBodyLimited(response, MAX_AVATAR_BYTES);
        return content.length ? (httpsCandidate(url) || '') : '';
    } catch (_) {
        return '';
    }
}

async function discoverFriendLinkAvatar(siteUrl, { fetchUrl = fetchPinnedUrl, signal } = {}) {
    const normalizedSiteUrl = normalizeFriendLinkUrl(siteUrl);
    if (!normalizedSiteUrl) throw new Error('请先填写有效的站点地址');

    const requestSignal = signal || AbortSignal.timeout(8000);
    const { response, url: finalSiteUrl } = await fetchWithSafeRedirects(normalizedSiteUrl, {
        fetchUrl,
        signal: requestSignal,
        protocols: ['http:', 'https:'],
        headers: {
            Accept: 'text/html,application/xhtml+xml;q=0.9',
            'User-Agent': 'TsukuyomiSpace-FriendLinkAvatar/1.0'
        }
    });
    if (!response.ok) {
        await cancelBody(response);
        throw new Error('站点暂时无法访问');
    }
    const contentType = cleanContentType(response.headers.get('content-type'));
    if (contentType && !['text/html', 'application/xhtml+xml'].includes(contentType)) {
        await cancelBody(response);
        throw new Error('站点首页不是可识别的网页');
    }

    const html = (await readBodyLimited(response, MAX_HTML_BYTES)).toString('utf8');
    const fallback = new URL('/favicon.ico', finalSiteUrl).toString();
    const candidates = [...new Set([...extractIconCandidates(html, finalSiteUrl), fallback])].slice(0, 6);
    for (const candidate of candidates) {
        const avatarUrl = await verifyAvatarCandidate(candidate, { fetchUrl, signal: requestSignal });
        if (avatarUrl) return avatarUrl;
    }
    throw new Error('没有找到可用的 HTTPS 站点头像');
}

async function prepareFriendLinkAvatar({ avatarUrl = '', siteUrl = '' } = {}, {
    resolveUrl = resolvePublicUrl,
    discover = discoverFriendLinkAvatar
} = {}) {
    if (!avatarUrl) {
        try {
            return await discover(siteUrl);
        } catch (_) {
            return '';
        }
    }

    const normalized = normalizeFriendLinkAvatarUrl(avatarUrl);
    if (!normalized) throw new Error('头像链接必须是有效的 HTTPS 地址');
    await resolveUrl(normalized, { protocols: ['https:'] });
    return normalized;
}

module.exports = {
    ACCEPTED_IMAGE_TYPES,
    MAX_AVATAR_BYTES,
    MAX_HTML_BYTES,
    discoverFriendLinkAvatar,
    extractIconCandidates,
    fetchWithSafeRedirects,
    prepareFriendLinkAvatar,
    readBodyLimited,
    verifyAvatarCandidate
};
