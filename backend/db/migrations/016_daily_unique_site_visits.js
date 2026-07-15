module.exports = {
    version: '016',
    name: 'daily_unique_site_visits',
    up(db) {
        const columns = new Set(
            db.prepare('PRAGMA table_info(stats)').all().map(column => column.name)
        );

        if (!columns.has('visit_day')) {
            db.exec('ALTER TABLE stats ADD COLUMN visit_day TEXT');
        }
        if (!columns.has('browser_key')) {
            db.exec('ALTER TABLE stats ADD COLUMN browser_key TEXT');
        }

        db.exec(`
            UPDATE stats
            SET visit_day = date(created_at, '+8 hours')
            WHERE event_type = 'view'
              AND (visit_day IS NULL OR visit_day = '');

            DELETE FROM stats
            WHERE event_type = 'view'
              AND id NOT IN (
                  SELECT MIN(id)
                  FROM stats
                  WHERE event_type = 'view'
                  GROUP BY
                      COALESCE(NULLIF(visitor_key, ''), CAST(id AS TEXT)),
                      COALESCE(NULLIF(visit_day, ''), date(created_at, '+8 hours'))
              );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_daily_unique_visitor
                ON stats(event_type, visit_day, visitor_key)
                WHERE event_type = 'view';
            CREATE INDEX IF NOT EXISTS idx_stats_daily_browser
                ON stats(event_type, visit_day, browser_key);
        `);
    }
};
