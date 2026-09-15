module.exports = {
    version: '033',
    name: 'create_article_likes',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS article_likes (
                user_id TEXT NOT NULL,
                article_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, article_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_article_likes_article ON article_likes(article_id);
        `);
    }
};
