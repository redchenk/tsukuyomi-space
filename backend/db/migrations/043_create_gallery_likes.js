module.exports = {
    version: '043',
    name: 'create_gallery_likes',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS gallery_likes (
                user_id TEXT NOT NULL,
                asset_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, asset_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (asset_id) REFERENCES article_assets(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_gallery_likes_asset ON gallery_likes(asset_id);
        `);
    }
};
