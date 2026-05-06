const db = require('../db');

function findLatestVerificationCode(email, purpose) {
    return db.prepare(`
        SELECT * FROM email_verification_codes
        WHERE email = ? AND purpose = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).get(email, purpose);
}

function markVerificationCodeUsed(id, usedAt) {
    return db.prepare('UPDATE email_verification_codes SET used_at = ? WHERE id = ?').run(usedAt, id).changes;
}

function createVerificationCode({ id, email, codeHash, purpose, expiresAt, createdAt }) {
    return db.prepare(`
        INSERT INTO email_verification_codes (id, email, code_hash, purpose, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, email, codeHash, purpose, expiresAt, createdAt);
}

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
    findLatestVerificationCode,
    markVerificationCodeUsed,
    createVerificationCode,
    findUserByEmail,
    findUserByUsernameOrEmail,
    findUserByUsernameOrEmailPair,
    findCurrentUserById,
    createUser
};
