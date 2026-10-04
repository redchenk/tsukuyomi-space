const assert = require('node:assert/strict');
const { before, after, describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-plaza-'));
Object.assign(process.env, { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0', DATA_DIR: directory,
    DB_PATH: path.join(directory, 'test.db'), JWT_SECRET: 'plaza-test-secret-longer-than-32-characters',
    ADMIN_USERNAME: 'admin', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'plaza-admin-test-password', ROOM_WEATHER_OFFLINE: 'true' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const cache = require('../backend/services/response-cache');
const repository = require('../backend/repositories/message-repository');
let server, base, cookie;
const roots = [], replies = [];
let pending, hiddenChild, articleComment;
const insert = (parent, content, index, status = 'approved', owner = 'plaza-a', article = null) => Number(db.prepare(`
    INSERT INTO messages(author, content, user_id, parent_id, status, article_id, created_at, like_count)
    VALUES('fixture', ?, ?, ?, ?, ?, ?, ?)`)
    .run(content, owner, parent, status, article, `2090-10-04 ${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00`, index % 3).lastInsertRowid);
async function read(query, auth = false) {
    const response = await fetch(`${base}/api/messages${query}`, { headers: auth ? { Cookie: cookie } : {} });
    return { status: response.status, headers: response.headers, body: await response.json() };
}
const feed = (query = '') => read(`?view=plaza&q=plaza-fixture${query}`);
before(async () => {
    const app = createApp();
    for (const [id, nickname] of [['plaza-a', 'Alice nickname'], ['plaza-b', 'Bob nickname']]) {
        db.prepare('INSERT INTO users(id, username, nickname, email, password_hash, role) VALUES(?,?,?,?,?,?)')
            .run(id, id, nickname, `${id}@example.test`, bcrypt.hashSync('plaza-test-password', 4), 'user');
    }
    for (let i = 1; i <= 25; i++) roots.push(insert(null, `plaza-fixture root ${i}`, i, 'approved', i % 2 ? 'plaza-a' : 'plaza-b'));
    for (let i = 0; i < 45; i++) replies.push(insert(roots.at(-1), `reply ${i}`, 100 + i));
    replies.push(insert(replies[0], 'legacy nested reply', 145));
    insert(roots[0], 'old needle%_ reply', 200);
    insert(roots[1], 'second thread reply', 201);
    pending = insert(null, 'plaza-fixture pending root', 202, 'pending');
    hiddenChild = insert(pending, 'needle hidden descendant', 203);
    const hiddenParent = insert(roots.at(-1), 'hidden parent', 204, 'pending');
    insert(hiddenParent, 'hidden ancestor child', 205);
    const article = db.prepare('SELECT id FROM articles LIMIT 1').get();
    articleComment = insert(null, 'plaza-fixture article comment', 206, 'approved', 'plaza-a', article.id);
    db.prepare('INSERT INTO message_likes(user_id,message_id) VALUES(?,?)').run('plaza-a', roots[0]);
    db.prepare('INSERT INTO message_likes(user_id,message_id) VALUES(?,?)').run('plaza-a', roots[1]);
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ username: 'plaza-a', password: 'plaza-test-password' }) });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(/,(?=\s*[^;,]+=)/).map(part => part.split(';')[0].trim())
        .filter(pair => pair && !pair.endsWith('=')).join('; ');
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

describe('bounded Plaza reads', () => {
    it('returns eight roots and only the latest reply per thread, with stable totals and floors', async () => {
        const { status, body } = await feed();
        assert.equal(status, 200);
        assert.equal(body.data.pagination.total, 25);
        assert.equal(body.data.pagination.totalPages, 4);
        const top = body.data.messages.filter(item => !item.parent_id);
        assert.deepEqual(top.map(item => item.id), roots.slice(-8).reverse());
        assert.equal(top[0].reply_count, 46);
        assert.ok(top[0].floor_number > top[1].floor_number);
        const preview = body.data.messages.filter(item => item.parent_id === roots.at(-1));
        assert.equal(preview.length, 1);
        assert.equal(preview[0].id, replies.at(-1));
        assert.ok(body.data.activity.length > 0 && body.data.activity.length <= 4);
        assert.ok(body.data.activity.every(item => item.id !== hiddenChild));
        assert.ok(body.data.activity.every(item => !Object.hasOwn(item, 'content')));
    });
    it('paginates without duplicates and clamps pages and limits', async () => {
        const collected = [];
        for (let page = 1; page <= 4; page++) collected.push(...(await feed(`&page=${page}`)).body.data.messages.filter(item => !item.parent_id).map(item => item.id));
        assert.deepEqual(collected, [...roots].reverse());
        assert.equal((await feed('&page=9999')).body.data.pagination.page, 4);
        assert.equal((await feed('&limit=500')).body.data.pagination.limit, 24);
    });
    it('searches older replies and escapes SQL wildcard characters as literal text', async () => {
        const found = await read('?view=plaza&q=needle%25_');
        assert.deepEqual(found.body.data.messages.filter(item => !item.parent_id).map(item => item.id), [roots[0]]);
        assert.equal((await read('?view=plaza&q=needle%25_X')).body.data.pagination.total, 0);
        assert.equal((await read('?view=plaza&q=hidden%20descendant')).body.data.pagination.total, 0);
        assert.ok((await read('?view=plaza&q=Bob%20nickname')).body.data.messages.filter(item => !item.parent_id).every(item => item.user_id === 'plaza-b'));
    });
    it('sorts hot and replied results using the full public thread, without downloading it', async () => {
        const hot = (await feed('&sort=hot')).body.data.messages.filter(item => !item.parent_id);
        assert.ok(hot.every((item, i) => !i || hot[i - 1].like_count >= item.like_count));
        const replied = (await feed('&sort=replied')).body.data;
        assert.equal(replied.pagination.total, 3);
        assert.equal(replied.messages[0].id, roots.at(-1));
        assert.equal(replied.messages[0].reply_count, 46);
    });
    it('binds personal filters and like state to the authenticated account', async () => {
        assert.equal((await read('?view=plaza&sort=mine')).status, 401);
        const mine = await read('?view=plaza&sort=mine&userId=plaza-b', true);
        assert.equal(mine.status, 200);
        assert.match(mine.headers.get('cache-control'), /private.*no-store/);
        assert.ok(mine.body.data.messages.filter(item => !item.parent_id).every(item => item.user_id === 'plaza-a'));
        assert.deepEqual((await read(`/liked?ids=${roots[0]},${roots[2]}`, true)).body.data, [roots[0]]);
        assert.equal((await read('/liked?ids=1,2')).status, 401);
        assert.equal((await read('/liked?ids=1 OR 1=1', true)).status, 400);
    });
    it('locates old root and reply links outside the first page', async () => {
        const root = (await feed(`&anchor_id=${roots[0]}`)).body.data;
        assert.equal(root.pagination.page, 4);
        assert.ok(root.messages.some(item => item.id === roots[0]));
        const oldReply = (await feed(`&anchor_id=${replies[0]}`)).body.data;
        assert.equal(oldReply.anchor_id, replies[0]);
        assert.ok(oldReply.messages.some(item => item.id === replies[0] && item.parent_id === roots.at(-1)));
        for (const id of [pending, hiddenChild, articleComment, 999999999]) assert.equal((await read(`?view=plaza&anchor_id=${id}`)).status, 404);
    });
    it('uses keyset pagination for expanded replies and includes legacy nesting without duplicates', async () => {
        const loaded = [];
        let cursor = null;
        do {
            const result = await read(`?view=thread&thread_id=${roots.at(-1)}${cursor ? `&before_id=${cursor}` : ''}`);
            assert.equal(result.status, 200);
            assert.ok(result.body.data.replies.length <= 20);
            assert.ok(result.body.data.replies.every(item => item.parent_id === roots.at(-1)));
            loaded.push(...result.body.data.replies.map(item => item.id));
            cursor = result.body.data.next_before_id;
        } while (cursor);
        assert.deepEqual(loaded, [...replies].reverse());
        assert.equal(new Set(loaded).size, 46);
        assert.equal((await read(`?view=thread&thread_id=${roots[0]}&before_id=${replies[0]}`)).status, 404);
        for (const id of [pending, hiddenChild, articleComment, replies[0]]) assert.equal((await read(`?view=thread&thread_id=${id}`)).status, 404);
    });
    it('invalidates the public page cache after likes', async () => {
        const id = roots.at(-1);
        const beforeCount = (await feed()).body.data.messages.find(item => item.id === id).like_count;
        const response = await fetch(`${base}/api/messages/${id}/like`, { method: 'POST', headers: { Cookie: cookie, Origin: base, 'X-Requested-With': 'XMLHttpRequest' } });
        assert.equal(response.status, 200);
        assert.equal((await feed()).body.data.messages.find(item => item.id === id).like_count, beforeCount + 1);
    });
    it('rejects malformed pagination and keeps legacy readers compatible', async () => {
        for (const query of ['view=wrong', 'view=plaza&page=-1', 'view=plaza&page=1&page=2', 'view=plaza&sort=wrong', 'view=thread', 'view=plaza&limit=8x', 'view=plaza&article_id=1']) {
            assert.equal((await read(`?${query}`)).status, 400, query);
        }
        const legacy = (await read('')).body.data;
        assert.ok(Array.isArray(legacy));
        assert.ok(legacy.some(item => item.id === replies[0]));
        cache.delPrefix('public:plaza-messages');
        const before = process.hrtime.bigint();
        const compact = repository.listPlazaPage({ limit: 8 });
        assert.ok(JSON.stringify(compact).length < JSON.stringify(legacy).length / 2);
        assert.ok(Number(process.hrtime.bigint() - before) / 1e6 < 1000, 'bounded fixture read');
    });
});
