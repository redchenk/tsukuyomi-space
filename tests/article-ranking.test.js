const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { contentQuality, featuredScore } = require('../backend/services/article-ranking');

const now = Date.parse('2026-09-15T00:00:00Z');
const prose = Array.from({ length: 12 }, (_, paragraph) =>
    `第${paragraph}节：` + Array.from({ length: 50 }, (_, word) => `记录${paragraph * 50 + word}的创作方法与验证结果`).join('，')
).join('\n\n');

test('content analysis rewards substance, ignores metadata and discounts repeated padding', () => {
    assert.ok(contentQuality(prose) > 30);
    assert.ok(contentQuality(prose) > contentQuality('wu'));
    const paragraph = '记录今天的创作过程，讲述遇到的问题与解决方法。';
    assert.equal(contentQuality(paragraph), contentQuality(Array(100).fill(paragraph).join('\n\n')));
    assert.ok(contentQuality('好'.repeat(10000)) < 1);
    assert.equal(contentQuality('<script>' + prose + '</script><div hidden>' + prose + '</div>', 'html'), 0);
    assert.equal(contentQuality('<p data-long="' + 'x'.repeat(10000) + '">wu</p>', 'html'), contentQuality('wu'));
    const html = prose.split('\n\n').map(text => `<p>${text}</p>`).join('');
    assert.equal(contentQuality(html, 'html'), contentQuality(prose));
    const blocks = JSON.stringify(prose.split('\n\n').map(text => ({ type: 'paragraph', text })));
    assert.equal(contentQuality(blocks, 'block'), contentQuality(prose));
    assert.ok(contentQuality(JSON.stringify([{ type: 'paragraph', text: prose }, { type: 'image', url: 'data:image/png;base64,' + 'a'.repeat(210000) }]), 'block') > 30);
    assert.equal(contentQuality('not json', 'block'), 0);
    assert.ok(contentQuality('![作品](/art/a.webp)') > contentQuality(''));
    assert.equal(contentQuality('![作品](/art/a.webp)'.repeat(20)), contentQuality('![作品](/art/a.webp)'));
    assert.ok(contentQuality('<img src="/art/a.webp">', 'html') > 0);
});

