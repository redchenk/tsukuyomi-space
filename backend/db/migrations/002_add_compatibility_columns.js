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
    version: '002',
    name: 'add_compatibility_columns',
    up(db) {
        addColumnIfMissing(db, 'users', 'bio', "TEXT DEFAULT ''");
        addColumnIfMissing(db, 'messages', 'article_id', 'INTEGER');
        addColumnIfMissing(db, 'messages', 'author', "TEXT DEFAULT '匿名'");
        addColumnIfMissing(db, 'messages', 'status', "TEXT DEFAULT 'approved'");
        addColumnIfMissing(db, 'messages', 'updated_at', 'DATETIME');
    }
};
