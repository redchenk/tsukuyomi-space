const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
const config = require('../backend/config');
const db = require('../backend/db');
const authState = require('../backend/services/auth-state');
const { ROOM_SYSTEM_PROMPT, buildChatPayload, createChatCompletion, isOllamaChatUrl, normalizeChatUrl } = require('../backend/services/llm');
const { createEmbedding } = require('../backend/services/room-embedding');
const { requireUserId, similarity } = require('../backend/services/room-memory');
const { scopeFilter, truncateUtf8 } = require('../backend/services/room-milvus-store');
const objectStorage = require('../backend/services/object-storage');
const friendLinkAvatarService = require('../backend/services/friend-link-avatar');
const { renderSeoCollectionPage } = require('../backend/seo/render-pages');

let server;
let baseUrl;
let userToken;
let managedUserToken;
let adminToken;
let staffAdminToken;
const testAvatar = `data:image/png;base64,${'a'.repeat(5000)}`;
const publicTestAvatarPattern = /^\/api\/user\/public\/normal-user\/avatar\?v=/;
let articleId;
let messageId;
let replyId;
let pixelArtworkId;

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

function namedAuthCookieFrom(response, name) {
    const header = response.headers.get('set-cookie') || '';
    const setCookie = header
        .split(/,(?=\s*[^;,]+=)/)
        .map(part => part.trim())
        .find(part => part.startsWith(`${name}=`)) || '';
    return setCookie.split(';')[0];
}

function tokenFromCookie(cookie) {
    return cookie.slice(cookie.indexOf('=') + 1);
}

function tamperToken(token) {
    const parts = token.split('.');
    const first = parts[2][0];
    parts[2] = `${first === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
    return parts.join('.');
}

async function request(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    return { response, body };
}

async function openEventStream(pathname, token) {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}${pathname}`, {
        headers: {
            Accept: 'text/event-stream',
            ...authHeader(token)
        },
        signal: controller.signal
    });
    return {
        controller,
        response,
        reader: response.body?.getReader(),
        decoder: new TextDecoder(),
        buffer: ''
    };
}

async function readEvent(stream, expectedEvent, timeoutMs = 2500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        let timeout;
        const remaining = Math.max(1, deadline - Date.now());
        const chunk = await Promise.race([
            stream.reader.read(),
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`Timed out waiting for SSE event ${expectedEvent}`)), remaining);
            })
        ]).finally(() => clearTimeout(timeout));

        if (chunk.done) throw new Error(`SSE stream ended before ${expectedEvent}`);
        stream.buffer += stream.decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');

        let boundary = stream.buffer.indexOf('\n\n');
        while (boundary >= 0) {
            const block = stream.buffer.slice(0, boundary);
            stream.buffer = stream.buffer.slice(boundary + 2);
            const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim() || 'message';
            const data = block
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart())
                .join('\n');
            if (event === expectedEvent) return data ? JSON.parse(data) : null;
            boundary = stream.buffer.indexOf('\n\n');
        }
    }
    throw new Error(`Timed out waiting for SSE event ${expectedEvent}`);
}

async function postJson(pathname, body, token) {
    return request(pathname, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify(body)
    });
}

async function putJson(pathname, body, token) {
    return request(pathname, {
        method: 'PUT',
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
    return body.data?.token || authCookieFrom(response);
}

function seedArticleDeletionGraph(ownerId, suffix) {
    return db.transaction(() => {
        const article = db.prepare(`
            INSERT INTO articles (title, slug, excerpt, content, category, tags, publish_date, status, author_id)
            VALUES (?, ?, '', 'delete graph body', '测试', '[]', '2026-07-18', 'published', ?)
        `).run(`Delete graph ${suffix}`, `delete-graph-${suffix}`, ownerId);
        const id = article.lastInsertRowid;
        const assetId = `delete-asset-${suffix}`;
        db.prepare(`
            INSERT INTO article_assets (id, article_id, owner_id, asset_type, mime_type, url, metadata)
            VALUES (?, ?, ?, 'image', 'image/png', ?, '{}')
        `).run(assetId, id, ownerId, `/api/assets/${assetId}`);
        db.prepare(`
            INSERT INTO article_content_blocks (id, article_id, block_type, sort_order, content_json, asset_id)
            VALUES (?, ?, 'image', 0, '{}', ?)
        `).run(`delete-block-${suffix}`, id, assetId);
        const parentId = db.prepare(`
            INSERT INTO messages (author, content, user_id, article_id, status)
            VALUES ('normal-user', 'parent deletion message', 'user-001', ?, 'approved')
        `).run(id).lastInsertRowid;
        const replyId = db.prepare(`
            INSERT INTO messages (author, content, user_id, parent_id, article_id, status)
            VALUES ('managed-user', 'reply deletion message', 'user-002', ?, ?, 'approved')
        `).run(parentId, id).lastInsertRowid;
        db.prepare('INSERT INTO message_likes (message_id, user_id) VALUES (?, ?)').run(parentId, 'user-002');
        db.prepare(`
            INSERT INTO message_mentions (message_id, mentioned_user_id, actor_id)
            VALUES (?, 'user-001', 'user-002')
        `).run(replyId);
        db.prepare(`
            INSERT INTO notifications (user_id, actor_id, type, title, related_message_id, related_article_id)
            VALUES ('user-001', 'user-002', 'reply', 'article deletion notification', ?, ?)
        `).run(replyId, id);
        db.prepare('INSERT INTO article_bookmarks (user_id, article_id) VALUES (?, ?)').run('user-002', id);
        return { id, assetId, parentId, replyId };
    })();
}

function cleanupArticleDeletionGraph(graph) {
    db.transaction(() => {
        db.prepare('DELETE FROM notifications WHERE related_article_id = ? OR related_message_id IN (?, ?)')
            .run(graph.id, graph.parentId, graph.replyId);
        db.prepare('DELETE FROM message_likes WHERE message_id IN (?, ?)').run(graph.parentId, graph.replyId);
        db.prepare('DELETE FROM message_mentions WHERE message_id IN (?, ?)').run(graph.parentId, graph.replyId);
        db.prepare('DELETE FROM messages WHERE id = ?').run(graph.replyId);
        db.prepare('DELETE FROM messages WHERE id = ?').run(graph.parentId);
        db.prepare('DELETE FROM article_bookmarks WHERE article_id = ?').run(graph.id);
        db.prepare('DELETE FROM article_content_blocks WHERE article_id = ?').run(graph.id);
        db.prepare('UPDATE article_assets SET article_id = NULL WHERE id = ?').run(graph.assetId);
        db.prepare('DELETE FROM articles WHERE id = ?').run(graph.id);
        db.prepare('DELETE FROM article_assets WHERE id = ?').run(graph.assetId);
    })();
}

function assertArticleDeletionGraphRemoved(graph) {
    assert.equal(db.prepare('SELECT id FROM articles WHERE id = ?').get(graph.id), undefined);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages WHERE id IN (?, ?)').get(graph.parentId, graph.replyId).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM message_likes WHERE message_id IN (?, ?)').get(graph.parentId, graph.replyId).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM message_mentions WHERE message_id IN (?, ?)').get(graph.parentId, graph.replyId).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE related_article_id = ? OR related_message_id IN (?, ?)').get(graph.id, graph.parentId, graph.replyId).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM article_bookmarks WHERE article_id = ?').get(graph.id).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM article_content_blocks WHERE article_id = ?').get(graph.id).count, 0);
    assert.equal(db.prepare('SELECT article_id FROM article_assets WHERE id = ?').get(graph.assetId).article_id, null);
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
    `).run('user-001', 'normal-user', 'normal@example.test', bcrypt.hashSync('user-test-password', 10), 'user', testAvatar);
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

        for (const table of ['schema_migrations', 'users', 'articles', 'messages', 'message_likes', 'room_chat_messages', 'room_conversation_shares', 'admins', 'site_settings']) {
            assert.ok(tables.includes(table), `${table} table should exist`);
        }

        const expectedVersions = require('../backend/db/migrations/init')
            .loadMigrations()
            .map(migration => migration.version);
        const migrations = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
        assert.deepEqual(migrations.map(row => row.version), expectedVersions);
        assert.ok(db.prepare('SELECT COUNT(*) AS count FROM articles').get().count >= 3);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM articles WHERE published_at IS NULL').get().count, 0);
        assert.equal(db.prepare('SELECT role FROM users WHERE username = ?').get('admin').role, 'admin');
        assert.equal(db.prepare('SELECT role FROM users WHERE username = ?').get('staff-admin').role, 'admin');
    });

    it('backfills recoverable legacy memory conversations once', () => {
        const migration = require('../backend/db/migrations/021_backfill_room_chat_messages');
        const userId = 'legacy-chat-migration-user';
        const memoryId = 'legacy-chat-memory';

        try {
            db.prepare(`
                INSERT INTO users (id, username, email, password_hash, role)
                VALUES (?, ?, ?, ?, 'user')
            `).run(userId, userId, `${userId}@example.test`, 'unused');
            db.prepare(`
                INSERT INTO room_memories (id, user_id, summary, content, embedding)
                VALUES (?, ?, ?, ?, '[]')
            `).run(
                memoryId,
                userId,
                'legacy conversation',
                '用户：first question\n八千代：first answer\n\n用户：second question\n八千代：second answer'
            );

            migration.up(db);
            migration.up(db);

            const messages = db.prepare(`
                SELECT role, content
                FROM room_chat_messages
                WHERE user_id = ?
                ORDER BY rowid ASC
            `).all(userId);
            assert.deepEqual(messages, [
                { role: 'user', content: 'first question' },
                { role: 'assistant', content: 'first answer' },
                { role: 'user', content: 'second question' },
                { role: 'assistant', content: 'second answer' }
            ]);
        } finally {
            db.prepare('DELETE FROM room_chat_messages WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM room_memories WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        }
    });

    it('backfills published articles from their original creation time without publishing drafts', () => {
        const migration = require('../backend/db/migrations/022_add_article_published_at');
        const published = db.prepare(`
            INSERT INTO articles (title, slug, publish_date, published_at, status, created_at)
            VALUES (?, ?, ?, NULL, 'published', ?)
        `).run('Legacy published timestamp', `legacy-published-${Date.now()}`, '2026-04-02', '2026-04-02 03:14:15');
        const draft = db.prepare(`
            INSERT INTO articles (title, slug, publish_date, published_at, status, created_at)
            VALUES (?, ?, ?, NULL, 'draft', ?)
        `).run('Legacy draft timestamp', `legacy-draft-${Date.now()}`, '2026-04-03', '2026-04-03 04:15:16');

        try {
            migration.up(db);
            migration.up(db);
            assert.equal(
                db.prepare('SELECT published_at FROM articles WHERE id = ?').get(published.lastInsertRowid).published_at,
                '2026-04-02 03:14:15'
            );
            assert.equal(
                db.prepare('SELECT published_at FROM articles WHERE id = ?').get(draft.lastInsertRowid).published_at,
                null
            );
        } finally {
            db.prepare('DELETE FROM articles WHERE id IN (?, ?)').run(published.lastInsertRowid, draft.lastInsertRowid);
        }
    });

    it('canonicalizes legacy article cover URLs only when the asset still exists', () => {
        const migration = require('../backend/db/migrations/023_canonicalize_article_cover_urls');
        const validAssetId = `legacy-cover-${Date.now()}`;
        const missingAssetId = `missing-cover-${Date.now()}`;
        const valid = db.prepare(`
            INSERT INTO articles (title, slug, cover_image, cover_image_asset_id)
            VALUES (?, ?, ?, ?)
        `).run('Legacy OSS cover', `legacy-oss-cover-${Date.now()}`, 'https://oss.example.test/legacy.png', validAssetId);
        const missing = db.prepare(`
            INSERT INTO articles (title, slug, cover_image, cover_image_asset_id)
            VALUES (?, ?, ?, ?)
        `).run('Missing legacy cover asset', `missing-cover-${Date.now()}`, '/assets/uploads/legacy.png', missingAssetId);
        db.prepare(`
            INSERT INTO article_assets (id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata)
            VALUES (?, ?, 'user-001', 'cover-image', 'image/png', ?, ?, ?)
        `).run(
            validAssetId,
            valid.lastInsertRowid,
            'https://oss.example.test/legacy.png',
            `legacy/${validAssetId}.png`,
            JSON.stringify({ storage: 'oss' })
        );

        try {
            migration.up(db);
            migration.up(db);
            assert.equal(
                db.prepare('SELECT cover_image FROM articles WHERE id = ?').get(valid.lastInsertRowid).cover_image,
                `/api/assets/proxy/${validAssetId}`
            );
            assert.equal(
                db.prepare('SELECT cover_image FROM articles WHERE id = ?').get(missing.lastInsertRowid).cover_image,
                '/assets/uploads/legacy.png'
            );
        } finally {
            db.prepare('DELETE FROM article_assets WHERE id = ?').run(validAssetId);
            db.prepare('DELETE FROM articles WHERE id IN (?, ?)').run(valid.lastInsertRowid, missing.lastInsertRowid);
        }
    });
});

describe('auth API', () => {
    it('gives an administrator separate terminal and real site-account sessions', async () => {
        const loginResult = await postJson('/api/admin/login', {
            username: 'admin',
            password: 'admin-test-password'
        });
        assert.equal(loginResult.response.status, 200);
        assert.equal(loginResult.body.data.user.username, 'admin');
        assert.equal(loginResult.body.data.user.role, 'admin');
        assert.equal(loginResult.body.data.user.has_real_email, true);

        const cookies = loginResult.response.headers.get('set-cookie') || '';
        assert.match(cookies, /tsukuyomi_session=/);
        assert.match(cookies, /tsukuyomi_admin_session=/);
        assert.match(cookies, /HttpOnly/i);
        assert.match(cookies, /Path=\//i);
        assert.match(cookies, /SameSite=Lax/i);
        assert.match(cookies, /SameSite=Strict/i);

        const sessionCookies = authCookieFrom(loginResult.response);
        const siteMe = await request('/api/auth/me', { headers: jsonHeaders(sessionCookies) });
        const adminMe = await request('/api/admin/me', { headers: jsonHeaders(sessionCookies) });
        assert.equal(siteMe.response.status, 200);
        assert.equal(siteMe.body.data.id, 'admin-001');
        assert.equal(adminMe.response.status, 200);
        assert.equal(adminMe.body.data.role, 'super_admin');
    });

    it('rejects JSON requests containing duplicate object keys', async () => {
        const result = await request('/api/auth/login', {
            method: 'POST',
            headers: jsonHeaders(),
            body: '{"username":"normal-user","username":"admin","password":"user-test-password"}'
        });
        assert.equal(result.response.status, 400);
        assert.equal(result.body.code, 'DUPLICATE_JSON_KEY');
    });

    it('logs in a normal user and rejects invalid credentials', async () => {
        const ok = await postJson('/api/auth/login', {
            username: 'normal-user',
            password: 'user-test-password'
        });
        assert.equal(ok.response.status, 200);
        assert.equal(ok.body.data.user.role, 'user');
        assert.ok(ok.body.data.token || authCookieFrom(ok.response));

        const bad = await postJson('/api/auth/login', {
            username: 'normal-user',
            password: 'wrong-password'
        });
        assert.equal(bad.response.status, 401);
        assert.equal(bad.body.success, false);
    });

    it('authenticates a valid cookie and rejects a tampered cookie token', async () => {
        const loggedIn = await postJson('/api/auth/login', {
            username: 'normal-user',
            password: 'user-test-password'
        });
        const cookie = namedAuthCookieFrom(loggedIn.response, 'tsukuyomi_session');
        const valid = await request('/api/auth/me', { headers: { Cookie: cookie } });
        assert.equal(valid.response.status, 200);

        const tampered = `tsukuyomi_session=${tamperToken(tokenFromCookie(cookie))}`;
        const rejected = await request('/api/auth/me', { headers: { Cookie: tampered } });
        assert.equal(rejected.response.status, 403);
        assert.equal(rejected.body.code, 'TOKEN_INVALID');
    });

    it('rejects unsigned cookies and signed cookies using an unapproved JWT algorithm', async () => {
        const loggedIn = await postJson('/api/auth/login', {
            username: 'normal-user',
            password: 'user-test-password'
        });
        const cookie = namedAuthCookieFrom(loggedIn.response, 'tsukuyomi_session');
        const claims = jwt.decode(tokenFromCookie(cookie));
        const wrongAlgorithmToken = jwt.sign(claims, config.jwtSecret, {
            algorithm: 'HS512',
            noTimestamp: true
        });
        const unsignedToken = jwt.sign(claims, null, {
            algorithm: 'none',
            noTimestamp: true
        });

        const rejectedAlgorithm = await request('/api/auth/me', {
            headers: { Cookie: `tsukuyomi_session=${wrongAlgorithmToken}` }
        });
        const rejectedUnsigned = await request('/api/auth/me', {
            headers: { Cookie: `tsukuyomi_session=${unsignedToken}` }
        });
        assert.equal(rejectedAlgorithm.response.status, 403);
        assert.equal(rejectedAlgorithm.body.code, 'TOKEN_INVALID');
        assert.equal(rejectedUnsigned.response.status, 403);
        assert.equal(rejectedUnsigned.body.code, 'TOKEN_INVALID');
    });

    it('keeps site and terminal cookie sessions in separate scopes', async () => {
        const loggedIn = await postJson('/api/admin/login', {
            username: 'admin',
            password: 'admin-test-password'
        });
        const userCookie = namedAuthCookieFrom(loggedIn.response, 'tsukuyomi_session');
        const adminCookie = namedAuthCookieFrom(loggedIn.response, 'tsukuyomi_admin_session');

        const userOnAdmin = await request('/api/admin/me', { headers: { Cookie: userCookie } });
        const adminOnUser = await request('/api/auth/me', { headers: { Cookie: adminCookie } });
        assert.equal(userOnAdmin.response.status, 401);
        assert.equal(adminOnUser.response.status, 401);

        const swappedAdmin = await request('/api/auth/me', {
            headers: { Cookie: `tsukuyomi_session=${tokenFromCookie(adminCookie)}` }
        });
        const swappedUser = await request('/api/admin/me', {
            headers: { Cookie: `tsukuyomi_admin_session=${tokenFromCookie(userCookie)}` }
        });
        assert.equal(swappedAdmin.response.status, 403);
        assert.equal(swappedAdmin.body.code, 'TOKEN_SCOPE_INVALID');
        assert.equal(swappedUser.response.status, 403);
        assert.equal(swappedUser.body.code, 'TOKEN_SCOPE_INVALID');
    });

    it('returns the current user for a bearer token', async () => {
        const { response, body } = await request('/api/auth/me', {
            headers: jsonHeaders(userToken)
        });

        assert.equal(response.status, 200);
        assert.equal(body.data.username, 'normal-user');
    });

    it('returns a readable error when the current password is incorrect', async () => {
        const result = await putJson('/api/user/password', {
            currentPassword: 'incorrect-current-password',
            newPassword: 'new-password-2026'
        }, userToken);

        assert.equal(result.response.status, 400);
        assert.equal(result.body.message, '当前密码错误');
    });

    it('requires password confirmation and only unlinks the current users QQ account', async () => {
        db.prepare(`
            INSERT INTO user_oauth_accounts (id, user_id, provider, provider_user_id, nickname)
            VALUES (?, ?, 'qq', ?, ?)
        `).run('normal-user-qq-link', 'user-001', 'normal-user-qq-openid', 'Normal QQ');
        db.prepare(`
            INSERT INTO user_oauth_accounts (id, user_id, provider, provider_user_id, nickname)
            VALUES (?, ?, 'qq', ?, ?)
        `).run('managed-user-qq-link', 'user-002', 'managed-user-qq-openid', 'Managed QQ');

        const rejected = await postJson('/api/auth/oauth/qq/unlink', {
            currentPassword: 'incorrect-current-password',
            userId: 'user-002'
        }, userToken);
        assert.equal(rejected.response.status, 400);
        assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM user_oauth_accounts WHERE user_id = ?`).get('user-001').count, 1);

        const unlinked = await postJson('/api/auth/oauth/qq/unlink', {
            currentPassword: 'user-test-password',
            userId: 'user-002'
        }, userToken);
        assert.equal(unlinked.response.status, 200);
        assert.equal(unlinked.body.data.user.oauth_accounts.length, 0);
        assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM user_oauth_accounts WHERE user_id = ?`).get('user-001').count, 0);
        assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM user_oauth_accounts WHERE user_id = ?`).get('user-002').count, 1);
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

    it('sets a usable password when a new QQ user binds an email', async () => {
        const ticket = 'qq-first-password-ticket';
        const email = 'qq-first-password@example.test';
        await authState.createOAuthPending({
            ticket,
            provider: 'qq',
            mode: 'bind_email',
            profile: {
                provider: 'qq',
                providerUserId: 'qq-first-password-openid',
                nickname: 'QQ First Password',
                avatar: '',
                raw: {}
            }
        });
        await authState.createVerificationCode({
            email,
            code: '321654',
            purpose: 'oauth_bind',
            ttlMs: 10 * 60 * 1000,
            cooldownMs: 60 * 1000
        });

        const bound = await postJson('/api/auth/oauth/qq/email', {
            ticket,
            email,
            emailCode: '321654',
            username: 'qq-first-password',
            newPassword: 'qq-first-password-2026'
        });
        assert.equal(bound.response.status, 201);

        const passwordLogin = await postJson('/api/auth/login', {
            username: email,
            password: 'qq-first-password-2026'
        });
        assert.equal(passwordLogin.response.status, 200);
    });

    it('resets an OAuth users password with a one-time email code', async () => {
        const userId = 'oauth-reset-user';
        const email = 'oauth-reset@example.test';
        db.prepare(`
            INSERT INTO users (id, username, email, password_hash, role)
            VALUES (?, ?, ?, ?, ?)
        `).run(userId, 'oauth-reset-user', email, bcrypt.hashSync('unknown-oauth-password', 10), 'user');
        db.prepare(`
            INSERT INTO user_oauth_accounts (id, user_id, provider, provider_user_id, nickname)
            VALUES (?, ?, ?, ?, ?)
        `).run('oauth-reset-link', userId, 'qq', 'oauth-reset-openid', 'OAuth Reset');

        const oldSession = await login('/api/auth/login', email, 'unknown-oauth-password');
        await authState.createVerificationCode({
            email,
            code: '654321',
            purpose: 'password_reset',
            ttlMs: 10 * 60 * 1000,
            cooldownMs: 60 * 1000
        });

        const reset = await postJson('/api/auth/password/reset', {
            email,
            emailCode: '654321',
            newPassword: 'oauth-reset-password-2026'
        });
        assert.equal(reset.response.status, 200);
        assert.match(reset.response.headers.get('set-cookie') || '', /tsukuyomi_session=/);

        const stale = await request('/api/auth/me', { headers: jsonHeaders(oldSession) });
        assert.equal(stale.response.status, 403);

        const resetSession = authCookieFrom(reset.response);
        const current = await request('/api/auth/me', { headers: jsonHeaders(resetSession) });
        assert.equal(current.response.status, 200);
        assert.equal(current.body.data.id, userId);

        const reused = await postJson('/api/auth/password/reset', {
            email,
            emailCode: '654321',
            newPassword: 'must-not-be-accepted'
        });
        assert.equal(reused.response.status, 400);

        const passwordLogin = await postJson('/api/auth/login', {
            username: email,
            password: 'oauth-reset-password-2026'
        });
        assert.equal(passwordLogin.response.status, 200);
    });

    it('keeps session hydration available beyond the sensitive auth rate limit', async () => {
        const isolatedApp = createApp();
        const isolatedServer = await new Promise((resolve) => {
            const instance = isolatedApp.listen(0, '127.0.0.1', () => resolve(instance));
        });
        const isolatedBaseUrl = `http://127.0.0.1:${isolatedServer.address().port}`;

        try {
            for (let index = 0; index < 65; index += 1) {
                const response = await fetch(`${isolatedBaseUrl}/api/auth/me`, {
                    headers: jsonHeaders(userToken)
                });
                assert.notEqual(response.status, 429, `session hydration was rate limited on request ${index + 1}`);
            }
        } finally {
            await new Promise((resolve, reject) => {
                isolatedServer.close((error) => error ? reject(error) : resolve());
            });
        }
    });
});

