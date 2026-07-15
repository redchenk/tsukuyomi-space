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
const { generateToken } = require('../backend/middleware/auth');
const { getClientIp } = require('../backend/middleware/security');

let server;
let baseUrl;

function jsonHeaders(token) {
    return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(baseUrl ? { Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin' } : {}),
        ...(token ? authHeader(token) : {})
    };
}

function authHeader(token) {
    if (String(token || '').includes('=')) return { Cookie: token };
    return { Authorization: `Bearer ${token}` };
}

function authCookieFrom(response) {
    const header = response.headers.get('set-cookie') || '';
    return header
        .split(/,(?=\s*[^;,]+=)/)
        .map(part => part.split(';')[0].trim())
        .filter(pair => pair && !pair.endsWith('='))
        .join('; ');
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
    return body.data?.token || authCookieFrom(response);
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

    const attackPayloads = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '%3Csvg%20onload%3Dalert(1)%3E',
        '&#x3c;iframe srcdoc="<script>alert(1)</script>">',
        '&#999999999999999999999;<img src=x onerror=alert(1)>',
        '<a href="java\nscript:alert(1)">click</a>',
        "{{constructor.constructor('alert(1)')()}}"
    ];
    for (const content of attackPayloads) {
        const blocked = await postJson('/api/messages', { content }, userToken);
        assert.equal(blocked.response.status, 422);
        assert.equal(blocked.body.success, false);
        assert.ok(['ACTIVE_MARKUP', 'CONTENT_TOO_LONG'].includes(blocked.body.code));
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages WHERE content = ?').get(content).count, 0);
    }

    const harmlessAngleText = await postJson('/api/messages', { content: '今天也很开心 <3' }, userToken);
    assert.equal(harmlessAngleText.response.status, 201);

    const tooLong = await postJson('/api/messages', { content: 'x'.repeat(2001) }, userToken);
    assert.equal(tooLong.response.status, 422);
    assert.equal(tooLong.body.code, 'CONTENT_TOO_LONG');

    const parseLimited = await postJson('/api/messages', { content: 'x'.repeat(20 * 1024) }, userToken);
    assert.equal(parseLimited.response.status, 413);

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

    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run('banned-user', 'banned-user', 'banned@example.test', bcrypt.hashSync('banned-password', 10), 'banned');
    const staleBannedToken = generateToken({ id: 'banned-user', username: 'banned-user', role: 'user' });
    const blockedSession = await request('/api/auth/me', { headers: jsonHeaders(staleBannedToken) });
    assert.equal(blockedSession.response.status, 403);
    assert.equal(blockedSession.body.code, 'ACCOUNT_DISABLED');
    const blockedLogin = await postJson('/api/auth/login', { username: 'banned-user', password: 'banned-password' });
    assert.equal(blockedLogin.response.status, 403);

    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run('rate-user', 'rate-user', 'rate@example.test', bcrypt.hashSync('rate-password', 10), 'user');
    const rateToken = generateToken({ id: 'rate-user', username: 'rate-user', role: 'user' });
    for (let index = 0; index < 12; index += 1) {
        const accepted = await postJson('/api/messages', { content: `rate-limit-${index}` }, rateToken);
        assert.equal(accepted.response.status, 201);
    }
    const rateLimited = await postJson('/api/messages', { content: 'rate-limit-blocked' }, rateToken);
    assert.equal(rateLimited.response.status, 429);

    assert.equal(getClientIp({
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-for': '198.51.100.27, 203.0.113.20' }
    }), '203.0.113.20');

    const health = await request('/api/health');
    assert.match(health.response.headers.get('content-security-policy') || '', /script-src 'self'/);

    console.log('message security and moderation flow ok');
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
