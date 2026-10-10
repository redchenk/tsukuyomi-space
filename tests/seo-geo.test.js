const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-seo-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: temp, DB_PATH: path.join(temp, 'seo.db'), REDIS_URL: '', ADMIN_PASSWORD: 'local-fixture-only', INDEXNOW_ENABLED: 'true' });
const config = require('../backend/config');
config.projectRoot = temp;
config.enableFrontendDist = true;
fs.mkdirSync(path.join(temp, 'dist/frontend'), { recursive: true });
fs.writeFileSync(path.join(temp, 'dist/frontend/index.html'), fs.readFileSync(path.join(__dirname, '../src/frontend/index.html'), 'utf8').replace('/main.js', '/assets/app-fixture.js'));
const { createApp } = require('../backend/app');
const app = createApp();
const db = require('../backend/db');
const indexnow = require('../backend/services/indexnow');
let server, base, articleId;
before(async () => {
    articleId = db.prepare("INSERT INTO articles(title,slug,content,excerpt,publish_date,status) VALUES (?,? ,?,'','2026-09-30','published')")
        .run('SEO <script> harmless title', 'seo-test', 'An actual public article about rendering. '.repeat(5)).lastInsertRowid;
    db.prepare("INSERT INTO articles(title,slug,content,publish_date,status) VALUES ('PRIVATE DRAFT','draft','PRIVATE BODY','2026-09-30','draft')").run();
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
test('all visitors get the same readable public document, one canonical and the interactive app', async () => {
    for (const route of ['/', '/hub', '/stage', '/plaza', '/room', '/reality', '/download', '/wiki', '/wiki/characters/yachiyo', '/pixel', '/gallery', '/game', '/friend-links', `/articles/${articleId}/seo-test`]) {
        let baseline;
        for (const ua of ['Mozilla/5.0', 'bingbot', 'OAI-SearchBot', 'ChatGPT-User']) {
            const response = await fetch(base + route, { headers: { 'User-Agent': ua } });
            const html = await response.text();
            assert.equal(response.status, 200, route);
            assert.match(html, /<h1[ >]/, route);
            assert.match(html, /data-seo-fallback/, route);
            assert.match(html, /app-fixture\.js/, route);
            assert.equal((html.match(/rel="canonical"/g) || []).length, 1, route);
            assert.equal((html.match(/type="application\/rss\+xml"/g) || []).length, 1, route);
            assert.match(html, /type="application\/rss\+xml"[^>]*href="https:\/\/yachiyo\.hk\/rss\.xml"/, route);
            assert.doesNotMatch(html, /PRIVATE BODY|PRIVATE DRAFT/);
            for (const schema of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(schema[1]));
            if (baseline) assert.equal(html, baseline, `${route} content must not depend on UA`);
            baseline = html;
        }
    }
});
test('native app downloads are public, usable without JavaScript and go directly to official GitHub assets', async () => {
    const snapshot = require('../shared/native-app-release.json');
    const html = await (await fetch(base + '/download')).text();
    const downloads = [...html.matchAll(/href="(https:\/\/github\.com\/redchenk\/tsukuyomi-space-app\/releases\/download\/[^\"]+)"/g)].map(match => match[1]);
    for (const suffix of ['windows-x64-setup.exe', 'macos-universal.dmg', 'android-arm64-v8a.apk', 'linux-x64.deb', 'ios-arm64-unsigned.ipa', 'SHA256SUMS.txt']) {
        const asset = snapshot.assets.find(asset => asset.name.endsWith(suffix));
        assert.ok(downloads.includes(asset.browser_download_url), suffix);
    }
    assert.match(html, /未签名|自行签名|需自签/);
    assert.doesNotMatch(html, /href="[^\"]*\/(?:api|cdn)\/(?:download|installer)/);
    assert.match(await (await fetch(base + '/sitemap.xml')).text(), /<loc>https:\/\/yachiyo.hk\/download<\/loc>/);
});
test('private pages stay noindex and missing public detail pages return 404', async () => {
    for (const route of ['/user-center', '/terminal', '/room/settings', '/attachments', '/login', '/gallery/manage']) {
        const response = await fetch(base + route);
        assert.match(response.headers.get('x-robots-tag'), /noindex/, route);
        assert.match(await response.text(), /name="robots" content="noindex,follow"/);
    }
    for (const route of ['/article', '/wiki/characters/not-real', '/wiki/terms/not-real', '/pixel?art=9999999', '/articles/9999999/absent', '/unknown-page']) assert.equal((await fetch(base + route)).status, 404, route);
});
test('stage pagination exposes older articles with page-specific canonical and filters do not index', async () => {
    const html = await (await fetch(base + '/stage?page=2&from=tracking')).text();
    assert.match(html, /canonical" href="https:\/\/yachiyo.hk\/stage\?page=2"/);
    const response = await fetch(base + '/stage?q=public');
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
});
test('topic landings retain their existing standalone view and public authors expose no private fields', async () => {
    const topic = await (await fetch(base + '/topics/chou-kaguya-hime')).text();
    assert.match(topic, /<h1/);
    assert.doesNotMatch(topic, /app-fixture\.js/);
    const username = '创作者';
    db.prepare("INSERT INTO users(id,username,nickname,email,password_hash,bio) VALUES ('seo-author',?, '公开昵称','private-seo@example.test','never-output-hash','公开简介')").run(username);
    const response = await fetch(base + '/users/' + encodeURIComponent(username));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /公开昵称/);
    assert.match(html, /公开简介/);
    assert.doesNotMatch(html, /private-seo@example|never-output-hash/);
    assert.equal((await fetch(base + '/users/nonexistent-seo-author')).status, 404);
});
test('sitemaps contain only public metadata and never invent daily static modifications', async () => {
    const html = await (await fetch(base + '/sitemap.xml')).text();
    assert.doesNotMatch(html, /draft|PRIVATE/);
    const home = html.match(/<url>\s*<loc>https:\/\/yachiyo.hk\/<\/loc>([\s\S]*?)<\/url>/)[1];
    assert.doesNotMatch(home, /lastmod/);
    const images = await (await fetch(base + '/sitemap-images.xml')).text();
    assert.doesNotMatch(images, /image:title|image:caption/);
});
test('IndexNow verifies ownership without exposing keys in HTML, and forbids arbitrary or private URLs', async () => {
    const key = indexnow.verificationKey();
    const response = await fetch(base + `/indexnow-${key}.txt`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), key);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    for (const route of ['/room/settings', '//attacker.test/', '/api/room/memory', '/articles/1/x?token=secret', '/pixel?art=1&private=yes']) assert.throws(() => indexnow.urlFor('yachiyo.hk', route));
    assert.throws(() => indexnow.urlFor('attacker.test', '/stage'));
    assert.equal(indexnow.urlFor('tsukuyomi-space.com', '/articles/247/中文标题'), 'https://tsukuyomi-space.com/articles/247');
});
test('IndexNow queues only committed publications, coalesces changes, retries and survives lost responses', async () => {
    db.prepare('DELETE FROM seo_indexnow_outbox').run();
    assert.throws(() => db.transaction(() => { db.prepare("UPDATE articles SET title='ROLLED BACK' WHERE id=?").run(articleId); throw new Error('rollback'); })());
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seo_indexnow_outbox').get().n, 0);
    db.prepare("UPDATE articles SET title='changed' WHERE id=?").run(articleId);
    db.prepare("UPDATE articles SET title='changed again' WHERE id=?").run(articleId);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seo_indexnow_outbox WHERE path LIKE ?').get(`/articles/${articleId}/%`).n, 2);
    db.prepare('UPDATE seo_indexnow_outbox SET available_at=0').run();
    let submissions = [];
    await indexnow.drain({ now: Date.now(), transport: async (url, opts) => { submissions.push(JSON.parse(opts.body)); throw new Error('response lost'); } });
    assert.equal(submissions.length, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM seo_indexnow_outbox WHERE status='pending' AND attempts=1").get().n, 6);
    db.prepare('UPDATE seo_indexnow_outbox SET available_at=0').run();
    await indexnow.drain({ transport: async () => new Response('', { status: 202 }) });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM seo_indexnow_outbox WHERE status='done' AND attempts=2").get().n, 6);
    db.prepare("UPDATE articles SET title='new revision' WHERE id=?").run(articleId);
    db.prepare('UPDATE seo_indexnow_outbox SET available_at=0').run();
    await indexnow.drain({ transport: async () => { db.prepare("UPDATE articles SET title=title||'x' WHERE id=?").run(articleId); return new Response('', { status: 200 }); } });
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM seo_indexnow_outbox WHERE status='pending'").get().n > 0, 'new edits must not be acknowledged by old requests');
    db.prepare("UPDATE seo_indexnow_outbox SET status='running',available_at=0").run();
    await indexnow.drain({ transport: async () => new Response('', { status: 403 }) });
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM seo_indexnow_outbox WHERE status='failed'").get().n > 0);
});
