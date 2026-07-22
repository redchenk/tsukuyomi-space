module.exports = {
    version: '027',
    name: 'create_user_growth_system',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_growth_profiles (
                user_id TEXT PRIMARY KEY,
                total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
                current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
                longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
                last_checkin_date TEXT,
                invite_code TEXT NOT NULL UNIQUE,
                referred_by_user_id TEXT,
                referral_claimed_at DATETIME,
                referral_qualified_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (referred_by_user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS user_growth_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                event_key TEXT NOT NULL,
                event_date TEXT NOT NULL,
                source_id TEXT NOT NULL DEFAULT '',
                xp INTEGER NOT NULL CHECK (xp >= 0),
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE (user_id, event_key, event_date, source_id)
            );

            CREATE INDEX IF NOT EXISTS idx_user_growth_events_user_created
                ON user_growth_events(user_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_user_growth_events_key_created
                ON user_growth_events(event_key, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_user_growth_profiles_referrer
                ON user_growth_profiles(referred_by_user_id, referral_qualified_at);
        `);
    }
};
