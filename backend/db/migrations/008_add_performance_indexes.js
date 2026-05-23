module.exports = {
    version: '008',
    name: 'add_performance_indexes',
    up(db) {
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_articles_public_order
                ON articles(pinned_at, publish_date DESC, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_articles_category_order
                ON articles(category, pinned_at, publish_date DESC, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_articles_author_order
                ON articles(author_id, pinned_at, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_articles_slug
                ON articles(slug);

            CREATE INDEX IF NOT EXISTS idx_messages_plaza_status_created
                ON messages(article_id, status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_messages_article_status_created
                ON messages(article_id, status, created_at);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_message_likes_unique_user
                ON message_likes(message_id, user_id);

            CREATE INDEX IF NOT EXISTS idx_stats_type_created
                ON stats(event_type, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_article_assets_owner_created
                ON article_assets(owner_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_article_assets_created
                ON article_assets(created_at DESC);
        `);
    }
};
