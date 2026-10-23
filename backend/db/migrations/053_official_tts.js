module.exports = {
    version: '053', name: 'official_tts',
    up(db) {
        db.exec(`CREATE TABLE official_tts_jobs (
            id TEXT PRIMARY KEY REFERENCES billing_requests(request_id),
            user_id TEXT NOT NULL REFERENCES users(id),
            fingerprint TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('processing','ready','failed','expired')),
            content_type TEXT, audio_bytes INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE INDEX official_tts_jobs_owner ON official_tts_jobs(user_id,created_at);
        CREATE INDEX official_tts_jobs_state ON official_tts_jobs(state,updated_at);`);
    }
};
