module.exports = {
    version: '052', name: 'play_test_invitations',
    up(db) {
        db.exec(`
            CREATE TABLE play_test_invitations (
                id TEXT PRIMARY KEY,
                application_id TEXT NOT NULL REFERENCES play_test_applications(id) ON DELETE CASCADE,
                email TEXT NOT NULL, action_url TEXT NOT NULL, invitation_version TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('sending','sent','failed','unknown')),
                result TEXT NOT NULL DEFAULT '', creator_id TEXT NOT NULL,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sent_at INTEGER
            );
            CREATE INDEX play_test_invitation_history ON play_test_invitations(application_id,created_at DESC);
            CREATE UNIQUE INDEX play_test_invitation_once ON play_test_invitations(application_id,action_url)
                WHERE status IN ('sending','sent','unknown');
        `);
    }
};
