const { createHash } = require('node:crypto');
const db = require('../db');
const { contentQuality, featuredScore, MAX_CONTENT_LENGTH } = require('./article-ranking');
const { routineReason } = require('./article-content-policy');
const { hongKongDate } = require('./user-growth');

function dayNumber(day) { return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000); }
function noise(day, id) { return createHash('sha256').update(`${day}:${id}`).digest().readUInt32BE(0) / 0xffffffff; }
function isRoutinePost(article) { return Boolean(article.routine_reason || routineReason(article)); }

// Deterministic Beta sampling keeps a snapshot stable while exploring uncertain
// candidates. Gamma sampling uses only a local seeded PRNG, never global Math.random.
function exploration(seed, article) {
    let counter=0;
    const random=()=>Math.max(1e-12,noise(seed,`${article.id}:${counter++}`));
    function gamma(shape) {
        if (shape<1) return gamma(shape+1)*Math.pow(random(),1/shape);
        const d=shape-1/3,c=1/Math.sqrt(9*d);
        for (let attempt=0;attempt<100;attempt++) {
            const x=Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
            const v=Math.pow(1+c*x,3);if(v<=0)continue;
            const u=random();if(u<1-0.0331*Math.pow(x,4)||Math.log(u)<x*x/2+d*(1-v+Math.log(v)))return d*v;
        }
        return shape;
    }
    const reads=Math.max(0,article.reads||0), impressions=Math.max(reads,article.impressions||0);
    const a=gamma(reads+2),b=gamma(impressions-reads+18);
    return a/(a+b);
}

// Three quality slots, two least-recently-recommended slots and one new-work slot
// in each group of six. Daily deterministic jitter breaks ties without reshuffling pages.
function buildDailyOrder(candidates, day, seed = day) {
    const ordinal = dayNumber(day);
    const articles = candidates.map(article => {
        const routine = isRoutinePost(article);
        const last = article.last_day ? dayNumber(article.last_day) : -Infinity;
        const cooldown = (Number.isFinite(last) ? 16 / Math.max(1, ordinal - last) : 0) + Math.min(12, Math.max(0,(article.consecutive_days||0)-1)*3);
        return { ...article, routine, last, dailyScore: article.featured_score + (article.pinned_at ? 4 : 0)
            + noise(seed, article.id) * 18 - cooldown - (routine ? 50 : 0) };
    });
    const selected = [];
    const authors = new Map();
    const categories = new Map();
    const eligible = articles.filter(a => !a.routine && (a.discovery_eligible || a.content_quality >= 6));
    const categoryCap = Math.max(3, Math.ceil(12 / Math.max(1,new Set(eligible.map(a=>a.category)).size)));
    let pool = eligible;
    while (pool.length && selected.length < 12) {
        const slot = selected.length % 6;
        let options = pool.filter(a => !a.author_id || (authors.get(a.author_id) || 0) < 2);
        if (!options.length) options = pool;
        const diverse = options.filter(a => (categories.get(a.category) || 0) < categoryCap);
        if (diverse.length) options = diverse;
        if (slot === 1) {
            const fresh = options.filter(a => {
                const date = String(a.published_at || a.created_at || '').slice(0, 10);
                const age = ordinal - dayNumber(date);
                return age >= 0 && age <= 7 && (a.impressions || 0) < 30;
            });
            if (fresh.length) options = fresh;
        }
        if (slot === 4) {
            const old = options.filter(a => ordinal-dayNumber(String(a.published_at || a.created_at || '').slice(0,10)) >= 30);
            if (old.length) options=old;
        }
        options.sort((a,b) => (slot === 3 ? (a.impressions || 0)-(b.impressions || 0) || (a.last===b.last?0:a.last<b.last?-1:1)
            : slot === 5 ? exploration(seed,b)-exploration(seed,a) : 0) || b.dailyScore-a.dailyScore || b.id-a.id);
        const next = options[0];
        next.slot = ['quality', 'new', 'quality', 'potential', 'old', 'explore'][slot];
        selected.push(next);
        categories.set(next.category,(categories.get(next.category)||0)+1);
        authors.set(next.author_id, (authors.get(next.author_id) || 0) + 1);
        pool = pool.filter(a => a.id !== next.id);
    }
    const ids = new Set(selected.map(a => a.id));
    const rest = articles.filter(a => !ids.has(a.id)).sort((a, b) => Number(a.routine) - Number(b.routine)
        || b.featured_score - a.featured_score || b.id - a.id);
    return [...selected, ...rest].map((a, index) => ({ ...a, position: index, recommended: ids.has(a.id) ? 1 : 0 }));
}

const ensureDailyRecommendations = db.transaction((now = Date.now()) => {
    const day = hongKongDate(new Date(now));
    const existing = db.prepare('SELECT MAX(position) AS last FROM article_daily_recommendations WHERE day = ?').get(day);
    const rows = db.prepare(`SELECT a.id, a.title, a.category, a.author_id, a.pinned_at, a.published_at, a.created_at,
        CASE WHEN a.content_format = 'block' THEN a.content ELSE substr(a.content, 1, ?) END AS content, a.content_format, a.view_count,
        (SELECT COUNT(*) FROM article_likes l WHERE l.article_id = a.id AND l.user_id != COALESCE(a.author_id, '')) AS likes,
        (SELECT COUNT(*) FROM article_bookmarks b WHERE b.article_id = a.id AND b.user_id != COALESCE(a.author_id, '')) AS bookmarks,
        h.last_day FROM articles a LEFT JOIN article_recommendation_history h ON h.article_id = a.id
        WHERE COALESCE(a.status, 'published') = 'published'
        AND NOT EXISTS (SELECT 1 FROM article_daily_recommendations r WHERE r.day = ? AND r.article_id = a.id)`).iterate(MAX_CONTENT_LENGTH, day);
    const midnight = Date.parse(`${day}T00:00:00+08:00`);
    const scored = [];
    for (const a of rows) {
        const quality = contentQuality(a.content, a.content_format);
        const { content, ...compact } = a;
        scored.push({ ...compact, content_quality: quality, featured_score: featuredScore(quality, a.view_count, a.likes, a.bookmarks, a.published_at || a.created_at, midnight) });
    }
    if (!scored.length) return day;
    const ordered = buildDailyOrder(scored, day);
    const add = db.prepare('INSERT INTO article_daily_recommendations(day, article_id, position, score, recommended) VALUES (?, ?, ?, ?, ?)');
    const remember = db.prepare('INSERT INTO article_recommendation_history(article_id, last_day) VALUES (?, ?) ON CONFLICT(article_id) DO UPDATE SET last_day = excluded.last_day');
    for (const [index, item] of ordered.entries()) {
        // New publications remain accessible immediately but do not shift an open day's pages.
        const recommended = existing.last === null ? item.recommended : 0;
        add.run(day, item.id, existing.last === null ? index : existing.last + 1 + index, item.featured_score, recommended);
        if (recommended) remember.run(item.id, day);
    }
    db.prepare("DELETE FROM article_daily_recommendations WHERE day < date(?, '-2 days')").run(day);
    db.prepare("DELETE FROM article_read_identities WHERE identity_key LIKE 'network:%' AND created_at < ?").run(now - 2 * 86400000);
    return day;
});

module.exports = { buildDailyOrder, ensureDailyRecommendations: now => ensureDailyRecommendations.immediate(now), isRoutinePost };
