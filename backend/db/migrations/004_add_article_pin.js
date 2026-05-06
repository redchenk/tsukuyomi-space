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
    version: '004',
    name: 'add_article_pin',
    up(db) {
        addColumnIfMissing(db, 'articles', 'pinned_at', 'DATETIME');
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_articles_pin_publish
                ON articles(pinned_at DESC, publish_date DESC, created_at DESC);
        `);
    }
};
