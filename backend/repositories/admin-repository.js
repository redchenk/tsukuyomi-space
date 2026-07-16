const crypto = require('crypto');
const db = require('../db');
const { normalizeContentFormat, uniqueArticleSlug } = require('./article-repository');

function findAdminByUsername(username) {
    return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
}

function findAdminById(id) {
    return db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
}

function ensureSiteUserForAdmin(admin) {
    if (!admin?.id || !admin?.username || !admin?.password_hash) {
        throw new Error('Cannot link an incomplete admin account');
    }

    const sync = db.transaction(() => {
        let user = db.prepare('SELECT * FROM users WHERE username = ?').get(admin.username);
        if (!user) {
            db.prepare(`
                INSERT INTO users (id, username, email, password_hash, role)
                VALUES (?, ?, ?, ?, 'admin')
            `).run(
                crypto.randomUUID(),
                admin.username,
                `admin-${admin.id}@admin.yachiyo.local`,
                admin.password_hash
            );
            user = db.prepare('SELECT * FROM users WHERE username = ?').get(admin.username);
        } else {
            db.prepare(`
                UPDATE users
                SET password_hash = ?, role = 'admin', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(admin.password_hash, user.id);
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        }
        return user;
    });

    return sync();
}

function updateAdminPassword(id, passwordHash) {
    const update = db.transaction(() => {
        const admin = findAdminById(id);
        if (!admin) return 0;
        const changes = db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, id).changes;
        db.prepare(`
            UPDATE users
            SET password_hash = ?, role = 'admin', updated_at = CURRENT_TIMESTAMP
            WHERE username = ?
        `).run(passwordHash, admin.username);
        return changes;
    });
    return update();
}

function listAdminArticles() {
    return db.prepare(`
        SELECT id, title, slug, category, content_format, cover_image_asset_id, view_count, status, pinned_at, created_at, updated_at
        FROM articles
        ORDER BY pinned_at IS NULL, pinned_at DESC, COALESCE(updated_at, created_at) DESC
    `).all();
}

function updateAdminArticle(id, article) {
    const slug = uniqueArticleSlug(article.title, id);
    return db.prepare(`
        UPDATE articles
        SET title = ?,
            slug = ?,
            excerpt = ?,
            content = ?,
            content_format = ?,
            category = ?,
            status = ?,
            read_time = COALESCE(?, read_time),
            cover_image = COALESCE(?, cover_image),
            cover_image_asset_id = COALESCE(?, cover_image_asset_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        article.title,
        slug,
        article.excerpt || '',
        article.content || '',
        normalizeContentFormat(article.contentFormat),
        article.category || '随笔',
        ['published', 'draft'].includes(article.status) ? article.status : 'published',
        article.readTime || null,
        article.coverImage || null,
        article.coverImageAssetId || null,
        id
    ).changes;
}

function toggleArticleStatus(id) {
    const article = db.prepare('SELECT status FROM articles WHERE id = ?').get(id);
    if (!article) return null;
    const status = article.status === 'published' ? 'draft' : 'published';
    db.prepare('UPDATE articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
    return status;
}

function toggleArticlePin(id) {
    const article = db.prepare('SELECT pinned_at FROM articles WHERE id = ?').get(id);
    if (!article) return null;
    const pinnedAt = article.pinned_at ? null : new Date().toISOString();
    db.prepare('UPDATE articles SET pinned_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(pinnedAt, id);
    return { pinnedAt };
}

function listAdminMessages() {
    return db.prepare(`
        SELECT m.id,
               COALESCE(u.username, m.author, '匿名') AS username,
               m.content,
               m.parent_id,
               m.article_id,
               a.title AS article_title,
               a.slug AS article_slug,
               COALESCE(m.status, 'approved') AS status,
               m.created_at,
               m.updated_at
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN articles a ON m.article_id = a.id
        ORDER BY m.created_at DESC
    `).all();
}

function approveMessage(id) {
    return db.prepare("UPDATE messages SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id).changes;
}

function findAdminMessageById(id) {
    return db.prepare(`
        SELECT id, content, status, created_at, updated_at
        FROM messages
        WHERE id = ?
    `).get(id);
}

function deleteMessage(id) {
    const rows = db.prepare(`
        WITH RECURSIVE message_tree(id) AS (
            SELECT id FROM messages WHERE id = ?
            UNION ALL
            SELECT m.id
            FROM messages m
            INNER JOIN message_tree mt ON m.parent_id = mt.id
        )
        SELECT id FROM message_tree
    `).all(id);
    const ids = rows.map(row => row.id);
    if (!ids.length) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const tx = db.transaction(() => {
        db.prepare(`DELETE FROM notifications WHERE related_message_id IN (${placeholders})`).run(...ids);
        db.prepare(`DELETE FROM message_likes WHERE message_id IN (${placeholders})`).run(...ids);
        db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);
    });
    tx();
    return ids.length;
}

function listUsers() {
    return db.prepare(`
        SELECT id, username, email, role, avatar, bio, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
    `).all();
}

function findUserForAdmin(id) {
    return db.prepare('SELECT username, role FROM users WHERE id = ?').get(id);
}

function findUserByUsername(username) {
    return db.prepare('SELECT id FROM users WHERE username = ?').get(username);
}

function updateUserRole(id, role) {
    return db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id).changes;
}

function updateUserUsername(id, username) {
    const tx = db.transaction(() => {
        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
        if (!user) return 0;
        const changes = db.prepare('UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(username, id).changes;
        db.prepare('UPDATE messages SET author = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(username, id);
        return changes;
    });
    return tx();
}

function resetUserPassword(id, passwordHash) {
    const update = db.transaction(() => {
        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
        if (!user) return 0;
        const changes = db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(passwordHash, id).changes;
        db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(passwordHash, user.username);
        return changes;
    });
    return update();
}

function deleteUser(id) {
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM message_likes WHERE user_id = ?').run(id);
        db.prepare('UPDATE messages SET user_id = NULL WHERE user_id = ?').run(id);
        db.prepare('UPDATE friend_links SET user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(id);
        db.prepare('UPDATE articles SET author_id = NULL WHERE author_id = ?').run(id);
        return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes;
    });
    return tx();
}

function listLinks() {
    return db.prepare('SELECT * FROM friend_links ORDER BY created_at DESC').all();
}

function createLink({ name, url }) {
    return db.prepare('INSERT INTO friend_links (name, url, status) VALUES (?, ?, ?)').run(name, url, 'active');
}

function deleteLink(id) {
    return db.prepare('DELETE FROM friend_links WHERE id = ?').run(id).changes;
}

function listSettings() {
    return db.prepare('SELECT key, value FROM site_settings').all();
}

function saveSettings(settings, allowedKeys) {
    const upsert = db.prepare(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    const tx = db.transaction(() => {
        for (const key of allowedKeys) {
            if (Object.prototype.hasOwnProperty.call(settings || {}, key)) {
                upsert.run(key, String(settings[key]));
            }
        }
    });
    tx();
}

module.exports = {
    findAdminByUsername,
    findAdminById,
    ensureSiteUserForAdmin,
    updateAdminPassword,
    listAdminArticles,
    updateAdminArticle,
    toggleArticleStatus,
    toggleArticlePin,
    listAdminMessages,
    findAdminMessageById,
    approveMessage,
    deleteMessage,
    listUsers,
    findUserForAdmin,
    findUserByUsername,
    updateUserRole,
    updateUserUsername,
    resetUserPassword,
    deleteUser,
    listLinks,
    createLink,
    deleteLink,
    listSettings,
    saveSettings
};
