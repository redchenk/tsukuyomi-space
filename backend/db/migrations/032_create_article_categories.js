module.exports = {
    version: '032',
    name: 'create_article_categories',
    up(db) {
        db.exec(`
            CREATE TABLE article_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                protected INTEGER NOT NULL DEFAULT 0 CHECK (protected IN (0, 1))
            );
            CREATE TABLE article_category_revision (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            );
            INSERT INTO article_category_revision (id, version) VALUES (1, 1);
        `);
        const insert = db.prepare('INSERT OR IGNORE INTO article_categories (name, protected) VALUES (?, ?)');
        for (const name of ['公告', '传说', '技术', '二创', '其他']) insert.run(name, name === '其他' ? 1 : 0);
        // Keep legacy custom categories so existing articles remain editable.
        for (const row of db.prepare("SELECT DISTINCT category FROM articles WHERE category IS NOT NULL AND trim(category) != '' ORDER BY id").all()) {
            const name = row.category.trim().normalize('NFC');
            insert.run(name, 0);
            const canonical = db.prepare('SELECT name FROM article_categories WHERE name = ?').get(name).name;
            db.prepare('UPDATE articles SET category = ? WHERE category = ?').run(canonical, row.category);
        }
        db.prepare("UPDATE articles SET category = '其他' WHERE category IS NULL OR trim(category) = ''").run();
    }
};
