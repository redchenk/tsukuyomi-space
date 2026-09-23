module.exports = {
    version: '035',
    name: 'create_login_location_state',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_login_location_state (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                ip_fingerprint TEXT NOT NULL,
                country_code TEXT NOT NULL,
                region TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }
};
