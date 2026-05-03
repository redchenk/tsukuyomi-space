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
