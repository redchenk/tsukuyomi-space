module.exports = {
    version: '029',
    name: 'create_kaguya_game_scores',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS kaguya_game_scores (
                user_id TEXT PRIMARY KEY,
                best_score INTEGER NOT NULL DEFAULT 0 CHECK(best_score >= 0),
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_kaguya_game_scores_ranking
            ON kaguya_game_scores(best_score DESC, updated_at ASC);
        `);
    }
};
