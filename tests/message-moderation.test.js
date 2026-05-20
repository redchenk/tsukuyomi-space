const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-message-moderation-'));

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'tsukuyomi.db');
process.env.JWT_SECRET = 'test-message-moderation-secret-with-enough-length';
process.env.REDIS_URL = '';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'admin-test-password';
process.env.ENABLE_FRONTEND_DIST = 'false';

const { createApp } = require('../backend/app');
const db = require('../backend/db');

let server;
let baseUrl;

function jsonHeaders(token) {
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

async function request(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const body = await response.json();
    return { response, body };
}

async function postJson(pathname, body, token) {
    return request(pathname, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify(body)
    });
}

async function login(pathname, payload) {
    const { response, body } = await postJson(pathname, payload);
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    return body.data.token;
}

async function main() {
    const app = createApp();
    server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const userPayload = {
        username: `moderation-${Date.now()}`,
        email: `moderation-${Date.now()}@example.test`,
        password: 'user-test-password'
    };

    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run('moderation-user', userPayload.username, userPayload.email, bcrypt.hashSync(userPayload.password, 10), 'user');

    const userToken = await login('/api/auth/login', {
        username: userPayload.email,
        password: userPayload.password
    });
    const adminToken = await login('/api/admin/login', {
        username: 'admin',
        password: 'admin-test-password'
    });

    const safeContent = `moderation-safe-${Date.now()}`;
    const safeCreateRes = await postJson('/api/messages', { content: safeContent }, userToken);
    assert.equal(safeCreateRes.response.status, 201);
    assert.equal(safeCreateRes.body.data.status, 'approved');

    const safeVisibleRes = await request('/api/messages/plaza/test-safe');
    assert.equal(safeVisibleRes.response.status, 200);
    const safeVisible = safeVisibleRes.body.data.find(item => item.id === safeCreateRes.body.data.id);
    assert.ok(safeVisible);
    assert.equal(safeVisible.content, safeContent);

    const riskyContent = `moderation-check-${Date.now()} 诈骗`;
    const riskyCreateRes = await postJson('/api/messages', { content: riskyContent }, userToken);
    assert.equal(riskyCreateRes.response.status, 201);
    assert.equal(riskyCreateRes.body.data.status, 'pending');
    assert.match(riskyCreateRes.body.message, /审核/);

    const hiddenRes = await request('/api/messages/plaza/test-before');
    assert.equal(hiddenRes.response.status, 200);
    assert.equal(hiddenRes.body.data.some(item => item.id === riskyCreateRes.body.data.id), false);

    const adminListRes = await request('/api/admin/messages', {
        headers: jsonHeaders(adminToken)
    });
    assert.equal(adminListRes.response.status, 200);
    const pending = adminListRes.body.data.find(item => item.id === riskyCreateRes.body.data.id);
    assert.ok(pending);
    assert.equal(pending.status, 'pending');

    const approveRes = await postJson(`/api/admin/messages/${riskyCreateRes.body.data.id}/approve`, {}, adminToken);
    assert.equal(approveRes.response.status, 200);
    assert.equal(approveRes.body.success, true);

    const visibleRes = await request('/api/messages/plaza/test-after');
    assert.equal(visibleRes.response.status, 200);
    const visible = visibleRes.body.data.find(item => item.id === riskyCreateRes.body.data.id);
    assert.ok(visible);
    assert.equal(visible.status, 'approved');
    assert.equal(visible.content, riskyContent);

    console.log('message moderation flow ok');
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        db.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
    });
