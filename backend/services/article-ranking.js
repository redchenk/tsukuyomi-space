const { createHash } = require('node:crypto');
const { Parser } = require('htmlparser2');

// Keep content analysis bounded and independent of language, author and category.
const MAX_CONTENT_LENGTH = 200000;
const qualityCache = new Map();
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'iframe', 'media', 'bilibili']);
const BLOCK_TAGS = new Set(['p', 'div', 'br', 'li', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'tr']);
const IGNORED_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg']);

function contentQuality(content, format = 'markdown') {
    // Parse block JSON intact so long articles and embedded images stay valid.
    const source = format === 'block' ? String(content || '') : String(content || '').slice(0, MAX_CONTENT_LENGTH);
    const key = createHash('sha256').update(`${format}\0${source}`).digest('hex');
    if (qualityCache.has(key)) return qualityCache.get(key);
    const media = new Set();
    const addMedia = (url) => {
        const value = String(url || '').trim();
        if (/^(?:https?:\/\/|\/(?!\/)|data:image\/|BV[\da-z]+)/i.test(value)) media.add(value);
    };
    let text = source;
    if (format === 'block') {
        try {
            const blocks = JSON.parse(source);
            const visible = [];
            let remaining = MAX_CONTENT_LENGTH;
            for (const block of Array.isArray(blocks) ? blocks : []) {
                if (remaining <= 0) break;
                if (MEDIA_TYPES.has(block?.type)) addMedia(block.url || block.bvid);
                const value = [block?.text, block?.content, block?.title, block?.description]
                    .filter(value => typeof value === 'string').join(' ').slice(0, remaining);
                visible.push(value);
                remaining -= value.length + 2;
            }
            text = visible.join('\n\n');
        } catch (_) {
            text = '';
        }
    } else if (format !== 'html') {
        text = source
            .replace(/!\[[^\]]*\]\(([^\s)]+)[^)]*\)/g, (_, url) => { addMedia(url); return ''; })
            .replace(/^::(?:bilibili|media|iframe)\[[^\]]*\]\(([^)]+)\).*$/gm, (_, url) => { addMedia(url); return ''; })
            .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/^\s*```[^\n]*$/gm, '')
            .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '');
    }
    const chunks = [];
    const ignored = [];
    const parser = new Parser({
        onopentag(name, attributes) {
            const hidden = IGNORED_TAGS.has(name) || 'hidden' in attributes
                || attributes['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attributes.style || '');
            ignored.push(Boolean(ignored.at(-1) || hidden));
            if (ignored.at(-1)) return;
            if (['img', 'video', 'audio', 'iframe', 'source'].includes(name)) addMedia(attributes.src);
            if (BLOCK_TAGS.has(name)) chunks.push('\n');
        },
        ontext(value) { if (!ignored.at(-1)) chunks.push(value.replace(/https?:\/\/\S+|data:\S+/gi, '')); },
        onclosetag(name) {
            if (!ignored.at(-1) && BLOCK_TAGS.has(name)) chunks.push('\n');
            ignored.pop();
        }
    }, { decodeEntities: true });
    parser.end(text);
    const paragraphs = [...new Set(chunks.join('').split(/\n+/).map(value => value.trim()).filter(Boolean))];
    const tokens = paragraphs.join(' ').normalize('NFKC').toLowerCase()
        .match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu) || [];
    // Repeating the same sentences or padding markup must not buy a higher rank.
    const shingles = new Set();
    for (let i = 0; i + 11 < tokens.length; i += 1) shingles.add(tokens.slice(i, i + 12).join(' '));
    const units = tokens.length < 12 ? tokens.length : Math.min(tokens.length, shingles.size + 11);
    const depth = Math.max(28 * (1 - Math.exp(-units / 500)), 22 * (1 - Math.exp(-media.size / 3)));
    const structure = 6 * (1 - Math.exp(-paragraphs.filter(value => value.length >= 40).length / 4)) * Math.min(1, units / 200);
    const mixedMedia = 6 * (1 - Math.exp(-media.size / 2)) * Math.min(1, units / 200);
    const quality = Math.min(40, depth + structure + mixedMedia);
    if (qualityCache.size >= 256) qualityCache.delete(qualityCache.keys().next().value);
    qualityCache.set(key, quality);
    return quality;
}

function count(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function featuredScore(quality, views, likes, bookmarks, publishedAt, now = Date.now()) {
    quality = Math.min(40, count(quality));
    views = count(views);
    likes = count(likes);
    bookmarks = count(bookmarks);
    const logSignal = (value, saturation) => Math.min(1, Math.log1p(value) / Math.log1p(saturation));
    // Smoothed engagement rates keep a single click on a new article from dominating.
    const engagement = (value, saturation, rate) => 20 * (
        0.65 * logSignal(value, saturation) + 0.35 * Math.min(1, value / (Math.max(views, value) + 40) / rate)
    );
    const published = Date.parse(String(publishedAt || '').replace(' ', 'T').replace(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)$/, '$1Z'));
    const ageDays = Number.isFinite(published) ? Math.max(0, (now - published) / 86400000) : Infinity;
    const freshness = 5 * Math.pow(0.5, ageDays / 90);
    // Views alone have limited influence, especially on empty/placeholder posts.
    const reach = 15 * logSignal(views, 10000) * (0.35 + 0.65 * quality / 40);
    return Math.round((quality + reach + engagement(likes, 30, 0.08)
        + engagement(bookmarks, 20, 0.04) + freshness) * 10000) / 10000;
}

module.exports = { contentQuality, featuredScore, MAX_CONTENT_LENGTH };
