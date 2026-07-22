module.exports = {
    version: '026',
    name: 'create_room_conversation_shares',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS room_conversation_shares (
                id TEXT PRIMARY KEY,
                share_key TEXT NOT NULL UNIQUE,
                user_id TEXT NOT NULL,
                turn_id TEXT NOT NULL,
                title TEXT NOT NULL,
                user_message TEXT NOT NULL,
                assistant_message TEXT NOT NULL,
                scene_json TEXT NOT NULL DEFAULT '{}',
                og_image_asset_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                revoked_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (og_image_asset_id) REFERENCES article_assets(id) ON DELETE SET NULL,
                UNIQUE (user_id, turn_id)
            );

            CREATE INDEX IF NOT EXISTS idx_room_conversation_shares_key_active
                ON room_conversation_shares(share_key, revoked_at);

            CREATE INDEX IF NOT EXISTS idx_room_conversation_shares_user_updated
                ON room_conversation_shares(user_id, updated_at DESC);
        `);
    }
};
