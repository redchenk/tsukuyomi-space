module.exports = {
    version: '030',
    name: 'add_friend_link_monitoring',
    up(db) {
        const columns = new Set(
            db.prepare('PRAGMA table_info(friend_links)').all().map(column => column.name)
        );
        const additions = [
            ['monitor_status', "TEXT NOT NULL DEFAULT 'unchecked'"],
            ['response_time_ms', 'INTEGER NOT NULL DEFAULT 0'],
            ['http_status', 'INTEGER NOT NULL DEFAULT 0'],
            ['fail_count', 'INTEGER NOT NULL DEFAULT 0'],
            ['has_backlink', 'INTEGER NOT NULL DEFAULT 0'],
            ['last_checked_at', 'DATETIME'],
            ['screenshot_url', "TEXT NOT NULL DEFAULT ''"],
            ['screenshot_updated_at', 'DATETIME'],
            ['monitor_error', "TEXT NOT NULL DEFAULT ''"]
        ];

        for (const [name, definition] of additions) {
            if (!columns.has(name)) {
                db.exec(`ALTER TABLE friend_links ADD COLUMN ${name} ${definition}`);
            }
        }

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_friend_links_monitoring
            ON friend_links(status, monitor_status, last_checked_at);
        `);
    }
};
