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
process.env.REDIS_URL = '';
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
let managedUserToken;
let adminToken;
let staffAdminToken;
let articleId;
let messageId;
let replyId;

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

async function patchJson(pathname, body, token) {
    return request(pathname, {
        method: 'PATCH',
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
        INSERT INTO users (id, username, email, password_hash, role, avatar)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('user-001', 'normal-user', 'normal@example.test', bcrypt.hashSync('user-test-password', 10), 'user', 'data:image/png;base64,test-avatar');
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role, bio)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('user-002', 'managed-user', 'managed@example.test', bcrypt.hashSync('managed-old-password', 10), 'user', 'managed test user');
    db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)')
        .run('staff-admin', bcrypt.hashSync('staff-test-password', 10), 'admin');

    userToken = await login('/api/auth/login', 'normal-user', 'user-test-password');
    managedUserToken = await login('/api/auth/login', 'managed-user', 'managed-old-password');
    adminToken = await login('/api/admin/login', 'admin', 'admin-test-password');
    staffAdminToken = await login('/api/admin/login', 'staff-admin', 'staff-test-password');
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

    it('blacklists a token after logout', async () => {
        const token = await login('/api/auth/login', 'normal-user', 'user-test-password');
        const loggedOut = await postJson('/api/auth/logout', {}, token);
        assert.equal(loggedOut.response.status, 200);

        const revoked = await request('/api/auth/me', {
            headers: jsonHeaders(token)
        });
        assert.equal(revoked.response.status, 401);
        assert.equal(revoked.body.code, 'TOKEN_REVOKED');
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

    it('allows an admin token to publish an announcement article', async () => {
        const result = await postJson('/api/articles', {
            title: 'Admin Announcement',
            excerpt: 'Announcement summary',
            content: 'Announcement content from tests.',
            category: '\u516c\u544a',
            read_time: '1 min'
        }, adminToken);

        assert.equal(result.response.status, 201);
        assert.equal(result.body.success, true);
        assert.equal(result.body.data.category, '\u516c\u544a');
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
        const listedMessage = list.body.data.find(item => item.id === messageId);
        assert.ok(listedMessage);
        assert.equal(listedMessage.avatar, 'data:image/png;base64,test-avatar');

        const liked = await postJson(`/api/messages/${messageId}/like`, {}, userToken);
        assert.equal(liked.response.status, 200);
        assert.equal(liked.body.data.like_count, 1);

        const duplicateLike = await postJson(`/api/messages/${messageId}/like`, {}, userToken);
        assert.equal(duplicateLike.response.status, 400);

        const reply = await postJson(`/api/messages/${messageId}/reply`, {
            content: 'A reply from tests'
        }, managedUserToken);
        assert.equal(reply.response.status, 201);
        replyId = reply.body.data.id;
        assert.equal(reply.body.data.parent_id, messageId);
        assert.equal(reply.body.data.article_id, articleId);

        const listWithReply = await request(`/api/messages?article_id=${articleId}`);
        assert.ok(listWithReply.body.data.some(item => item.id === reply.body.data.id));
    });
});

describe('notifications API', () => {
    it('records replies and likes as inbox notifications', async () => {
        const liked = await postJson(`/api/messages/${messageId}/like`, {}, managedUserToken);
        assert.equal(liked.response.status, 200);

        const inbox = await request('/api/user/notifications', {
            headers: jsonHeaders(userToken)
        });
        assert.equal(inbox.response.status, 200);
        assert.ok(inbox.body.unread >= 2);
        assert.ok(inbox.body.data.some(item => item.type === 'reply' && Number(item.related_message_id) === Number(replyId)));
        assert.ok(inbox.body.data.some(item => item.type === 'like' && Number(item.related_message_id) === Number(messageId)));

        const countBefore = inbox.body.unread;
        const firstUnread = inbox.body.data.find(item => item.unread);
        if (firstUnread) {
            const marked = await postJson(`/api/user/notifications/${firstUnread.id}/read`, {}, userToken);
            assert.equal(marked.response.status, 200);
            assert.ok(marked.body.unread <= countBefore - 1);
        }

        const cleared = await postJson('/api/user/notifications/read-all', {}, userToken);
        assert.equal(cleared.response.status, 200);
    });
});

describe('stats API', () => {
    it('records page views and returns public site counters', async () => {
        const recorded = await postJson('/api/stats/view', { path: '/hub' });
        assert.equal(recorded.response.status, 200);
        assert.equal(recorded.body.success, true);

        const { response, body } = await request('/api/stats');
        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.ok(body.data.articles >= 1);
        assert.ok(body.data.users >= 1);
        assert.ok(body.data.messages >= 1);
        assert.ok(body.data.todayViews >= 1);
        assert.ok(body.data.totalViews >= 1);
        assert.ok('weekViews' in body.data);
        assert.ok('articleViews' in body.data);
    });

    it('deduplicates repeated view records from the same visitor IP', async () => {
        const before = await request('/api/stats');
        const beforeToday = before.body.data.todayViews;
        const first = await request('/api/stats/view', {
            method: 'POST',
            headers: {
                ...jsonHeaders(),
                'x-forwarded-for': '203.0.113.10'
            },
            body: JSON.stringify({ path: '/room' })
        });
        const second = await request('/api/stats/view', {
            method: 'POST',
            headers: {
                ...jsonHeaders(),
                'x-forwarded-for': '203.0.113.10'
            },
            body: JSON.stringify({ path: '/plaza' })
        });
        assert.equal(first.response.status, 200);
        assert.equal(second.response.status, 200);
        assert.equal(second.body.deduped, true);

        const after = await request('/api/stats');
        assert.equal(after.body.data.todayViews, beforeToday + 1);
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

describe('room memory API', () => {
    it('requires a logged-in user for server-side room memories', async () => {
        const { response, body } = await request('/api/room/memory/status');

        assert.equal(response.status, 401);
        assert.equal(body.success, false);
    });

    it('records, searches, isolates, and clears per-user memories', async () => {
        const created = await postJson('/api/room/memory', {
            visitorName: 'normal-user',
            userMessage: '请记住我喜欢浅蓝色和淡紫色的房间氛围。',
            assistantReply: '我记住了。下次会把房间的光调得更像浅蓝和淡紫的月色。',
            metadata: { test: true }
        }, userToken);
        assert.equal(created.response.status, 201);
        assert.match(created.body.data.summary, /浅蓝色/);
        assert.equal(created.body.data.type, 'preference');
        assert.ok(created.body.data.tags.includes('preference'));
        assert.ok(created.body.data.importance > 0);

        const merged = await postJson('/api/room/memory', {
            visitorName: 'normal-user',
            userMessage: '以后房间主题继续用浅蓝色和淡紫色，我喜欢这种清新的感觉。',
            assistantReply: '嗯，我会把这种偏好合并到记忆里。'
        }, userToken);
        assert.equal(merged.response.status, 200);
        assert.equal(merged.body.message, '记忆已合并更新');

        const search = await request('/api/room/memory?q=%E6%B5%85%E8%93%9D%E8%89%B2&limit=3', {
            headers: jsonHeaders(userToken)
        });
        assert.equal(search.response.status, 200);
        assert.ok(search.body.data.some(item => item.summary.includes('浅蓝色')));
        assert.ok(search.body.data[0].score > 0);
        assert.equal(Object.prototype.hasOwnProperty.call(search.body.data[0], 'content'), false);

        const detail = await request(`/api/room/memory/${created.body.data.id}`, {
            headers: jsonHeaders(userToken)
        });
        assert.equal(detail.response.status, 200);
        assert.match(detail.body.data.content, /浅蓝色/);

        const updated = await request(`/api/room/memory/${created.body.data.id}`, {
            method: 'PATCH',
            headers: jsonHeaders(userToken),
            body: JSON.stringify({
                type: 'project',
                summary: '用户希望 room 页面保持浅蓝和淡紫的清新氛围。',
                tags: ['room', 'visual-style'],
                importance: 0.9,
                confidence: 0.88
            })
        });
        assert.equal(updated.response.status, 200);
        assert.equal(updated.body.data.type, 'project');
        assert.equal(updated.body.data.importance, 0.9);
        assert.ok(updated.body.data.tags.includes('visual-style'));

        const byType = await request('/api/room/memory?type=project', {
            headers: jsonHeaders(userToken)
        });
        assert.equal(byType.response.status, 200);
        assert.ok(byType.body.data.some(item => item.type === 'project'));

        const isolated = await request('/api/room/memory?q=%E6%B5%85%E8%93%9D%E8%89%B2', {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(isolated.response.status, 200);
        assert.equal(isolated.body.data.length, 0);

        const status = await request('/api/room/memory/status', {
            headers: jsonHeaders(userToken)
        });
        assert.equal(status.response.status, 200);
        assert.equal(status.body.data.scope, 'per-user');
        assert.equal(status.body.data.count, 1);
        assert.ok(status.body.data.byType.some(item => item.type === 'project' && item.count === 1));

        const ignored = await postJson('/api/room/memory', {
            userMessage: '我现在有点饿。',
            assistantReply: '那先吃点东西吧。'
        }, userToken);
        assert.equal(ignored.response.status, 202);
        assert.equal(ignored.body.data, null);

        const forced = await postJson('/api/room/memory', {
            userMessage: '我现在有点饿。',
            assistantReply: '那先吃点东西吧。',
            force: true
        }, userToken);
        assert.equal(forced.response.status, 201);
        assert.equal(forced.body.data.type, 'conversation');

        const sensitive = await postJson('/api/room/memory', {
            userMessage: '请记住我的 API key 是 sk-secret-test。',
            assistantReply: '这类敏感信息不应该保存。',
            force: true
        }, userToken);
        assert.equal(sensitive.response.status, 202);
        assert.equal(sensitive.body.data, null);

        const cleared = await request('/api/room/memory', {
            method: 'DELETE',
            headers: jsonHeaders(userToken)
        });
        assert.equal(cleared.response.status, 200);
        assert.equal(cleared.body.data.count, 2);
    });
});

describe('MCP bridge API', () => {
    it('lists MiniMax Token Plan MCP tools without proxying arbitrary URLs', async () => {
        const { response, body } = await postJson('/api/mcp/token-plan', {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        });

        assert.equal(response.status, 200);
        assert.equal(body.jsonrpc, '2.0');
        assert.equal(body.id, 1);
        assert.ok(body.result.tools.some(tool => tool.name === 'web_search'));
        assert.ok(body.result.tools.some(tool => tool.name === 'understand_image'));
    });

    it('rejects unsupported MCP methods and tools', async () => {
        const unsupportedMethod = await postJson('/api/mcp/token-plan', {
            jsonrpc: '2.0',
            id: 2,
            method: 'resources/list',
            params: {}
        });
        assert.equal(unsupportedMethod.response.status, 400);
        assert.equal(unsupportedMethod.body.error.code, -32601);

        const unsupportedTool = await postJson('/api/mcp/token-plan', {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
                name: 'fetch_url',
                arguments: { url: 'https://example.com' },
                meta: { auth: { api_key: 'test-key' } }
            }
        });
        assert.equal(unsupportedTool.response.status, 400);
        assert.equal(unsupportedTool.body.error.code, -32602);
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
        assert.equal(me.body.data.role, 'super_admin');
        assert.ok(me.body.data.id);

        const articles = await request('/api/admin/articles', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(articles.response.status, 200);
        assert.ok(Array.isArray(articles.body.data));
    });

    it('lets admins pin and unpin articles', async () => {
        const pinned = await postJson(`/api/admin/articles/${articleId}/toggle-pin`, {}, adminToken);
        assert.equal(pinned.response.status, 200);
        assert.ok(pinned.body.data.pinned_at);

        const adminList = await request('/api/admin/articles', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(adminList.response.status, 200);
        assert.equal(adminList.body.data[0].id, articleId);
        assert.ok(adminList.body.data[0].pinned_at);

        const publicList = await request('/api/articles?limit=1');
        assert.equal(publicList.response.status, 200);
        assert.equal(publicList.body.data[0].id, articleId);
        assert.ok(publicList.body.data[0].pinned_at);

        const unpinned = await postJson(`/api/admin/articles/${articleId}/toggle-pin`, {}, adminToken);
        assert.equal(unpinned.response.status, 200);
        assert.equal(unpinned.body.data.pinned_at, null);
    });

    it('lets a super admin manage user roles and passwords', async () => {
        const users = await request('/api/admin/users', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(users.response.status, 200);
        const managed = users.body.data.find(item => item.username === 'managed-user');
        assert.ok(managed);
        assert.equal(managed.bio, 'managed test user');
        assert.equal(managed.role, 'user');

        const role = await patchJson(`/api/admin/users/${managed.id}/role`, { role: 'admin' }, adminToken);
        assert.equal(role.response.status, 200);
        assert.equal(role.body.data.role, 'admin');
        assert.equal(db.prepare('SELECT role FROM users WHERE id = ?').get(managed.id).role, 'admin');

        const reset = await postJson(`/api/admin/users/${managed.id}/password`, {
            password: 'managed-new-password'
        }, adminToken);
        assert.equal(reset.response.status, 200);

        const loginWithNewPassword = await postJson('/api/auth/login', {
            username: 'managed-user',
            password: 'managed-new-password'
        });
        assert.equal(loginWithNewPassword.response.status, 200);
        assert.equal(loginWithNewPassword.body.data.user.username, 'managed-user');
    });

    it('prevents non-super admins from changing user permissions or passwords', async () => {
        const forbiddenRole = await patchJson('/api/admin/users/user-001/role', {
            role: 'admin'
        }, staffAdminToken);
        assert.equal(forbiddenRole.response.status, 403);
        assert.equal(forbiddenRole.body.success, false);

        const forbiddenPassword = await postJson('/api/admin/users/user-001/password', {
            password: 'blocked-password'
        }, staffAdminToken);
        assert.equal(forbiddenPassword.response.status, 403);

        const forbiddenDelete = await request('/api/admin/users/user-001', {
            method: 'DELETE',
            headers: jsonHeaders(staffAdminToken)
        });
        assert.equal(forbiddenDelete.response.status, 403);
    });

    it('allows an admin to change their own terminal password', async () => {
        const changed = await postJson('/api/admin/password', {
            currentPassword: 'staff-test-password',
            newPassword: 'staff-new-password'
        }, staffAdminToken);
        assert.equal(changed.response.status, 200);

        const oldPassword = await postJson('/api/admin/login', {
            username: 'staff-admin',
            password: 'staff-test-password'
        });
        assert.equal(oldPassword.response.status, 401);

        const newPasswordToken = await login('/api/admin/login', 'staff-admin', 'staff-new-password');
        assert.ok(newPasswordToken);
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
