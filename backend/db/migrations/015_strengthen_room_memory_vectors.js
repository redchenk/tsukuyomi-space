module.exports = {
    version: '015',
    name: 'strengthen_room_memory_vectors',
    up(db) {
        const columns = new Set(db.prepare('PRAGMA table_info(room_memories)').all().map(row => row.name));
        if (!columns.has('vector_synced_at')) {
            db.exec('ALTER TABLE room_memories ADD COLUMN vector_synced_at DATETIME');
        }
        if (!columns.has('vector_sync_error')) {
            db.exec("ALTER TABLE room_memories ADD COLUMN vector_sync_error TEXT DEFAULT ''");
        }
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_room_memories_user_vector_sync
                ON room_memories(user_id, vector_synced_at, updated_at);

            CREATE TABLE IF NOT EXISTS room_memory_vector_deletions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                memory_id TEXT NOT NULL,
                last_error TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, memory_id)
            );

            CREATE INDEX IF NOT EXISTS idx_room_memory_vector_deletions_user
                ON room_memory_vector_deletions(user_id, created_at);
        `);
    }
};
