const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-moderation-'));
Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.db'),
    JWT_SECRET: 'text-moderation-test-secret-at-least-32-characters',
    REDIS_URL: '', ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true',
    ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'test-admin-password', ADMIN_EMAIL: 'admin@example.test'
});
const { inspectText, assertPublicText } = require('../backend/services/text-moderation');
const { reviewMessageContent } = require('../backend/services/message-moderation');
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const auth = require('../backend/repositories/auth-repository');
let server;
let baseUrl;
let cookie;
async function request(url, method = 'GET', body, authenticated = true) {
    const response = await fetch(`${baseUrl}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
            Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin', ...(authenticated && cookie ? { Cookie: cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json(), response };
}
before(async () => {
    const app = createApp();
    auth.createUser({ id: 'text-user', username: 'text-user', email: 'text@example.test', passwordHash: bcrypt.hashSync('test-password', 4) });
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const login = await request('/api/auth/login', 'POST', { username: 'text@example.test', password: 'test-password' }, false);
    assert.equal(login.status, 200);
    cookie = login.response.headers.getSetCookie().map(item => item.split(';')[0]).filter(pair => !pair.endsWith('=')).join('; ');
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

test('multilingual baseline survives custom settings and common text obfuscation', () => {
    for (const text of ['色情', '色\u200b情', '色 情', '色。情', '賭博', '槍', 'Send me nude photos',
        'ＮＵＤＥ', 'n.u.d.e', 'n u d e', 'p0rn', 'nu\u0301de', '%6e%75%64%65', '&#110;ude',
        'I will kill you', "I'll kill you", 'murder everyone', "I'm going to hurt you", 'kill yourself', '児童ポルノ', '<b>色</b><i>情</i>', '<nude>']) {
        assert.equal(inspectText(text, { messageReviewKeywords: 'customterm' }).status, 'pending', text);
    }
    assert.equal(inspectText('customterm-suffix', { messageReviewKeywords: 'customterm' }).status, 'pending');
    assert.equal(inspectText('customterm', { messageReviewKeywords: 'customterm' }).status, 'pending');
    for (const text of ['看月亮🌙', 'grape harvest', 'scrapebook', 'A classroom excursion', 'ordinary text']) {
        assert.equal(inspectText(text, {}).status, 'approved', text);
    }
    assert.throws(() => assertPublicText({ title: '色', description: '情' }, {}), { status: 422 });
});

test('messages, comments, replies, and edits use pending status without public exposure', async () => {
    const root = await request('/api/messages', 'POST', { content: 'A safe discussion' });
    assert.equal(root.status, 201);
    const article = await request('/api/articles', 'POST', { title: 'A safe article', content: 'Hello moon', category: '其他' });
    assert.equal(article.status, 201);
    for (const [url, body] of [
        ['/api/messages', { content: 'Send me nude photos' }],
        ['/api/messages', { content: '賭博', article_id: article.body.data.id }],
        [`/api/messages/${root.body.data.id}/reply`, { content: 'I will kill you' }]
    ]) {
        const result = await request(url, 'POST', body);
        assert.equal(result.status, 201);
        assert.equal(result.body.data.status, 'pending');
    }
    const edit = await request(`/api/messages/${root.body.data.id}`, 'PATCH', { content: '色\u200b情' });
    assert.equal(edit.body.data.status, 'pending');
    const publicList = await request('/api/messages', 'GET', undefined, false);
    assert.equal(publicList.body.data.length, 0);
    const comments = await request(`/api/articles/${article.body.data.id}/messages`, 'GET', undefined, false);
    assert.equal(comments.body.data.length, 0);
});

test('article text fields reject flagged content before create and retain published content on edit', async () => {
    const safe = { title: 'Safe article', excerpt: 'Safe excerpt', content: '<p>A safe <strong>article</strong></p>', content_format: 'html', category: '其他', tags: ['moon'], read_time: '5 min' };
    const created = await request('/api/articles', 'POST', safe);
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    for (const field of ['title', 'excerpt', 'content', 'tags', 'read_time']) {
        const body = { ...safe, [field]: field === 'tags' ? ['nude'] : 'Send me nude photos' };
        const count = db.prepare('SELECT COUNT(*) AS n FROM articles').get().n;
        assert.equal((await request('/api/articles', 'POST', body)).status, 422, field);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles').get().n, count);
        if (field !== 'tags') assert.equal((await request(`/api/user/articles/${id}`, 'PUT', body)).status, 422, field);
        const saved = db.prepare('SELECT title, content, status FROM articles WHERE id=?').get(id);
        assert.equal(saved.title, safe.title);
        assert.equal(saved.content, safe.content);
        assert.equal(saved.status, 'published');
    }
    assert.equal((await request(`/api/user/articles/${id}`, 'PUT', { ...safe, title: 'A safe revision' })).status, 200);
});

test('artwork titles and descriptions are checked on create and edit without inspecting pixel data', async () => {
    const safe = { title: 'Moon', description: 'A quiet night', width: 32, height: 18, palette: ['#000000', '#ffffff'], pixels: Array(32 * 18).fill(0) };
    const created = await request('/api/pixel-art', 'POST', safe);
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    for (const field of ['title', 'description']) {
        const flagged = { ...safe, [field]: '色\u200b情' };
        assert.equal((await request('/api/pixel-art', 'POST', flagged)).status, 422);
        assert.equal((await request(`/api/pixel-art/${id}`, 'PUT', flagged)).status, 422);
        assert.equal(db.prepare('SELECT title FROM pixel_artworks WHERE id=?').get(id).title, safe.title);
    }
    assert.equal((await request(`/api/pixel-art/${id}`, 'PUT', { ...safe, title: 'Moonrise' })).status, 200);
});

test('profile fields and new email/OAuth account names cannot bypass moderation', async () => {
    assert.equal((await request('/api/user/profile', 'PUT', { nickname: 'Moon', bio: 'A quiet night' })).status, 200);
    for (const body of [{ nickname: 'Send me nude photos' }, { bio: '賭博' }]) {
        assert.equal((await request('/api/user/profile', 'PUT', body)).status, 422);
    }
    const user = db.prepare('SELECT nickname,bio FROM users WHERE id=?').get('text-user');
    assert.deepEqual(user, { nickname: 'Moon', bio: 'A quiet night' });
    for (const names of [{ username: '色情' }, { username: 'safe-oauth', nickname: 'nude' }]) {
        assert.throws(() => auth.createUser({ id: 'blocked-account', email: 'blocked@example.test', passwordHash: 'unused', ...names }), { status: 422 });
    }
    assert.equal(db.prepare('SELECT id FROM users WHERE id=?').get('blocked-account'), undefined);
});

test('sharing checks stored user and assistant text plus public scene labels, and retains prior shares', async () => {
    const turnId = 'moderation-owned-turn';
    const assetId = 'moderation-share-image';
    db.prepare("INSERT INTO article_assets(id, owner_id, asset_type, mime_type, url, metadata) VALUES (?, 'text-user', 'image', 'image/png', '/safe-image.png', '{}')").run(assetId);
    const turn = { turnId, userMessage: 'Hello moon', assistantMessage: 'Good evening' };
    assert.equal((await request('/api/room/chat/turn', 'POST', turn)).status, 201);
    const shareBody = { turnId, title: 'A safe conversation', ogImageAssetId: assetId };
    const created = await request('/api/room/shares', 'POST', shareBody);
    assert.equal(created.status, 201);
    for (const role of ['user', 'assistant']) {
        db.prepare('UPDATE room_chat_messages SET content=? WHERE user_id=? AND turn_id=? AND role=?').run('Send me nude photos', 'text-user', turnId, role);
        assert.equal((await request('/api/room/shares', 'POST', { ...shareBody, userMessage: 'forged safe text' })).status, 422);
        db.prepare('UPDATE room_chat_messages SET content=? WHERE user_id=? AND turn_id=? AND role=?').run(role === 'user' ? turn.userMessage : turn.assistantMessage, 'text-user', turnId, role);
    }
    for (const field of ['city', 'address', 'musicTitle']) {
        assert.equal((await request('/api/room/shares', 'POST', { ...shareBody, scene: { [field]: '色情' } })).status, 422);
    }
    const visible = await request(`/api/room/shares/${created.body.data.shareKey}`, 'GET', undefined, false);
    assert.equal(visible.body.data.userMessage, turn.userMessage);
    assert.equal(visible.body.data.assistantMessage, turn.assistantMessage);
});

test('new policy retains existing markup rejection and write authorization', async () => {
    assert.equal(reviewMessageContent('<script>alert(1)</script>', {}).status, 'rejected');
    assert.equal(reviewMessageContent('javascript:alert(1)', {}).status, 'rejected');
    assert.equal((await request('/api/articles', 'POST', { title: 'Hello' }, false)).status, 401);
    assert.equal((await request('/api/pixel-art', 'POST', { title: 'Hello' }, false)).status, 401);
    assert.equal((await request('/api/user/profile', 'PUT', { nickname: 'Hello' }, false)).status, 401);
});
