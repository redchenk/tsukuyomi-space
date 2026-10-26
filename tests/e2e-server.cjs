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
process.env.APP_RELEASES_OFFLINE = 'true';
process.env.PARTNER_OAUTH_ISSUER = `http://127.0.0.1:${process.env.PORT}`;

// Load configuration only after the test environment is set. Uploads and the
// SQLite database belong to this disposable fixture, never the developer's data.
const config = require('../backend/config');
// The isolated browser fixture never connects to a real SMTP provider.
config.smtp.user = 'fixture-sender@example.test';
config.smtp.pass = 'fixture-only';
const fixtureMailer = require('../backend/services/mailer');
for (const name of ['sendCampaignEmail', 'sendNotificationEmail', 'sendVerificationEmail', 'sendPlayTestInvitation']) fixtureMailer[name] = async () => {};
// Only progress tests emulate the private object store. The real image route,
// authentication, validation and database receipt still run in this fixture.
const fixtureRequest = new (require('node:async_hooks').AsyncLocalStorage)();
const imageObjects = new Map();
const objectStorage = require('../backend/services/object-storage');
const realStorage = { ...objectStorage };
objectStorage.isConfigured = () => fixtureRequest.getStore() === true || realStorage.isConfigured();
objectStorage.putObject = async options => {
    if (fixtureRequest.getStore() !== true || !options.privateRead) return realStorage.putObject(options);
    const key = `private-fixture/${options.id}`;
    imageObjects.set(key, { buffer: options.buffer, mimeType: options.mimeType });
    return { key };
};
objectStorage.getObject = async key => imageObjects.get(key) || realStorage.getObject(key);
objectStorage.deleteObject = async key => imageObjects.delete(key) || realStorage.deleteObject(key);
const sourceRoot = config.projectRoot;
const fixtureRoot = path.join(dataDir, 'public');
fs.mkdirSync(path.join(fixtureRoot, 'dist'), { recursive: true });
fs.symlinkSync(process.env.E2E_FRONTEND_ARTIFACT || path.join(sourceRoot, 'dist/frontend'), path.join(fixtureRoot, 'dist/frontend'), process.platform === 'win32' ? 'junction' : 'dir');
for (const name of ['lib', 'models']) {
    if (fs.existsSync(path.join(sourceRoot, name))) fs.symlinkSync(path.join(sourceRoot, name), path.join(fixtureRoot, name), process.platform === 'win32' ? 'junction' : 'dir');
}
fs.mkdirSync(path.join(fixtureRoot, 'assets/uploads'), { recursive: true });
for (const entry of fs.readdirSync(path.join(sourceRoot, 'assets'), { withFileTypes: true })) {
    if (entry.name === 'uploads') continue;
    const source = path.join(sourceRoot, 'assets', entry.name), target = path.join(fixtureRoot, 'assets', entry.name);
    if (entry.isDirectory()) fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
    else if (entry.isFile()) fs.copyFileSync(source, target);
}
for (const name of ['favicon.ico', 'site.webmanifest', 'live2d-core.js']) if (fs.existsSync(path.join(sourceRoot, name))) fs.copyFileSync(path.join(sourceRoot, name), path.join(fixtureRoot, name));
config.projectRoot = fixtureRoot;
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
// Browser scenarios need independent identities: the drift quota is per user,
// and a full Chromium + mobile WebKit run must not consume a shared account.
for (const project of ['chromium', 'chromium-mobile', 'webkit-mobile']) {
    for (const scenario of ['keyboard', 'themes']) {
        for (const role of ['owner', 'reader']) {
            const username = `drift-${scenario}-${role}-${project}`;
            db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)')
                .run(username, username, `${username}@example.test`, bcrypt.hashSync('mem0-test-password', 4), 'user');
        }
    }
}
// A legacy manually marked invitation has no delivery receipt until explicitly sent.
db.prepare('INSERT INTO play_test_applications(id,email,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('play-invitation-legacy', 'legacy-invitation@example.test', 'invited', '2026-10-23', new Date().toISOString(), new Date().toISOString());
// Mail campaign tests exercise the persistent queue against the fixture sink.
{
    for (let i = 1; i <= 12; i++) {
        const id = `campaign-e2e-${String(i).padStart(2, '0')}`;
        db.prepare('INSERT INTO users(id,username,nickname,email,password_hash,role) VALUES(?,?,?,?,?,?)')
            .run(id, id, `月下旅人 ${i}`, `${id}@example.test`, 'fixture', 'user');
    }
    require('../backend/services/mail-campaigns').start();
}
// Stable login names with a server-selected article task on the current day.
// The disposable fixture exercises real rewards without a production test hook.
const articleTaskGrowth = require('../backend/services/user-growth');
for (const name of ['article-task-like', 'article-task-bookmark']) {
    let assigned = false;
    const password = bcrypt.hashSync('article-task-password', 4);
    for (let i = 0; i < 100; i++) {
        const id = `${name}-${i}`;
        db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)')
            .run(id, id, `${id}@example.test`, password, 'user');
        if (articleTaskGrowth.getState(id).today.tasks[2].key !== 'daily_article_engage') continue;
        db.prepare('UPDATE users SET username=? WHERE id=?').run(name, id);
        assigned = true;
        break;
    }
    if (!assigned) throw new Error('Could not seed article task fixture');
}
db.prepare('INSERT INTO articles(id,title,content,author_id,status) VALUES(?,?,?,?,?)')
    .run(987601, '成长任务验收文章', '这是一篇用于验证点赞或收藏任务的公开文章。', 'e2e-user-001', 'published');
