const store = require('../services/redis-store');

function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
}

function createRateLimiter({ windowMs, max, keyPrefix = 'rate' }) {
    const hits = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of hits.entries()) {
            if (bucket.resetAt <= now) hits.delete(key);
        }
    }, Math.min(windowMs, 60 * 1000)).unref();

    return async (req, res, next) => {
        const now = Date.now();
        const key = `${keyPrefix}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
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
    securityHeaders,
    createRateLimiter
};
