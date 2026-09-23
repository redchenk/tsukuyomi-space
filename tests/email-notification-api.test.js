const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-notifications-'));
Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.db'),
    JWT_SECRET: 'notification-test-secret-at-least-32-characters', REDIS_URL: '',
    ADMIN_PASSWORD: 'test-super-password', ADMIN_USERNAME: 'admin',
    ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true'
});

const sentByRoutes = [];
const mailer = require('../backend/services/mailer');
mailer.sendNotificationEmail = async (to, event) => { sentByRoutes.push({ to, event }); };
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { notificationEmailRecipient, queueNotificationEmail } = require('../backend/services/notification-email');
const { generateToken } = require('../backend/middleware/auth');
let server;
let baseUrl;
let superCookie;
let staffCookie;

async function call(pathname, { method = 'GET', body, cookie, token } = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
            'Content-Type': 'application/json', Origin: baseUrl,
            'Sec-Fetch-Site': 'same-origin', 'X-Requested-With': 'XMLHttpRequest',
            ...(cookie ? { Cookie: cookie } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json(), response };
}

before(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)')
        .run('staff', bcrypt.hashSync('test-staff-password', 10), 'admin');
    const superLogin = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'test-super-password' } });
    const staffLogin = await call('/api/admin/login', { method: 'POST', body: { username: 'staff', password: 'test-staff-password' } });
    assert.equal(superLogin.status, 200);
    assert.equal(staffLogin.status, 200);
    superCookie = superLogin.response.headers.getSetCookie().find(value => value.startsWith('tsukuyomi_admin_session=')).split(';')[0];
    staffCookie = staffLogin.response.headers.getSetCookie().find(value => value.startsWith('tsukuyomi_admin_session=')).split(';')[0];
    db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        .run('notify-owner', 'notify-owner', 'owner@example.com', bcrypt.hashSync('owner-password', 10), 'user');
    db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        .run('notify-actor', 'notify-actor', 'actor@example.com', bcrypt.hashSync('actor-password', 10), 'user');
});

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

test('notification settings default off and are super_admin-only', async () => {
    const defaults = await call('/api/admin/settings', { cookie: superCookie });
    assert.equal(defaults.status, 200);
    assert.equal(defaults.body.data.emailNotifyReplies, false);
    assert.equal(defaults.body.data.emailNotifyLikes, false);
    assert.equal(defaults.body.data.emailNotifyUnusualLogin, false);
    assert.equal(defaults.body.data.mailConfigured, false);

    const staffRead = await call('/api/admin/settings', { cookie: staffCookie });
    assert.equal(staffRead.status, 200);
    assert.equal(Object.hasOwn(staffRead.body.data, 'emailNotifyReplies'), false);
    assert.equal(Object.hasOwn(staffRead.body.data, 'mailConfigured'), false);

    const denied = await call('/api/admin/settings', {
        method: 'POST', cookie: staffCookie, body: { emailNotifyReplies: true }
    });
    assert.equal(denied.status, 403);

    const invalid = await call('/api/admin/settings', {
        method: 'POST', cookie: superCookie, body: { emailNotifyReplies: 'false' }
    });
    assert.equal(invalid.status, 400);

    const saved = await call('/api/admin/settings', {
        method: 'POST', cookie: superCookie,
        body: { emailNotifyReplies: true, emailNotifyLikes: true, emailNotifyUnusualLogin: false }
    });
    assert.equal(saved.status, 200);
    const refreshed = await call('/api/admin/settings', { cookie: superCookie });
    assert.equal(refreshed.body.data.emailNotifyReplies, true);
    assert.equal(refreshed.body.data.emailNotifyLikes, true);
    assert.equal(refreshed.body.data.emailNotifyUnusualLogin, false);
});

test('email dispatch respects enabled type, recipient address and actor identity', async () => {
    assert.equal(notificationEmailRecipient('notify-owner', 'reply', 'other'), 'owner@example.com');
    assert.equal(notificationEmailRecipient('notify-owner', 'like', 'other'), 'owner@example.com');
    assert.equal(notificationEmailRecipient('notify-owner', 'reply', 'notify-owner'), '');
    assert.equal(notificationEmailRecipient('notify-owner', 'follow', 'other'), '');
    const sent = [];
    const queued = queueNotificationEmail({
        userId: 'notify-owner', actorId: 'other', type: 'reply',
        title: '新回复', content: '你好', link: '/plaza', actorName: '访客'
    }, { schedule: callback => callback(), send: async (...args) => sent.push(args) });
    await Promise.resolve();
    assert.equal(queued, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], 'owner@example.com');
    assert.equal(sent[0][1].type, 'reply');
    db.prepare("UPDATE site_settings SET value = 'false' WHERE key = 'emailNotifyReplies'").run();
    assert.equal(notificationEmailRecipient('notify-owner', 'reply', 'other'), '');
});

