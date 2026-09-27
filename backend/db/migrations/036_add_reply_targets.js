module.exports = {
    version: '036',
    name: 'add_reply_targets',
    up(db) {
        // Nullable additions keep this migration small on the production server.
        db.exec(`
            ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;
            ALTER TABLE messages ADD COLUMN reply_to_author TEXT;
        `);
    }
};
