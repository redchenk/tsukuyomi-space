module.exports = {
    version: '039',
    name: 'add_user_nickname',
    up(db) {
        if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'nickname')) {
            db.exec("ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
        }
        // Preserve existing display names without changing account IDs or login handles.
        db.exec("UPDATE users SET nickname = username WHERE nickname IS NULL OR trim(nickname) = ''");
    }
};
