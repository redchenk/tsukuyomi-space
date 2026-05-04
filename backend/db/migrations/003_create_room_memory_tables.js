module.exports = {
    version: '003',
    name: 'create_room_memory_tables',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS room_memories (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                visitor_name TEXT DEFAULT '',
                memory_type TEXT DEFAULT 'conversation',
                summary TEXT NOT NULL,
                content TEXT NOT NULL,
                embedding TEXT NOT NULL,
                importance REAL DEFAULT 0.5,
                metadata TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_room_memories_user_created
                ON room_memories(user_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_room_memories_user_type
                ON room_memories(user_id, memory_type);
        `);
    }
};
