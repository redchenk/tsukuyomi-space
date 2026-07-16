module.exports = {
    version: '020',
    name: 'create_room_chat_messages',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS room_chat_messages (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                turn_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_room_chat_messages_user_turn_role
                ON room_chat_messages(user_id, turn_id, role);

            CREATE INDEX IF NOT EXISTS idx_room_chat_messages_user_created
                ON room_chat_messages(user_id, created_at DESC);
        `);
    }
};
