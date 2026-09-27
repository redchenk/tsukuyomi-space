const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const growth = require('./user-growth');
const { getClientIp } = require('../middleware/security');

const READ_SECONDS = 12;
const COOKIE = 'tsukuyomi_reader';
const RATES = { like: 2, bookmark: 5 };
const digest = value => crypto.createHmac('sha256', config.jwtSecret).update(`article-reader:${value}`).digest('hex');
const actorId = req => req.user?.scope === 'admin' ? req.user.siteUserId || '' : req.user?.id || '';

function deviceCookie(req) {
    const value = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
    const [id, signature] = value.split('.');
    if (!/^[a-f0-9]{40}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return '';
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest(id))) ? id : '';
}

function beginRead(req, res, articleId, now = Date.now()) {
    let device = deviceCookie(req);
    if (!device) {
        device = crypto.randomBytes(20).toString('hex');
        res.cookie(COOKIE, `${device}.${digest(device)}`, {
            httpOnly: true, secure: Boolean(req.secure), sameSite: 'lax', path: '/', maxAge: 365 * 86400000
        });
    }
    return {
        seconds: READ_SECONDS,
        token: jwt.sign({ article: String(articleId), device: digest(device), user: actorId(req), iat: Math.floor(now / 1000) }, config.jwtSecret,
            { algorithm: 'HS256', audience: 'article-read', expiresIn: '1h' })
    };
}

function reward(authorId, kind, sourceId, articleId, xp, now) {
    if (!authorId || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(authorId)) return;
    growth.ensureProfile(authorId);
    growth.insertEvent({ userId: authorId, eventKey: `article_${kind}`, eventDate: growth.hongKongDate(new Date(now)),
        sourceId, xp, metadata: { articleId } });
}

const countRead = db.transaction(({ articleId, user, device, network, now }) => {
    const article = db.prepare("SELECT id, author_id, view_count FROM articles WHERE id = ? AND COALESCE(status, 'published') = 'published'").get(articleId);
    if (!article) return { counted: false, reason: 'unavailable', viewCount: 0 };
    const selfRead = Boolean(user && user === article.author_id);
    const keys = [`device:${device}`, ...(user ? [`account:${digest(user)}`] : [])];
    // A one-day network/browser fallback also catches anonymous cookie resets.
    // Never use it to merge different signed-in readers on a shared network.
    const fallback = `network:${growth.hongKongDate(new Date(now))}:${network}`;
    const exists = db.prepare('SELECT 1 FROM article_read_identities WHERE article_id = ? AND identity_key = ?');
    const repeated = keys.some(key => exists.get(article.id, key)) || (!user && Boolean(exists.get(article.id, fallback)));
    const add = db.prepare('INSERT OR IGNORE INTO article_read_identities(article_id, identity_key, created_at) VALUES (?, ?, ?)');
    // Record newly seen aliases even on a duplicate (guest -> login, account -> new device).
    for (const key of [...keys, fallback]) add.run(article.id, key, now);
    if (selfRead) return { counted: false, reason: 'author', viewCount: article.view_count };
    if (!repeated) {
        db.prepare('UPDATE articles SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?').run(article.id);
        reward(article.author_id, 'view', `${article.id}:${device}`, article.id, 1, now);
    }
    return { counted: !repeated, reason: repeated ? 'already_read' : 'counted', viewCount: Number(article.view_count || 0) + (repeated ? 0 : 1) };
});

function completeRead(req, now = Date.now()) {
    let claims;
    try {
        claims = jwt.verify(String(req.body?.token || ''), config.jwtSecret, { algorithms: ['HS256'], audience: 'article-read', clockTimestamp: Math.floor(now / 1000) });
    } catch (_) {
        return { counted: false, reason: 'invalid_token' };
    }
    const device = deviceCookie(req);
    if (!device || claims.device !== digest(device) || claims.user !== actorId(req) || claims.article !== String(req.params.id)) {
        return { counted: false, reason: 'identity_changed' };
    }
    if (!Number.isFinite(claims.iat) || now - claims.iat * 1000 < READ_SECONDS * 1000) return { counted: false, reason: 'too_soon' };
    if (/bot|crawler|spider|headless|preview|facebookexternalhit/i.test(req.headers['user-agent'] || '')) return { counted: false, reason: 'automated' };
    return countRead.immediate({ articleId: claims.article, device: claims.device, user: claims.user, now,
        network: digest(`${getClientIp(req)}|${String(req.headers['user-agent'] || '').slice(0, 400)}`) });
}

function rewardInteraction(articleId, userId, kind, now = Date.now()) {
    if (!RATES[kind]) throw new Error('Invalid article reward');
    const article = db.prepare("SELECT author_id FROM articles WHERE id = ? AND COALESCE(status, 'published') = 'published'").get(articleId);
    if (!article || !article.author_id || article.author_id === userId) return;
    const receipt = db.prepare('INSERT OR IGNORE INTO article_reward_receipts(article_id, kind, actor_id) VALUES (?, ?, ?)').run(articleId, kind, userId);
    if (receipt.changes) reward(article.author_id, kind, `${articleId}:${userId}`, articleId, RATES[kind], now);
}

const backfillHistorical = db.transaction(() => {
    if (db.prepare("SELECT 1 FROM article_growth_backfills WHERE version = 'v1'").get()) return;
    const today = growth.hongKongDate();
    let users = 0;
    let total = 0;
    // Aggregate in SQLite; do not load article bodies or per-view histories into memory.
    const rows = db.prepare(`SELECT a.author_id, SUM(MAX(0, COALESCE(a.view_count, 0))) AS views,
        SUM((SELECT COUNT(*) FROM article_likes l WHERE l.article_id = a.id AND l.user_id != a.author_id)) AS likes,
        SUM((SELECT COUNT(*) FROM article_bookmarks b WHERE b.article_id = a.id AND b.user_id != a.author_id)) AS bookmarks
        FROM articles a JOIN users u ON u.id = a.author_id
        GROUP BY a.author_id`).all();
    for (const row of rows) {
        const xp = row.views + row.likes * 2 + row.bookmarks * 5;
        if (!xp) continue;
        growth.ensureProfile(row.author_id);
        const result = growth.insertEvent({ userId: row.author_id, eventKey: 'article_history', eventDate: today, sourceId: 'v1', xp,
            metadata: { views: row.views, likes: row.likes, bookmarks: row.bookmarks, backfilled: true } });
        if (result.awarded) { users += 1; total += xp; }
    }
    for (const [table, kind] of [['article_likes', 'like'], ['article_bookmarks', 'bookmark']]) {
        db.exec(`INSERT OR IGNORE INTO article_reward_receipts(article_id, kind, actor_id)
            SELECT s.article_id, '${kind}', s.user_id FROM ${table} s JOIN articles a ON a.id = s.article_id`);
    }
    db.prepare("INSERT INTO article_growth_backfills(version, users, xp) VALUES ('v1', ?, ?)").run(users, total);
});

module.exports = { beginRead, completeRead, rewardInteraction, backfillHistorical: () => backfillHistorical.immediate(), READ_SECONDS };
