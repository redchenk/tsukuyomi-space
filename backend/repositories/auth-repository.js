const db = require('../db');

function findUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findUserByUsernameOrEmail(value) {
    return db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(value, value);
}

function findUserByUsernameOrEmailPair(username, email) {
    return db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, email);
}

function findCurrentUserById(id) {
    return db.prepare('SELECT id, username, email, role, avatar, created_at FROM users WHERE id = ?').get(id);
}

function createUser({ id, username, email, passwordHash }) {
    return db.prepare(`
        INSERT INTO users (id, username, email, password_hash)
        VALUES (?, ?, ?, ?)
    `).run(id, username, email, passwordHash);
}

module.exports = {
    findUserByEmail,
    findUserByUsernameOrEmail,
    findUserByUsernameOrEmailPair,
    findCurrentUserById,
    createUser
};
