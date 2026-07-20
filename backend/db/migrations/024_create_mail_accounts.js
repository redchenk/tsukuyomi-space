module.exports = {
    version: '024',
    name: 'create_mail_accounts',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS mail_accounts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE,
                display_name TEXT DEFAULT '',
                auth_type TEXT NOT NULL DEFAULT 'app_password',
                credential_blob TEXT NOT NULL,
                imap_host TEXT NOT NULL,
                imap_port INTEGER NOT NULL DEFAULT 993,
                imap_secure INTEGER NOT NULL DEFAULT 1,
                smtp_host TEXT NOT NULL,
                smtp_port INTEGER NOT NULL DEFAULT 465,
                smtp_secure INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'active',
                last_sync_at DATETIME,
                last_error TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, email),
                CHECK (auth_type IN ('password', 'app_password', 'oauth2')),
                CHECK (status IN ('active', 'error', 'disabled')),
                CHECK (imap_port = 993),
                CHECK (smtp_port IN (465, 587))
            );

            CREATE INDEX IF NOT EXISTS idx_mail_accounts_user_updated
                ON mail_accounts(user_id, updated_at DESC);

            CREATE TRIGGER IF NOT EXISTS trg_mail_accounts_user_limit
            BEFORE INSERT ON mail_accounts
            WHEN (SELECT COUNT(*) FROM mail_accounts WHERE user_id = NEW.user_id) >= 8
            BEGIN
                SELECT RAISE(ABORT, 'MAIL_ACCOUNT_LIMIT');
            END;
        `);
    }
};
