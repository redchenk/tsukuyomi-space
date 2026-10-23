module.exports = {
    version: '050', name: 'create_mail_campaigns',
    up(db) {
        db.exec(`
            CREATE TABLE mail_campaigns (
                id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
                subject TEXT NOT NULL, body TEXT NOT NULL, action_url TEXT NOT NULL, action_label TEXT NOT NULL,
                audience_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft','queued','running','completed','cancelled')),
                created_at INTEGER NOT NULL, queued_at INTEGER
            );
            CREATE TABLE mail_campaign_recipients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id TEXT NOT NULL REFERENCES mail_campaigns(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','sending','sent','failed','unknown','skipped','cancelled')),
                result TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
                UNIQUE(campaign_id,email)
            );
            CREATE INDEX idx_mail_campaign_pending ON mail_campaign_recipients(status,campaign_id,id);
            CREATE INDEX idx_mail_campaign_created ON mail_campaigns(created_at DESC);
        `);
    }
};
