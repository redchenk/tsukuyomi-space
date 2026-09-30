module.exports = {
    version: '040',
    name: 'create_fushi_mcp',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS fushi_grants (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                client_id TEXT NOT NULL, credential_version TEXT NOT NULL,
                issuer TEXT NOT NULL, resource TEXT NOT NULL,
                scopes TEXT NOT NULL, created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL, revoked_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS fushi_oauth_codes (
                hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES fushi_grants(id) ON DELETE CASCADE,
                redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL,
                expires_at INTEGER NOT NULL, used_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS fushi_oauth_tokens (
                hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES fushi_grants(id) ON DELETE CASCADE,
                kind TEXT NOT NULL CHECK(kind IN ('access', 'refresh')),
                expires_at INTEGER NOT NULL, used_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_fushi_tokens_expiry ON fushi_oauth_tokens(expires_at);
            CREATE INDEX IF NOT EXISTS idx_fushi_tokens_grant ON fushi_oauth_tokens(grant_id);
            CREATE INDEX IF NOT EXISTS idx_fushi_codes_grant ON fushi_oauth_codes(grant_id);
            CREATE TABLE IF NOT EXISTS fushi_events (
                seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL,
                owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, notification_id INTEGER NOT NULL,
                message_id INTEGER NOT NULL, thread_id INTEGER NOT NULL,
                kind TEXT NOT NULL, article_id INTEGER, occurred_at INTEGER NOT NULL,
                UNIQUE(owner_id, message_id)
            );
            CREATE INDEX IF NOT EXISTS idx_fushi_events_owner_seq ON fushi_events(owner_id, seq);
            CREATE INDEX IF NOT EXISTS idx_fushi_events_thread ON fushi_events(owner_id, thread_id, seq);
            CREATE INDEX IF NOT EXISTS idx_fushi_events_expiry ON fushi_events(occurred_at);
            CREATE TABLE IF NOT EXISTS fushi_history (
                owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, floor_seq INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS fushi_subscriptions (
                id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                grant_id TEXT NOT NULL REFERENCES fushi_grants(id) ON DELETE CASCADE, name TEXT NOT NULL,
                arguments TEXT NOT NULL, callback_box TEXT NOT NULL, callback_hash TEXT NOT NULL,
                secret_box TEXT, previous_secret_box TEXT, rotate_until INTEGER,
                expires_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
                verified_at INTEGER NOT NULL, scan_cursor INTEGER NOT NULL DEFAULT 0,
                base_cursor INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_fushi_subscriptions_owner ON fushi_subscriptions(owner_id, active, expires_at);
            CREATE INDEX IF NOT EXISTS idx_fushi_callback_cache ON fushi_subscriptions(owner_id, callback_hash, verified_at);
            CREATE INDEX IF NOT EXISTS idx_fushi_subscriptions_grant ON fushi_subscriptions(grant_id);
            CREATE TABLE IF NOT EXISTS fushi_deliveries (
                subscription_id TEXT NOT NULL REFERENCES fushi_subscriptions(id) ON DELETE CASCADE,
                event_seq INTEGER NOT NULL REFERENCES fushi_events(seq) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','inflight','accepted','dead','cancelled')),
                attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL,
                lease_until INTEGER, received_at INTEGER, last_status INTEGER, last_error TEXT,
                PRIMARY KEY(subscription_id, event_seq)
            );
            CREATE INDEX IF NOT EXISTS idx_fushi_deliveries_due ON fushi_deliveries(status, next_attempt);
            CREATE TABLE IF NOT EXISTS fushi_reply_submissions (
                owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, idempotency_key TEXT NOT NULL,
                request_hash TEXT NOT NULL, event_id TEXT NOT NULL,
                notification_id INTEGER NOT NULL,
                source_message_id INTEGER NOT NULL,
                message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
                result TEXT NOT NULL, created_at INTEGER NOT NULL,
                PRIMARY KEY(owner_id, idempotency_key), UNIQUE(owner_id, event_id), UNIQUE(owner_id, source_message_id)
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_fushi_cursor ON notifications(user_id, type, id);
            CREATE INDEX IF NOT EXISTS idx_fushi_submissions_recent ON fushi_reply_submissions(owner_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_fushi_codes_expiry ON fushi_oauth_codes(expires_at);
            CREATE INDEX IF NOT EXISTS idx_fushi_grants_expiry ON fushi_grants(expires_at);
            CREATE INDEX IF NOT EXISTS idx_messages_fushi_thread ON messages(parent_id, status, id);
        `);
    }
};
