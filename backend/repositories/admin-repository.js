const db = require('../db');

function findAdminByUsername(username) {
    return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
}

function findAdminById(id) {
    return db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
}

function updateAdminPassword(id, passwordHash) {
    return db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, id).changes;
}

function listAdminArticles() {
    return db.prepare(`
        SELECT id, title, category, view_count, status, pinned_at, created_at, updated_at
        FROM articles
        ORDER BY pinned_at IS NULL, pinned_at DESC, COALESCE(updated_at, created_at) DESC
    `).all();
}

function updateAdminArticle(id, article) {
    return db.prepare(`
        UPDATE articles
        SET title = ?,
            excerpt = ?,
            content = ?,
            category = ?,
            status = ?,
            read_time = COALESCE(?, read_time),
            cover_image = COALESCE(?, cover_image),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        article.title,
        article.excerpt || '',
        article.content || '',
        article.category || '随笔',
        ['published', 'draft'].includes(article.status) ? article.status : 'published',
        article.readTime || null,
        article.coverImage || null,
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
        SELECT id,
               COALESCE(author, '匿名') AS username,
               content,
               COALESCE(status, 'approved') AS status,
               created_at
        FROM messages
        ORDER BY created_at DESC
    `).all();
}

function approveMessage(id) {
    return db.prepare("UPDATE messages SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id).changes;
}

function deleteMessage(id) {
    return db.prepare('DELETE FROM messages WHERE id = ?').run(id).changes;
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
    return db.prepare('UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(username, id).changes;
}

function resetUserPassword(id, passwordHash) {
    return db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, id).changes;
}

function deleteUser(id) {
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM message_likes WHERE user_id = ?').run(id);
        db.prepare('UPDATE messages SET user_id = NULL WHERE user_id = ?').run(id);
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
    updateAdminPassword,
    listAdminArticles,
    updateAdminArticle,
    toggleArticleStatus,
    toggleArticlePin,
    listAdminMessages,
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
