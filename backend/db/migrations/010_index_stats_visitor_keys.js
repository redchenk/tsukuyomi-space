module.exports = {
    version: '010',
    name: 'index_stats_visitor_keys',
    up(db) {
        const columns = new Set(
            db.prepare('PRAGMA table_info(stats)').all().map(column => column.name)
        );

        if (!columns.has('visitor_key')) {
            db.exec('ALTER TABLE stats ADD COLUMN visitor_key TEXT');
        }
        if (!columns.has('page_path')) {
            db.exec('ALTER TABLE stats ADD COLUMN page_path TEXT');
        }
        if (!columns.has('user_agent')) {
            db.exec('ALTER TABLE stats ADD COLUMN user_agent TEXT');
        }

        db.exec(`
            UPDATE stats
            SET
                visitor_key = COALESCE(
                    NULLIF(visitor_key, ''),
                    NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.ip') END, ''),
                    NULLIF(event_data, ''),
                    CAST(id AS TEXT)
                ),
                page_path = COALESCE(
                    NULLIF(page_path, ''),
                    NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.path') END, '')
                ),
                user_agent = COALESCE(
                    NULLIF(user_agent, ''),
                    NULLIF(CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.userAgent') END, '')
                )
            WHERE event_type = 'view'
              AND (visitor_key IS NULL OR visitor_key = '');

            CREATE INDEX IF NOT EXISTS idx_stats_view_visitor
                ON stats(event_type, visitor_key);
            CREATE INDEX IF NOT EXISTS idx_stats_view_created_visitor
                ON stats(event_type, created_at DESC, visitor_key);
        `);
    }
};
