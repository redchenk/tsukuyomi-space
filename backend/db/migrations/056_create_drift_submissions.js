module.exports = {
    version: '056', name: 'create_drift_submissions',
    up(db) {
        db.exec(`
            CREATE TABLE drift_submissions (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                request_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                result_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, request_id)
            );
        `);
    }
};
