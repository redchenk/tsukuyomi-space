module.exports = {
    version: '031',
    name: 'add_friend_link_screenshot_key',
    up(db) {
        const columns = new Set(
            db.prepare('PRAGMA table_info(friend_links)').all().map(column => column.name)
        );
        if (!columns.has('screenshot_storage_key')) {
            db.exec("ALTER TABLE friend_links ADD COLUMN screenshot_storage_key TEXT NOT NULL DEFAULT ''");
        }

        // Direct OSS URLs are unusable for private buckets. A later monitor run
        // repopulates these through the same-origin preview endpoint.
        db.exec(`
            UPDATE friend_links
            SET screenshot_url = ''
            WHERE COALESCE(screenshot_storage_key, '') = ''
              AND COALESCE(screenshot_url, '') <> '';
        `);
    }
};
