module.exports = {
    version: '001',
    name: 'create_core_tables',
    up(db) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                avatar TEXT DEFAULT '',
                bio TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS email_verification_codes (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                purpose TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                used_at INTEGER,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                excerpt TEXT,
                content TEXT,
                content_format TEXT DEFAULT 'markdown',
                category TEXT DEFAULT '公告',
                tags TEXT DEFAULT '[]',
                author_id TEXT,
                publish_date TEXT,
                read_time TEXT DEFAULT '5 min',
                view_count INTEGER DEFAULT 0,
                cover_image TEXT,
                cover_image_asset_id TEXT,
                status TEXT DEFAULT 'published',
                pinned_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author TEXT NOT NULL DEFAULT '匿名',
                content TEXT NOT NULL,
                user_id TEXT,
                parent_id INTEGER,
                like_count INTEGER DEFAULT 0,
                article_id INTEGER,
                status TEXT DEFAULT 'approved',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (parent_id) REFERENCES messages(id),
                FOREIGN KEY (article_id) REFERENCES articles(id)
            );

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

            CREATE TABLE IF NOT EXISTS message_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (message_id) REFERENCES messages(id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(message_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                event_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS friend_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS site_settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }
};
