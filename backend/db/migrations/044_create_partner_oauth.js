module.exports = {
    version: '044',
    name: 'create_partner_oauth',
    up(db) {
        db.exec(`
            CREATE TABLE partner_oauth_clients (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, redirect_uris TEXT NOT NULL,
                secret_hash TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
                version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
            );
            CREATE TABLE partner_oauth_identities (
                sub TEXT PRIMARY KEY, issuer TEXT NOT NULL,
                client_id TEXT NOT NULL REFERENCES partner_oauth_clients(id),
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                version INTEGER NOT NULL DEFAULT 1, authorized_at INTEGER NOT NULL, revoked_at INTEGER,
                UNIQUE(issuer, client_id, user_id)
            );
            CREATE TABLE partner_oauth_requests (
                hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_hash TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL
            );
            CREATE INDEX idx_partner_requests_expiry ON partner_oauth_requests(expires_at);
            CREATE TABLE partner_oauth_codes (
                hash TEXT PRIMARY KEY, sub TEXT NOT NULL REFERENCES partner_oauth_identities(sub) ON DELETE CASCADE,
                client_version INTEGER NOT NULL, identity_version INTEGER NOT NULL,
                credential_version TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL,
                expires_at INTEGER NOT NULL, used_at INTEGER
            );
            CREATE INDEX idx_partner_codes_expiry ON partner_oauth_codes(expires_at);
            CREATE TABLE partner_oauth_tokens (
                hash TEXT PRIMARY KEY, code_hash TEXT NOT NULL REFERENCES partner_oauth_codes(hash) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL, revoked_at INTEGER
            );
            CREATE INDEX idx_partner_tokens_expiry ON partner_oauth_tokens(expires_at);
            CREATE INDEX idx_partner_tokens_code ON partner_oauth_tokens(code_hash);
        `);
    }
};