describe('articles API', () => {
    it('lists seeded articles', async () => {
        const { response, body } = await request('/api/articles?limit=2');

        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control') || '', /no-store/);
        assert.equal(response.headers.get('surrogate-control'), 'no-store');
        assert.equal(body.success, true);
        assert.ok(Array.isArray(body.data));
        assert.ok(body.data.length > 0);
        assert.equal(body.pagination.limit, 2);
    });

    it('prevents shared CDN caching for every mutable public content feed', async () => {
        const paths = [
            '/api/articles?limit=1',
            '/api/live/cache-regression/articles?limit=1',
            '/api/messages',
            '/api/live/cache-regression/messages',
            '/api/assets/gallery/public?limit=1',
            '/api/live/cache-regression/assets/gallery/public?limit=1',
            '/api/assets/gallery?limit=1',
            '/api/pixel-art/gallery?limit=1',
            '/api/live/cache-regression/pixel-art/gallery?limit=1',
            '/api/friend-links',
            '/api/live/cache-regression/friend-links'
        ];

        for (const pathname of paths) {
            const { response } = await request(pathname);
            assert.equal(response.status, 200, pathname);
            assert.match(response.headers.get('cache-control') || '', /no-store/, pathname);
            assert.equal(response.headers.get('surrogate-control'), 'no-store', pathname);
        }

        const blockedWrite = await request('/api/live/cache-regression/messages', {
            method: 'POST',
            headers: jsonHeaders(userToken),
            body: JSON.stringify({ content: 'must not be accepted' })
        });
        assert.equal(blockedWrite.response.status, 405);

        const blockedAssetProxyAlias = await request('/api/live/cache-regression/assets/proxy/not-allowed');
        assert.equal(blockedAssetProxyAlias.response.status, 404);
    });

    it('hides draft articles from public API, SSR, and sitemap', async () => {
        const draft = db.prepare(`
            INSERT INTO articles (title, slug, excerpt, content, category, tags, publish_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'Hidden Draft Article',
            'hidden-draft-article',
            'Draft summary',
            'Draft body should not be public.',
            '\u968f\u7b14',
            '[]',
            '2026-05-24',
            'draft'
        );
        const draftId = draft.lastInsertRowid;

        const list = await request('/api/articles?limit=200');
        assert.equal(list.response.status, 200);
        assert.equal(list.body.data.some(article => article.id === draftId), false);

        const detail = await request(`/api/articles/${draftId}`);
        assert.equal(detail.response.status, 404);

        const liveDetail = await request(`/api/articles/${draftId}/live/test`);
        assert.equal(liveDetail.response.status, 404);

        const comments = await request(`/api/messages?article_id=${draftId}`);
        assert.equal(comments.response.status, 404);

        const ssr = await request(`/articles/${draftId}/hidden-draft-article`);
        assert.equal(ssr.response.status, 404);
        assert.equal(String(ssr.body).includes('Hidden Draft Article'), false);

        const sitemap = await request('/sitemap.xml');
        assert.equal(sitemap.response.status, 200);
        assert.equal(String(sitemap.body).includes(`/articles/${draftId}/hidden-draft-article`), false);

        const firstPublish = await postJson(`/api/admin/articles/${draftId}/toggle-status`, {}, adminToken);
        assert.equal(firstPublish.response.status, 200);
        const firstPublishedAt = db.prepare('SELECT published_at FROM articles WHERE id = ?').get(draftId).published_at;
        assert.match(firstPublishedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        await postJson(`/api/admin/articles/${draftId}/toggle-status`, {}, adminToken);
        await postJson(`/api/admin/articles/${draftId}/toggle-status`, {}, adminToken);
        assert.equal(db.prepare('SELECT published_at FROM articles WHERE id = ?').get(draftId).published_at, firstPublishedAt);
        await postJson(`/api/admin/articles/${draftId}/toggle-status`, {}, adminToken);
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
        assert.match(created.body.data.author_avatar, publicTestAvatarPattern);
        assert.match(created.body.data.published_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        const originalPublishedAt = created.body.data.published_at;

        const fetched = await request(`/api/articles/${articleId}`);
        assert.equal(fetched.response.status, 200);
        assert.equal(fetched.body.data.title, 'Test Article');
        assert.deepEqual(fetched.body.data.tags, ['test']);
        assert.match(fetched.body.data.author_avatar, publicTestAvatarPattern);
        assert.equal(fetched.body.data.published_at, originalPublishedAt);

        const updated = await putJson(`/api/articles/${articleId}`, {
            title: 'Test Article',
            excerpt: 'Updated summary',
            content: 'Updated without changing publication time.',
            content_format: 'markdown',
            category: '\u968f\u7b14',
            tags: ['test'],
            read_time: '1 min'
        }, adminToken);
        assert.equal(updated.response.status, 200);
        assert.equal(updated.body.data.published_at, originalPublishedAt);

        const list = await request('/api/articles?limit=200');
        assert.equal(list.response.status, 200);
        const listedArticle = list.body.data.find(article => article.id === articleId);
        assert.ok(listedArticle);
        assert.match(listedArticle.author_avatar, publicTestAvatarPattern);
        assert.equal(listedArticle.published_at, originalPublishedAt);
        assert.ok(JSON.stringify(list.body).length < 128 * 1024);
    });

    it('persists OSS article covers through a durable same-origin asset URL', async () => {
        const originalGetSettings = objectStorage.getSettings;
        const originalPutObject = objectStorage.putObject;
        const foreignAssetId = `foreign-cover-${Date.now()}`;
        let createdArticleId = null;
        let coverAssetId = '';
        objectStorage.getSettings = () => ({
            ossEnabled: true,
            ossProvider: 'aliyun',
            ossEndpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
            ossRegion: 'cn-hangzhou',
            ossBucket: 'article-cover-test',
            ossAccessKeyId: 'test-access-key',
            ossAccessKeySecret: 'test-access-secret',
            ossPublicBaseUrl: 'https://oss.example.test',
            ossDefaultStorage: 'oss',
            ossUploadPath: 'articles/${role}'
        });
        objectStorage.putObject = async ({ id, mimeType, role }) => {
            assert.equal(mimeType, 'image/png');
            assert.equal(role, 'cover');
            return {
                storage: 'oss',
                key: `articles/cover/${id}.png`,
                url: `https://oss.example.test/articles/cover/${id}.png`
            };
        };

        try {
            const coverDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
            const created = await postJson('/api/articles', {
                title: 'Durable OSS Cover',
                excerpt: 'Durable cover regression',
                content: 'The cover must not depend on a browser Referer header.',
                category: '\u5176\u4ed6',
                read_time: '1 min',
                cover_image: coverDataUrl
            }, userToken);
            assert.equal(created.response.status, 201);
            createdArticleId = created.body.data.id;
            coverAssetId = created.body.data.cover_image_asset_id;
            const durableUrl = `/api/assets/proxy/${encodeURIComponent(coverAssetId)}`;
            assert.equal(created.body.data.cover_image, durableUrl);
            assert.equal(db.prepare('SELECT cover_image FROM articles WHERE id = ?').get(createdArticleId).cover_image, durableUrl);

            const asset = db.prepare('SELECT url, storage_key, metadata FROM article_assets WHERE id = ?').get(coverAssetId);
            assert.match(asset.url, /^https:\/\/oss\.example\.test\//);
            assert.match(asset.storage_key, /^articles\/cover\//);
            assert.equal(JSON.parse(asset.metadata).storage, 'oss');

            db.prepare('UPDATE articles SET cover_image = ? WHERE id = ?')
                .run('https://oss.example.test/articles/cover/legacy-direct.png', createdArticleId);
            const legacyDirect = await request(`/api/articles/${createdArticleId}/live/legacy-direct-cover`);
            assert.equal(legacyDirect.response.status, 200);
            assert.equal(legacyDirect.body.data.cover_image, durableUrl);

            db.prepare('UPDATE articles SET cover_image = ?, cover_image_asset_id = ? WHERE id = ?')
                .run('/assets/uploads/legacy-cover.png', `missing-${coverAssetId}`, createdArticleId);
            const missingAsset = await request(`/api/articles/${createdArticleId}/live/missing-cover-asset`);
            assert.equal(missingAsset.response.status, 200);
            assert.equal(missingAsset.body.data.cover_image, '/assets/uploads/legacy-cover.png');
            db.prepare('UPDATE articles SET cover_image = ?, cover_image_asset_id = ? WHERE id = ?')
                .run(durableUrl, coverAssetId, createdArticleId);

            const updated = await putJson(`/api/user/articles/${createdArticleId}`, {
                title: 'Durable OSS Cover',
                excerpt: 'Durable cover regression',
                content: 'Updated article content.',
                content_format: 'markdown',
                category: '\u5176\u4ed6',
                read_time: '1 min',
                cover_image: `${durableUrl}?expires=1&signature=expired`,
                cover_image_asset_id: coverAssetId
            }, userToken);
            assert.equal(updated.response.status, 200);
            assert.equal(updated.body.data.cover_image, durableUrl);
            assert.equal(db.prepare('SELECT cover_image FROM articles WHERE id = ?').get(createdArticleId).cover_image, durableUrl);

            db.prepare(`
                INSERT INTO article_assets (id, owner_id, asset_type, mime_type, url, storage_key, metadata)
                VALUES (?, 'user-002', 'cover-image', 'image/png', ?, ?, ?)
            `).run(
                foreignAssetId,
                `https://oss.example.test/private/${foreignAssetId}.png`,
                `private/${foreignAssetId}.png`,
                JSON.stringify({ storage: 'oss' })
            );
            const foreignCover = await putJson(`/api/user/articles/${createdArticleId}`, {
                title: 'Durable OSS Cover',
                excerpt: 'Durable cover regression',
                content: 'Must not expose another users private cover.',
                content_format: 'markdown',
                category: '\u5176\u4ed6',
                read_time: '1 min',
                cover_image: `https://oss.example.test/private/${foreignAssetId}.png`,
                cover_image_asset_id: foreignAssetId
            }, userToken);
            assert.equal(foreignCover.response.status, 403);
            assert.equal(db.prepare('SELECT cover_image_asset_id FROM articles WHERE id = ?').get(createdArticleId).cover_image_asset_id, coverAssetId);
        } finally {
            objectStorage.getSettings = originalGetSettings;
            objectStorage.putObject = originalPutObject;
            db.prepare('DELETE FROM article_assets WHERE id = ?').run(foreignAssetId);
            if (createdArticleId) {
                await request(`/api/user/articles/${createdArticleId}`, {
                    method: 'DELETE',
                    headers: jsonHeaders(userToken)
                });
            }
            if (coverAssetId) db.prepare('DELETE FROM article_assets WHERE id = ?').run(coverAssetId);
        }
    });

    it('lets an author delete an article with dependent content', async () => {
        const graph = seedArticleDeletionGraph('user-001', `user-${Date.now()}`);
        try {
            const removed = await request(`/api/user/articles/${graph.id}`, {
                method: 'DELETE',
                headers: jsonHeaders(userToken)
            });
            assert.equal(removed.response.status, 200);
            assert.equal(removed.body.success, true);
            assertArticleDeletionGraphRemoved(graph);
        } finally {
            cleanupArticleDeletionGraph(graph);
        }
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

describe('gallery API', () => {
    it('includes the public uploader name without exposing account details', async () => {
        const assetId = `gallery-owner-${Date.now()}`;
        const originalAvatar = db.prepare('SELECT avatar FROM users WHERE id = ?').get('user-001').avatar;
        const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        db.prepare('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(avatar, 'user-001');
        db.prepare(`
            INSERT INTO article_assets (
                id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
            ) VALUES (?, ?, 'image', 'image/png', ?, ?, ?, datetime('now', '+1 hour'), datetime('now', '+1 hour'))
        `).run(
            assetId,
            'user-001',
            `/assets/uploads/${assetId}.png`,
            `assets/uploads/${assetId}.png`,
            JSON.stringify({ collection: 'gallery', gallery: true, title: 'Uploader credit test' })
        );

        try {
            const list = await request('/api/assets/gallery?limit=48&search=Uploader%20credit%20test');
            assert.equal(list.response.status, 200);
            const listedAsset = list.body.data.assets.find(asset => asset.id === assetId);
            assert.ok(listedAsset);
            assert.equal(listedAsset.owner_username, 'normal-user');
            assert.equal(listedAsset.owner_has_avatar, true);
            assert.equal(listedAsset.owner_avatar_url, '');
            assert.ok(listedAsset.owner_avatar_updated_at);
            assert.equal(listedAsset.preview_url, listedAsset.access_url);
            assert.equal(Object.hasOwn(listedAsset, 'email'), false);
            assert.equal(Object.hasOwn(listedAsset, 'avatar'), false);

            const avatarResponse = await fetch(`${baseUrl}/api/user/public/normal-user/avatar?v=${encodeURIComponent(listedAsset.owner_avatar_updated_at)}`);
            assert.equal(avatarResponse.status, 200);
            assert.equal(avatarResponse.headers.get('content-type'), 'image/png');
            assert.match(avatarResponse.headers.get('cache-control') || '', /immutable/);
            assert.ok((await avatarResponse.arrayBuffer()).byteLength > 0);

            const legacyQqAvatar = 'http://thirdqq.qlogo.cn/ek_qqapp/example-avatar/100';
            db.prepare('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(legacyQqAvatar, 'user-001');
            const legacyList = await request('/api/assets/gallery?limit=48&search=Uploader%20credit%20test');
            const legacyAsset = legacyList.body.data.assets.find(asset => asset.id === assetId);
            assert.equal(legacyAsset.owner_avatar_url, 'https://thirdqq.qlogo.cn/ek_qqapp/example-avatar/100');

            const preview = await request('/api/assets/gallery/public?limit=23');
            assert.equal(preview.response.status, 200);
            const previewAsset = preview.body.data.assets.find(asset => asset.id === assetId);
            assert.ok(previewAsset);
            assert.equal(previewAsset.owner_username, 'normal-user');
        } finally {
            db.prepare('DELETE FROM article_assets WHERE id = ?').run(assetId);
            db.prepare('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(originalAvatar, 'user-001');
        }
    });

    it('redirects OSS image previews without unsupported response overrides', async () => {
        const assetId = `gallery-oss-preview-${Date.now()}`;
        const storageKey = `users/user-001/gallery/${assetId}.png`;
        const originalSignatureUrl = objectStorage.aliyunV1SignatureUrl;
        let signatureOptions = null;
        objectStorage.aliyunV1SignatureUrl = (key, options) => {
            assert.equal(key, storageKey);
            signatureOptions = options;
            return 'https://storage.example.test/signed-image.png';
        };
        db.prepare(`
            INSERT INTO article_assets (
                id, owner_id, asset_type, mime_type, url, storage_key, metadata
            ) VALUES (?, ?, 'gallery-image', 'image/png', ?, ?, ?)
        `).run(
            assetId,
            'user-001',
            `https://storage.example.test/${storageKey}`,
            storageKey,
            JSON.stringify({
                storage: 'oss',
                collection: 'gallery',
                gallery: true,
                visibility: 'public',
                fileName: 'preview.png'
            })
        );

        try {
            const gallery = await request(`/api/assets/gallery?limit=12&search=${encodeURIComponent(assetId)}`);
            const listedAsset = gallery.body.data.assets.find(asset => asset.id === assetId);
            assert.equal(listedAsset.preview_url, 'https://storage.example.test/signed-image.png');

            const response = await fetch(`${baseUrl}/api/assets/proxy/${encodeURIComponent(assetId)}`, {
                redirect: 'manual'
            });
            assert.equal(response.status, 302);
            assert.equal(response.headers.get('location'), 'https://storage.example.test/signed-image.png');
            assert.equal(signatureOptions.preferPublicBase, true);
            assert.equal(Object.hasOwn(signatureOptions, 'contentType'), false);
            assert.equal(Object.hasOwn(signatureOptions, 'contentDisposition'), false);
        } finally {
            objectStorage.aliyunV1SignatureUrl = originalSignatureUrl;
            db.prepare('DELETE FROM article_assets WHERE id = ?').run(assetId);
        }
    });

    it('keeps OSS media redirects free of unsupported response type overrides', async () => {
        const assetId = `gallery-oss-video-${Date.now()}`;
        const storageKey = `users/user-001/video/${assetId}.mp4`;
        const originalSignatureUrl = objectStorage.aliyunV1SignatureUrl;
        let signatureOptions = null;
        objectStorage.aliyunV1SignatureUrl = (key, options) => {
            assert.equal(key, storageKey);
            signatureOptions = options;
            return 'https://storage.example.test/signed-video.mp4';
        };
        db.prepare(`
            INSERT INTO article_assets (
                id, owner_id, asset_type, mime_type, url, storage_key, metadata
            ) VALUES (?, ?, 'video', 'video/mp4', ?, ?, ?)
        `).run(
            assetId,
            'user-001',
            `https://storage.example.test/${storageKey}`,
            storageKey,
            JSON.stringify({ storage: 'oss', visibility: 'public', fileName: 'preview.mp4' })
        );

        try {
            const response = await fetch(`${baseUrl}/api/assets/proxy/${encodeURIComponent(assetId)}`, {
                redirect: 'manual'
            });
            assert.equal(response.status, 302);
            assert.equal(response.headers.get('location'), 'https://storage.example.test/signed-video.mp4');
            assert.equal(signatureOptions.preferPublicBase, true);
            assert.equal(Object.hasOwn(signatureOptions, 'contentType'), false);
            assert.equal(Object.hasOwn(signatureOptions, 'contentDisposition'), false);
        } finally {
            objectStorage.aliyunV1SignatureUrl = originalSignatureUrl;
            db.prepare('DELETE FROM article_assets WHERE id = ?').run(assetId);
        }
    });

    it('stores safe OSS preview media with inline content disposition', async () => {
        const originalFetch = globalThis.fetch;
        const requests = [];
        globalThis.fetch = async (url, options) => {
            requests.push({ url: String(url), options });
            return new Response('', { status: 200 });
        };
        const settings = {
            ossEnabled: true,
            ossProvider: 'aliyun',
            ossEndpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
            ossRegion: 'cn-hangzhou',
            ossBucket: 'preview-test',
            ossAccessKeyId: 'test-access-key',
            ossAccessKeySecret: 'test-access-secret',
            ossUploadPath: 'tests/${role}'
        };

        try {
            await objectStorage.putObject({
                buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
                mimeType: 'image/png',
                ext: 'png',
                role: 'gallery',
                id: 'inline-preview',
                settings
            });
            await objectStorage.putObject({
                buffer: Buffer.from('%PDF-1.7'),
                mimeType: 'application/pdf',
                ext: 'pdf',
                role: 'attachment',
                id: 'download-document',
                settings
            });

            assert.match(requests[0].options.headers['content-disposition'], /^inline;/);
            assert.match(requests[1].options.headers['content-disposition'], /^attachment;/);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe('site activity feed', () => {
    it('publishes cache-safe JSON and RSS feeds and refreshes after content changes', async () => {
        const first = await request('/api/site-feed?limit=20');

        assert.equal(first.response.status, 200);
        assert.match(first.response.headers.get('cache-control') || '', /no-store/);
        assert.equal(first.response.headers.get('surrogate-control'), 'no-store');
        assert.equal(first.body.success, true);
        assert.equal(first.body.data.site.status, 'online');
        assert.ok(Array.isArray(first.body.data.items));
        assert.ok(Number.isFinite(first.body.data.stats.articles));
        assert.match(first.body.data.feeds.json, /\/api\/site-feed$/);
        assert.match(first.body.data.feeds.rss, /\/api\/site-feed\/rss$/);
        assert.match(first.body.data.feeds.rssAlias, /\/feed\.xml$/);

        const keys = new Set();
        const collectKeys = (value) => {
            if (!value || typeof value !== 'object') return;
            for (const [key, child] of Object.entries(value)) {
                keys.add(key);
                collectKeys(child);
            }
        };
        collectKeys(first.body.data);
        for (const privateKey of ['content', 'pixels', 'palette', 'storage_key', 'owner_id', 'author_id', 'user_id', 'avatar', 'email']) {
            assert.equal(keys.has(privateKey), false, `site feed exposed ${privateKey}`);
        }

        const etag = first.response.headers.get('etag');
        assert.ok(etag);
        const notModified = await request('/api/site-feed?limit=20', {
            headers: { 'If-None-Match': etag }
        });
        assert.equal(notModified.response.status, 304);

        const title = `Fresh Site Feed ${Date.now()}`;
        const created = await postJson('/api/articles', {
            title,
            excerpt: 'A new public update for feed cache invalidation.',
            content: 'Feed regression test.',
            category: '\u968f\u7b14'
        }, userToken);
        assert.equal(created.response.status, 201);

        const refreshed = await request('/api/site-feed?limit=30');
        assert.equal(refreshed.response.status, 200);
        assert.ok(refreshed.body.data.items.some(item => item.title === title));

        const rss = await request('/feed.xml?limit=30');
        assert.equal(rss.response.status, 200);
        assert.match(rss.response.headers.get('content-type') || '', /application\/rss\+xml/);
        assert.match(rss.response.headers.get('cache-control') || '', /no-store/);
        assert.match(rss.body, /<rss version="2\.0"/);
        assert.match(rss.body, /<item>/);
        assert.match(rss.body, new RegExp(title));

        const apiRss = await request('/api/site-feed/rss?limit=2');
        assert.equal(apiRss.response.status, 200);
        assert.match(apiRss.response.headers.get('content-type') || '', /application\/rss\+xml/);
        assert.match(apiRss.body, /<rss version="2\.0"/);
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
        assert.match(created.body.data.avatar, publicTestAvatarPattern);

        const list = await request(`/api/messages?article_id=${articleId}`);
        assert.equal(list.response.status, 200);
        const listedMessage = list.body.data.find(item => item.id === messageId);
        assert.ok(listedMessage);
        assert.match(listedMessage.avatar, publicTestAvatarPattern);

        const liked = await postJson(`/api/messages/${messageId}/like`, {}, userToken);
        assert.equal(liked.response.status, 200);
        assert.equal(liked.body.data.like_count, 1);
        assert.equal(liked.body.data.viewer_liked, true);

        const likedIds = await request('/api/messages/liked', { headers: jsonHeaders(userToken) });
        assert.equal(likedIds.response.status, 200);
        assert.ok(likedIds.body.data.includes(messageId));

        const otherLikedIds = await request('/api/messages/liked', { headers: jsonHeaders(managedUserToken) });
        assert.equal(otherLikedIds.response.status, 200);
        assert.ok(!otherLikedIds.body.data.includes(messageId));

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
        assert.doesNotMatch(JSON.stringify(listWithReply.body), /data:image\//);

        const plazaLatest = await request('/api/messages/plaza/latest?limit=4');
        assert.equal(plazaLatest.response.status, 200);
        assert.ok(plazaLatest.body.data.length <= 4);
        assert.ok(plazaLatest.body.data.every(item => !Object.hasOwn(item, 'avatar') && !Object.hasOwn(item, 'user_id')));
        assert.ok(JSON.stringify(plazaLatest.body).length < 16 * 1024);
    });

    it('lets users manage only their own messages without deleting other users replies', async () => {
        const created = await postJson('/api/messages', {
            content: 'An editable owner message'
        }, userToken);
        assert.equal(created.response.status, 201);
        const ownedId = created.body.data.id;

        const reply = await postJson(`/api/messages/${ownedId}/reply`, {
            content: 'A reply that must survive parent deletion'
        }, managedUserToken);
        assert.equal(reply.response.status, 201);

        const mine = await request('/api/messages/mine', { headers: jsonHeaders(userToken) });
        assert.equal(mine.response.status, 200);
        assert.ok(mine.body.data.some(item => item.id === ownedId));
        assert.ok(mine.body.data.every(item => item.user_id === 'user-001'));

        const deniedEdit = await patchJson(`/api/messages/${ownedId}`, {
            content: 'Unauthorized edit'
        }, managedUserToken);
        assert.equal(deniedEdit.response.status, 404);

        const edited = await patchJson(`/api/messages/${ownedId}`, {
            content: 'The owner updated this message'
        }, userToken);
        assert.equal(edited.response.status, 200);
        assert.equal(edited.body.data.content, 'The owner updated this message');

        const deniedDelete = await request(`/api/messages/${ownedId}`, {
            method: 'DELETE',
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(deniedDelete.response.status, 404);

        const deleted = await request(`/api/messages/${ownedId}`, {
            method: 'DELETE',
            headers: jsonHeaders(userToken)
        });
        assert.equal(deleted.response.status, 200);
        assert.equal(db.prepare('SELECT id FROM messages WHERE id = ?').get(ownedId), undefined);
        assert.equal(db.prepare('SELECT parent_id FROM messages WHERE id = ?').get(reply.body.data.id).parent_id, null);
    });
});

describe('pixel art API', () => {
    function makePixelArtworkPayload(title, width = 32, height = 18) {
        const pixels = Array(width * height).fill(-1);
        pixels[width * 3 + 3] = 2;
        pixels[width * 3 + 4] = 3;
        pixels[width * 4 + 3] = 4;
        pixels[width * 4 + 4] = 5;
        return {
            title,
            description: `${title} description`,
            size: width,
            width,
            height,
            background_color: '#172033',
            palette: ['#0b1020', '#ffffff', '#aef2ff', '#7b8cf6', '#a481ff', '#ff9aba'],
            pixels
        };
    }

    it('creates, lists, and likes shared pixel artworks', async () => {
        const artworkWidth = 128;
        const artworkHeight = 72;
        const pixels = Array(artworkWidth * artworkHeight).fill(-1);
        pixels[artworkWidth * 4 + 4] = 2;
        pixels[artworkWidth * 4 + 5] = 3;
        pixels[artworkWidth * 5 + 4] = 4;
        pixels[artworkWidth * 5 + 5] = 5;

        const created = await postJson('/api/pixel-art', {
            title: 'Test Pixel Moon',
            description: 'A small test painting',
            size: artworkWidth,
            width: artworkWidth,
            height: artworkHeight,
            background_color: '#172033',
            palette: ['#0b1020', '#ffffff', '#aef2ff', '#7b8cf6', '#a481ff', '#ff9aba'],
            pixels
        }, userToken);
        assert.equal(created.response.status, 201);
        assert.equal(created.body.success, true);
        assert.equal(created.body.data.author, 'normal-user');
        assert.match(created.body.data.avatar, publicTestAvatarPattern);
        assert.equal(created.body.data.size, artworkWidth);
        assert.equal(created.body.data.width, artworkWidth);
        assert.equal(created.body.data.height, artworkHeight);
        assert.equal(created.body.data.background_color, '#172033');
        pixelArtworkId = created.body.data.id;

        const list = await request('/api/pixel-art?limit=10');
        assert.equal(list.response.status, 200);
        assert.ok(list.body.data.some(item => item.id === pixelArtworkId));

        const galleryList = await request('/api/pixel-art/gallery');
        assert.equal(galleryList.response.status, 200);
        const galleryArtwork = galleryList.body.data.find(item => item.id === pixelArtworkId);
        assert.ok(galleryArtwork);
        assert.equal(galleryList.body.pagination.limit, 12);
        assert.equal(Object.hasOwn(galleryArtwork, 'pixels'), false);
        assert.equal(typeof galleryArtwork.pixels_base64, 'string');
        assert.ok(galleryArtwork.preview_width <= 192);
        assert.ok(galleryArtwork.preview_height <= 108);
        assert.doesNotMatch(JSON.stringify(galleryList.body), /data:image\//);
        assert.match(galleryList.response.headers.get('cache-control') || '', /no-store/);

        const previewList = await request('/api/pixel-art/preview');
        assert.equal(previewList.response.status, 200);
        assert.equal(previewList.body.data.length, 1);
        assert.equal(Object.hasOwn(previewList.body.data[0], 'pixels'), false);
        assert.equal(typeof previewList.body.data[0].pixels_base64, 'string');
        assert.match(previewList.response.headers.get('cache-control') || '', /no-store/);

        const liked = await postJson(`/api/pixel-art/${pixelArtworkId}/like`, {}, managedUserToken);
        assert.equal(liked.response.status, 200);
        assert.equal(liked.body.data.like_count, 1);
        assert.equal(liked.body.data.viewer_liked, true);

        const duplicateLike = await postJson(`/api/pixel-art/${pixelArtworkId}/like`, {}, managedUserToken);
        assert.equal(duplicateLike.response.status, 400);

        const detail = await request(`/api/pixel-art/${pixelArtworkId}`, {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(detail.response.status, 200);
        assert.equal(detail.body.data.viewer_liked, true);
        assert.equal(detail.body.data.width, artworkWidth);
        assert.equal(detail.body.data.height, artworkHeight);
        assert.equal(detail.body.data.pixels.length, artworkWidth * artworkHeight);

        const likedGallery = await request('/api/pixel-art/gallery', {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(likedGallery.response.status, 200);
        assert.equal(likedGallery.body.data.find(item => item.id === pixelArtworkId)?.viewer_liked, true);

        const hubPreview = await request('/api/hub-preview');
        assert.equal(hubPreview.response.status, 200);
        assert.equal(hubPreview.body.success, true);
        assert.ok(hubPreview.body.data.article);
        assert.ok(Array.isArray(hubPreview.body.data.messages));
        assert.ok(hubPreview.body.data.pixel);
        assert.equal(Object.hasOwn(hubPreview.body.data.pixel, 'pixels'), false);
        assert.equal(typeof hubPreview.body.data.pixel.pixels_base64, 'string');
        assert.equal(hubPreview.body.data.pixel.width, artworkWidth);
        assert.equal(hubPreview.body.data.pixel.height, artworkHeight);
        assert.ok(JSON.stringify(hubPreview.body).length < 64 * 1024);

        const shareImage = await fetch(`${baseUrl}/api/pixel-art/${pixelArtworkId}/image.png`);
        assert.equal(shareImage.status, 200);
        assert.equal(shareImage.headers.get('content-type'), 'image/png');
        assert.equal(Buffer.from(await shareImage.arrayBuffer()).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

        const crawlerPage = await request(`/pixel?art=${pixelArtworkId}`, {
            headers: { 'User-Agent': 'Twitterbot/1.0' }
        });
        assert.equal(crawlerPage.response.status, 200);
        assert.match(crawlerPage.body, /Test Pixel Moon/);
        assert.match(crawlerPage.body, new RegExp(`/api/pixel-art/${pixelArtworkId}/image\\.png`));
        assert.match(crawlerPage.body, new RegExp(`/pixel\\?art=${pixelArtworkId}`));
    });

    it('isolates pixel artwork management by owner while allowing admins', async () => {
        const managedCreated = await postJson('/api/pixel-art', makePixelArtworkPayload('Managed User Pixel'), managedUserToken);
        assert.equal(managedCreated.response.status, 201);
        const managedArtworkId = managedCreated.body.data.id;

        const userManageList = await request('/api/pixel-art/manage?limit=20', {
            headers: jsonHeaders(userToken)
        });
        assert.equal(userManageList.response.status, 200);
        assert.ok(userManageList.body.data.some(item => item.id === pixelArtworkId));
        assert.ok(!userManageList.body.data.some(item => item.id === managedArtworkId));

        const forbiddenRead = await request(`/api/pixel-art/manage/${managedArtworkId}`, {
            headers: jsonHeaders(userToken)
        });
        assert.equal(forbiddenRead.response.status, 403);

        const forbiddenUpdate = await putJson(
            `/api/pixel-art/${managedArtworkId}`,
            makePixelArtworkPayload('Hijacked Pixel'),
            userToken
        );
        assert.equal(forbiddenUpdate.response.status, 403);

        const forbiddenDelete = await request(`/api/pixel-art/${managedArtworkId}`, {
            method: 'DELETE',
            headers: jsonHeaders(userToken)
        });
        assert.equal(forbiddenDelete.response.status, 403);

        const ownDetail = await request(`/api/pixel-art/${pixelArtworkId}`, {
            headers: jsonHeaders(userToken)
        });
        assert.equal(ownDetail.response.status, 200);
        const ownPixels = [...ownDetail.body.data.pixels];
        ownPixels[0] = 1;
        const ownerUpdate = await putJson(`/api/pixel-art/${pixelArtworkId}`, {
            title: 'Updated Test Pixel Moon',
            description: 'Updated by owner',
            size: ownDetail.body.data.width,
            width: ownDetail.body.data.width,
            height: ownDetail.body.data.height,
            background_color: ownDetail.body.data.background_color,
            palette: ownDetail.body.data.palette,
            pixels: ownPixels
        }, userToken);
        assert.equal(ownerUpdate.response.status, 200);
        assert.equal(ownerUpdate.body.data.title, 'Updated Test Pixel Moon');
        assert.equal(ownerUpdate.body.data.author, 'normal-user');

        const adminManageList = await request('/api/pixel-art/manage?limit=20', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(adminManageList.response.status, 200);
        assert.ok(adminManageList.body.data.some(item => item.id === pixelArtworkId));
        assert.ok(adminManageList.body.data.some(item => item.id === managedArtworkId));

        const adminUpdate = await putJson(
            `/api/pixel-art/${managedArtworkId}`,
            makePixelArtworkPayload('Admin Curated Pixel'),
            adminToken
        );
        assert.equal(adminUpdate.response.status, 200);
        assert.equal(adminUpdate.body.data.title, 'Admin Curated Pixel');
        assert.equal(adminUpdate.body.data.author, 'managed-user');

        const adminDelete = await request(`/api/pixel-art/${managedArtworkId}`, {
            method: 'DELETE',
            headers: jsonHeaders(adminToken)
        });
        assert.equal(adminDelete.response.status, 200);

        const deletedDetail = await request(`/api/pixel-art/${managedArtworkId}`);
        assert.equal(deletedDetail.response.status, 404);
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
        assert.ok(inbox.body.data.some(item => item.type === 'pixel_art_like' && item.metadata?.artworkId === pixelArtworkId));

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

describe('social API', () => {
    it('creates mention notifications and returns trending topics', async () => {
        const created = await postJson('/api/messages', {
            content: '@managed-user 请来看看 #月读茶会# 的新话题。'
        }, userToken);
        assert.equal(created.response.status, 201);

        const inbox = await request('/api/user/notifications', {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(inbox.response.status, 200);
        assert.ok(inbox.body.data.some(item => item.type === 'mention' && /提到了你/.test(item.title)));

        const topics = await request('/api/messages/topics?limit=5');
        assert.equal(topics.response.status, 200);
        assert.ok(topics.body.data.some(item => item.topic === '月读茶会'));
    });

    it('supports public profiles, following authors, and article bookmarks', async () => {
        const profile = await request('/api/user/public/normal-user', {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(profile.response.status, 200);
        assert.equal(profile.body.data.user.username, 'normal-user');
        assert.equal(profile.body.data.viewer.isFollowing, false);
        assert.ok(profile.body.data.stats.articles >= 1);

        const followed = await postJson('/api/user/follow/user-001', {}, managedUserToken);
        assert.equal(followed.response.status, 200);
        assert.equal(followed.body.data.isFollowing, true);
        assert.ok(followed.body.data.followers >= 1);

        const followedProfile = await request('/api/user/public/normal-user', {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(followedProfile.body.data.viewer.isFollowing, true);

        const bookmarked = await postJson(`/api/user/bookmarks/${articleId}`, {}, managedUserToken);
        assert.equal(bookmarked.response.status, 200);
        assert.equal(bookmarked.body.data.bookmarked, true);
        assert.ok(bookmarked.body.data.count >= 1);

        const status = await request(`/api/user/bookmarks/${articleId}/status`, {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(status.response.status, 200);
        assert.equal(status.body.data.bookmarked, true);

        const bookmarks = await request('/api/user/bookmarks', {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(bookmarks.response.status, 200);
        assert.ok(bookmarks.body.data.some(item => Number(item.id) === Number(articleId)));

        const unfollowed = await request('/api/user/follow/user-001', {
            method: 'DELETE',
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(unfollowed.response.status, 200);
        assert.equal(unfollowed.body.data.isFollowing, false);

        const unbookmarked = await request(`/api/user/bookmarks/${articleId}`, {
            method: 'DELETE',
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(unbookmarked.response.status, 200);
        assert.equal(unbookmarked.body.data.bookmarked, false);
    });
});

describe('stats API', () => {
    it('counts plaza top-level messages without counting replies', async () => {
        const before = await request('/api/stats');
        assert.equal(before.response.status, 200);
        const beforeMessages = before.body.data.messages;

        const plazaMessage = await postJson('/api/messages', {
            content: 'A plaza message for stats'
        }, userToken);
        assert.equal(plazaMessage.response.status, 201);

        const afterMessage = await request('/api/stats/live/message-count');
        assert.equal(afterMessage.response.status, 200);
        assert.equal(afterMessage.body.data.messages, beforeMessages + 1);

        const reply = await postJson(`/api/messages/${plazaMessage.body.data.id}/reply`, {
            content: 'A plaza reply that should not change stats'
        }, managedUserToken);
        assert.equal(reply.response.status, 201);

        const afterReply = await request('/api/stats/live/reply-count');
        assert.equal(afterReply.response.status, 200);
        assert.equal(afterReply.body.data.messages, beforeMessages + 1);
    });

    it('records page views and returns public site counters', async () => {
        const recorded = await postJson('/api/stats/view', { path: '/hub' });
        assert.equal(recorded.response.status, 200);
        assert.equal(recorded.body.success, true);
        assert.ok(recorded.body.data.todayViews >= 1);

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

    it('deduplicates repeated anonymous visits from the same browser for the current Hong Kong day', async () => {
        const before = await request('/api/stats');
        const beforeToday = before.body.data.todayViews;
        const first = await request('/api/stats/view', {
            method: 'POST',
            headers: {
                ...jsonHeaders(),
                'x-forwarded-for': '203.0.113.10',
                'user-agent': 'tsukuyomi-dedupe-test'
            },
            body: JSON.stringify({ path: '/room' })
        });
        const second = await request('/api/stats/view', {
            method: 'POST',
            headers: {
                ...jsonHeaders(),
                'x-forwarded-for': '203.0.113.10',
                'user-agent': 'tsukuyomi-dedupe-test'
            },
            body: JSON.stringify({ path: '/plaza' })
        });
        assert.equal(first.response.status, 200);
        assert.equal(second.response.status, 200);
        assert.equal(second.body.deduped, true);

        const after = await request('/api/stats');
        assert.equal(after.body.data.todayViews, beforeToday + 1);
    });

    it('merges an anonymous browser visit into the signed-in account for the same day', async () => {
        const before = await request('/api/stats');
        const visitor = await request('/api/stats/view', {
            method: 'POST',
            headers: {
                ...jsonHeaders(),
                'user-agent': 'tsukuyomi-alias-test'
            },
            body: JSON.stringify({ path: '/access' })
        });
        const visitorCookie = authCookieFrom(visitor.response);
        const userHeaders = jsonHeaders(userToken);
        const combinedCookie = [userHeaders.Cookie, visitorCookie].filter(Boolean).join('; ');
        const signedIn = await request('/api/stats/view', {
            method: 'POST',
            headers: {
                ...userHeaders,
                ...(combinedCookie ? { Cookie: combinedCookie } : {}),
                'user-agent': 'tsukuyomi-alias-test'
            },
            body: JSON.stringify({ path: '/hub' })
        });

        assert.equal(visitor.body.recorded, true);
        assert.equal(signedIn.body.deduped, true);
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count
            FROM stats
            WHERE event_type = 'view'
              AND visit_day = date('now', '+8 hours')
              AND visitor_key = 'account:user:user-001'
        `).get().count, 1);
        const after = await request('/api/stats');
        assert.equal(after.body.data.todayViews, before.body.data.todayViews + 1);
    });

    it('counts each signed-in account only once per day across repeated visits', async () => {
        const before = await request('/api/stats');
        const managedFirst = await postJson('/api/stats/view', { path: '/room' }, managedUserToken);
        const managedAgain = await postJson('/api/stats/view', { path: '/plaza' }, managedUserToken);
        const adminFirst = await postJson('/api/stats/view', { path: '/terminal' }, adminToken);
        const adminAgain = await postJson('/api/stats/view', { path: '/terminal?panel=analytics' }, adminToken);

        assert.equal(managedFirst.body.recorded, true);
        assert.equal(managedAgain.body.deduped, true);
        assert.equal(adminFirst.body.recorded, true);
        assert.equal(adminAgain.body.deduped, true);
        const after = await request('/api/stats');
        assert.equal(after.body.data.todayViews, before.body.data.todayViews + 2);
    });

    it('records the same account again on a later Hong Kong day', async () => {
        const managedView = db.prepare(`
            SELECT id
            FROM stats
            WHERE event_type = 'view'
              AND visitor_key = 'account:user:user-002'
              AND visit_day = date('now', '+8 hours')
        `).get();
        assert.ok(managedView?.id);
        db.prepare(`
            UPDATE stats
            SET visit_day = date('now', '+8 hours', '-1 day'),
                created_at = datetime('now', '-1 day')
            WHERE id = ?
        `).run(managedView.id);

        const nextDay = await postJson('/api/stats/view', { path: '/hub' }, managedUserToken);
        assert.equal(nextDay.body.recorded, true);
        assert.equal(db.prepare(`
            SELECT COUNT(DISTINCT visit_day) AS count
            FROM stats
            WHERE event_type = 'view'
              AND visitor_key = 'account:user:user-002'
        `).get().count, 2);
    });

    it('rejects untrusted page-view writes without the same-origin request header', async () => {
        const rejected = await request('/api/stats/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/forged' })
        });
        assert.equal(rejected.response.status, 403);
        assert.deepEqual(rejected.body, { success: false, message: '请求被拒绝' });
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
    it('persists room chat turns per account and broadcasts content-free updates', async () => {
        const unauthenticated = await request('/api/room/chat');
        assert.equal(unauthenticated.response.status, 401);

        let userStream;
        let managedStream;
        try {
            [userStream, managedStream] = await Promise.all([
                openEventStream('/api/room/memory/events', userToken),
                openEventStream('/api/room/memory/events', managedUserToken)
            ]);
            await Promise.all([readEvent(userStream, 'ready'), readEvent(managedStream, 'ready')]);

            const turnId = `turn-${Date.now()}-account-a`;
            const saved = await postJson('/api/room/chat/turn', {
                turnId,
                userId: 'spoofed-account',
                userMessage: 'Cross-device room question',
                assistantMessage: 'Cross-device room answer'
            }, userToken);
            assert.equal(saved.response.status, 201);
            assert.deepEqual(saved.body.data.map(item => item.role), ['user', 'assistant']);

            const event = await readEvent(userStream, 'chat');
            assert.equal(event.action, 'turn-saved');
            assert.equal(event.messageIds.length, 2);
            assert.equal(Object.hasOwn(event, 'content'), false);
            assert.equal(Object.hasOwn(event, 'userId'), false);

            const isolated = await request('/api/room/chat', { headers: jsonHeaders(managedUserToken) });
            assert.equal(isolated.response.status, 200);
            assert.equal(isolated.body.data.length, 0);

            const duplicate = await postJson('/api/room/chat/turn', {
                turnId,
                userMessage: 'Cross-device room question',
                assistantMessage: 'Cross-device room answer'
            }, userToken);
            assert.equal(duplicate.response.status, 200);
            assert.equal(duplicate.body.data.length, 2);

            const imported = await postJson('/api/room/chat/import', {
                messages: [
                    { role: 'user', content: 'Imported local question' },
                    { role: 'assistant', content: 'Imported local answer' }
                ]
            }, managedUserToken);
            assert.equal(imported.response.status, 201);
            assert.deepEqual(imported.body.data.map(item => item.content), ['Imported local question', 'Imported local answer']);

            const userHistory = await request('/api/room/chat', { headers: jsonHeaders(userToken) });
            assert.deepEqual(userHistory.body.data.map(item => item.content), ['Cross-device room question', 'Cross-device room answer']);
        } finally {
            userStream?.controller.abort();
            managedStream?.controller.abort();
            await Promise.allSettled([userStream?.reader?.cancel(), managedStream?.reader?.cancel()]);
            db.prepare("DELETE FROM room_chat_messages WHERE user_id IN ('user-001', 'user-002')").run();
        }
    });

    it('captures memory-only room turns for legacy tabs without duplicating modern saves', async () => {
        const userMessage = 'sync hello';
        const assistantMessage = 'sync reply';

        try {
            db.prepare("DELETE FROM room_chat_messages WHERE user_id = 'user-001'").run();

            const legacy = await postJson('/api/room/memory', {
                userMessage,
                assistantReply: assistantMessage
            }, userToken);
            assert.equal(legacy.response.status, 202);

            const captured = await request('/api/room/chat', { headers: jsonHeaders(userToken) });
            assert.equal(captured.response.status, 200);
            assert.deepEqual(captured.body.data.map(item => item.content), [userMessage, assistantMessage]);

            const modernRetry = await postJson('/api/room/chat/turn', {
                turnId: `turn-${Date.now()}-legacy-retry`,
                userMessage,
                assistantMessage
            }, userToken);
            assert.equal(modernRetry.response.status, 200);
            assert.equal(modernRetry.body.data.length, 2);

            const repeatedLegacy = await postJson('/api/room/memory', {
                userMessage,
                assistantReply: assistantMessage
            }, userToken);
            assert.equal(repeatedLegacy.response.status, 202);

            const deduplicated = await request('/api/room/chat', { headers: jsonHeaders(userToken) });
            assert.equal(deduplicated.body.data.length, 2);
        } finally {
            db.prepare("DELETE FROM room_chat_messages WHERE user_id = 'user-001'").run();
            db.prepare("DELETE FROM room_memories WHERE user_id = 'user-001'").run();
        }
    });

    it('clips Milvus text fields by UTF-8 bytes without breaking Unicode characters', () => {
        const source = '月'.repeat(800);
        const clipped = truncateUtf8(source, 1024);

        assert.equal(Buffer.byteLength(clipped, 'utf8') <= 1024, true);
        assert.equal(clipped, '月'.repeat(341));
        assert.doesNotMatch(clipped, /\uFFFD/);
    });

    it('builds useful local vectors and enforces user scope at the service boundary', () => {
        const preference = createEmbedding('我喜欢浅蓝色和淡紫色');
        const related = createEmbedding('用户偏好浅蓝色房间主题');
        const unrelated = createEmbedding('服务器数据库部署完成');

        assert.ok(similarity(preference, related) > similarity(preference, unrelated));
        assert.throws(() => requireUserId(''), /authenticated user/i);
        assert.match(scopeFilter('user', 'account-a'), /scope == "user" AND user_id == "account-a"/);
    });

    it('requires a logged-in user for server-side room memories', async () => {
        const { response, body } = await request('/api/room/memory/status');

        assert.equal(response.status, 401);
        assert.equal(body.success, false);
    });

    it('streams memory changes only to the authenticated account', async () => {
        const unauthenticated = await request('/api/room/memory/events');
        assert.equal(unauthenticated.response.status, 401);

        let userStream;
        let managedStream;
        let userMemoryId = '';
        let managedMemoryId = '';
        try {
            [userStream, managedStream] = await Promise.all([
                openEventStream('/api/room/memory/events', userToken),
                openEventStream('/api/room/memory/events', managedUserToken)
            ]);
            assert.equal(userStream.response.status, 200);
            assert.equal(managedStream.response.status, 200);
            assert.match(userStream.response.headers.get('content-type') || '', /text\/event-stream/);
            await Promise.all([
                readEvent(userStream, 'ready'),
                readEvent(managedStream, 'ready')
            ]);

            const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const userCreated = await postJson('/api/room/memory', {
                userMessage: `Remember cross-device marker ${marker} for account A.`,
                assistantReply: `Stored marker ${marker}.`,
                force: true
            }, userToken);
            assert.equal(userCreated.response.status, 201);
            userMemoryId = userCreated.body.data.id;

            const userEvent = await readEvent(userStream, 'memory');
            assert.equal(userEvent.action, 'created');
            assert.deepEqual(userEvent.memoryIds, [userMemoryId]);
            assert.equal(Object.hasOwn(userEvent, 'userId'), false);
            assert.equal(Object.hasOwn(userEvent, 'content'), false);

            const managedCreated = await postJson('/api/room/memory', {
                userMessage: `Remember cross-device marker ${marker} for account B.`,
                assistantReply: `Stored account B marker ${marker}.`,
                force: true
            }, managedUserToken);
            assert.equal(managedCreated.response.status, 201);
            managedMemoryId = managedCreated.body.data.id;

            const managedEvent = await readEvent(managedStream, 'memory');
            assert.equal(managedEvent.action, 'created');
            assert.deepEqual(managedEvent.memoryIds, [managedMemoryId]);
            assert.notEqual(managedEvent.memoryIds[0], userMemoryId);
        } finally {
            userStream?.controller.abort();
            managedStream?.controller.abort();
            await Promise.allSettled([
                userStream?.reader?.cancel(),
                managedStream?.reader?.cancel()
            ]);
            if (userMemoryId) {
                await request(`/api/room/memory/${userMemoryId}`, {
                    method: 'DELETE',
                    headers: jsonHeaders(userToken)
                });
            }
            if (managedMemoryId) {
                await request(`/api/room/memory/${managedMemoryId}`, {
                    method: 'DELETE',
                    headers: jsonHeaders(managedUserToken)
                });
            }
        }
    });

    it('records, searches, isolates, and clears per-user memories', async () => {
        const created = await postJson('/api/room/memory', {
            userId: 'spoofed-other-account',
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
        assert.equal(created.body.data.vectorPending, false);

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

        const isolatedDetail = await request(`/api/room/memory/${created.body.data.id}`, {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(isolatedDetail.response.status, 404);

        const isolatedUpdate = await request(`/api/room/memory/${created.body.data.id}`, {
            method: 'PATCH',
            headers: jsonHeaders(managedUserToken),
            body: JSON.stringify({ summary: '不应允许跨账号修改' })
        });
        assert.equal(isolatedUpdate.response.status, 404);

        const isolatedDelete = await request(`/api/room/memory/${created.body.data.id}`, {
            method: 'DELETE',
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(isolatedDelete.response.status, 404);

        const status = await request('/api/room/memory/status', {
            headers: jsonHeaders(userToken)
        });
        assert.equal(status.response.status, 200);
        assert.equal(status.body.data.scope, 'per-user');
        assert.equal(status.body.data.count, 1);
        assert.equal(status.body.data.embedding.activeModel, 'feature-hash-v2');
        assert.deepEqual(status.body.data.vectorSync, { pending: 0, failed: 0, pendingDeletions: 0, lastSyncedAt: '' });
        assert.ok(status.body.data.byType.some(item => item.type === 'project' && item.count === 1));

        const synced = await postJson('/api/room/memory/vector-sync', { limit: 500, userId: 'spoofed-other-account' }, userToken);
        assert.equal(synced.response.status, 200);
        assert.equal(synced.body.data.sync.enabled, false);

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

    it('does not merge unrelated memories on vector similarity alone', async () => {
        try {
            const scenarios = [
                {
                    type: 'conversation',
                    firstSummary: 'Astronomy telescope calibration notes',
                    firstContent: 'Orion nebula aperture tracking and equatorial mount alignment.',
                    secondSummary: 'Sourdough fermentation kitchen schedule',
                    secondContent: 'Rye starter hydration timing and cast iron baking temperature.'
                },
                {
                    type: 'preference',
                    firstSummary: 'Enjoys minimalist piano recordings',
                    firstContent: 'Prefers quiet solo piano albums during early morning reading.',
                    secondSummary: 'Chooses spicy Sichuan noodles',
                    secondContent: 'Orders extra chili oil with hand pulled noodles at lunch.'
                }
            ];

            for (const scenario of scenarios) {
                const first = await postJson('/api/room/memory', {
                    type: scenario.type,
                    summary: scenario.firstSummary,
                    content: scenario.firstContent,
                    force: true
                }, userToken);
                assert.equal(first.response.status, 201);

                const falsePositiveVector = createEmbedding(`${scenario.secondSummary}\n${scenario.secondContent}`);
                db.prepare('UPDATE room_memories SET embedding = ? WHERE id = ? AND user_id = ?')
                    .run(JSON.stringify(falsePositiveVector), first.body.data.id, 'user-001');

                const second = await postJson('/api/room/memory', {
                    type: scenario.type,
                    summary: scenario.secondSummary,
                    content: scenario.secondContent,
                    force: true
                }, userToken);
                assert.equal(second.response.status, 201);
                assert.notEqual(second.body.data.id, first.body.data.id);
            }

            const status = await request('/api/room/memory/status', {
                headers: jsonHeaders(userToken)
            });
            assert.equal(status.body.data.count, 4);
        } finally {
            await request('/api/room/memory', {
                method: 'DELETE',
                headers: jsonHeaders(userToken)
            });
        }
    });
});

describe('MCP bridge API', () => {
    it('requires a session and lists only the fixed MiniMax tools', async () => {
        const anonymous = await postJson('/api/mcp/token-plan', {
            jsonrpc: '2.0', id: 0, method: 'tools/list', params: {}
        });
        assert.equal(anonymous.response.status, 401);

        const { response, body } = await postJson('/api/mcp/token-plan', {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        }, userToken);

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
        }, userToken);
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
        }, userToken);
        assert.equal(unsupportedTool.response.status, 400);
        assert.equal(unsupportedTool.body.error.code, -32602);
    });
});

describe('chat API endpoint allowlist', () => {
    it('normalizes supported provider chat endpoints', () => {
        assert.equal(
            normalizeChatUrl('https://api.openai.com/v1', 'gpt-4o-mini'),
            'https://api.openai.com/v1/responses'
        );
        assert.equal(
            normalizeChatUrl('https://api.deepseek.com', 'deepseek-chat'),
            'https://api.deepseek.com/chat/completions'
        );
    });

    it('uses Kimi-compatible temperature for Moonshot models', () => {
        const payload = buildChatPayload({
            chatUrl: 'https://api.moonshot.cn/v1/chat/completions',
            model: 'kimi-k2.6',
            systemPrompt: 'system',
            history: [],
            message: 'hello'
        });
        assert.equal(payload.temperature, 1);

        const normalPayload = buildChatPayload({
            chatUrl: 'https://api.deepseek.com/chat/completions',
            model: 'deepseek-chat',
            systemPrompt: 'system',
            history: [],
            message: 'hello'
        });
        assert.equal(normalPayload.temperature, 0.7);
    });

    it('does not impose a short Room reply limit', () => {
        const responsesPayload = buildChatPayload({
            chatUrl: 'https://api.openai.com/v1/responses',
            model: 'gpt-5.5',
            systemPrompt: ROOM_SYSTEM_PROMPT,
            history: [],
            message: '请完整说明。'
        });
        const compatiblePayload = buildChatPayload({
            chatUrl: 'https://api.deepseek.com/chat/completions',
            model: 'deepseek-v4-flash',
            systemPrompt: ROOM_SYSTEM_PROMPT,
            history: [],
            message: '请完整说明。'
        });
        const anthropicPayload = buildChatPayload({
            chatUrl: 'https://api.anthropic.com/v1/messages',
            model: 'claude-sonnet-4',
            systemPrompt: ROOM_SYSTEM_PROMPT,
            history: [],
            message: '请完整说明。'
        });

        assert.equal(Object.hasOwn(responsesPayload, 'max_output_tokens'), false);
        assert.equal(Object.hasOwn(compatiblePayload, 'max_tokens'), false);
        assert.ok(anthropicPayload.max_tokens >= 4096);
        assert.doesNotMatch(ROOM_SYSTEM_PROMPT, /不超过\s*\d+\s*字/);
    });

    it('normalizes loopback Ollama endpoints and builds native chat payloads', () => {
        const nativeUrl = normalizeChatUrl('localhost:11434', 'qwen2.5:7b');
        assert.equal(nativeUrl, 'http://localhost:11434/api/chat');
        assert.equal(isOllamaChatUrl(nativeUrl), true);
        assert.equal(
            normalizeChatUrl('http://127.0.0.1:11434/v1', 'llama3.1'),
            'http://127.0.0.1:11434/v1/chat/completions'
        );

        const payload = buildChatPayload({
            chatUrl: nativeUrl,
            model: 'qwen2.5:7b',
            systemPrompt: 'system',
            history: [{ role: 'assistant', content: 'hi' }],
            message: 'hello'
        });

        assert.equal(payload.model, 'qwen2.5:7b');
        assert.equal(payload.stream, false);
        assert.deepEqual(payload.messages.map(item => item.role), ['system', 'assistant', 'user']);
        assert.equal(payload.messages[2].content, 'hello');
    });

    it('allows no-key Ollama chat requests and parses native replies', async () => {
        const originalFetch = globalThis.fetch;
        const calls = [];
        globalThis.fetch = async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                json: async () => ({ model: 'qwen2.5:7b', message: { role: 'assistant', content: 'pong' } })
            };
        };

        try {
            const result = await createChatCompletion({
                message: 'ping',
                apiUrl: 'localhost:11434',
                model: 'qwen2.5:7b',
                systemPrompt: 'system'
            });

            assert.equal(result.reply, 'pong');
            assert.equal(calls[0].url, 'http://localhost:11434/api/chat');
            assert.equal(calls[0].options.headers.Authorization, undefined);
            const body = JSON.parse(calls[0].options.body);
            assert.equal(body.stream, false);
            assert.equal(body.messages.at(-1).content, 'ping');
        } finally {
            globalThis.fetch = originalFetch;
        }
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

describe('request and upload security', () => {
    it('accepts Agent OS login with browser-proven same-origin metadata', async () => {
        const result = await request('/api/auth/login', {
            method: 'POST',
            headers: {
                Origin: baseUrl,
                'Sec-Fetch-Site': 'same-origin',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'normal-user',
                password: 'user-test-password'
            })
        });

        assert.equal(result.response.status, 200);
        assert.equal(result.body.success, true);
    });

    it('rejects forged same-origin metadata from an untrusted origin', async () => {
        const result = await request('/api/auth/login', {
            method: 'POST',
            headers: {
                Origin: 'https://attacker.example',
                'Sec-Fetch-Site': 'same-origin',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'normal-user',
                password: 'user-test-password'
            })
        });

        assert.equal(result.response.status, 403);
        assert.equal(result.body.message, '请求被拒绝');
        assert.equal(Object.hasOwn(result.body, 'code'), false);
    });

    it('rejects cookie writes without trusted browser provenance', async () => {
        const loggedIn = await postJson('/api/auth/login', {
            username: 'normal-user',
            password: 'user-test-password'
        });
        const cookie = authCookieFrom(loggedIn.response);
        const result = await request('/api/auth/logout', {
            method: 'POST',
            headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body: '{}'
        });
        assert.equal(result.response.status, 403);
        assert.equal(result.body.message, '请求被拒绝');
        assert.equal(Object.hasOwn(result.body, 'code'), false);
    });

    it('does not accept an AJAX header alone as CSRF proof', async () => {
        const loggedIn = await postJson('/api/auth/login', {
            username: 'normal-user',
            password: 'user-test-password'
        });
        const cookie = authCookieFrom(loggedIn.response);
        const result = await request('/api/auth/logout', {
            method: 'POST',
            headers: {
                Cookie: cookie,
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: '{}'
        });

        assert.equal(result.response.status, 403);
        assert.deepEqual(result.body, { success: false, message: '请求被拒绝' });
    });

    it('does not trust arbitrary yachiyo.hk subdomains for CORS', async () => {
        const result = await request('/api/health', {
            headers: { Origin: 'https://attacker.yachiyo.hk' }
        });
        assert.equal(result.response.headers.get('access-control-allow-origin'), null);
    });

    it('rejects executable or mismatched uploads for users and admins', async () => {
        const phpBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('<?php echo 1; ?>')]);
        const payload = {
            dataUrl: `data:image/jpeg;base64,${phpBytes.toString('base64')}`,
            fileName: 'avatar.php',
            mimeType: 'image/jpeg',
            storage: 'local'
        };
        const userUpload = await postJson('/api/assets', payload, userToken);
        const adminUpload = await postJson('/api/assets', payload, adminToken);
        assert.equal(userUpload.response.status, 400);
        assert.equal(adminUpload.response.status, 400);

        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        const svgUpload = await postJson('/api/assets', {
            dataUrl: `data:image/svg+xml;base64,${svg.toString('base64')}`,
            fileName: 'payload.svg',
            mimeType: 'image/svg+xml'
        }, userToken);
        assert.equal(svgUpload.response.status, 400);
    });

    it('keeps local uploads behind asset authorization', async () => {
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
        const upload = await postJson('/api/assets', {
            dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
            fileName: 'private-photo.jpg',
            mimeType: 'image/jpeg',
            storage: 'local'
        }, userToken);
        assert.equal(upload.response.status, 200);
        assert.match(upload.body.data.markdown_url, /^\/api\/assets\/proxy\//);

        const direct = await request(upload.body.data.url, { redirect: 'manual' });
        assert.equal(direct.response.status, 307);
        const protectedPath = direct.response.headers.get('location');
        assert.match(protectedPath, /^\/api\/assets\/local\//);

        const anonymous = await request(protectedPath);
        assert.equal(anonymous.response.status, 401);

        const owner = await request(protectedPath, { headers: authHeader(userToken) });
        assert.equal(owner.response.status, 200);
        assert.equal(owner.response.headers.get('content-type'), 'image/jpeg');
        assert.match(owner.response.headers.get('content-disposition') || '', /^inline/);

        const removed = await request(`/api/assets/${upload.body.data.id}`, {
            method: 'DELETE',
            headers: jsonHeaders(userToken)
        });
        assert.equal(removed.response.status, 200);
    });

    it('rejects active avatar data URLs', async () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        const result = await postJson('/api/user/avatar', {
            avatar: `data:image/svg+xml;base64,${svg.toString('base64')}`
        }, userToken);
        assert.equal(result.response.status, 400);
    });

    it('rejects GPT-SoVITS path traversal before contacting the local service', async () => {
        const result = await postJson('/api/tts', {
            text: '测试',
            provider: 'gpt-sovits',
            apiUrl: 'http://127.0.0.1:9880/tts',
            refAudioPath: 'reference_audio/yachiyo.wav',
            gptWeightPath: '../payload.ckpt',
            sovitsWeightPath: 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e12_s684.pth'
        });
        assert.equal(result.response.status, 400);
        assert.match(result.body.message, /相对路径|权重路径/);
    });
});

describe('friend link applications API', () => {
    it('keeps applications private until an admin approves them', async () => {
        const publicBefore = await request('/api/friend-links');
        assert.equal(publicBefore.response.status, 200);
        assert.ok(Array.isArray(publicBefore.body.data));

        const anonymous = await postJson('/api/friend-links', {
            name: 'Example Friend',
            url: 'https://friend.example.test/',
            description: 'A small independent website.'
        });
        assert.equal(anonymous.response.status, 401);

        const unsafe = await postJson('/api/friend-links', {
            name: 'Unsafe Friend',
            url: 'javascript:alert(1)',
            description: 'This URL should never be accepted.'
        }, userToken);
        assert.equal(unsafe.response.status, 422);
        assert.equal(unsafe.body.code, 'INVALID_LINK_APPLICATION');

        const originalPrepareAvatar = friendLinkAvatarService.prepareFriendLinkAvatar;
        friendLinkAvatarService.prepareFriendLinkAvatar = async ({ avatarUrl }) => (
            avatarUrl || 'https://cdn.example.test/friend-avatar.png'
        );
        let created;
        try {
            created = await postJson('/api/friend-links', {
                name: 'Example Friend',
                url: 'https://friend.example.test/',
                description: 'A small independent website.',
                backlink_url: 'https://friend.example.test/links',
                note: 'API integration test'
            }, userToken);
        } finally {
            friendLinkAvatarService.prepareFriendLinkAvatar = originalPrepareAvatar;
        }
        assert.equal(created.response.status, 201);
        assert.equal(created.body.data.status, 'pending');
        assert.equal(created.body.data.avatar_url, 'https://cdn.example.test/friend-avatar.png');
        const linkId = created.body.data.id;

        const duplicate = await postJson('/api/friend-links', {
            name: 'Example Friend',
            url: 'https://friend.example.test/',
            description: 'A duplicate application should be rejected.'
        }, userToken);
        assert.equal(duplicate.response.status, 409);
        assert.equal(duplicate.body.code, 'LINK_PENDING');

        const mine = await request('/api/friend-links/mine', { headers: jsonHeaders(userToken) });
        assert.equal(mine.response.status, 200);
        assert.ok(mine.body.data.some(item => item.id === linkId && item.status === 'pending'));

        const hidden = await request('/api/friend-links');
        assert.equal(hidden.body.data.some(item => item.id === linkId), false);

        const adminList = await request('/api/admin/links', { headers: jsonHeaders(adminToken) });
        assert.equal(adminList.response.status, 200);
        assert.ok(adminList.body.data.some(item => item.id === linkId && item.applicant_username === 'normal-user'));

        const approved = await postJson(`/api/admin/links/${linkId}/status`, { status: 'active' }, adminToken);
        assert.equal(approved.response.status, 200);
        assert.equal(approved.body.data.status, 'active');

        const visible = await request('/api/friend-links');
        assert.ok(visible.body.data.some(item => (
            item.id === linkId
            && item.name === 'Example Friend'
            && Object.hasOwn(item, 'avatar_url')
        )));

        const removed = await request(`/api/admin/links/${linkId}`, {
            method: 'DELETE',
            headers: jsonHeaders(adminToken)
        });
        assert.equal(removed.response.status, 200);
    });
});

describe('admin API permissions', () => {
    it('requires authentication for admin APIs', async () => {
        const { response, body } = await request('/api/admin/stats');

        assert.equal(response.status, 401);
        assert.equal(body.code, 'UNAUTHORIZED');
    });

    it('rejects normal user sessions for admin APIs', async () => {
        const { response, body } = await request('/api/admin/stats', {
            headers: jsonHeaders(userToken)
        });

        assert.equal(response.status, 401);
        assert.equal(body.code, 'UNAUTHORIZED');
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

        db.prepare(`
            INSERT INTO site_settings (key, value, updated_at)
            VALUES ('ossAccessKeySecret', 'stored-test-secret', CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run();
        const settings = await request('/api/admin/settings', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(settings.response.status, 200);
        assert.equal(Object.hasOwn(settings.body.data, 'ossAccessKeySecret'), false);

        const savedSettings = await postJson('/api/admin/settings', {
            siteTitle: 'Tsukuyomi Space',
            ossAccessKeySecret: ''
        }, adminToken);
        assert.equal(savedSettings.response.status, 200);
        assert.equal(
            db.prepare("SELECT value FROM site_settings WHERE key = 'ossAccessKeySecret'").get().value,
            'stored-test-secret'
        );
    });

    it('exposes content moderation only through the administrator site session', async () => {
        const anonymous = await request('/api/moderation/me');
        assert.equal(anonymous.response.status, 401);

        const normalUser = await request('/api/moderation/me', {
            headers: jsonHeaders(userToken)
        });
        assert.equal(normalUser.response.status, 403);
        assert.equal(normalUser.body.code, 'FORBIDDEN');

        const me = await request('/api/moderation/me', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(me.response.status, 200);
        assert.match(me.response.headers.get('cache-control') || '', /private/);
        assert.match(me.response.headers.get('cache-control') || '', /no-store/);
        assert.equal(me.body.data.username, 'admin');
        assert.equal(me.body.data.role, 'admin');

        const [summary, articles, messages, gallery, attachments] = await Promise.all([
            request('/api/moderation/summary', { headers: jsonHeaders(adminToken) }),
            request('/api/moderation/articles?page=1&limit=2', { headers: jsonHeaders(adminToken) }),
            request('/api/moderation/messages?page=1&limit=2&status=all', { headers: jsonHeaders(adminToken) }),
            request('/api/assets/gallery?scope=all&page=1&limit=2', { headers: jsonHeaders(adminToken) }),
            request('/api/assets?scope=all&collection=attachments&page=1&limit=2', { headers: jsonHeaders(adminToken) })
        ]);
        for (const result of [summary, articles, messages, gallery, attachments]) {
            assert.equal(result.response.status, 200);
        }
        assert.ok(summary.body.data.articles >= 3);
        assert.equal(summary.body.data.messages.all, summary.body.data.messages.pending + summary.body.data.messages.approved);
        assert.ok(Array.isArray(articles.body.data.items));
        assert.equal(articles.body.data.items.length, 2);
        assert.equal(articles.body.data.pagination.limit, 2);
        assert.ok(articles.body.data.pagination.totalPages >= 2);
        assert.ok(Array.isArray(messages.body.data.items));
        assert.ok(messages.body.data.items.length <= 2);
        assert.equal(messages.body.data.pagination.total, summary.body.data.messages.all);
        assert.ok(Array.isArray(gallery.body.data.assets));
        assert.ok(Array.isArray(attachments.body.data.assets));
        assert.ok(attachments.body.data.assets.every(asset => asset.metadata?.collection !== 'gallery' && asset.metadata?.gallery !== true));

        const pendingMessages = await request('/api/moderation/messages?page=1&limit=10&status=pending', {
            headers: jsonHeaders(adminToken)
        });
        const approvedMessages = await request('/api/moderation/messages?page=1&limit=10&status=approved', {
            headers: jsonHeaders(adminToken)
        });
        assert.equal(pendingMessages.response.status, 200);
        assert.equal(approvedMessages.response.status, 200);
        assert.equal(pendingMessages.body.data.pagination.total, summary.body.data.messages.pending);
        assert.equal(approvedMessages.body.data.pagination.total, summary.body.data.messages.approved);
        assert.ok(pendingMessages.body.data.items.every(message => message.status !== 'approved'));
        assert.ok(approvedMessages.body.data.items.every(message => message.status === 'approved'));

        const terminalCookie = String(adminToken).split('; ').find(value => value.startsWith('tsukuyomi_admin_session='));
        assert.ok(terminalCookie);
        const terminalScope = await request('/api/moderation/me', {
            headers: jsonHeaders(tokenFromCookie(terminalCookie))
        });
        assert.equal(terminalScope.response.status, 403);
        assert.equal(terminalScope.body.code, 'TOKEN_SCOPE_INVALID');
    });

    it('lets a site admin delete an article with dependent content', async () => {
        const graph = seedArticleDeletionGraph('user-001', `admin-${Date.now()}`);
        try {
            const removed = await postJson(`/api/moderation/articles/${graph.id}/delete`, {}, adminToken);
            assert.equal(removed.response.status, 200);
            assert.equal(removed.body.success, true);
            assertArticleDeletionGraphRemoved(graph);
        } finally {
            cleanupArticleDeletionGraph(graph);
        }
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

        const role = await postJson(`/api/admin/users/${managed.id}/role`, { role: 'admin' }, adminToken);
        assert.equal(role.response.status, 200);
        assert.equal(role.body.data.role, 'admin');
        assert.equal(db.prepare('SELECT role FROM users WHERE id = ?').get(managed.id).role, 'admin');

        const reset = await postJson(`/api/admin/users/${managed.id}/password`, {
            password: 'managed-new-password'
        }, adminToken);
        assert.equal(reset.response.status, 200);

        const staleSession = await request('/api/auth/me', {
            headers: jsonHeaders(managedUserToken)
        });
        assert.equal(staleSession.response.status, 403);

        const loginWithNewPassword = await postJson('/api/auth/login', {
            username: 'managed-user',
            password: 'managed-new-password'
        });
        assert.equal(loginWithNewPassword.response.status, 200);
        assert.equal(loginWithNewPassword.body.data.user.username, 'managed-user');

        const banned = await patchJson(`/api/admin/users/${managed.id}/role`, { role: 'banned' }, adminToken);
        assert.equal(banned.response.status, 200);
        assert.equal(banned.body.data.role, 'banned');
        const blockedLogin = await postJson('/api/auth/login', {
            username: 'managed-user',
            password: 'managed-new-password'
        });
        assert.equal(blockedLogin.response.status, 403);

        const restored = await patchJson(`/api/admin/users/${managed.id}/role`, { role: 'admin' }, adminToken);
        assert.equal(restored.response.status, 200);
    });

    it('prevents non-super admins from changing user permissions or passwords', async () => {
        const forbiddenRole = await postJson('/api/admin/users/user-001/role', {
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

        const hiddenSettings = await request('/api/admin/settings', {
            headers: jsonHeaders(staffAdminToken)
        });
        assert.equal(hiddenSettings.response.status, 200);
        assert.equal(Object.hasOwn(hiddenSettings.body.data, 'ossAccessKeySecret'), false);

        const forbiddenSettings = await postJson('/api/admin/settings', {
            ossEndpoint: 'https://storage.example.test'
        }, staffAdminToken);
        assert.equal(forbiddenSettings.response.status, 403);

        const forbiddenOssTest = await postJson('/api/admin/settings/oss-test', {}, staffAdminToken);
        assert.equal(forbiddenOssTest.response.status, 403);

        const forbiddenOssImport = await postJson('/api/assets/oss-register', {}, staffAdminToken);
        assert.equal(forbiddenOssImport.response.status, 403);

        const injectedLink = await postJson('/api/admin/links', {
            name: 'unsafe',
            url: 'javascript:alert(1)'
        }, staffAdminToken);
        assert.equal(injectedLink.response.status, 400);
    });

    it('keeps linked administrator site identities immutable', async () => {
        const staffUser = db.prepare('SELECT id FROM users WHERE username = ?').get('staff-admin');
        assert.ok(staffUser?.id);

        const roleChange = await patchJson(`/api/admin/users/${staffUser.id}/role`, { role: 'user' }, adminToken);
        const usernameChange = await patchJson(`/api/admin/users/${staffUser.id}/username`, { username: 'renamed-admin' }, adminToken);
        const deleteResult = await request(`/api/admin/users/${staffUser.id}`, {
            method: 'DELETE',
            headers: jsonHeaders(adminToken)
        });
        assert.equal(roleChange.response.status, 403);
        assert.equal(usernameChange.response.status, 403);
        assert.equal(deleteResult.response.status, 403);

        const staffLogin = await postJson('/api/admin/login', {
            username: 'staff-admin',
            password: 'staff-test-password'
        });
        assert.equal(staffLogin.response.status, 200);
        assert.equal(staffLogin.body.data.user.email, '');
        assert.equal(staffLogin.body.data.user.has_real_email, false);
    });

    it('allows an admin to change their own terminal password', async () => {
        const changed = await postJson('/api/admin/password', {
            currentPassword: 'staff-test-password',
            newPassword: 'staff-new-password'
        }, staffAdminToken);
        assert.equal(changed.response.status, 200);

        const staleSession = await request('/api/admin/me', {
            headers: jsonHeaders(staffAdminToken)
        });
        assert.equal(staleSession.response.status, 403);

        const oldPassword = await postJson('/api/admin/login', {
            username: 'staff-admin',
            password: 'staff-test-password'
        });
        assert.equal(oldPassword.response.status, 401);

        const newPasswordToken = await login('/api/admin/login', 'staff-admin', 'staff-new-password');
        assert.ok(newPasswordToken);

        const siteUserToken = await login('/api/auth/login', 'staff-admin', 'staff-new-password');
        const changedFromSite = await putJson('/api/user/password', {
            currentPassword: 'staff-new-password',
            newPassword: 'staff-final-password'
        }, siteUserToken);
        assert.equal(changedFromSite.response.status, 200);

        const finalAdminToken = await login('/api/admin/login', 'staff-admin', 'staff-final-password');
        assert.ok(finalAdminToken);
    });
});

describe('legacy page paths', () => {
    it('never exposes repository files through the Express static fallback', async () => {
        const sourceFile = await request('/package.json');
        assert.equal(sourceFile.response.status, 404);

        const publicRuntime = await request('/live2d-core.js');
        assert.equal(publicRuntime.response.status, 200);
        assert.match(publicRuntime.response.headers.get('content-type') || '', /javascript/);
    });

    it('redirects the former pixel art path and preserves its query', async () => {
        const { response } = await request('/arena?art=42', { redirect: 'manual' });

        assert.equal(response.status, 301);
        assert.equal(response.headers.get('location'), '/pixel?art=42');
        assert.match(response.headers.get('cache-control') || '', /no-store/);
    });

    it('routes public profile paths through the Vue fallback', async () => {
        const { response, body } = await request('/users/normal-user');

        assert.equal(response.status, 503);
        assert.match(body, /Frontend build is missing/);
    });

    it('routes browser stage requests through Vue and renders every article for crawlers', async () => {
        const browser = await request('/stage', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        assert.equal(browser.response.status, 503);
        assert.match(browser.body, /Frontend build is missing/);

        const insert = db.prepare(`
            INSERT INTO articles (title, excerpt, content, publish_date, status)
            VALUES (?, ?, ?, ?, 'published')
        `);
        const ids = [];
        try {
            for (let index = 1; index <= 30; index += 1) {
                const day = String(index).padStart(2, '0');
                const result = insert.run(
                    `Stage complete article ${day}`,
                    'Stage crawler regression test',
                    'Stage crawler regression test content',
                    `2099-01-${day}`
                );
                ids.push(result.lastInsertRowid);
            }

            const crawler = await request('/stage', {
                headers: { 'User-Agent': 'Googlebot/2.1' }
            });
            assert.equal(crawler.response.status, 200);
            assert.match(crawler.response.headers.get('vary') || '', /User-Agent/i);
            assert.match(crawler.body, /Stage complete article 01/);
            assert.match(crawler.body, /Stage complete article 30/);
        } finally {
            const remove = db.prepare('DELETE FROM articles WHERE id = ?');
            for (const id of ids) remove.run(id);
        }
    });

    it('publishes and revokes one owned room turn without exposing private history', async () => {
        const turnId = `share-${Date.now()}-owned`;
        const assetId = `room-share-card-${Date.now()}`;
        try {
            db.prepare("DELETE FROM room_chat_messages WHERE user_id IN ('user-001', 'user-002')").run();
            await postJson('/api/room/chat/turn', {
                turnId,
                userMessage: '今晚一起看月亮吗？',
                assistantMessage: '当然，我会把这一刻记下来。'
            }, userToken);
            db.prepare(`
                INSERT INTO article_assets (id, owner_id, asset_type, mime_type, url, storage_key, metadata)
                VALUES (?, 'user-001', 'image', 'image/jpeg', ?, ?, '{}')
            `).run(assetId, `/api/assets/proxy/${assetId}`, `test/${assetId}.jpg`);

            const created = await postJson('/api/room/shares', {
                turnId,
                title: '月下的一次对话',
                ogImageAssetId: assetId,
                userMessage: 'forged content must be ignored',
                scene: {
                    weather: 'rain',
                    timePhase: 'night',
                    season: 'summer',
                    city: '香港',
                    temperature: 27,
                    ignored: '<script>alert(1)</script>'
                }
            }, userToken);
            assert.equal(created.response.status, 201);
            assert.match(created.body.data.shareKey, /^[A-Za-z0-9_-]{20,}$/);
            assert.equal(created.body.data.userMessage, '今晚一起看月亮吗？');
            assert.equal(Object.hasOwn(created.body.data, 'userId'), false);

            const publicShare = await request(`/api/room/shares/${created.body.data.shareKey}`);
            assert.equal(publicShare.response.status, 200);
            assert.equal(publicShare.body.data.assistantMessage, '当然，我会把这一刻记下来。');
            assert.equal(publicShare.body.data.scene.city, '香港');
            assert.equal(Object.hasOwn(publicShare.body.data.scene, 'ignored'), false);
            assert.equal(Object.hasOwn(publicShare.body.data, 'userId'), false);

            const denied = await postJson('/api/room/shares', {
                turnId,
                title: 'stolen',
                ogImageAssetId: assetId
            }, managedUserToken);
            assert.ok([403, 404].includes(denied.response.status));

            const revoked = await request(`/api/room/shares/${created.body.data.shareKey}`, {
                method: 'DELETE',
                headers: jsonHeaders(userToken)
            });
            assert.equal(revoked.response.status, 200);
            const missing = await request(`/api/room/shares/${created.body.data.shareKey}`);
            assert.equal(missing.response.status, 404);
        } finally {
            db.prepare('DELETE FROM room_conversation_shares WHERE user_id = ?').run('user-001');
            db.prepare('DELETE FROM article_assets WHERE id = ?').run(assetId);
            db.prepare("DELETE FROM room_chat_messages WHERE user_id IN ('user-001', 'user-002')").run();
        }
    });

    it('serves crawler snapshots for Hub, Pixel, Wiki entries, and public friend links', async () => {
        const crawlerHeaders = { 'User-Agent': 'Googlebot/2.1' };
        const pages = [
            ['/hub', /月读空间中枢大厅/],
            ['/pixel', /192×108 月光像素画工坊/],
            ['/wiki', /超时空辉夜姬角色与世界观 Wiki/],
            ['/wiki/characters/kaguya', /辉夜 - 角色词条/],
            ['/wiki/terms/tsukuyomi', /月读／TSUKUYOMI/],
            ['/friend-links', /月读空间友链导航/]
        ];

        for (const [pathname, expected] of pages) {
            const crawler = await request(pathname, { headers: crawlerHeaders });
            assert.equal(crawler.response.status, 200, pathname);
            assert.match(crawler.response.headers.get('vary') || '', /User-Agent/i, pathname);
            assert.match(crawler.body, expected, pathname);
            assert.match(crawler.body, /<meta name="keywords" content="[^"]+">/, pathname);
            assert.match(crawler.body, /<link rel="canonical" href="https:\/\/yachiyo\.hk\//, pathname);
        }

        const browserHub = await request('/hub', { headers: { 'User-Agent': 'Mozilla/5.0' } });
        assert.equal(browserHub.response.status, 503);
        assert.match(browserHub.body, /Frontend build is missing/);
    });

    it('keeps crawler snapshot links on safe web protocols', () => {
        const html = renderSeoCollectionPage({
            path: '/friend-links',
            title: 'Protocol test',
            description: 'Crawler link protocol validation.',
            items: [{ title: 'Unsafe link', href: 'javascript:alert(1)', image: 'data:text/html,unsafe' }],
            actions: [{ label: 'Unsafe action', href: 'file:///etc/passwd' }]
        });

        assert.doesNotMatch(html, /javascript:|file:|data:text\/html/i);
        assert.match(html, /href="https:\/\/yachiyo\.hk\/?"/);
    });

    it('publishes every Wiki entry, SEO topic, article cover, and gallery image in sitemaps', async () => {
        const { WIKI_ENTRIES, wikiEntryPath } = require('../backend/seo/wiki-content');
        const articleCover = 'https://oss.yachiyo.hk/seo/article-cover.webp?version=1&source=test';
        const galleryImage = 'https://oss.yachiyo.hk/seo/gallery-image.webp?version=2&source=test';
        const article = db.prepare(`
            INSERT INTO articles (title, slug, excerpt, content, category, tags, cover_image, publish_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
        `).run(
            'SEO image sitemap article',
            'seo-image-sitemap-article',
            'SEO article cover description',
            'SEO article body',
            '技术',
            '["SEO"]',
            articleCover,
            '2026-07-20'
        );
        const galleryAssetId = 'seo-gallery-image-sitemap';
        db.prepare(`
            INSERT INTO article_assets (id, asset_type, mime_type, url, storage_key, metadata)
            VALUES (?, 'gallery-image', 'image/webp', ?, ?, ?)
        `).run(galleryAssetId, galleryImage, 'seo/gallery-image.webp', JSON.stringify({ collection: 'gallery', title: 'SEO gallery image' }));

        try {
            const sitemap = await request('/sitemap.xml');
            assert.equal(sitemap.response.status, 200);
            for (const entry of WIKI_ENTRIES) {
                assert.match(sitemap.body, new RegExp(wikiEntryPath(entry).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            }
            assert.match(sitemap.body, /\/friend-links/);
            assert.match(sitemap.body, /\/topics\/cosmic-princess-kaguya-wiki/);
            assert.match(sitemap.body, /\/topics\/pixel-art-community/);

            const imageSitemap = await request('/sitemap-images.xml');
            assert.equal(imageSitemap.response.status, 200);
            assert.match(imageSitemap.response.headers.get('content-type') || '', /xml/);
            assert.match(imageSitemap.body, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
            assert.match(imageSitemap.body, /article-cover\.webp\?version=1&amp;source=test/);
            assert.match(imageSitemap.body, /gallery-image\.webp\?version=2&amp;source=test/);
            assert.match(imageSitemap.body, /<image:title>SEO image sitemap article<\/image:title>/);
            assert.match(imageSitemap.body, /<image:title>SEO gallery image<\/image:title>/);

            const robots = await request('/robots.txt');
            assert.match(robots.body, /Sitemap: https:\/\/yachiyo\.hk\/sitemap-images\.xml/);
        } finally {
            db.prepare('DELETE FROM article_assets WHERE id = ?').run(galleryAssetId);
            db.prepare('DELETE FROM articles WHERE id = ?').run(article.lastInsertRowid);
        }
    });

    it('does not redirect removed static page routes', async () => {
        for (const pathname of ['/room.html', '/article.html?id=1', '/pages/room.html', '/pages/stage']) {
            const { response } = await request(pathname, { redirect: 'manual' });
            assert.equal(response.status, 404, `${pathname} should be gone`);
        }
    });
});
