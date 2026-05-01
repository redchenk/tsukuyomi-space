const bcrypt = require('bcryptjs');
const config = require('../../config');
const db = require('../index');

function columnNames(tableName) {
    return db.pragma(`table_info('${tableName}')`).map(col => col.name);
}

function addColumnIfMissing(tableName, columnName, definition) {
    const columns = columnNames(tableName);
    if (columns.length && !columns.includes(columnName)) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
}

function createCoreTables() {
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
            category TEXT DEFAULT '公告',
            tags TEXT DEFAULT '[]',
            author_id TEXT,
            publish_date TEXT,
            read_time TEXT DEFAULT '5 min',
            view_count INTEGER DEFAULT 0,
            cover_image TEXT,
            status TEXT DEFAULT 'published',
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

function runCompatibilityMigrations() {
    addColumnIfMissing('users', 'bio', "TEXT DEFAULT ''");
    addColumnIfMissing('messages', 'article_id', 'INTEGER');
    addColumnIfMissing('messages', 'author', "TEXT DEFAULT '匿名'");
    addColumnIfMissing('messages', 'status', "TEXT DEFAULT 'approved'");
    addColumnIfMissing('messages', 'updated_at', 'DATETIME');
}

function ensureDefaultAdminUser() {
    const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(config.defaultAdmin.username);
    if (adminExists) return;

    if (config.isProduction && !config.defaultAdmin.password) {
        throw new Error('ADMIN_PASSWORD must be set before creating the first admin user in production.');
    }

    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        'admin-001',
        config.defaultAdmin.username,
        config.defaultAdmin.email,
        bcrypt.hashSync(config.defaultAdmin.password || 'admin123', 10),
        'admin'
    );
    console.log(`Default admin user created: ${config.defaultAdmin.username}`);
}

function ensureDefaultAdminAccount() {
    const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;
    if (adminCount === 0) {
        if (config.isProduction && !config.defaultAdmin.password) {
            throw new Error('ADMIN_PASSWORD must be set before creating the first admin account in production.');
        }
        db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)')
            .run(config.defaultAdmin.username, bcrypt.hashSync(config.defaultAdmin.password || 'admin123', 10), 'super_admin');
        console.log(`Default admin account created: ${config.defaultAdmin.username}`);
    }
}

function seedDefaultArticles() {
    const articleCount = db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
    if (articleCount > 0) return;

    const insert = db.prepare(`
        INSERT INTO articles (title, excerpt, content, category, tags, publish_date, read_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const seed = db.transaction(() => {
        insert.run(
            '欢迎来到月读空间',
            '这里是月读空间的第一篇文章',
            '月读空间是一个承载梦、记忆与交流的虚拟空间。欢迎在这里阅读、留言，也欢迎慢慢留下自己的痕迹。',
            '公告',
            JSON.stringify(['公告', '欢迎']),
            '2024-01-01',
            '3 min'
        );
        insert.run(
            '辉夜姬的传说',
            '来自月之都的公主，跨越千年的故事',
            '在遥远的传说里，月亮承载着归途、等待与重逢。这里保存这些轻柔的片段，也保存每一次抵达。',
            '传说',
            JSON.stringify(['辉夜姬', '传说']),
            '2024-01-02',
            '5 min'
        );
        insert.run(
            '月读空间技术札记',
            '探索虚拟空间背后的实现',
            '这个项目把前端页面、用户系统、文章、留言、统计和智能服务串在一起。后续会继续让结构更清晰，体验更稳定。',
            '技术',
            JSON.stringify(['技术', '札记']),
            '2024-01-03',
            '4 min'
        );
    });
    seed();
    console.log('Default articles initialized');
}

function seedSiteSettings() {
    const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM site_settings').get().count;
    if (settingsCount > 0) return;

    const insert = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)');
    insert.run('siteTitle', '月读空间');
    insert.run('siteAnnouncement', '欢迎访问月读空间');
    insert.run('sakuraEffect', 'true');
    insert.run('scanlineEffect', 'true');
}

function initDatabase() {
    createCoreTables();
    runCompatibilityMigrations();
    ensureDefaultAdminUser();
    ensureDefaultAdminAccount();
    seedDefaultArticles();
    seedSiteSettings();
}

module.exports = {
    initDatabase
};
