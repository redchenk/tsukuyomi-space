module.exports = {
    version: '017',
    name: 'friend_link_applications',
    up(db) {
        const columns = new Set(
            db.prepare('PRAGMA table_info(friend_links)').all().map(column => column.name)
        );

        const additions = [
            ['description', "TEXT DEFAULT ''"],
            ['backlink_url', "TEXT DEFAULT ''"],
            ['note', "TEXT DEFAULT ''"],
            ['user_id', 'TEXT'],
            ['reviewed_at', 'DATETIME'],
            ['updated_at', 'DATETIME']
        ];

        for (const [name, definition] of additions) {
            if (!columns.has(name)) {
                db.exec(`ALTER TABLE friend_links ADD COLUMN ${name} ${definition}`);
            }
        }

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_friend_links_status_created
                ON friend_links(status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_friend_links_user_created
                ON friend_links(user_id, created_at DESC);
        `);
    }
};
