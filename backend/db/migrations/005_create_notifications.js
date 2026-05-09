module.exports = {
    version: '005',
    name: 'create_notifications',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                actor_id TEXT,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                link TEXT,
                related_message_id INTEGER,
                related_article_id INTEGER,
                metadata TEXT DEFAULT '{}',
                read_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (actor_id) REFERENCES users(id),
                FOREIGN KEY (related_message_id) REFERENCES messages(id),
                FOREIGN KEY (related_article_id) REFERENCES articles(id)
            );

            CREATE INDEX IF NOT EXISTS idx_notifications_user_created
                ON notifications (user_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_notifications_user_read
                ON notifications (user_id, read_at);
        `);
    }
};
