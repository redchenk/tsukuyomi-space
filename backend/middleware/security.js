const crypto = require('crypto');
const net = require('net');
const store = require('../services/redis-store');

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' https: wss:",
    "frame-src https:",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests'
].join('; ');

function securityHeaders(req, res, next) {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
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
    const directIp = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress);
    if (!isLoopback(directIp)) return directIp || 'unknown';

    const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
        .split(',')
        .map(normalizeIp)
        .find(Boolean);
    return forwarded || normalizeIp(req?.headers?.['x-real-ip']) || directIp || 'unknown';
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
    getClientIp
};
