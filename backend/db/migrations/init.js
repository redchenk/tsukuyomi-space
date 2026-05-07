const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../../config');
const db = require('../index');

const MIGRATION_TABLE = 'schema_migrations';

function ensureMigrationTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
            version TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

function loadMigrations() {
    return fs.readdirSync(__dirname)
        .filter(file => /^\d+_.+\.js$/.test(file))
        .sort()
        .map(file => {
            const migration = require(path.join(__dirname, file));
            const version = file.match(/^(\d+)_/)[1];
            if (!migration || migration.version !== version || typeof migration.up !== 'function') {
                throw new Error(`Invalid migration module: ${file}`);
            }
            return {
                version,
                name: migration.name || path.basename(file, '.js'),
                up: migration.up
            };
        });
}

function runMigrations() {
    ensureMigrationTable();

    const applied = new Set(
        db.prepare(`SELECT version FROM ${MIGRATION_TABLE}`).all().map(row => row.version)
    );

    for (const migration of loadMigrations()) {
        if (applied.has(migration.version)) continue;

        const applyMigration = db.transaction(() => {
            migration.up(db);
            db.prepare(`
                INSERT INTO ${MIGRATION_TABLE} (version, name)
                VALUES (?, ?)
            `).run(migration.version, migration.name);
        });

        applyMigration();
        console.log(`Applied database migration ${migration.version}_${migration.name}`);
    }
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
    insert.run('visitPopupEnabled', 'false');
    insert.run('visitPopupTitle', '欢迎来到月读空间');
    insert.run('visitPopupContent', '');
    insert.run('visitPopupButton', '我知道了');
}

function initDatabase() {
    runMigrations();
    ensureDefaultAdminUser();
    ensureDefaultAdminAccount();
    seedDefaultArticles();
    seedSiteSettings();
}

module.exports = {
    initDatabase,
    loadMigrations,
    runMigrations
};
