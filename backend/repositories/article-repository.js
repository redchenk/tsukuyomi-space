const db = require('../db');
const { createSlug } = require('../utils/slug');

const CONTENT_FORMATS = new Set(['markdown', 'html', 'block']);

function normalizeContentFormat(format) {
    const value = String(format || '').trim().toLowerCase();
    return CONTENT_FORMATS.has(value) ? value : 'markdown';
}

function uniqueArticleSlug(title, id = null) {
    const base = createSlug(title, id ? `article-${id}` : 'article');
    let slug = base;
    let suffix = 2;
    while (true) {
        const existing = db.prepare('SELECT id FROM articles WHERE slug = ? AND (? IS NULL OR id != ?)').get(slug, id, id);
        if (!existing) return slug;
        slug = `${base}-${suffix}`;
        suffix += 1;
    }
}

function listArticles({ category, limit, offset }) {
    let query = `
        SELECT a.id, a.title, a.slug, a.excerpt, a.category, a.tags, a.author_id,
            a.publish_date, a.read_time, a.view_count, a.cover_image, a.cover_image_asset_id,
            a.content_format, a.status, a.pinned_at, a.created_at, a.updated_at,
            u.username AS author_username
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.id
    `;
    let countQuery = 'SELECT COUNT(*) AS total FROM articles';
    const params = [];

    if (category) {
        query += ' WHERE a.category = ?';
        countQuery += ' WHERE category = ?';
        params.push(category);
    }

    query += ' ORDER BY a.pinned_at IS NULL, a.pinned_at DESC, a.publish_date DESC, a.created_at DESC LIMIT ? OFFSET ?';

    return {
        total: db.prepare(countQuery).get(...params).total,
        articles: db.prepare(query).all(...params, limit, offset)
    };
}

function createArticle(article) {
    const slug = uniqueArticleSlug(article.title);
    const result = db.prepare(`
        INSERT INTO articles (
            title, slug, excerpt, content, content_format, category, tags, author_id,
            publish_date, read_time, cover_image, cover_image_asset_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        article.title,
        slug,
        article.excerpt || '',
        article.content || '',
        normalizeContentFormat(article.contentFormat),
        article.category,
        JSON.stringify(article.tags || []),
        article.authorId,
        article.publishDate,
        article.readTime || '5 min',
        article.coverImage || null,
        article.coverImageAssetId || null
    );
    return findArticleById(result.lastInsertRowid);
}

function findArticleById(id) {
    return db.prepare(`
        SELECT a.*, u.username AS author_username
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.id
        WHERE a.id = ?
    `).get(id);
}

function incrementArticleViews(id) {
    return db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(id).changes;
}

function updateArticle(id, article) {
    const slug = uniqueArticleSlug(article.title, id);
    db.prepare(`
        UPDATE articles
        SET title = ?,
            slug = ?,
            excerpt = ?,
            content = ?,
            content_format = ?,
            category = ?,
            tags = ?,
            read_time = ?,
            cover_image = ?,
            cover_image_asset_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        article.title,
        slug,
        article.excerpt || '',
        article.content || '',
        normalizeContentFormat(article.contentFormat),
        article.category || '公告',
        JSON.stringify(article.tags || []),
        article.readTime || '5 min',
        article.coverImage !== undefined ? article.coverImage : null,
        article.coverImageAssetId || null,
        id
    );
    return findArticleById(id);
}

function deleteArticle(id) {
    return db.prepare('DELETE FROM articles WHERE id = ?').run(id).changes;
}

function listUserArticles(userId) {
    return db.prepare(`
        SELECT id, title, slug, category, view_count, status, pinned_at, content_format, cover_image_asset_id, created_at, updated_at
        FROM articles WHERE author_id = ?
        ORDER BY pinned_at IS NULL, pinned_at DESC, created_at DESC
    `).all(userId);
}

function listSeoArticles(limit = 500) {
    return db.prepare(`
        SELECT a.id, a.title, a.slug, a.excerpt, a.content, a.content_format, a.publish_date, a.created_at, a.updated_at,
            a.cover_image, a.cover_image_asset_id, a.category, a.tags, a.read_time, u.username AS author_username
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.id
        ORDER BY a.pinned_at IS NULL, a.pinned_at DESC, a.publish_date DESC, a.created_at DESC
        LIMIT ?
    `).all(limit);
}

function updateUserArticle(id, article) {
    const slug = uniqueArticleSlug(article.title, id);
    db.prepare(`
        UPDATE articles SET
            title = ?,
            slug = ?,
            excerpt = ?,
            content = ?,
            content_format = ?,
            category = ?,
            read_time = ?,
            cover_image = ?,
            cover_image_asset_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        article.title,
        slug,
        article.excerpt || '',
        article.content || '',
        normalizeContentFormat(article.contentFormat),
        article.category,
        article.readTime || '5 min',
        article.coverImage || null,
        article.coverImageAssetId || null,
        id
    );
    return findArticleById(id);
}

module.exports = {
    uniqueArticleSlug,
    normalizeContentFormat,
    listArticles,
    createArticle,
    findArticleById,
    incrementArticleViews,
    updateArticle,
    deleteArticle,
    listUserArticles,
    listSeoArticles,
    updateUserArticle
};
