module.exports = {
    version: '009',
    name: 'create_social_tables',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_follows (
                follower_id TEXT NOT NULL,
                following_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (follower_id, following_id),
                FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
                CHECK (follower_id != following_id)
            );

            CREATE INDEX IF NOT EXISTS idx_user_follows_following
                ON user_follows(following_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_user_follows_follower
                ON user_follows(follower_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS article_bookmarks (
                user_id TEXT NOT NULL,
                article_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, article_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_article_bookmarks_user_created
                ON article_bookmarks(user_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_article_bookmarks_article
                ON article_bookmarks(article_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS message_mentions (
                message_id INTEGER NOT NULL,
                mentioned_user_id TEXT NOT NULL,
                actor_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, mentioned_user_id),
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_message_mentions_user_created
                ON message_mentions(mentioned_user_id, created_at DESC);
        `);
    }
};
