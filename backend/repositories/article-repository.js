const db = require('../db');

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
    const result = db.prepare(`
        INSERT INTO articles (title, excerpt, content, category, tags, author_id, publish_date, read_time, cover_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        article.title,
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
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
}

function incrementArticleViews(id) {
    return db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(id).changes;
}

function updateArticle(id, article) {
    db.prepare(`
        UPDATE articles
        SET title = ?, excerpt = ?, content = ?, category = ?, tags = ?, read_time = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        article.title,
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
        SELECT id, title, category, view_count, status, pinned_at, created_at, updated_at
        FROM articles WHERE author_id = ?
        ORDER BY pinned_at IS NULL, pinned_at DESC, created_at DESC
    `).all(userId);
}

function listSeoArticles(limit = 500) {
    return db.prepare(`
        SELECT id, title, excerpt, publish_date, created_at, updated_at
        FROM articles
        ORDER BY pinned_at IS NULL, pinned_at DESC, publish_date DESC, created_at DESC
        LIMIT ?
    `).all(limit);
}

function updateUserArticle(id, article) {
    db.prepare(`
        UPDATE articles SET
            title = ?, excerpt = ?, content = ?, category = ?,
            read_time = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(article.title, article.excerpt || '', article.content || '', article.category, article.readTime || '5 min', article.coverImage || null, id);
    return findArticleById(id);
}

module.exports = {
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
