module.exports = {
    version: '055', name: 'create_drift_bottles',
    up(db) {
        db.exec(`
            CREATE TABLE drift_bottles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                recipient_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                language TEXT NOT NULL DEFAULT 'zh',
                status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
                review TEXT NOT NULL,
                closed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                picked_at TEXT
            );
            CREATE INDEX idx_drift_available ON drift_bottles(status, closed, recipient_id);
            CREATE INDEX idx_drift_owner ON drift_bottles(user_id, id);
            CREATE INDEX idx_drift_recipient ON drift_bottles(recipient_id, id);
            CREATE TABLE drift_replies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bottle_id INTEGER NOT NULL REFERENCES drift_bottles(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                language TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
                review TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX idx_drift_replies ON drift_replies(bottle_id, id);
            CREATE TABLE drift_blocks (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY(user_id, blocked_id), CHECK(user_id != blocked_id)
            );
        `);
    }
};
