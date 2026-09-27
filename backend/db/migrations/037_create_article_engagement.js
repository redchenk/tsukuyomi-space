module.exports = {
    version: '037',
    name: 'create_article_engagement',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS article_read_identities (
                article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                identity_key TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (article_id, identity_key)
            );
            CREATE TABLE IF NOT EXISTS article_reward_receipts (
                article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                kind TEXT NOT NULL CHECK (kind IN ('like', 'bookmark')),
                actor_id TEXT NOT NULL,
                PRIMARY KEY (article_id, kind, actor_id)
            );
            CREATE TABLE IF NOT EXISTS article_growth_backfills (
                version TEXT PRIMARY KEY,
                completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                users INTEGER NOT NULL,
                xp INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS article_daily_recommendations (
                day TEXT NOT NULL,
                article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                score REAL NOT NULL,
                recommended INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (day, article_id)
            );
            CREATE TABLE IF NOT EXISTS article_recommendation_history (
                article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
                last_day TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_article_recommendation_history
                ON article_daily_recommendations(article_id, recommended, day);
            CREATE INDEX IF NOT EXISTS idx_article_recommendation_order
                ON article_daily_recommendations(day, position);
        `);
    }
};
