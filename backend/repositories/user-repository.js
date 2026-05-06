const db = require('../db');

function findProfileById(id) {
    return db.prepare(`
        SELECT id, username, email, avatar, bio, role, created_at
        FROM users WHERE id = ?
    `).get(id);
}

function findUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function updateBio(id, bio) {
    return db.prepare('UPDATE users SET bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(bio || '', id).changes;
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
    updateBio,
    updateAvatar,
    updatePassword
};
