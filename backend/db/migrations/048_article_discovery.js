module.exports = {
    version: '048', name: 'article_discovery',
    up(db) {
        const added = db.prepare("INSERT OR IGNORE INTO article_categories(name) VALUES ('任务')").run();
        if (added.changes) db.prepare('UPDATE article_category_revision SET version = version + 1 WHERE id = 1').run();
        db.exec(`
            CREATE TABLE article_discovery_state(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
            INSERT INTO article_discovery_state VALUES(1,1);
            CREATE TABLE article_discovery_snapshots(id TEXT PRIMARY KEY, day TEXT NOT NULL, created_at INTEGER NOT NULL, revision INTEGER NOT NULL);
            CREATE TABLE article_discovery_items(snapshot_id TEXT NOT NULL REFERENCES article_discovery_snapshots(id) ON DELETE CASCADE,
                article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, position INTEGER NOT NULL,
                score REAL NOT NULL, recommended INTEGER NOT NULL, slot TEXT NOT NULL, routine INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(snapshot_id,article_id));
            CREATE INDEX idx_discovery_order ON article_discovery_items(snapshot_id,position);
            CREATE TABLE article_discovery_receipts(day TEXT NOT NULL, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                actor TEXT NOT NULL, network TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, bucket INTEGER NOT NULL,
                seen_at INTEGER NOT NULL, did_read INTEGER NOT NULL DEFAULT 0, did_like INTEGER NOT NULL DEFAULT 0, did_bookmark INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(day,article_id,actor));
            CREATE TABLE article_discovery_aliases(day TEXT NOT NULL,article_id INTEGER NOT NULL,identity TEXT NOT NULL,actor TEXT NOT NULL,
                PRIMARY KEY(day,article_id,identity),FOREIGN KEY(day,article_id,actor) REFERENCES article_discovery_receipts(day,article_id,actor) ON DELETE CASCADE);
            CREATE INDEX idx_discovery_network ON article_discovery_receipts(day,article_id,network);
            CREATE TABLE article_discovery_daily(day TEXT NOT NULL, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                source TEXT NOT NULL, bucket INTEGER NOT NULL, impressions INTEGER NOT NULL DEFAULT 0, reads INTEGER NOT NULL DEFAULT 0,
                likes INTEGER NOT NULL DEFAULT 0, bookmarks INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(day,article_id,source,bucket));
            CREATE INDEX idx_discovery_daily_article ON article_discovery_daily(article_id,day);
        `);
    }
};
