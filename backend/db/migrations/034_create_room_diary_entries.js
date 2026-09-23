module.exports = {
    version: '034',
    name: 'create_room_diary_entries',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS room_diary_entries (
                user_id TEXT NOT NULL,
                diary_id TEXT NOT NULL,
                entry_json TEXT,
                deleted_at INTEGER,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, diary_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_room_diary_entries_user_created
                ON room_diary_entries(user_id, created_at);

            CREATE TABLE IF NOT EXISTS room_diary_metadata (
                user_id TEXT PRIMARY KEY,
                metadata_json TEXT NOT NULL,
                revision INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
    }
};
