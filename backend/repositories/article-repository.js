const db = require('../db');
const articleCategories = require('./article-category-repository');
const { createSlug } = require('../utils/slug');
const { publicAvatarUrl } = require('../utils/avatar');

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

function compactArticleRow(row) {
    if (!row) return row;
    const {
        cover_asset_exists: coverAssetExists,
        cover_asset_url: coverAssetUrl,
        author_avatar_updated_at: authorAvatarUpdatedAt,
        ...article
    } = row;
    return {
        ...article,
        cover_image: coverAssetExists && article.cover_image_asset_id
            ? `/api/assets/proxy/${encodeURIComponent(String(article.cover_image_asset_id))}`
            : article.cover_image,
        cover_image_url: coverAssetExists && coverAssetUrl
            ? coverAssetUrl
            : article.cover_image,
        author_avatar: publicAvatarUrl({
            avatar: article.author_avatar,
            username: article.author_username,
            updatedAt: authorAvatarUpdatedAt
        })
    };
}

function compactArticleRows(rows) {
    return rows.map(compactArticleRow);
}

function listArticles({ category, limit, offset }) {
    let query = `
        SELECT a.id, a.title, a.slug, a.excerpt, a.category, a.tags, a.author_id,
            a.publish_date, a.published_at, a.read_time, a.view_count, a.cover_image, a.cover_image_asset_id,
            a.content_format, a.status, a.pinned_at, a.created_at, a.updated_at,
            u.username AS author_username,
            u.avatar AS author_avatar,
            COALESCE(u.updated_at, u.created_at) AS author_avatar_updated_at,
            cover_asset.url AS cover_asset_url,
            CASE WHEN cover_asset.id IS NULL THEN 0 ELSE 1 END AS cover_asset_exists
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN article_assets cover_asset ON cover_asset.id = a.cover_image_asset_id
        WHERE COALESCE(a.status, 'published') = 'published'
    `;
    let countQuery = "SELECT COUNT(*) AS total FROM articles WHERE COALESCE(status, 'published') = 'published'";
    const params = [];

    if (category) {
        query += ' AND a.category = ?';
        countQuery += ' AND category = ?';
        params.push(category);
    }

    query += ' ORDER BY a.pinned_at IS NULL, a.pinned_at DESC, COALESCE(a.published_at, a.created_at, a.publish_date) DESC LIMIT ? OFFSET ?';

    return {
        total: db.prepare(countQuery).get(...params).total,
        articles: compactArticleRows(db.prepare(query).all(...params, limit, offset))
    };
}

function listRecentPublishedArticles(limit = 8) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 8, 30));
    return compactArticleRows(db.prepare(`
        SELECT a.id, a.title, a.slug, a.excerpt, a.category, a.tags, a.author_id,
            a.publish_date, a.published_at, a.read_time, a.view_count, a.cover_image, a.cover_image_asset_id,
            a.content_format, a.status, a.pinned_at, a.created_at, a.updated_at,
            u.username AS author_username,
            u.avatar AS author_avatar,
            COALESCE(u.updated_at, u.created_at) AS author_avatar_updated_at,
            cover_asset.url AS cover_asset_url,
            CASE WHEN cover_asset.id IS NULL THEN 0 ELSE 1 END AS cover_asset_exists
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN article_assets cover_asset ON cover_asset.id = a.cover_image_asset_id
        WHERE COALESCE(a.status, 'published') = 'published'
        ORDER BY COALESCE(a.updated_at, a.created_at, a.publish_date) DESC, a.id DESC
        LIMIT ?
    `).all(safeLimit));
}

