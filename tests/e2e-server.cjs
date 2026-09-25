const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-e2e-'));

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = process.env.PORT || '4174';
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'tsukuyomi.db');
process.env.JWT_SECRET = 'e2e-jwt-secret-with-more-than-32-characters';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'admin-test-password';
process.env.ROOM_WEATHER_OFFLINE = 'true';

const { createApp } = require('../backend/app');
const db = require('../backend/db');

function seedE2EUser() {
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get('e2e-user');
    if (exists) return;
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run('e2e-user-001', 'e2e-user', 'e2e@example.test', bcrypt.hashSync('e2e-password', 10), 'user');
}

const app = createApp();
seedE2EUser();
for (const username of ['mem0-browser', 'mem0-isolated']) {
    db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(username, username, username + '@example.test', bcrypt.hashSync('mem0-test-password', 4), 'user');
}
if (process.env.UI_PREVIEW_FIXTURES === 'true') {
    const article = require('./fixtures/editorial-article.cjs');
    db.prepare('UPDATE articles SET title = ?, content = ?, content_format = ?, cover_image = ?, read_time = ? WHERE id = ?')
        .run(article.title, article.content, article.content_format, article.cover_image, article.read_time, article.id);
    const insertMessage = db.prepare('INSERT INTO messages (author, content, user_id, status) VALUES (?, ?, ?, ?)');
    for (const content of ['今天也给日常留一点月光。', '一起分享喜欢的作品，期待下一次相遇。', '浅色与深色主题都应该清楚易读。']) {
        insertMessage.run('月下旅人', content, 'e2e-user-001', 'approved');
    }
}
const server = app.listen(Number(process.env.PORT), process.env.HOST, () => {
    const address = server.address();
    console.log(`E2E server listening on http://${address.address}:${address.port}`);
});

function shutdown() {
    server.close(() => {
        db.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
