module.exports = {
    version: '054', name: 'play_test_invitation_settings',
    up(db) {
        db.exec("ALTER TABLE play_test_settings ADD COLUMN invitation_url TEXT NOT NULL DEFAULT 'https://play.google.com/apps/internaltest/4701667283312409674'");
    }
};
