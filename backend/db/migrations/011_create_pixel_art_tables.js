module.exports = {
    version: '011',
    name: 'create_pixel_art_tables',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS pixel_artworks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                author_id TEXT NOT NULL,
                size INTEGER NOT NULL DEFAULT 16,
                background_color TEXT NOT NULL DEFAULT '#0b1020',
                palette TEXT NOT NULL,
                pixels TEXT NOT NULL,
                like_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_pixel_artworks_created
                ON pixel_artworks(created_at DESC, id DESC);

            CREATE INDEX IF NOT EXISTS idx_pixel_artworks_likes
                ON pixel_artworks(like_count DESC, created_at DESC);

            CREATE TABLE IF NOT EXISTS pixel_art_likes (
                artwork_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (artwork_id, user_id),
                FOREIGN KEY (artwork_id) REFERENCES pixel_artworks(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_pixel_art_likes_user_created
                ON pixel_art_likes(user_id, created_at DESC);
        `);
    }
};
