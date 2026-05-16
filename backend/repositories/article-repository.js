const db = require('../db');
const { createSlug } = require('../utils/slug');

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
        SELECT a.*, u.username AS author_username
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
        INSERT INTO articles (title, slug, excerpt, content, category, tags, author_id, publish_date, read_time, cover_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        article.title,
        slug,
        article.excerpt || '',
        article.content || '',
        article.category,
        JSON.stringify(article.tags || []),
        article.authorId,
        article.publishDate,
        article.readTime || '5 min',
        article.coverImage || null
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
        SET title = ?, slug = ?, excerpt = ?, content = ?, category = ?, tags = ?, read_time = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        article.title,
        slug,
        article.excerpt || '',
        article.content || '',
        article.category || '公告',
        JSON.stringify(article.tags || []),
        article.readTime || '5 min',
        article.coverImage !== undefined ? article.coverImage : null,
        id
    );
    return findArticleById(id);
}

function deleteArticle(id) {
    return db.prepare('DELETE FROM articles WHERE id = ?').run(id).changes;
}

function listUserArticles(userId) {
    return db.prepare(`
        SELECT id, title, slug, category, view_count, status, pinned_at, created_at, updated_at
        FROM articles WHERE author_id = ?
        ORDER BY pinned_at IS NULL, pinned_at DESC, created_at DESC
    `).all(userId);
}

function listSeoArticles(limit = 500) {
    return db.prepare(`
        SELECT a.id, a.title, a.slug, a.excerpt, a.publish_date, a.created_at, a.updated_at,
            a.cover_image, a.category, a.tags, a.read_time, u.username AS author_username
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
            title = ?, slug = ?, excerpt = ?, content = ?, category = ?,
            read_time = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(article.title, slug, article.excerpt || '', article.content || '', article.category, article.readTime || '5 min', article.coverImage || null, id);
    return findArticleById(id);
}

module.exports = {
    uniqueArticleSlug,
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
