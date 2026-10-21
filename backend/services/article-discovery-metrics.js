const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { hongKongDate } = require('./user-growth');
const { readerContext, digest } = require('./article-engagement');
const { routineReason } = require('./article-content-policy');
const SOURCES = new Set(['stage-featured', 'stage-daily', 'stage-latest']);
const actor = identity => identity.user ? digest(`account:${identity.user}`) : identity.device;
const bucket = position => position === 0 ? 0 : position <= 2 ? 1 : position <= 5 ? 2 : position <= 11 ? 3 : 4;
const automated = req => /bot|crawler|spider|headless|preview|facebookexternalhit/i.test(req.headers['user-agent'] || '');
function issueSession(req, res, items, source, now = Date.now()) {
    if (!SOURCES.has(source) || items.length > 24) throw Object.assign(new Error('推荐来源无效'), { statusCode: 400 });
    const identity = readerContext(req, res);
    return { seconds: 1, token: jwt.sign({ items: items.map(item => ({ id: Number(item.id), position: item.position })), source,
        device: identity.device, user: identity.user, iat: Math.floor(now / 1000) }, config.jwtSecret,
        { algorithm: 'HS256', audience: 'article-discovery', expiresIn: '20m' }) };
}
function verify(req, token, now) {
    try {
        if (typeof token !== 'string' || token.length > 12000 || automated(req)) return null;
        const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], audience: 'article-discovery', clockTimestamp: Math.floor(now / 1000) });
        const identity = readerContext(req);
        if (!identity || claims.device !== identity.device || claims.user !== identity.user || !SOURCES.has(claims.source)
            || !Array.isArray(claims.items) || claims.items.length > 24 || !Number.isFinite(claims.iat) || now - claims.iat * 1000 < 1000) return null;
        return { claims, identity };
    } catch { return null; }
}
function resolvedActor(day,id,identity) {
    for (const key of [...new Set([actor(identity),identity.device])]) {
        const found=db.prepare('SELECT actor FROM article_discovery_aliases WHERE day=? AND article_id=? AND identity=?').get(day,id,key);
        if(found)return found.actor;
    }
    return '';
}
function aliasReceipt(day,id,identity,canonical) {
    const add=db.prepare('INSERT OR IGNORE INTO article_discovery_aliases(day,article_id,identity,actor) VALUES(?,?,?,?)');
    for(const key of new Set([actor(identity),identity.device]))add.run(day,id,key,canonical);
}
const recordImpressionsTransaction = db.transaction((req, now) => {
    const session = verify(req, req.body?.token, now);
    if (!session) return { counted: [], reason: 'invalid_session' };
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length > 24 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw Object.assign(new Error('曝光列表无效'), { statusCode: 400 });
    const { claims, identity } = session, day = hongKongDate(new Date(now)), key = actor(identity);
    const counted = [];
    for (const item of claims.items.filter(item => ids.includes(item.id))) {
        const article = db.prepare("SELECT id,title,content,content_format,category,author_id FROM articles WHERE id = ? AND COALESCE(status,'published') = 'published'").get(item.id);
        if (!article || article.author_id === identity.user || routineReason(article)) continue;
        const canonical=resolvedActor(day,article.id,identity) || (!identity.user ? db.prepare('SELECT actor FROM article_discovery_receipts WHERE day=? AND article_id=? AND network=?').get(day,article.id,identity.network)?.actor : '');
        if(canonical){aliasReceipt(day,article.id,identity,canonical);continue;}
        const b = bucket(item.position);
        const added = db.prepare('INSERT OR IGNORE INTO article_discovery_receipts(day,article_id,actor,network,source,bucket,seen_at) VALUES(?,?,?,?,?,?,?)')
            .run(day, article.id, key, identity.user ? '' : identity.network, claims.source, b, now);
        aliasReceipt(day,article.id,identity,key);
        if (!added.changes) continue;
        db.prepare(`INSERT INTO article_discovery_daily(day,article_id,source,bucket,impressions) VALUES(?,?,?,?,1)
            ON CONFLICT(day,article_id,source,bucket) DO UPDATE SET impressions=impressions+1`).run(day, article.id, claims.source, b);
        counted.push(article.id);
    }
    return { counted };
});
function markReceipt(day, id, key, kind, now) {
    const column = { read: 'did_read', like: 'did_like', bookmark: 'did_bookmark' }[kind];
    const countColumn = { read: 'reads', like: 'likes', bookmark: 'bookmarks' }[kind];
    if (!column) return false;
    const receipt = db.prepare('SELECT * FROM article_discovery_receipts WHERE day=? AND article_id=? AND actor=?').get(day,id,key);
    if (!receipt || receipt[column] || now - receipt.seen_at > 20 * 60000 || now < receipt.seen_at) return false;
    db.prepare(`UPDATE article_discovery_receipts SET ${column}=1 WHERE day=? AND article_id=? AND actor=?`).run(day,id,key);
    db.prepare(`UPDATE article_discovery_daily SET ${countColumn}=${countColumn}+1 WHERE day=? AND article_id=? AND source=? AND bucket=?`).run(day,id,receipt.source,receipt.bucket);
    return true;
}
const qualifiedTransaction = db.transaction((req, id, now) => {
    const session = verify(req, req.body?.discoveryToken, now);
    if (!session || !session.claims.items.some(item => item.id === Number(id))) return false;
    const day=hongKongDate(new Date(now));
    return markReceipt(day,id,resolvedActor(day,id,session.identity)||actor(session.identity),'read',now);
});
function recordInteraction(id, userId, kind, now = Date.now()) {
    const day=hongKongDate(new Date(now)),key=digest(`account:${userId}`);
    const alias=db.prepare('SELECT actor FROM article_discovery_aliases WHERE day=? AND article_id=? AND identity=?').get(day,id,key);
    return markReceipt(day,id,alias?.actor||key,kind,now);
}
function discoveryEvidence(now = Date.now()) {
    const rows = db.prepare('SELECT article_id,source,bucket,SUM(impressions) AS impressions,SUM(reads) AS reads,SUM(likes) AS likes,SUM(bookmarks) AS bookmarks,MAX(day) AS last_day FROM article_discovery_daily GROUP BY article_id,source,bucket').all();
    const totals = new Map(), baseline = new Map();
    for (const row of rows) {
        const key = `${row.source}:${row.bucket}`, global = baseline.get(key) || { impressions: 0, reads: 0, likes: 0, bookmarks: 0 };
        for (const field of Object.keys(global)) global[field] += row[field];
        baseline.set(key,global);
        const article = totals.get(row.article_id) || { impressions: 0, reads: 0, cells: [] };
        article.lastDay = !article.lastDay || article.lastDay < row.last_day ? row.last_day : article.lastDay;
        article.impressions += row.impressions; article.reads += row.reads; article.cells.push(row);totals.set(row.article_id,article);
    }
    const today = hongKongDate(new Date(now));
    const ordinal = value => Math.floor(Date.parse(value + 'T00:00:00Z') / 86400000);
    const dayRows = db.prepare("SELECT DISTINCT article_id,day FROM article_discovery_daily WHERE day BETWEEN date(?,'-6 days') AND ? AND impressions>0").all(today,today);
    const days = new Map();
    for (const row of dayRows) { if (!days.has(row.article_id)) days.set(row.article_id,new Set());days.get(row.article_id).add(ordinal(row.day)); }
    for (const [id, article] of totals) {
        const seen = days.get(id) || new Set(); let cursor = ordinal(today);
        if (!seen.has(cursor)) cursor--;
        let streak=0;while(seen.has(cursor--))streak++;
        article.consecutiveDays=streak;

        let feedback = 0;
        for (const [field, prior, weight] of [['reads', 2, 10], ['likes', 0.4, 4], ['bookmarks', 0.2, 6]]) {
            let observed=0,expected=0;
            for (const cell of article.cells) {
                const global = baseline.get(`${cell.source}:${cell.bucket}`);
                // Compare against the observed baseline at the same source and
                // position, with a 20-impression prior; never infer impressions
                // from historic view/like counters.
                expected += cell.impressions * (global[field] + prior) / (global.impressions + 20);
                observed += cell[field];
            }
            feedback += weight * Math.min(1,(observed+prior)/(expected+prior)/2);
        }
        article.feedback = feedback;
    }
    return totals;
}
module.exports = { issueSession, recordImpressions: (req,now=Date.now()) => recordImpressionsTransaction.immediate(req,now),
    recordQualified: (req,id,now=Date.now()) => qualifiedTransaction.immediate(req,id,now), recordInteraction, discoveryEvidence };
