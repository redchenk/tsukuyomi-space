const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-test-'));

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'tsukuyomi.db');
process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'admin-test-password';
process.env.ENABLE_FRONTEND_DIST = 'false';
process.env.ROOM_WEATHER_OFFLINE = 'true';

const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { normalizeChatUrl } = require('../backend/services/llm');

let server;
let baseUrl;
let userToken;
let adminToken;
let articleId;
let messageId;

function jsonHeaders(token) {
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

async function request(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    return { response, body };
}

async function postJson(pathname, body, token) {
    return request(pathname, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify(body)
    });
}

async function login(pathname, username, password) {
    const { response, body } = await postJson(pathname, { username, password });
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    return body.data.token;
}

before(async () => {
    const app = createApp();
    server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run('user-001', 'normal-user', 'normal@example.test', bcrypt.hashSync('user-test-password', 10), 'user');

    userToken = await login('/api/auth/login', 'normal-user', 'user-test-password');
    adminToken = await login('/api/admin/login', 'admin', 'admin-test-password');
});

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('database initialization', () => {
    it('creates core tables and seeds defaults', () => {
        const tables = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table'
            ORDER BY name
        `).all().map(row => row.name);

        for (const table of ['schema_migrations', 'users', 'articles', 'messages', 'message_likes', 'admins', 'site_settings']) {
            assert.ok(tables.includes(table), `${table} table should exist`);
        }

        const expectedVersions = require('../backend/db/migrations/init')
            .loadMigrations()
            .map(migration => migration.version);
        const migrations = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
        assert.deepEqual(migrations.map(row => row.version), expectedVersions);
        assert.ok(db.prepare('SELECT COUNT(*) AS count FROM articles').get().count >= 3);
        assert.equal(db.prepare('SELECT role FROM users WHERE username = ?').get('admin').role, 'admin');
    });
});

describe('auth API', () => {
    it('logs in a normal user and rejects invalid credentials', async () => {
        const ok = await postJson('/api/auth/login', {
            username: 'normal-user',
            password: 'user-test-password'
        });
        assert.equal(ok.response.status, 200);
        assert.equal(ok.body.data.user.role, 'user');
        assert.ok(ok.body.data.token);

        const bad = await postJson('/api/auth/login', {
            username: 'normal-user',
            password: 'wrong-password'
        });
        assert.equal(bad.response.status, 401);
        assert.equal(bad.body.success, false);
    });

    it('returns the current user for a bearer token', async () => {
        const { response, body } = await request('/api/auth/me', {
            headers: jsonHeaders(userToken)
        });

        assert.equal(response.status, 200);
        assert.equal(body.data.username, 'normal-user');
    });
});

describe('articles API', () => {
    it('lists seeded articles', async () => {
        const { response, body } = await request('/api/articles?limit=2');

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.ok(Array.isArray(body.data));
        assert.ok(body.data.length > 0);
        assert.equal(body.pagination.limit, 2);
    });

    it('allows an authenticated user to create and read a non-admin article', async () => {
        const created = await postJson('/api/articles', {
            title: 'Test Article',
            excerpt: 'Short summary',
            content: 'Hello from the API test.',
            category: '\u968f\u7b14',
            tags: ['test'],
            read_time: '1 min'
        }, userToken);

        assert.equal(created.response.status, 201);
        assert.equal(created.body.success, true);
        articleId = created.body.data.id;

        const fetched = await request(`/api/articles/${articleId}`);
        assert.equal(fetched.response.status, 200);
        assert.equal(fetched.body.data.title, 'Test Article');
        assert.deepEqual(fetched.body.data.tags, ['test']);
    });

    it('prevents a normal user from publishing an announcement article', async () => {
        const result = await postJson('/api/articles', {
            title: 'Forbidden Announcement',
            category: '\u516c\u544a'
        }, userToken);

        assert.equal(result.response.status, 403);
        assert.equal(result.body.success, false);
    });
});

describe('messages API', () => {
    it('creates, lists, likes, and replies to messages', async () => {
        const created = await postJson('/api/messages', {
            content: 'A message from tests',
            article_id: articleId
        }, userToken);
        assert.equal(created.response.status, 201);
        messageId = created.body.data.id;

        const list = await request(`/api/messages?article_id=${articleId}`);
        assert.equal(list.response.status, 200);
        assert.ok(list.body.data.some(item => item.id === messageId));

        const liked = await postJson(`/api/messages/${messageId}/like`, {}, userToken);
        assert.equal(liked.response.status, 200);
        assert.equal(liked.body.data.like_count, 1);

        const duplicateLike = await postJson(`/api/messages/${messageId}/like`, {}, userToken);
        assert.equal(duplicateLike.response.status, 400);

        const reply = await postJson(`/api/messages/${messageId}/reply`, {
            content: 'A reply from tests'
        }, userToken);
        assert.equal(reply.response.status, 201);
        assert.equal(reply.body.data.parent_id, messageId);
    });
});

describe('room world API', () => {
    it('returns a deterministic world state when weather is offline', async () => {
        const { response, body } = await request('/api/room/world');

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.source, 'local-fallback');
        assert.ok(['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'].includes(body.data.weather));
        assert.ok(['dawn', 'day', 'dusk', 'night'].includes(body.data.timePhase));
        assert.ok(['spring', 'summer', 'autumn', 'winter'].includes(body.data.season));
        assert.equal(body.data.location.timezone, 'Asia/Hong_Kong');
    });

    it('does not proxy room LLM or TTS requests through the server', async () => {
        const { response, body } = await postJson('/api/room/chat', {
            message: '我这边今天的天气怎么样？',
            conversation: [],
            settings: {},
            weatherLocation: {
                lat: 39.9042,
                lon: 116.4074,
                timezone: 'Asia/Shanghai'
            }
        });

        assert.equal(response.status, 410);
        assert.equal(body.success, false);
        assert.match(body.message, /browser/i);

        const tts = await postJson('/api/room/tts', {
            text: 'hello',
            settings: { apiKey: 'secret' }
        });
        assert.equal(tts.response.status, 410);
        assert.equal(tts.body.success, false);
    });
});

describe('chat API endpoint allowlist', () => {
    it('normalizes supported provider chat endpoints', () => {
        assert.equal(
            normalizeChatUrl('https://api.openai.com/v1', 'gpt-4o-mini'),
            'https://api.openai.com/v1/chat/completions'
        );
        assert.equal(
            normalizeChatUrl('https://api.deepseek.com', 'deepseek-chat'),
            'https://api.deepseek.com/chat/completions'
        );
    });

    it('rejects arbitrary chat apiUrl values before proxying', async () => {
        for (const apiUrl of [
            'http://127.0.0.1:1/latest/meta-data',
            'https://example.com/chat/completions',
            'https://api.openai.com/v1/chat/completions?target=http://127.0.0.1'
        ]) {
            const { response, body } = await postJson('/api/chat', {
                message: 'hello',
                apiKey: 'test-key',
                apiUrl,
                model: 'test-model'
            });

            assert.equal(response.status, 400);
            assert.equal(body.success, false);
            assert.match(body.message, /LLM API/);
        }
    });
});

describe('admin API permissions', () => {
    it('requires authentication for admin APIs', async () => {
        const { response, body } = await request('/api/admin/stats');

        assert.equal(response.status, 401);
        assert.equal(body.code, 'UNAUTHORIZED');
    });

    it('rejects normal user tokens for admin APIs', async () => {
        const { response, body } = await request('/api/admin/stats', {
            headers: jsonHeaders(userToken)
        });

        assert.equal(response.status, 403);
        assert.equal(body.code, 'FORBIDDEN');
    });

    it('allows an admin token to access admin APIs', async () => {
        const me = await request('/api/admin/me', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(me.response.status, 200);
        assert.equal(me.body.data.username, 'admin');

        const articles = await request('/api/admin/articles', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(articles.response.status, 200);
        assert.ok(Array.isArray(articles.body.data));
    });
});

describe('legacy page paths', () => {
    it('does not redirect removed static page routes', async () => {
        for (const pathname of ['/room.html', '/article.html?id=1', '/pages/room.html', '/pages/stage']) {
            const { response } = await request(pathname, { redirect: 'manual' });
            assert.equal(response.status, 404, `${pathname} should be gone`);
        }
    });
});
