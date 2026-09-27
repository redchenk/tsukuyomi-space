const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'article-engagement-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dir, DB_PATH: path.join(dir, 'test.db'), JWT_SECRET: 'article-engagement-tests-32-char-secret', ADMIN_PASSWORD: 'engagement-test', REDIS_URL: '', ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const engagement = require('../backend/services/article-engagement');
const growth = require('../backend/services/user-growth');
const social = require('../backend/repositories/social-repository');
const { buildDailyOrder, ensureDailyRecommendations } = require('../backend/services/article-recommendations');
const { generateToken } = require('../backend/middleware/auth');
let server, base, articleId;
const now = Date.parse('2026-09-27T01:00:00Z');
before(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const id of ['author', 'alice', 'bob']) db.prepare('INSERT INTO users(id, username, email, password_hash) VALUES (?, ?, ?, ?)').run(id, id, `${id}@test.invalid`, 'hashed-password');
    articleId = Number(db.prepare("INSERT INTO articles(title, content, author_id, category, view_count) VALUES ('创作', '正文', 'author', '其他', 10)").run().lastInsertRowid);
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
function request(user = '', cookie = '', id = articleId) {
    return { headers: { cookie, 'user-agent': 'Mozilla/5.0 Article reader' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, params: { id: String(id) }, user: user ? { id: user } : undefined };
}
function start(user = '', cookie = '', id = articleId, at = now) {
    const req = request(user, cookie, id);
    const res = { cookie(name, value) { req.headers.cookie = `${name}=${value}`; } };
    const reading = engagement.beginRead(req, res, id, at);
    req.body = { token: reading.token };
    return req;
}
function views() { return db.prepare('SELECT view_count AS n FROM articles WHERE id = ?').get(articleId).n; }
function xp() { return growth.getState('author').level.totalXp; }

test('historical XP preserves old XP, pays all stored signals once, and seeds toggle receipts', () => {
    growth.checkIn('author');
    social.bookmarkArticle('alice', articleId);
    social.setArticleLike('bob', articleId, true);
    // Construct the pre-release snapshot without new code rewards.
    db.prepare("DELETE FROM user_growth_events WHERE event_key LIKE 'article_%'").run();
    db.prepare("UPDATE user_growth_profiles SET total_xp = 10 WHERE user_id = 'author'").run();
    db.prepare('DELETE FROM article_reward_receipts').run();
    db.prepare('DELETE FROM article_growth_backfills').run();
    engagement.backfillHistorical();
    assert.equal(xp(), 27); // old 10 + 10 reads + 2 likes + 5 bookmarks
    engagement.backfillHistorical();
    assert.equal(xp(), 27);
    const state = growth.getState('author').articles;
    assert.deepEqual([state.totalXp, state.historyXp, state.viewXp, state.likeXp, state.bookmarkXp], [17, 17, 10, 2, 5]);
    social.unbookmarkArticle('alice', articleId);
    social.bookmarkArticle('alice', articleId);
    social.setArticleLike('bob', articleId, false);
    social.setArticleLike('bob', articleId, true);
    assert.equal(xp(), 27);
});

test('details including the live alias never increase reads; too-early, tampered and mismatched receipts cannot count', async () => {
    const before = views();
    for (const route of [`/api/articles/${articleId}`, `/api/articles/${articleId}/live/probe`, `/api/live/probe/articles/${articleId}`]) {
        const response = await fetch(base + route);
        const payload = await response.json();
        assert.equal(payload.success, true);
        assert.equal(payload.reading.seconds, 12);
        assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    }
    assert.equal(views(), before);
    const req = start('alice');
    assert.equal(engagement.completeRead(req, now + 11999).reason, 'too_soon');
    const stolen = { ...req, headers: { ...req.headers, cookie: start('bob').headers.cookie } };
    assert.equal(engagement.completeRead(stolen, now + 13000).reason, 'identity_changed');
    assert.equal(engagement.completeRead({ ...req, params: { id: '99999' } }, now + 13000).reason, 'identity_changed');
    assert.equal(engagement.completeRead({ ...req, body: { token: 'forged' } }, now + 13000).reason, 'invalid_token');
    assert.equal(engagement.completeRead(req, now + 3601000).reason, 'invalid_token');
    assert.equal(views(), before);
});

test('read + XP are atomic, device/account aliases deduplicate across tabs, login and days', () => {
    const before = views(), beforeXp = xp();
    const guest = start();
    assert.equal(engagement.completeRead(guest, now + 12000).counted, true);
    assert.equal(engagement.completeRead(guest, now + 14000).counted, false);
    const login = start('alice', guest.headers.cookie);
    assert.equal(engagement.completeRead(login, now + 12000).counted, false);
    const newDevice = start('alice');
    assert.equal(engagement.completeRead(newDevice, now + 12000).counted, false);
    assert.equal(engagement.completeRead(start('bob', newDevice.headers.cookie), now + 12000).counted, false);
    const tomorrow = start('alice', '', articleId, now + 86400000);
    assert.equal(engagement.completeRead(tomorrow, now + 86412000).counted, false);
    assert.equal(views(), before + 1);
    assert.equal(xp(), beforeXp + 1);
    // Resetting an anonymous cookie within the same day does not buy another read.
    assert.equal(engagement.completeRead(start(), now + 12000).counted, false);
});

test('shared network allows another signed-in reader, author and bots cannot farm XP', () => {
    db.prepare("INSERT INTO users(id, username, email, password_hash) VALUES ('charlie','charlie','charlie@test.invalid','hash')").run();
    const before = views(), beforeXp = xp();
    const own = start('author');
    assert.equal(engagement.completeRead(own, now + 12000).reason, 'author');
    assert.equal(engagement.completeRead(start('', own.headers.cookie), now + 12000).counted, false);
    const bot = start('charlie'); bot.headers['user-agent'] = 'Googlebot';
    assert.equal(engagement.completeRead(bot, now + 12000).reason, 'automated');
    assert.equal(engagement.completeRead(start('charlie'), now + 12000).counted, true);
    assert.equal(views(), before + 1);
    assert.equal(xp(), beforeXp + 1);
});

test('first real like/bookmark reward the author at 2/5 XP; self and cancel/re-add do not', async () => {
    const before = xp();
    const token = generateToken({ id: 'charlie', username: 'charlie', role: 'user' });
    async function send(route, method) {
        const res = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200);
        return res.json();
    }
    await send(`/api/user/article-likes/${articleId}`, 'POST');
    assert.equal(xp(), before + 2);
    await send(`/api/user/bookmarks/${articleId}`, 'POST');
    assert.equal(xp(), before + 7);
    for (const route of ['article-likes', 'bookmarks']) {
        await send(`/api/user/${route}/${articleId}`, 'DELETE');
        await send(`/api/user/${route}/${articleId}`, 'POST');
    }
    social.setArticleLike('author', articleId, true);
    social.bookmarkArticle('author', articleId);
    assert.equal(xp(), before + 7);
});

