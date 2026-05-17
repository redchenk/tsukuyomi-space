function columnNames(db, tableName) {
    return db.pragma(`table_info('${tableName}')`).map(col => col.name);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
    const columns = columnNames(db, tableName);
    if (columns.length && !columns.includes(columnName)) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
}

module.exports = {
    version: '007',
    name: 'add_article_content_metadata',
    up(db) {
        addColumnIfMissing(db, 'articles', 'content_format', "TEXT DEFAULT 'markdown'");
        addColumnIfMissing(db, 'articles', 'cover_image_asset_id', 'TEXT');
        db.exec(`
            UPDATE articles
            SET content_format = 'markdown'
            WHERE content_format IS NULL OR content_format = '';
        `);
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_articles_content_format ON articles(content_format);

            CREATE TABLE IF NOT EXISTS article_assets (
                id TEXT PRIMARY KEY,
                article_id INTEGER,
                owner_id TEXT,
                asset_type TEXT NOT NULL,
                mime_type TEXT,
                url TEXT NOT NULL,
                storage_key TEXT,
                metadata TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (article_id) REFERENCES articles(id),
                FOREIGN KEY (owner_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS article_content_blocks (
                id TEXT PRIMARY KEY,
                article_id INTEGER NOT NULL,
                block_type TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                content_json TEXT NOT NULL DEFAULT '{}',
                asset_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
                FOREIGN KEY (asset_id) REFERENCES article_assets(id)
            );

            CREATE INDEX IF NOT EXISTS idx_article_assets_article ON article_assets(article_id);
            CREATE INDEX IF NOT EXISTS idx_article_blocks_article_order ON article_content_blocks(article_id, sort_order);
        `);
    }
};
