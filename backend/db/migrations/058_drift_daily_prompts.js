module.exports = {
    version: '058', name: 'drift_daily_prompts',
    up(db) {
        db.exec(`
            CREATE TABLE drift_daily_prompts (
                date TEXT PRIMARY KEY,
                prompt_id TEXT NOT NULL,
                prompt_json TEXT NOT NULL
            );
            ALTER TABLE drift_bottles ADD COLUMN daily_prompt_date TEXT;
            ALTER TABLE drift_bottles ADD COLUMN daily_prompt_id TEXT;
            ALTER TABLE drift_bottles ADD COLUMN daily_prompt_json TEXT;
        `);
    }
};