function createArticle(article) {
    article.category = articleCategories.resolveCategory(article.category);
    const slug = uniqueArticleSlug(article.title);
    const result = db.prepare(`
        INSERT INTO articles (
            title, slug, excerpt, content, content_format, category, tags, author_id,
            publish_date, published_at, read_time, cover_image, cover_image_asset_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        article.publishedAt || new Date().toISOString(),
        article.readTime || '5 min',
        article.coverImage || null,
        article.coverImageAssetId || null
    );
    return findArticleById(result.lastInsertRowid);
}

function findArticleById(id) {
    return compactArticleRow(db.prepare(`
        SELECT a.*, u.username AS author_username, u.avatar AS author_avatar,
            COALESCE(u.updated_at, u.created_at) AS author_avatar_updated_at,
            cover_asset.url AS cover_asset_url,
            CASE WHEN cover_asset.id IS NULL THEN 0 ELSE 1 END AS cover_asset_exists
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN article_assets cover_asset ON cover_asset.id = a.cover_image_asset_id
        WHERE a.id = ?
    `).get(id));
}

function findPublishedArticleById(id) {
    return compactArticleRow(db.prepare(`
        SELECT a.*, u.username AS author_username, u.avatar AS author_avatar,
            COALESCE(u.updated_at, u.created_at) AS author_avatar_updated_at,
            cover_asset.url AS cover_asset_url,
            CASE WHEN cover_asset.id IS NULL THEN 0 ELSE 1 END AS cover_asset_exists
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN article_assets cover_asset ON cover_asset.id = a.cover_image_asset_id
        WHERE a.id = ?
          AND COALESCE(a.status, 'published') = 'published'
    `).get(id));
}

function incrementArticleViews(id) {
    return db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(id).changes;
}

function updateArticle(id, article) {
    article.category = articleCategories.resolveCategory(article.category, db.prepare('SELECT category FROM articles WHERE id = ?').get(id)?.category || '其他');
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
    const remove = db.transaction((articleId) => {
        if (!db.prepare('SELECT 1 FROM articles WHERE id = ?').get(articleId)) return 0;

        const messageTree = `
            WITH RECURSIVE article_messages(id) AS (
                SELECT id FROM messages WHERE article_id = ?
                UNION
                SELECT child.id
                FROM messages AS child
                JOIN article_messages AS parent ON child.parent_id = parent.id
            )
        `;
        db.prepare(`${messageTree}
            DELETE FROM notifications
            WHERE related_article_id = ?
               OR related_message_id IN (SELECT id FROM article_messages)
        `).run(articleId, articleId);
        db.prepare(`${messageTree}
            DELETE FROM message_likes
            WHERE message_id IN (SELECT id FROM article_messages)
        `).run(articleId);
        db.prepare(`${messageTree}
            DELETE FROM message_mentions
            WHERE message_id IN (SELECT id FROM article_messages)
        `).run(articleId);
        db.prepare(`${messageTree}
            DELETE FROM messages
            WHERE id IN (SELECT id FROM article_messages)
        `).run(articleId);

        db.prepare('DELETE FROM article_content_blocks WHERE article_id = ?').run(articleId);
        db.prepare('DELETE FROM article_bookmarks WHERE article_id = ?').run(articleId);
        db.prepare(`
            UPDATE article_assets
            SET article_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE article_id = ?
        `).run(articleId);
        return db.prepare('DELETE FROM articles WHERE id = ?').run(articleId).changes;
    });
    return remove(id);
}

function listUserArticles(userId) {
    return db.prepare(`
        SELECT id, title, slug, category, view_count, status, pinned_at, content_format, cover_image_asset_id, created_at, updated_at
        FROM articles WHERE author_id = ?
        ORDER BY pinned_at IS NULL, pinned_at DESC, created_at DESC
    `).all(userId);
}

function listSeoArticles(limit = 500) {
    return compactArticleRows(db.prepare(`
        SELECT a.id, a.title, a.slug, a.excerpt, a.content, a.content_format, a.publish_date, a.published_at, a.created_at, a.updated_at,
            a.cover_image, a.cover_image_asset_id, a.category, a.tags, a.read_time,
            u.username AS author_username,
            u.avatar AS author_avatar,
            COALESCE(u.updated_at, u.created_at) AS author_avatar_updated_at,
            cover_asset.url AS cover_asset_url,
            CASE WHEN cover_asset.id IS NULL THEN 0 ELSE 1 END AS cover_asset_exists
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN article_assets cover_asset ON cover_asset.id = a.cover_image_asset_id
        WHERE COALESCE(a.status, 'published') = 'published'
        ORDER BY a.pinned_at IS NULL, a.pinned_at DESC, COALESCE(a.published_at, a.created_at, a.publish_date) DESC
        LIMIT ?
    `).all(limit));
}

function updateUserArticle(id, article) {
    article.category = articleCategories.resolveCategory(article.category, db.prepare('SELECT category FROM articles WHERE id = ?').get(id)?.category || '其他');
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
    listRecentPublishedArticles,
    createArticle,
    findArticleById,
    findPublishedArticleById,
    incrementArticleViews,
    updateArticle,
    deleteArticle,
    listUserArticles,
    listSeoArticles,
    updateUserArticle
};
