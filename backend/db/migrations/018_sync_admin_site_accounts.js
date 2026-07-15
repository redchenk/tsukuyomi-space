const crypto = require('crypto');

module.exports = {
    version: '018',
    name: 'sync_admin_site_accounts',
    up(db) {
        const admins = db.prepare('SELECT id, username, password_hash FROM admins').all();
        const findUser = db.prepare('SELECT id FROM users WHERE username = ?');
        const createUser = db.prepare(`
            INSERT INTO users (id, username, email, password_hash, role)
            VALUES (?, ?, ?, ?, 'admin')
        `);
        const syncUser = db.prepare(`
            UPDATE users
            SET password_hash = ?, role = 'admin', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        for (const admin of admins) {
            const user = findUser.get(admin.username);
            if (user) {
                syncUser.run(admin.password_hash, user.id);
                continue;
            }
            createUser.run(
                crypto.randomUUID(),
                admin.username,
                `admin-${admin.id}@admin.yachiyo.local`,
                admin.password_hash
            );
        }
    }
};
