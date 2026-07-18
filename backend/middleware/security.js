const crypto = require('crypto');
const net = require('net');
const config = require('../config');
const store = require('../services/redis-store');

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' https: wss: http://localhost:11434",
    "frame-src https:",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:"
].join('; ');

function securityHeaders(req, res, next) {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    if (config.isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('X-XSS-Protection', '0');
    next();
}

function normalizedOrigin(value) {
    try {
        const url = new URL(String(value || ''));
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : '';
    } catch (_) {
        return '';
    }
}

function trustedOrigins() {
    const origins = new Set(config.corsOrigins.map(normalizedOrigin).filter(Boolean));
    const publicOrigin = normalizedOrigin(config.publicSiteUrl);
    const oauthOrigin = normalizedOrigin(config.oauthRedirectBaseUrl);
    if (publicOrigin) origins.add(publicOrigin);
    if (oauthOrigin) origins.add(oauthOrigin);
    if (publicOrigin) {
        const url = new URL(publicOrigin);
        if (url.hostname === 'yachiyo.hk') origins.add(`${url.protocol}//www.yachiyo.hk${url.port ? `:${url.port}` : ''}`);
    }
    return origins;
}

function isAllowedOrigin(origin, req = null) {
    if (!origin) return true;
    const normalized = normalizedOrigin(origin);
    if (!normalized) return false;
    if (trustedOrigins().has(normalized)) return true;
    if (!config.isProduction && req?.headers?.host) {
        return normalized === `${req.protocol || 'http'}://${req.headers.host}`;
    }
    return false;
}

function requireTrustedWrite(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase())) return next();
    if (/^Bearer\s+\S+$/i.test(String(req.headers.authorization || ''))) return next();

    const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    const origin = String(req.headers.origin || '');
    const requestedWith = String(req.headers['x-requested-with'] || '');
    const allowedOrigin = Boolean(origin) && isAllowedOrigin(origin, req);
    const hasAjaxHeader = requestedWith === 'XMLHttpRequest';
    const browserProvesTrustedContext = fetchSite === 'same-origin'
        || (fetchSite === 'same-site' && allowedOrigin);
    const trustedOriginRequest = allowedOrigin && (hasAjaxHeader || browserProvesTrustedContext);
    const trustedOriginlessRequest = !origin && fetchSite === 'same-origin' && hasAjaxHeader;

    if (fetchSite !== 'cross-site' && (!origin || allowedOrigin) && (trustedOriginRequest || trustedOriginlessRequest)) {
        return next();
    }

    return res.status(403).json({ success: false, message: '请求被拒绝' });
}

function normalizeIp(value) {
    let candidate = String(value || '').trim();
    if (!candidate) return '';
    if (candidate.startsWith('[')) candidate = candidate.slice(1, candidate.indexOf(']'));
    if (candidate.startsWith('::ffff:')) candidate = candidate.slice(7);
    if (net.isIP(candidate)) return candidate;
    const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    return ipv4WithPort && net.isIP(ipv4WithPort[1]) ? ipv4WithPort[1] : '';
}

function isLoopback(value) {
    const ip = normalizeIp(value);
    return ip === '127.0.0.1' || ip === '::1';
}

function getClientIp(req) {
    const frameworkIp = normalizeIp(req?.ip);
    if (frameworkIp && !isLoopback(frameworkIp)) return frameworkIp;
    const directIp = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress);
    if (directIp && !isLoopback(directIp)) return directIp;

    const realIp = normalizeIp(req?.headers?.['x-real-ip']);
    if (realIp) return realIp;
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
        .split(',')
        .map(normalizeIp)
        .filter(Boolean)
        .pop();
    return forwarded || directIp || 'unknown';
}

function rateLimitKey(prefix, identity) {
    const digest = crypto.createHash('sha256').update(String(identity || 'unknown')).digest('hex');
    return `${prefix}:${digest}`;
}

function createRateLimiter({ windowMs, max, keyPrefix = 'rate', keyGenerator = getClientIp }) {
    const hits = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of hits.entries()) {
            if (bucket.resetAt <= now) hits.delete(key);
        }
    }, Math.min(windowMs, 60 * 1000)).unref();

    return async (req, res, next) => {
        const now = Date.now();
        const key = rateLimitKey(keyPrefix, await keyGenerator(req));
        const ttlSeconds = Math.ceil(windowMs / 1000);

        if (store.isRedisEnabled()) {
            const bucket = await store.incrementWithTtl(key, ttlSeconds);
            if (bucket.count > max) {
                res.setHeader('Retry-After', Math.max(1, bucket.ttl || ttlSeconds));
                return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
            }
            return next();
        }

        const bucket = hits.get(key);

        if (!bucket || bucket.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        bucket.count += 1;
        if (bucket.count > max) {
            res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
            return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
        }

        next();
    };
}

module.exports = {
    CONTENT_SECURITY_POLICY,
    securityHeaders,
    createRateLimiter,
    getClientIp,
    isAllowedOrigin,
    requireTrustedWrite
};
