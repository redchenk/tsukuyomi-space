const categories = require('../repositories/article-category-repository');
const responseCache = require('./response-cache');

const waiting = new Set();
const WAIT_MS = 20000;

function snapshot() {
    const data = categories.list();
    const revision = categories.revision();
    return { success: true, data, revision };
}

function publish() {
    for (const prefix of ['public:articles:', 'public:hub-preview', 'public:site-feed', 'seo:']) responseCache.delPrefix(prefix);
    const payload = snapshot();
    for (const finish of [...waiting]) finish(payload);
    return payload;
}

function waitForChange(req, res) {
    const payload = snapshot();
    if (req.query.revision !== payload.revision) return res.json(payload);
    if (waiting.size >= 1024 || [...waiting].filter((item) => item.ip === req.ip).length >= 32) {
        return res.status(429).set('Retry-After', '20').json({ success: false, message: 'Too many category subscriptions' });
    }
    // Long polling works through the existing buffered CDN/API proxies without an SSE exception.
    let timer;
    const cleanup = () => {
        clearTimeout(timer);
        waiting.delete(finish);
        res.off('close', cleanup);
    };
    const finish = (next) => {
        cleanup();
        if (!res.destroyed && !res.writableEnded) res.json(next);
    };
    finish.ip = req.ip;
    waiting.add(finish);
    timer = setTimeout(() => finish(snapshot()), WAIT_MS);
    timer.unref?.();
    res.once('close', cleanup);
}

module.exports = { snapshot, publish, waitForChange };