test('ranking balances quality, reach, reader endorsement and a small freshness boost', () => {
    const score = (quality, views, likes = 0, bookmarks = 0, date = '2026-09-01') => featuredScore(quality, views, likes, bookmarks, date, now);
    assert.ok(score(contentQuality(prose), 50) > score(contentQuality('wu'), 1000000));
    assert.ok(score(30, 100, 3) > score(30, 100));
    assert.ok(score(30, 100, 0, 3) > score(30, 100));
    assert.ok(score(30, 500) > score(30, 50));
    assert.ok(score(30, 100, 5, 3) > score(30, 10000));
    assert.ok(score(30, 0, 1) < score(30, 100, 5, 3));
    assert.ok(score(30, 100, 5, 3, '2026-09-15') > score(30, 100, 5, 3, '2020-01-01'));
    assert.equal(score(30, 100, 5, 3, '2028-01-01'), score(30, 100, 5, 3, '2026-09-15'));
    assert.equal(score(30, -1), score(30, 0));
    assert.ok(Number.isFinite(score(NaN, Infinity, -3, NaN, 'bad')));
    assert.ok(score(100, 1e9, 1e9, 1e9) <= 100);
});

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-ranking-'));
Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.db'),
    JWT_SECRET: 'ranking-test-secret-at-least-32-characters', REDIS_URL: '',
    ADMIN_PASSWORD: 'ranking-test-password', ADMIN_USERNAME: 'admin',
    ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true'
});
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const repository = require('../backend/repositories/article-repository');
const cache = require('../backend/services/response-cache');
let server;
let baseUrl;
let cookie;
let strongId;
let emptyId;
let draftId;
before(async () => {
    const app = createApp();
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const insert = db.prepare(`INSERT INTO articles (title, content, category, view_count, published_at, status, pinned_at)
        VALUES (?, ?, 'ranking-fixture', ?, ?, ?, ?)`);
    emptyId = Number(insert.run('置顶空文', 'wu', 1000000, '2026-09-15', 'published', '2026-09-15').lastInsertRowid);
    for (let i = 0; i < 105; i++) insert.run(`短文${i}`, '一句记录', 10, '2026-09-10', 'published', null);
    strongId = Number(insert.run('实质内容', prose, 50, '2026-09-01', 'published', null).lastInsertRowid);
    draftId = Number(insert.run('未发布内容', prose, 1000000, '2026-09-15', 'draft', null).lastInsertRowid);
    const login = await call('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'ranking-test-password' } });
    assert.equal(login.response.status, 200);
    cookie = login.response.headers.getSetCookie().find(value => value.startsWith('tsukuyomi_session=')).split(';')[0];
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

async function call(url, { method = 'GET', body, authenticated = false } = {}) {
    const response = await fetch(baseUrl + url, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin',
            'X-Requested-With': 'XMLHttpRequest', ...(authenticated ? { Cookie: cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { response, body: await response.json() };
}

test('pins stay first while featured and latest preserve their own order before pagination', async () => {
    const query = '/api/articles?category=ranking-fixture&limit=2';
    const pinned = await call(query);
    const latest = await call(query + '&sort=latest');
    const featured = await call(query + '&sort=featured');
    assert.equal(pinned.body.data[0].id, emptyId);
    assert.equal(latest.body.data[0].id, emptyId);
    assert.equal(featured.body.data[0].id, emptyId);
    assert.equal(featured.body.data[1].id, strongId);
    assert.equal(featured.body.pagination.total, 107);
    assert.ok(featured.body.data[1].featured_score > featured.body.data[0].featured_score);
    assert.equal(featured.body.data[1].like_count, 0);
    assert.equal(featured.body.data[1].bookmark_count, 0);
    assert.equal('content' in featured.body.data[0], false);
    const all = repository.listArticles({ category: 'ranking-fixture', limit: 200, offset: 0, sort: 'featured', now }).articles;
    const pages = [0, 100].flatMap(offset => repository.listArticles({ category: 'ranking-fixture', limit: 100, offset, sort: 'featured', now }).articles);
    assert.deepEqual(pages.map(row => row.id), all.map(row => row.id));
    assert.equal(new Set(pages.map(row => row.id)).size, 107);
    assert.ok(!pages.some(row => row.id === draftId));
    const live = await call('/api/live/ranking/articles?category=ranking-fixture&limit=1&sort=featured');
    assert.equal(live.body.data[0].id, emptyId);
});

test('article likes are authenticated, idempotent, reversible and invalidate the ranking cache', async () => {
    const route = `/api/user/article-likes/${strongId}`;
    assert.equal((await call(route, { method: 'POST' })).response.status, 401);
    for (const method of ['POST', 'DELETE', 'GET']) {
        const hidden = await call(`/api/user/article-likes/${draftId}${method === 'GET' ? '/status' : ''}`, { method, authenticated: true });
        assert.equal(hidden.response.status, 404);
    }
    const listing = '/api/articles?category=ranking-fixture&sort=featured';
    const before = (await call(listing)).body.data.find(row => row.id === strongId);
    const liked = await call(route, { method: 'POST', authenticated: true });
    assert.deepEqual(liked.body.data, { liked: true, count: 1 });
    assert.deepEqual((await call(route, { method: 'POST', authenticated: true })).body.data, liked.body.data);
    assert.deepEqual((await call(route + '/status', { authenticated: true })).body.data, liked.body.data);
    const after = (await call(listing)).body.data.find(row => row.id === strongId);
    assert.equal(after.like_count, 1);
    assert.ok(after.featured_score > before.featured_score);
    const detail = await call(`/api/articles/${strongId}`);
    assert.equal(detail.body.data.like_count, 1);
    assert.equal(detail.body.data.bookmark_count, 0);
    assert.deepEqual((await call(route, { method: 'DELETE', authenticated: true })).body.data, { liked: false, count: 0 });
    assert.deepEqual((await call(route, { method: 'DELETE', authenticated: true })).body.data, { liked: false, count: 0 });
    assert.equal((await call(listing)).body.data.find(row => row.id === strongId).like_count, 0);
});

test('bookmarks refresh featured scores immediately and article deletion removes endorsements', async () => {
    const listing = '/api/articles?category=ranking-fixture&sort=featured';
    const before = (await call(listing)).body.data.find(row => row.id === strongId);
    await call(`/api/user/bookmarks/${strongId}`, { method: 'POST', authenticated: true });
    const saved = (await call(listing)).body.data.find(row => row.id === strongId);
    assert.equal(saved.bookmark_count, 1);
    assert.ok(saved.featured_score > before.featured_score);
    await call(`/api/user/bookmarks/${strongId}`, { method: 'DELETE', authenticated: true });
    assert.equal((await call(listing)).body.data.find(row => row.id === strongId).bookmark_count, 0);
    await call(`/api/user/article-likes/${emptyId}`, { method: 'POST', authenticated: true });
    assert.equal(repository.deleteArticle(emptyId), 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM article_likes WHERE article_id = ?').get(emptyId).total, 0);
    cache.clear();
});
