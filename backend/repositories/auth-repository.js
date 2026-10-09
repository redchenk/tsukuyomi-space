const db = require('../db');

function findUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function findUserByUsernameOrEmail(value) {
    return db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(value, value);
}

function findUserByUsernameOrEmailPair(username, email) {
    return db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, email);
}

function findCurrentUserById(id) {
    return db.prepare("SELECT id, username, COALESCE(NULLIF(nickname, ''), username) AS nickname, email, role, avatar, bio, created_at FROM users WHERE id = ?").get(id);
}

function isUsernameTaken(username) {
    return Boolean(db.prepare('SELECT id FROM users WHERE username = ?').get(username));
}

function createUser({ id, username, nickname = username, email, passwordHash, role = 'user', avatar = '' }) {
    return db.prepare(`
        INSERT INTO users (id, username, nickname, email, password_hash, role, avatar)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, nickname || username, email, passwordHash, role, avatar || '');
}

function findUserByOAuthAccount(provider, providerUserId) {
    return db.prepare(`
        SELECT users.*, oauth.provider, oauth.provider_user_id, oauth.union_id, oauth.provider_email
        FROM user_oauth_accounts oauth
        INNER JOIN users ON users.id = oauth.user_id
        WHERE oauth.provider = ? AND oauth.provider_user_id = ?
    `).get(provider, providerUserId);
}

function findOAuthAccount(provider, providerUserId) {
    return db.prepare(`
        SELECT * FROM user_oauth_accounts
        WHERE provider = ? AND provider_user_id = ?
    `).get(provider, providerUserId);
}

function oauthProfileJson(profile) {
    try {
        return JSON.stringify(profile || {});
    } catch (_) {
        return '{}';
    }
}

function createOAuthAccount({
    id,
    userId,
    provider,
    providerUserId,
    unionId = '',
    providerEmail = '',
    nickname = '',
    avatar = '',
    profile = {}
}) {
    return db.prepare(`
        INSERT INTO user_oauth_accounts (
            id,
            user_id,
            provider,
            provider_user_id,
            union_id,
            provider_email,
            nickname,
            avatar,
            profile_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        userId,
        provider,
        providerUserId,
        unionId || '',
        providerEmail || '',
        nickname || '',
        avatar || '',
        oauthProfileJson(profile)
    );
}

function writeOAuthAccount(account) {
    const other = listOAuthAccountsByUser(account.userId).find(row =>
        row.provider === account.provider && row.provider_user_id !== account.providerUserId);
    if (other) {
        const error = new Error('当前账号已绑定其他同类第三方账号，请先解绑');
        error.status = 409;
        throw error;
    }
    const existing = findOAuthAccount(account.provider, account.providerUserId);
    if (!existing) {
        createOAuthAccount(account);
        return;
    }

    // A provider identity cannot move between site accounts during linking.
    if (existing.user_id !== account.userId) {
        const error = new Error('该第三方账号已绑定其他账号');
        error.status = 409;
        throw error;
    }

    db.prepare(`
        UPDATE user_oauth_accounts
        SET user_id = ?,
            union_id = ?,
            provider_email = ?,
            nickname = ?,
            avatar = ?,
            profile_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE provider = ? AND provider_user_id = ?
    `).run(
        account.userId,
        account.unionId || '',
        account.providerEmail || '',
        account.nickname || '',
        account.avatar || '',
        oauthProfileJson(account.profile),
        account.provider,
        account.providerUserId
    );
}

function applyOAuthAvatar(userId, avatar) {
    if (!avatar) return;
    db.prepare(`
        UPDATE users
        SET avatar = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND COALESCE(avatar, '') = ''
    `).run(avatar, userId);
}

const createUserWithOAuthAccount = db.transaction(({ user, account }) => {
    createUser(user);
    createOAuthAccount({ ...account, userId: user.id });
    return findCurrentUserById(user.id);
});

const linkOAuthAccount = db.transaction((account) => {
    writeOAuthAccount(account);
    applyOAuthAvatar(account.userId, account.avatar);
    return findCurrentUserById(account.userId);
});

const updateUserEmailWithOAuthAccount = db.transaction(({ userId, email, account }) => {
    db.prepare(`
        UPDATE users
        SET email = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(email, userId);
    writeOAuthAccount({ ...account, userId });
    applyOAuthAvatar(userId, account.avatar);
    return findCurrentUserById(userId);
});

function listOAuthAccountsByUser(userId) {
    return db.prepare(`
        SELECT provider, provider_user_id, union_id, provider_email, nickname, avatar, created_at, updated_at
        FROM user_oauth_accounts
        WHERE user_id = ?
        ORDER BY created_at DESC
    `).all(userId);
}

function deleteOAuthAccountForUser(userId, provider) {
    return db.prepare(`
        DELETE FROM user_oauth_accounts
        WHERE user_id = ? AND provider = ?
    `).run(userId, provider).changes;
}

module.exports = {
    findUserByEmail,
    findUserById,
    findUserByUsernameOrEmail,
    findUserByUsernameOrEmailPair,
    findCurrentUserById,
    isUsernameTaken,
    createUser,
    findUserByOAuthAccount,
    findOAuthAccount,
    createOAuthAccount,
    createUserWithOAuthAccount,
    linkOAuthAccount,
    updateUserEmailWithOAuthAccount,
    listOAuthAccountsByUser,
    deleteOAuthAccountForUser
};
