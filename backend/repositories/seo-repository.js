const db = require('../db');
// Metadata-only queries never decode full pixel grids or copy article bodies
// into sitemaps. Bounds also keep hostile crawler requests inexpensive.
function sitemapArticles() {
    return db.prepare("SELECT id, slug, cover_image, updated_at, published_at, created_at, publish_date FROM articles WHERE COALESCE(status, 'published') = 'published' ORDER BY id LIMIT 40000").all();
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
