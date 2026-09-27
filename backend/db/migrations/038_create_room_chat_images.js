module.exports = {
    version: '038',
    name: 'create_room_chat_images',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS room_chat_images (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                turn_id TEXT NOT NULL,
                object_key TEXT NOT NULL,
                name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                deleted INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, turn_id)
            );
            CREATE INDEX IF NOT EXISTS idx_room_chat_images_cleanup
                ON room_chat_images(deleted, created_at);
        `);
    }
};
