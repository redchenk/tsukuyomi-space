module.exports = {
    version: '022',
    name: 'add_article_published_at',
    up(db) {
        const columns = new Set(
            db.prepare('PRAGMA table_info(articles)').all().map(column => column.name)
        );
        if (!columns.has('published_at')) {
            db.exec('ALTER TABLE articles ADD COLUMN published_at DATETIME');
        }

        db.exec(`
            UPDATE articles
            SET published_at = CASE
                WHEN COALESCE(status, 'published') = 'published' THEN COALESCE(
                    NULLIF(created_at, ''),
                    CASE
                        WHEN length(trim(COALESCE(publish_date, ''))) >= 16 THEN publish_date
                        WHEN length(trim(COALESCE(publish_date, ''))) >= 10
                            THEN substr(publish_date, 1, 10) || ' 00:00:00'
                    END,
                    CURRENT_TIMESTAMP
                )
                ELSE NULL
            END
            WHERE published_at IS NULL;

            CREATE INDEX IF NOT EXISTS idx_articles_published_at
                ON articles(published_at DESC);
        `);
    }
};
