const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { summarizeArticle, resolveArticleExcerpt, SUMMARY_LENGTH, MAX_SUMMARY_INPUT } = require('../backend/services/article-summary');

test('extracts readable prose from Markdown without code, URLs or formatting', () => {
    const source = '---\ntitle: metadata\n---\n# 月下记录\n\n今天的**创作**与[阅读](https://example.test/read)。\n\n```js\nsecretCode();\n```\n\n> 留下一点月光。\n![夜景](/cover.webp)';
    assert.equal(summarizeArticle(source), '月下记录 今天的创作与阅读。 留下一点月光。 夜景');
    assert.equal(summarizeArticle('开头\n~~~js\ncode();\n~~~\n结尾'), '开头 结尾');
    assert.equal(summarizeArticle('开头\n```js\nunfinished code'), '开头');
    assert.equal(summarizeArticle('[说明][ref]\n\n[ref]: https://example.test/secret\nhttps://example.test'), '说明');
});

test('new Markdown syntax leaves readable summaries without exposing spoilers', () => {
    assert.equal(summarizeArticle('::: tip 提示\n==重点=={.tip} :spoiler[隐藏[嵌套]内容] 继续。\n:::'), '重点 继续。');
    assert.equal(summarizeArticle('> [!NOTE]\n> 说明[^a]\n\n[^a]: 资料'), '说明');
    assert.equal(summarizeArticle('| 项目 | 数量 |\n| :--- | ---: |\n| 月光 | 8 |\n\n- [x] 完成\n- [ ] 待办'), '项目 数量 月光 8 完成 待办');
});

test('supports HTML and block articles, excluding invisible markup', () => {
    const html = '<h2>月光</h2><p>阅读 &amp; 创作<br>继续。</p><script>secret()</script><div hidden>隐藏</div><p style="display:none">隐藏</p><div aria-hidden="true"><span>隐藏</span></div><pre><code>const secret=1</code></pre><p>下一段</p>';
    assert.equal(summarizeArticle(html, 'html'), '月光 阅读 & 创作 继续。 下一段');
    const blocks = JSON.stringify([{ type: 'paragraph', text: '月下记录。' }, { type: 'code', text: 'secret' }, { type: 'paragraph', text: '继续创作。' }, { type: 'image', url: 'https://example.test/image', alt: '夜景' }]);
    assert.equal(summarizeArticle(blocks, 'block'), '月下记录。 继续创作。 夜景');
    assert.equal(summarizeArticle('invalid', 'block'), '');
    assert.equal(summarizeArticle('[]', 'block'), '');
});

