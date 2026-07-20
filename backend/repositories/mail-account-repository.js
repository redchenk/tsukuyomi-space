const db = require('../db');

const PUBLIC_FIELDS = `
    id, provider, email, COALESCE(display_name, '') AS display_name,
    auth_type, imap_host, imap_port, imap_secure,
    smtp_host, smtp_port, smtp_secure, status,
    last_sync_at, COALESCE(last_error, '') AS last_error,
    created_at, updated_at
`;

function listForUser(userId) {
    return db.prepare(`
        SELECT ${PUBLIC_FIELDS}
        FROM mail_accounts
        WHERE user_id = ?
        ORDER BY updated_at DESC, created_at DESC
    `).all(userId);
}

function findForUser(id, userId) {
    return db.prepare(`
        SELECT *
        FROM mail_accounts
        WHERE id = ? AND user_id = ?
    `).get(id, userId);
}

function findPublicForUser(id, userId) {
    return db.prepare(`
        SELECT ${PUBLIC_FIELDS}
        FROM mail_accounts
        WHERE id = ? AND user_id = ?
    `).get(id, userId);
}

function countForUser(userId) {
    return Number(db.prepare('SELECT COUNT(*) AS count FROM mail_accounts WHERE user_id = ?').get(userId)?.count || 0);
}

function create(account) {
    db.prepare(`
        INSERT INTO mail_accounts (
            id, user_id, provider, email, display_name, auth_type, credential_blob,
            imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure,
            status, last_sync_at, last_error
        ) VALUES (
            @id, @user_id, @provider, @email, @display_name, @auth_type, @credential_blob,
            @imap_host, @imap_port, @imap_secure, @smtp_host, @smtp_port, @smtp_secure,
            'active', CURRENT_TIMESTAMP, ''
        )
    `).run(account);
    return findPublicForUser(account.id, account.user_id);
}

function update(id, userId, account) {
    const credentialSql = account.credential_blob ? ', credential_blob = @credential_blob' : '';
    const changes = db.prepare(`
        UPDATE mail_accounts
        SET provider = @provider,
            email = @email,
            display_name = @display_name,
            auth_type = @auth_type,
            imap_host = @imap_host,
            imap_port = @imap_port,
            imap_secure = @imap_secure,
            smtp_host = @smtp_host,
            smtp_port = @smtp_port,
            smtp_secure = @smtp_secure,
            status = 'active',
            last_error = '',
            updated_at = CURRENT_TIMESTAMP
            ${credentialSql}
        WHERE id = @id AND user_id = @user_id
    `).run({ ...account, id, user_id: userId }).changes;
    return changes ? findPublicForUser(id, userId) : null;
}

function setSyncState(id, userId, { ok, error = '' }) {
    db.prepare(`
        UPDATE mail_accounts
        SET status = ?,
            last_sync_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_sync_at END,
            last_error = ?
        WHERE id = ? AND user_id = ?
    `).run(ok ? 'active' : 'error', ok ? 1 : 0, String(error).slice(0, 240), id, userId);
}

function remove(id, userId) {
    return db.prepare('DELETE FROM mail_accounts WHERE id = ? AND user_id = ?').run(id, userId).changes;
}

module.exports = {
    countForUser,
    create,
    findForUser,
    findPublicForUser,
    listForUser,
    remove,
    setSyncState,
    update
};
