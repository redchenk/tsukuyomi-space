module.exports = {
    version: '014',
    name: 'create_oauth_accounts',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_oauth_accounts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                provider_user_id TEXT NOT NULL,
                union_id TEXT,
                provider_email TEXT,
                nickname TEXT,
                avatar TEXT,
                profile_json TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(provider, provider_user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_user_oauth_accounts_user
                ON user_oauth_accounts(user_id);

            CREATE INDEX IF NOT EXISTS idx_user_oauth_accounts_email
                ON user_oauth_accounts(provider_email);
        `);
    }
};
