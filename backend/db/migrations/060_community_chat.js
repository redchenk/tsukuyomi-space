module.exports = {
    version: '060',
    name: 'community_chat',
    up(db) {
        db.exec(`
            CREATE TABLE community_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel TEXT NOT NULL,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                request_id TEXT UNIQUE,
                reply_to INTEGER REFERENCES community_messages(id) ON DELETE SET NULL,
                ai_status TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                removed INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX community_channel_history ON community_messages(channel,id);
            CREATE INDEX community_user_recent ON community_messages(user_id,created_at);
            CREATE UNIQUE INDEX community_ai_reply ON community_messages(reply_to) WHERE user_id IS NULL;
            CREATE TABLE community_reports (
                message_id INTEGER NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
                reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY(message_id,reporter_id)
            );
            CREATE TABLE community_mutes (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                until_ms INTEGER NOT NULL
            );
        `);
    }
};
