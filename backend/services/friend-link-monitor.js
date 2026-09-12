const { Parser } = require('htmlparser2');
const { fetchPinnedUrl } = require('./outbound-url-security');
const { fetchWithSafeRedirects, readBodyLimited } = require('./friend-link-avatar');
const { normalizeFriendLinkUrl } = require('./friend-links');

const MAX_BACKLINK_HTML_BYTES = 512 * 1024;
const SLOW_RESPONSE_MS = 1800;
const RESTRICTED_STATUSES = new Set([401, 403, 405, 429]);

function normalizeHostname(value) {
    const hostname = String(value || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    return hostname && !hostname.includes('/') ? hostname : '';
}

function normalizeAuthorHosts(values = []) {
    return new Set(values.map(value => {
        try {
            return normalizeHostname(new URL(value).hostname);
        } catch (_) {
            return normalizeHostname(value);
        }
    }).filter(Boolean));
}

function hostnameMatches(candidate, expected) {
    return candidate === expected || candidate.endsWith(`.${expected}`);
}

function htmlContainsBacklink(html, documentUrl, authorHosts) {
    const expectedHosts = normalizeAuthorHosts(authorHosts);
    if (!expectedHosts.size) return false;

    let baseUrl = documentUrl;
    let found = false;
    const parser = new Parser({
        onopentag(name, attributes) {
            if (found) return;
            if (name === 'base' && attributes.href) {
                try {
                    baseUrl = new URL(attributes.href, documentUrl).toString();
                } catch (_) {
                    // Ignore malformed base URLs.
                }
                return;
            }
            if (name !== 'a' || !attributes.href) return;
            try {
                const linkedUrl = new URL(attributes.href, baseUrl);
                if (!['http:', 'https:'].includes(linkedUrl.protocol)) return;
                const linkedHost = normalizeHostname(linkedUrl.hostname);
                found = [...expectedHosts].some(host => hostnameMatches(linkedHost, host));
            } catch (_) {
                // Ignore malformed links and continue parsing.
            }
        }
    }, { decodeEntities: true, lowerCaseAttributeNames: true, lowerCaseTags: true });
    parser.end(String(html || ''));
    return found;
}

async function cancelBody(response) {
    try {
        await response?.body?.cancel();
    } catch (_) {
        // The response body may already be consumed or closed.
    }
}

function getContentType(response) {
    return String(response?.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
}

function responseStatus(httpStatus, responseTimeMs) {
    if (httpStatus >= 200 && httpStatus < 300) {
        return responseTimeMs > SLOW_RESPONSE_MS ? 'slow' : 'online';
    }
    if (RESTRICTED_STATUSES.has(httpStatus)) return 'restricted';
    return 'offline';
}

function nextFailCount(previous, status) {
    const current = Math.max(0, Number.parseInt(previous, 10) || 0);
    if (status === 'online' || status === 'slow') return 0;
    if (status === 'restricted') return current;
    return current + 1;
}

async function fetchPage(url, { fetchUrl, signal, userAgent }) {
    return fetchWithSafeRedirects(url, {
        fetchUrl,
        signal,
        protocols: ['http:', 'https:'],
        headers: {
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2',
            'User-Agent': userAgent
        }
    });
}

async function inspectBacklinkPage(url, options) {
    try {
        const { response, url: finalUrl } = await fetchPage(url, options);
        if (!response.ok) {
            await cancelBody(response);
            return false;
        }
        const contentType = getContentType(response);
        if (contentType && !['text/html', 'application/xhtml+xml'].includes(contentType)) {
            await cancelBody(response);
            return false;
        }
        const html = (await readBodyLimited(response, MAX_BACKLINK_HTML_BYTES)).toString('utf8');
        return htmlContainsBacklink(html, finalUrl, options.authorHosts);
    } catch (_) {
        return false;
    }
}

async function checkFriendLink(link, {
    authorHosts = ['yachiyo.hk'],
    fetchUrl = fetchPinnedUrl,
    now = () => Date.now()
} = {}) {
    const siteUrl = normalizeFriendLinkUrl(link?.url);
    if (!siteUrl) throw new Error('友链地址无效');

    const checkedAt = new Date(now()).toISOString();
    const userAgent = 'TsukuyomiSpace-FriendLinkMonitor/1.0 (+https://yachiyo.hk/friend-links)';
    const signal = AbortSignal.timeout(10000);
    const startedAt = now();

    try {
        const { response, url: finalUrl } = await fetchPage(siteUrl, { fetchUrl, signal, userAgent });
        const responseTimeMs = Math.max(0, Math.round(now() - startedAt));
        const httpStatus = Number(response.status) || 0;
        const status = responseStatus(httpStatus, responseTimeMs);
        const backlinkUrl = normalizeFriendLinkUrl(link?.backlink_url) || finalUrl;
        let hasBacklink = false;

        if (!response.ok) {
            await cancelBody(response);
        } else if (backlinkUrl === finalUrl) {
            const contentType = getContentType(response);
            if (!contentType || ['text/html', 'application/xhtml+xml'].includes(contentType)) {
                try {
                    const html = (await readBodyLimited(response, MAX_BACKLINK_HTML_BYTES)).toString('utf8');
                    hasBacklink = htmlContainsBacklink(html, finalUrl, authorHosts);
                } catch (_) {
                    // Reachability succeeded; an oversized backlink page is simply unverifiable.
                }
            } else {
                await cancelBody(response);
            }
        } else {
            await cancelBody(response);
            hasBacklink = await inspectBacklinkPage(backlinkUrl, {
                fetchUrl,
                signal,
                userAgent,
                authorHosts
            });
        }

        return {
            id: link.id,
            url: siteUrl,
            status,
            responseTimeMs,
            httpStatus,
            failCount: nextFailCount(link.fail_count, status),
            hasBacklink,
            error: '',
            checkedAt
        };
    } catch (error) {
        return {
            id: link.id,
            url: siteUrl,
            status: 'offline',
            responseTimeMs: Math.max(0, Math.round(now() - startedAt)),
            httpStatus: 0,
            failCount: nextFailCount(link.fail_count, 'offline'),
            hasBacklink: false,
            error: String(error?.message || '站点检测失败').slice(0, 300),
            checkedAt
        };
    }
}

module.exports = {
    MAX_BACKLINK_HTML_BYTES,
    RESTRICTED_STATUSES,
    SLOW_RESPONSE_MS,
    checkFriendLink,
    htmlContainsBacklink,
    nextFailCount,
    normalizeAuthorHosts,
    responseStatus
};