db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)')
    .run('upload-super-admin', 'upload-super-admin', 'upload-super-admin@example.test', bcrypt.hashSync('upload-super-password', 4), 'super_admin');
require('../backend/services/partner-oauth').registerClient({
    id: 'e2e-partner', name: '第八千代测试应用', redirectUris: ['https://partner.example.test/callback'], secret: 'e'.repeat(43)
});
for (const project of ['chromium', 'chromium-mobile', 'webkit-mobile']) {
    const id = `diary-cross-device-${project}`;
    db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)')
      .run(id, id, id + '@example.test', bcrypt.hashSync('mem0-test-password', 4), 'user');
    const chat = require('../backend/repositories/room-chat-repository');
    db.transaction(() => {
        for (let i = 0; i < 130; i++) chat.saveTurn(id, { turnId: `diary-${i}`, userMessage: i === 0 ? '手机早上说的早餐和旅行计划' : `跨设备交流第${i}轮`, assistantMessage: i === 129 ? '手机晚上的月亮和晚安' : `回复第${i}轮` });
    })();
}
for (const username of ['memory-414-chromium', 'memory-414-webkit-iphone11', 'mem0-browser', 'mem0-isolated', 'mem0-fallback-browser', 'turn-context-account', 'feedback-browser', 'reply-owner', 'reply-reader', 'reply-writer',
    'memory-source-local-desktop', 'memory-source-local-mobile', 'memory-source-cloud', 'memory-source-retry',
    'terminal-nickname-desktop', 'terminal-nickname-mobile', 'nickname-own-desktop', 'nickname-own-mobile']) {
    db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(username, username, username + '@example.test', bcrypt.hashSync('mem0-test-password', 4), 'user');
}
db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)')
    .run('notify-staff', bcrypt.hashSync('notify-staff-password', 4), 'admin');
for (const username of ['notify-staff', 'notify-site-admin']) {
    db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        .run(username, username, username + '@example.test', bcrypt.hashSync('notify-staff-password', 4), 'admin');
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
const server = require('node:http').createServer((req, res) => {
    // A test-only response delay lets native XHR send its body before the API
    // acknowledgement. Other suites and all production servers stay unaffected.
    if (req.headers['x-upload-fixture-delay'] === '1800' && ['POST', 'PUT'].includes(req.method)
        && ['/api/assets', '/api/user/avatar', '/api/articles', '/api/room/chat/images'].includes(req.url.split('?')[0])) {
        const end = res.end.bind(res);
        res.end = (...args) => { setTimeout(() => end(...args), 1800); return res; };
    }
    fixtureRequest.run(req.headers['x-upload-fixture-delay'] === '1800' && req.url.split('?')[0] === '/api/room/chat/images', () => app(req, res));
}).listen(Number(process.env.PORT), process.env.HOST, () => {
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
