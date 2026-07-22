const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-growth-api-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'growth-api.db');
process.env.JWT_SECRET = 'growth-api-jwt-secret-with-more-than-32-characters';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@growth-api.test';
process.env.ADMIN_PASSWORD = 'admin-growth-api-test-password';
process.env.ENABLE_FRONTEND_DIST = 'false';
process.env.REDIS_URL = '';

const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');

let server;
let baseUrl;
let token;
let actionToken;

function headers(auth = true, authToken = token) {
    return {
        'Content-Type': 'application/json',
        Origin: baseUrl,
        'Sec-Fetch-Site': 'same-origin',
        'X-Requested-With': 'XMLHttpRequest',
        ...(auth ? { Authorization: `Bearer ${authToken}` } : {})
    };
}

async function call(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    return { response, body: await response.json() };
}

before(async () => {
    server = await new Promise((resolve) => {
        const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES ('growth-api-user', 'growth-api-user', 'growth-api@example.test', 'growth-api-password-hash', 'user')
    `).run();
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES ('public-level-zero', 'public-level-zero', 'public-level-zero@example.test', 'growth-api-password-hash', 'user')
    `).run();
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES ('growth-action-user', 'growth-action-user', 'growth-action@example.test', 'growth-api-password-hash', 'user')
    `).run();
    token = generateToken({ id: 'growth-api-user', username: 'growth-api-user', role: 'user' });
    actionToken = generateToken({ id: 'growth-action-user', username: 'growth-action-user', role: 'user' });
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('growth API', () => {
    it('publishes only bounded level identity data without creating a private profile', async () => {
        const before = db.prepare('SELECT COUNT(*) AS count FROM user_growth_profiles WHERE user_id = ?').get('public-level-zero').count;
        const { response, body } = await call('/api/growth/public?ids=public-level-zero', { headers: headers(false) });
        const after = db.prepare('SELECT COUNT(*) AS count FROM user_growth_profiles WHERE user_id = ?').get('public-level-zero').count;

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.deepEqual(Object.keys(body.data[0]).sort(), ['level', 'title', 'userId']);
        assert.equal(body.data[0].userId, 'public-level-zero');
        assert.equal(body.data[0].level, 1);
        assert.equal(before, 0);
        assert.equal(after, 0);

        const invalid = await call('/api/growth/public?ids=public-level-zero%2C..%2Fadmin', { headers: headers(false) });
        assert.equal(invalid.response.status, 400);
    });

    it('requires an authenticated account', async () => {
        const { response, body } = await call('/api/growth/me', { headers: headers(false) });
        assert.equal(response.status, 401);
        assert.equal(body.success, false);
    });

    it('ignores client-supplied XP and awards a share only once', async () => {
        const first = await call('/api/growth/actions/share', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ platform: 'qq', xp: 999999, eventKey: 'referral_invite' })
        });
        const second = await call('/api/growth/actions/share', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ platform: 'qq' })
        });

        assert.equal(first.response.status, 200);
        assert.equal(first.body.data.award.xp, 15);
        assert.equal(first.body.data.state.level.totalXp, 15);
        assert.deepEqual(first.body.data.state.today.tasks.slice(0, 2).map((task) => task.key), ['checkin', 'daily_share']);
        assert.equal(first.body.data.state.today.tasks[2].type, 'rotating');
        assert.equal(second.body.data.award.xp, 0);
        assert.equal(second.body.data.state.level.totalXp, 15);
    });

    it('awards the first complete room turn and returns the updated state', async () => {
        const result = await call('/api/room/chat/turn', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({
                turnId: 'growth-api-turn-001',
                userMessage: '今天也请多关照。',
                assistantMessage: '嗯，我会记住今天的相遇。'
            })
        });
        assert.equal(result.response.status, 201);
        assert.equal(result.body.growth.award.xp, 0);
        assert.equal(result.body.growth.award.roomFirstTurn, true);
        assert.equal(result.body.growth.state.today.roomChatCompleted, true);
        assert.equal(result.body.growth.state.today.completed, 1);
        assert.equal(result.body.growth.state.level.totalXp, 15);
    });

    it('completes the assigned rotating task from its real content endpoint', async () => {
        const current = await call('/api/growth/me', { headers: headers(true, actionToken) });
        const task = current.body.data.today.tasks.find((item) => item.type === 'rotating');
        let result;

        if (task.key === 'daily_article_publish') {
            result = await call('/api/articles', {
                method: 'POST',
                headers: headers(true, actionToken),
                body: JSON.stringify({
                    title: 'Growth integration article',
                    excerpt: 'A real article action for the rotating growth task.',
                    content: 'Growth integration content',
                    category: '其他',
                    read_time: '1 min'
                })
            });
        } else if (task.key === 'daily_plaza_engage') {
            result = await call('/api/messages', {
                method: 'POST',
                headers: headers(true, actionToken),
                body: JSON.stringify({ content: '今天的月读广场成长任务测试留言。' })
            });
        } else if (task.key === 'daily_pixel_engage') {
            const pixels = Array(32 * 18).fill(-1);
            pixels[33] = 1;
            result = await call('/api/pixel-art', {
                method: 'POST',
                headers: headers(true, actionToken),
                body: JSON.stringify({
                    title: 'Growth integration pixel',
                    description: 'Rotating task artwork',
                    size: 32,
                    width: 32,
                    height: 18,
                    background_color: '#172033',
                    palette: ['#0b1020', '#ffffff'],
                    pixels
                })
            });
        } else {
            result = await call('/api/assets', {
                method: 'POST',
                headers: headers(true, actionToken),
                body: JSON.stringify({
                    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                    fileName: 'growth-gallery.png',
                    mimeType: 'image/png',
                    alt: 'Growth gallery task',
                    collection: 'gallery',
                    storage: 'local'
                })
            });
        }

        assert.ok([200, 201].includes(result.response.status));
        assert.equal(result.body.success, true);
        assert.equal(result.body.growth.award.eventKey, task.key);
        assert.equal(result.body.growth.award.xp, 20);
        assert.equal(result.body.growth.state.today.completed, 1);
    });
});
