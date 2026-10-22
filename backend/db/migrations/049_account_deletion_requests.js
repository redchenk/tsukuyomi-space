module.exports = {
    version: '049', name: 'account_deletion_requests',
    up(db) {
        db.exec(`
            CREATE TABLE account_deletion_requests (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
                status TEXT NOT NULL CHECK(status IN ('pending','processing','completed','cancelled')),
                requested_at TEXT NOT NULL,
                due_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                policy_version TEXT NOT NULL,
                resolution TEXT NOT NULL DEFAULT '',
                checklist TEXT NOT NULL DEFAULT '{}'
            );
            CREATE UNIQUE INDEX account_deletion_active ON account_deletion_requests(user_id)
                WHERE status IN ('pending','processing');
            CREATE INDEX account_deletion_queue ON account_deletion_requests(status,requested_at);
        `);
    }
};
