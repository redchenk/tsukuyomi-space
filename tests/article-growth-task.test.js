const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsu-article-task-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: directory, DB_PATH: path.join(directory, 'test.db'), JWT_SECRET: 'article-task-fixture-secret-with-at-least-32-characters', ADMIN_PASSWORD: 'fixture-admin-password', ENABLE_FRONTEND_DIST: 'false', REDIS_URL: '' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const growth = require('../backend/services/user-growth');
const { generateToken } = require('../backend/middleware/auth');
let server, base, article, hiddenArticle;
function addUser(id) { db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)').run(id, id, `${id}@example.test`, 'fixture', 'user'); }
function assignedUser(prefix, key = 'daily_article_engage') {
    for (let i = 0; i < 100; i++) {
        const id = `${prefix}-${i}`; addUser(id);
        if (growth.getState(id).today.tasks[2].key === key) return id;
    }
    throw new Error('Could not seed an assigned task');
}
async function call(user, pathname, method = 'POST', body = {}) {
    const headers = { 'Content-Type': 'application/json', Origin: base, 'X-Requested-With': 'XMLHttpRequest' };
    if (user) headers.Authorization = `Bearer ${generateToken({ id: user, username: user, role: 'user' })}`;
    const response = await fetch(base + pathname, { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
}
const task = id => growth.getState(id).today.tasks[2];
before(async () => {
    server = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    addUser('article-task-author');
    const insert = db.prepare('INSERT INTO articles(title,content,author_id,status) VALUES(?,?,?,?)');
    article = Number(insert.run('公开文章', '任务验收正文', 'article-task-author', 'published').lastInsertRowid);
    hiddenArticle = Number(insert.run('未公开文章', '草稿', 'article-task-author', 'draft').lastInsertRowid);
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

for (const endpoint of ['article-likes', 'bookmarks']) {
    test(`${endpoint} completes the actor's task once, including retries and switching action`, async () => {
        const user = assignedUser(endpoint);
        const opposite = endpoint === 'article-likes' ? 'bookmarks' : 'article-likes';
        assert.equal(task(user).label, '给任意一篇文章点赞或收藏');
        const authorXp = growth.getState('article-task-author').level.totalXp;
        for (const target of [99999999, hiddenArticle]) assert.equal((await call(user, `/api/user/${endpoint}/${target}`)).status, 404);
        assert.equal((await call(null, `/api/user/${endpoint}/${article}`)).status, 401);
        await call(user, `/api/user/${endpoint}/${article}`, 'DELETE');
        await call(user, '/api/growth/actions/stage-visit', 'POST', { xp: 999999, userId: 'article-task-author', activityKey: 'article_like' });
        assert.equal(task(user).completed, false);
        const result = await call(user, `/api/user/${endpoint}/${article}`, 'POST', { xp: 99999, userId: 'article-task-author' });
        assert.equal(result.status, 200);
        assert.equal(result.growth.award.eventKey, 'daily_article_engage');
        assert.equal(result.growth.award.xp, 20);
        assert.equal(result.growth.state.today.tasks[2].completed, true);
        assert.equal(result.growth.state.level.totalXp, 20);
        await call(user, `/api/user/${endpoint}/${article}`);
        await call(user, `/api/user/${endpoint}/${article}`, 'DELETE');
        assert.equal((await call(user, `/api/user/${endpoint}/${article}`)).growth.award.xp, 0);
        assert.equal((await call(user, `/api/user/${opposite}/${article}`)).growth.award.xp, 0);
        assert.equal(growth.getState(user).level.totalXp, 20);
        assert.equal(growth.getState('article-task-author').level.totalXp - authorXp, 7, 'author interaction XP stays separate from the actor daily task');
    });
}

test('concurrent like and bookmark requests share one daily reward', async () => {
    const user = assignedUser('concurrent');
    const results = await Promise.all(['article-likes', 'bookmarks'].map(endpoint => call(user, `/api/user/${endpoint}/${article}`)));
    assert.deepEqual(results.map(result => result.growth.award.xp).sort((a, b) => a - b), [0, 20]);
    assert.equal(task(user).earnedXp, 20);
});

test('both legacy tasks remain completed without an extra reward or renamed history', async () => {
    for (const legacy of ['daily_stage_visit', 'daily_article_publish']) {
        const user = assignedUser(legacy);
        db.prepare('INSERT INTO user_growth_events(user_id,event_key,event_date,xp) VALUES(?,?,?,20)').run(user, legacy, growth.hongKongDate());
        db.prepare('UPDATE user_growth_profiles SET total_xp=20 WHERE user_id=?').run(user);
        assert.equal(task(user).completed, true);
        assert.equal(task(user).earnedXp, 20);
        const result = await call(user, `/api/user/article-likes/${article}`);
        assert.equal(result.growth.award.xp, 0);
        assert.equal(result.growth.state.level.totalXp, 20);
        assert.equal(result.growth.state.recentEvents[0].key, legacy);
        assert.equal(db.prepare("SELECT COUNT(*) n FROM user_growth_events WHERE user_id=? AND event_key='daily_article_engage'").get(user).n, 0);
    }
});

test('other rotating tasks and removal actions do not complete the article task', async () => {
    const user = assignedUser('plaza-assigned', 'daily_plaza_engage');
    assert.equal((await call(user, `/api/user/article-likes/${article}`)).growth, null);
    assert.equal((await call(user, `/api/user/bookmarks/${article}`)).growth, null);
    assert.equal(task(user).completed, false);
    assert.equal(growth.getState(user).level.totalXp, 0);
});

test('interaction and task completion roll back together if the reward cannot be recorded', async () => {
    const user = assignedUser('atomic');
    const record = growth.recordDailyActivity, log = console.error;
    const authorXp = growth.getState('article-task-author').level.totalXp;
    try {
        growth.recordDailyActivity = () => { throw new Error('fixture storage failure'); };
        console.error = () => {};
        for (const endpoint of ['article-likes', 'bookmarks']) assert.equal((await call(user, `/api/user/${endpoint}/${article}`)).status, 500);
    } finally { growth.recordDailyActivity = record; console.error = log; }
    assert.equal((await call(user, `/api/user/article-likes/${article}/status`, 'GET')).data.liked, false);
    assert.equal((await call(user, `/api/user/bookmarks/${article}/status`, 'GET')).data.bookmarked, false);
    assert.equal(growth.getState('article-task-author').level.totalXp, authorXp);
    assert.equal(task(user).completed, false);
    assert.equal((await call(user, `/api/user/bookmarks/${article}`)).growth.award.xp, 20, 'retry can finish the task after storage recovers');
});

test('legacy completion only counts for its original day', () => {
    const user = assignedUser('later-rotation');
    const today = new Date();
    db.prepare('INSERT INTO user_growth_events(user_id,event_key,event_date,xp) VALUES(?,?,?,20)').run(user, 'daily_stage_visit', growth.hongKongDate(today));
    db.prepare('UPDATE user_growth_profiles SET total_xp=20 WHERE user_id=?').run(user);
    const nextRotation = new Date(today.getTime() + 5 * 86400000);
    assert.equal(growth.getState(user, nextRotation).today.tasks[2].completed, false);
    const result = growth.recordDailyActivity(user, 'article_bookmark', article, nextRotation);
    assert.equal(result.award.xp, 20);
    assert.equal(result.state.level.totalXp, 40);
});
