const db = require('../db');

function findProfileById(id) {
    return db.prepare(`
        SELECT id, username, COALESCE(NULLIF(nickname, ''), username) AS nickname, email, avatar, bio, role, created_at
        FROM users WHERE id = ?
    `).get(id);
}

function findUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function findPublicAvatarByUsername(username) {
    const value = String(username || '').trim().toLowerCase();
    if (!value) return null;
    return db.prepare(`
        SELECT username, avatar, created_at, updated_at
        FROM users
        WHERE lower(username) = ?
    `).get(value);
}

function updateBio(id, bio) {
    return db.prepare('UPDATE users SET bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(bio || '', id).changes;
}

function updateProfile(id, { nickname, bio }) {
    return db.prepare('UPDATE users SET nickname = ?, bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(nickname, bio, id).changes;
}

function updateAvatar(id, avatar) {
    return db.prepare('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(avatar, id).changes;
}

function updatePassword(id, passwordHash) {
    return db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, id).changes;
}

module.exports = {
    findProfileById,
    findUserById,
    findPublicAvatarByUsername,
    updateBio,
    updateProfile,
    updateAvatar,
    updatePassword
};
