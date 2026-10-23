module.exports = {
    version: '051', name: 'play_test_applications',
    up(db) {
        db.exec(`
            CREATE TABLE play_test_applications (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                device TEXT NOT NULL DEFAULT '',
                android_version TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','invited')),
                consent_version TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX play_test_applications_queue ON play_test_applications(status,created_at);
            CREATE TABLE play_test_settings (
                id INTEGER PRIMARY KEY CHECK(id=1),
                registration_open INTEGER NOT NULL DEFAULT 1 CHECK(registration_open IN (0,1)),
                join_url TEXT NOT NULL DEFAULT ''
            );
            INSERT INTO play_test_settings(id) VALUES(1);
        `);
    }
};
