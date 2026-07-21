module.exports = {
    version: '025',
    name: 'add_friend_link_avatar',
    up(db) {
        const columns = new Set(
            db.prepare('PRAGMA table_info(friend_links)').all().map(column => column.name)
        );

        if (!columns.has('avatar_url')) {
            db.exec("ALTER TABLE friend_links ADD COLUMN avatar_url TEXT DEFAULT ''");
        }
    }
};