test('published replies, article comments and new likes mail the owner once when enabled', async () => {
    db.prepare("UPDATE site_settings SET value = 'true' WHERE key = 'emailNotifyReplies'").run();
    const ownerToken = generateToken({ id: 'notify-owner', username: 'notify-owner', role: 'user' });
    const actorToken = generateToken({ id: 'notify-actor', username: 'notify-actor', role: 'user' });
    const ownerMessage = await call('/api/messages', {
        method: 'POST', body: { content: '月下留言' }, token: ownerToken
    });
    assert.equal(ownerMessage.status, 201);
    const messageId = ownerMessage.body.data.id;
    const reply = await call(`/api/messages/${messageId}/reply`, {
        method: 'POST', body: { content: '欢迎回来' }, token: actorToken
    });
    assert.equal(reply.status, 201);
    const messageLike = await call(`/api/messages/${messageId}/like`, {
        method: 'POST', token: actorToken
    });
    assert.equal(messageLike.status, 200);
    const secondLike = await call(`/api/messages/${messageId}/like`, {
        method: 'POST', token: actorToken
    });
    assert.equal(secondLike.status, 400);
    const articleId = db.prepare("INSERT INTO articles (title, content, category, status, author_id) VALUES ('月下文章', '正文', '其他', 'published', ?)")
        .run('notify-owner').lastInsertRowid;
    const articleComment = await call('/api/messages', {
        method: 'POST', body: { content: '这篇文章写得真好', article_id: articleId }, token: actorToken
    });
    assert.equal(articleComment.status, 201);
    assert.equal(articleComment.body.data.status, 'approved');
    const articleLike = await call(`/api/user/article-likes/${articleId}`, {
        method: 'POST', token: actorToken
    });
    assert.equal(articleLike.status, 200);
    const duplicateArticleLike = await call(`/api/user/article-likes/${articleId}`, {
        method: 'POST', token: actorToken
    });
    assert.equal(duplicateArticleLike.status, 200);
    const pendingReply = await call(`/api/messages/${messageId}/reply`, {
        method: 'POST', body: { content: '这条消息提到政治，需要先审核' }, token: actorToken
    });
    assert.equal(pendingReply.status, 201);
    assert.equal(pendingReply.body.data.status, 'pending');
    const pendingArticleComment = await call('/api/messages', {
        method: 'POST', body: { content: '这篇文章提到政治，需要先审核', article_id: articleId }, token: actorToken
    });
    assert.equal(pendingArticleComment.status, 201);
    assert.equal(pendingArticleComment.body.data.status, 'pending');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(sentByRoutes.map(item => item.event.type).sort(), ['like', 'like', 'reply', 'reply']);
    assert.equal(sentByRoutes.filter(item => item.event.title.includes('评论了你的文章《月下文章》')).length, 1);
    assert.ok(sentByRoutes.some(item => item.event.link.endsWith(`#comment-${articleComment.body.data.id}`)));
    assert.equal(sentByRoutes.filter(item => item.event.title.includes('点赞了你的文章')).length, 1);
    const reviewList = await call('/api/admin/messages', { cookie: superCookie });
    const reviewed = reviewList.body.data.find(item => item.id === pendingReply.body.data.id);
    const reviewedArticleComment = reviewList.body.data.find(item => item.id === pendingArticleComment.body.data.id);
    assert.ok(reviewed?.moderation?.reviewDigest);
    assert.ok(reviewedArticleComment?.moderation?.reviewDigest);
    const approved = await call(`/api/admin/messages/${reviewed.id}/approve`, {
        method: 'POST', cookie: superCookie,
        body: { reviewDigest: reviewed.moderation.reviewDigest }
    });
    assert.equal(approved.status, 200);
    const approvedArticleComment = await call(`/api/admin/messages/${reviewedArticleComment.id}/approve`, {
        method: 'POST', cookie: superCookie,
        body: { reviewDigest: reviewedArticleComment.moderation.reviewDigest }
    });
    assert.equal(approvedArticleComment.status, 200);
    const approvedAgain = await call(`/api/admin/messages/${reviewedArticleComment.id}/approve`, {
        method: 'POST', cookie: superCookie,
        body: { reviewDigest: reviewedArticleComment.moderation.reviewDigest }
    });
    assert.equal(approvedAgain.status, 200);
    const selfComment = await call('/api/messages', {
        method: 'POST', body: { content: '感谢大家阅读', article_id: articleId }, token: ownerToken
    });
    assert.equal(selfComment.status, 201);
    const pendingEditedComment = await call('/api/messages', {
        method: 'POST', body: { content: '这篇文章提到政治，我想补充一下', article_id: articleId }, token: actorToken
    });
    assert.equal(pendingEditedComment.body.data.status, 'pending');
    const editedComment = await call(`/api/messages/${pendingEditedComment.body.data.id}`, {
        method: 'PATCH', body: { content: '补充一句：期待下一篇' }, token: actorToken
    });
    assert.equal(editedComment.status, 200);
    assert.equal(editedComment.body.data.status, 'approved');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(sentByRoutes.map(item => item.event.type).sort(), ['like', 'like', 'reply', 'reply', 'reply', 'reply', 'reply']);
    assert.equal(sentByRoutes.filter(item => item.event.title.includes('评论了你的文章《月下文章》')).length, 3);
    assert.ok(sentByRoutes.every(item => item.to === 'owner@example.com'));
    const notifications = db.prepare("SELECT type, link, related_article_id, related_message_id FROM notifications WHERE user_id = 'notify-owner' ORDER BY id").all();
    assert.deepEqual(notifications.map(item => item.type), ['reply', 'like', 'reply', 'like', 'reply', 'reply', 'reply']);
    const articleNotification = notifications.find(item => item.related_message_id === articleComment.body.data.id);
    assert.equal(articleNotification.related_article_id, articleId);
    assert.ok(articleNotification.link.endsWith(`#comment-${articleComment.body.data.id}`));
});