test('bounds summaries, prefers sentence boundaries and preserves manual excerpts', () => {
    assert.equal(summarizeArticle('月'.repeat(120) + '。' + '夜'.repeat(100)), '月'.repeat(120) + '。');
    const unicode = summarizeArticle('🌙'.repeat(250));
    assert.equal(Array.from(unicode).length, SUMMARY_LENGTH);
    assert.equal(unicode, '🌙'.repeat(SUMMARY_LENGTH - 1) + '…');
    assert.ok(summarizeArticle('Article content '.repeat(500)).length <= SUMMARY_LENGTH);
    assert.equal(summarizeArticle(null), '');
    assert.equal(summarizeArticle('![](/cover.png)'), '');
    assert.equal(resolveArticleExcerpt(' 手写'.repeat(100), '正文'), ' 手写'.repeat(100));
    assert.equal(resolveArticleExcerpt(' \n ', '自动提取正文。'), '自动提取正文。');
});

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-summary-'));
Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.db'),
    JWT_SECRET: 'summary-test-secret-at-least-32-characters', REDIS_URL: '',
    ADMIN_PASSWORD: 'summary-admin-password', ADMIN_USERNAME: 'admin',
    ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true'
});
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const repository = require('../backend/repositories/article-repository');
let server;
let baseUrl;
let userCookie;
let adminCookie;
let moderatorCookie;
before(async () => {
    const app = createApp();
    db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        .run('summary-user', 'summary-user', 'summary@example.test', bcrypt.hashSync('summary-password', 4), 'user');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    userCookie = await login('/api/auth/login', 'summary-user', 'summary-password', 'tsukuyomi_session');
    adminCookie = await login('/api/admin/login', 'admin', 'summary-admin-password', 'tsukuyomi_admin_session');
    moderatorCookie = await login('/api/auth/login', 'admin', 'summary-admin-password', 'tsukuyomi_session');
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});
async function call(url, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(baseUrl + url, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin',
            'X-Requested-With': 'XMLHttpRequest', ...(cookie ? { Cookie: cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { response, body: await response.json() };
}
async function login(url, username, password, name) {
    const result = await call(url, { method: 'POST', body: { username, password } });
    assert.equal(result.response.status, 200);
    return result.response.headers.getSetCookie().find(value => value.startsWith(name + '=')).split(';')[0];
}

test('summary preview is authenticated, read-only and validates unsupported inputs', async () => {
    const before = db.prepare('SELECT COUNT(*) AS total FROM articles').get().total;
    for (const [url, cookie] of [['/api/articles/summarize', userCookie], ['/api/admin/articles/summarize', adminCookie]]) {
        assert.equal((await call(url, { method: 'POST', body: { content: '正文' } })).response.status, 401);
        const preview = await call(url, { method: 'POST', cookie, body: { content: '# 标题\n\n这是一段正文。' } });
        assert.equal(preview.response.status, 200);
        assert.equal(preview.body.data.excerpt, '标题 这是一段正文。');
        assert.match(preview.response.headers.get('cache-control'), /no-store/);
        for (const [body, status] of [[{ content: ' ' }, 400], [{ content: '正文', content_format: 'other' }, 400], [{ content: '```js\ncode();\n```' }, 422], [{ content: '月'.repeat(MAX_SUMMARY_INPUT + 1) }, 413]]) {
            assert.equal((await call(url, { method: 'POST', cookie, body })).response.status, status);
        }
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM articles').get().total, before);
});

test('blank excerpts are saved automatically and all edit routes retain manual excerpts or regenerate', async () => {
    const article = { title: '自动摘要测试', category: '其他', content: '第一篇文章的正文。', content_format: 'markdown', read_time: '2 分钟', excerpt: '' };
    const created = await call('/api/articles', { method: 'POST', cookie: userCookie, body: article });
    assert.equal(created.response.status, 201);
    const id = created.body.data.id;
    assert.equal(db.prepare('SELECT excerpt FROM articles WHERE id = ?').get(id).excerpt, article.content);
    const routes = [
        [`/api/user/articles/${id}`, 'PUT', userCookie],
        [`/api/articles/${id}`, 'PUT', moderatorCookie],
        [`/api/admin/articles/${id}`, 'PUT', adminCookie],
        [`/api/moderation/articles/${id}/save`, 'POST', moderatorCookie]
    ];
    for (const [url, method, cookie] of routes) {
        const manual = '这段手写摘要需要完整保留。'.repeat(30);
        assert.equal((await call(url, { method, cookie, body: { ...article, excerpt: manual } })).response.status, 200);
        assert.equal(db.prepare('SELECT excerpt FROM articles WHERE id = ?').get(id).excerpt, manual);
        const body = { ...article, content: '更新后的正文，用于重新生成摘要。', excerpt: ' \n ' };
        assert.equal((await call(url, { method, cookie, body })).response.status, 200);
        assert.equal(db.prepare('SELECT excerpt FROM articles WHERE id = ?').get(id).excerpt, body.content);
    }
});

test('legacy blank excerpts appear in list, recent and detail without rewriting stored articles', async () => {
    const content = '<p>旧文章也应显示正文摘要。</p>';
    const id = Number(db.prepare("INSERT INTO articles (title, excerpt, content, content_format, category, status) VALUES (?, '', ?, 'html', 'summary-legacy', 'published')")
        .run('旧文章', content).lastInsertRowid);
    const listed = repository.listArticles({ category: 'summary-legacy', limit: 10, offset: 0 }).articles[0];
    assert.equal(listed.excerpt, '旧文章也应显示正文摘要。');
    assert.equal('content' in listed, false);
    assert.equal(repository.listRecentPublishedArticles(30).find(row => row.id === id).excerpt, listed.excerpt);
    const detail = await call(`/api/articles/${id}`);
    assert.equal(detail.body.data.excerpt, listed.excerpt);
    assert.equal(db.prepare('SELECT excerpt FROM articles WHERE id = ?').get(id).excerpt, '');
});
