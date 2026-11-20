const db = require('../db');
const { articleNoindex, MAX_PLACEHOLDER_SOURCE } = require('../seo/article-search');
db.function('exclude_article_from_search', { deterministic: true }, (title, category, excerpt, content, format) =>
    Number(articleNoindex({ title, category, excerpt, content, content_format: format })));

function sitemapArticles() {
    return db.prepare(`
        SELECT id, slug, title, cover_image, updated_at, published_at, created_at, publish_date
        FROM articles WHERE COALESCE(status, 'published') = 'published'
          AND (NULLIF(cover_image, '') IS NOT NULL OR NULLIF(cover_image_asset_id, '') IS NOT NULL
               OR exclude_article_from_search(title, category, substr(excerpt, 1, ?), substr(content, 1, ?), content_format) = 0)
        ORDER BY id LIMIT 40000
    `).all(MAX_PLACEHOLDER_SOURCE + 1, MAX_PLACEHOLDER_SOURCE + 1);
}
function pixelSummaries(limit = 24, offset = 0) {
    return db.prepare(`SELECT a.id, a.title, a.description, a.width, a.height, a.size, a.created_at, a.updated_at,
        COALESCE(NULLIF(u.nickname, ''), u.username) AS author
        FROM pixel_artworks a LEFT JOIN users u ON u.id = a.author_id ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`)
        .all(Math.max(1, Math.min(10000, Number(limit) || 24)), Math.max(0, Number(offset) || 0));
}
function pixelById(id) { return db.prepare(`SELECT a.id, a.title, a.description, a.width, a.height, a.size, a.created_at, a.updated_at,
    COALESCE(NULLIF(u.nickname, ''), u.username) AS author FROM pixel_artworks a LEFT JOIN users u ON u.id = a.author_id WHERE a.id = ?`).get(id); }
module.exports = { sitemapArticles, pixelSummaries, pixelById };
