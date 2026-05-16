const { createSlug } = require('../../utils/slug');

function columnNames(db, tableName) {
    return db.pragma(`table_info('${tableName}')`).map(col => col.name);
}

module.exports = {
    version: '006',
    name: 'add_article_slug',
    up(db) {
        const columns = columnNames(db, 'articles');
        if (!columns.includes('slug')) {
            db.exec('ALTER TABLE articles ADD COLUMN slug TEXT');
        }
        db.exec('CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)');

        const rows = db.prepare('SELECT id, title, slug FROM articles').all();
        const update = db.prepare('UPDATE articles SET slug = ? WHERE id = ?');
        const seen = new Map();
        for (const row of rows) {
            const base = createSlug(row.slug || row.title, `article-${row.id}`);
            const count = seen.get(base) || 0;
            seen.set(base, count + 1);
            update.run(count ? `${base}-${count + 1}` : base, row.id);
        }
    }
};