test('transaction failures roll back both the interaction and reward receipt', () => {
    const before = views();
    db.exec("CREATE TRIGGER fail_article_xp BEFORE INSERT ON user_growth_events WHEN NEW.event_key = 'article_view' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    const reader = start('', '', articleId); reader.ip = '192.0.2.5';
    assert.throws(() => engagement.completeRead(reader, now + 12000), /test failure/);
    assert.equal(views(), before);
    db.exec('DROP TRIGGER fail_article_xp');
    assert.equal(engagement.completeRead(reader, now + 12000).counted, true);
});

test('the read HTTP endpoint authenticates and credits a valid server-issued receipt', async () => {
    const id = Number(db.prepare("INSERT INTO articles(title, author_id) VALUES ('HTTP 阅读测试', 'author')").run().lastInsertRowid);
    const req = start('alice', '', id, Date.now() - 14000);
    const token = generateToken({ id: 'alice', username: 'alice', role: 'user' });
    const before = xp();
    const send = () => fetch(`${base}/api/articles/${id}/read`, { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Cookie: req.headers.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }).then(r => r.json());
    assert.equal((await send()).data.counted, true);
    assert.equal((await send()).data.counted, false);
    assert.equal(xp(), before + 1);
});

test('daily recommendations rotate qualified work, limit author dominance and avoid task posts', () => {
    const candidates = Array.from({ length: 48 }, (_, id) => ({ id, title: `作品${id}`, category: '二创', content_quality: 24, featured_score: 35 + id % 8,
        author_id: `author-${id % 8}`, published_at: '2026-09-26', last_day: null }));
    candidates.push({ id: 99, title: '打卡', category: '任务', content_quality: 1, featured_score: 99, pinned_at: '2026-09-27' });
    const seen = new Set(), dailySets = [];
    for (let date = 27; date <= 30; date++) {
        const day = `2026-09-${date}`;
        const order = buildDailyOrder(candidates, day);
        assert.deepEqual(order, buildDailyOrder(candidates, day));
        const picks = order.filter(a => a.recommended);
        assert.equal(picks.length, 12);
        assert.ok(picks.every(a => a.id !== 99));
        for (const a of picks) { seen.add(a.id); candidates.find(c => c.id === a.id).last_day = day; }
        assert.ok([...new Set(picks.map(a => a.author_id))].length >= 6);
        dailySets.push(picks.map(a => a.id).join(','));
    }
    assert.equal(new Set(dailySets).size, 4);
    assert.ok(seen.size >= 32, `Expected discovery rotation, saw ${seen.size}`);
});

test('daily snapshots survive repeated requests and new publications without shifting existing pages', () => {
    const day = ensureDailyRecommendations(now);
    const read = () => db.prepare('SELECT * FROM article_daily_recommendations WHERE day = ? ORDER BY position').all(day);
    const initial = read();
    ensureDailyRecommendations(now + 60000);
    assert.deepEqual(read(), initial);
    const id = db.prepare("INSERT INTO articles(title, content, category) VALUES ('新作', '写作过程和经验', '其他')").run().lastInsertRowid;
    ensureDailyRecommendations(now + 120000);
    assert.deepEqual(read().slice(0, initial.length), initial);
    assert.equal(read().at(-1).article_id, Number(id));
    assert.equal(read().at(-1).recommended, 0);
    assert.equal(ensureDailyRecommendations(Date.parse('2026-09-27T16:00:00Z')), '2026-09-28');
});
