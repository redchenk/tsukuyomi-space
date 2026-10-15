const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { articleDocument, articleRevision, articleSections, chunkSections, staticDocuments } = require('../backend/services/site-knowledge-corpus');
const { createKnowledgeSearch } = require('../backend/services/site-knowledge');
const { createIndexer } = require('../backend/workers/site-knowledge-indexer');

function fixture() {
    const db = new Database(':memory:');
    db.exec("CREATE TABLE articles(id INTEGER PRIMARY KEY,title TEXT,slug TEXT,content TEXT,content_format TEXT,updated_at TEXT,status TEXT)");
    db.prepare('INSERT INTO articles VALUES(?,?,?,?,?,?,?)').run(1, '设置语音', 'voice', '启动语音服务后填写地址。', 'markdown', '2026-10-15', 'published');
    const row = db.prepare('SELECT * FROM articles WHERE id=1').get();
    const hit = { id: 'article:1:0', document_id: 'article:1', revision: articleRevision(row), title: row.title, url: '/articles/1/voice', kind: 'article', text: row.content, spoiler: 0 };
    return { db, row, hit };
}

test('extracts deep article sections, preserves configuration text and drops hidden HTML', () => {
    const row = { id: 5, title: '配置', slug: 'hello world', content_format: 'markdown', content: '# 概览\n' + '公开段落。'.repeat(300) + '\n## 远程连接\n```sh\nAPI_URL=http://localhost:9880\n```\n龙舟仪式在最后一个段落。<script>恶意脚本</script><span hidden>隐藏秘密</span>' };
    const doc = articleDocument(row);
    assert.equal(doc.url, '/articles/5/hello%20world');
    assert.ok(doc.chunks.some(c => c.section === '远程连接' && c.text.includes('龙舟仪式')));
    assert.ok(doc.chunks.some(c => c.text.includes('API_URL=http://localhost:9880')));
    assert.ok(doc.chunks.every(c => Array.from(c.text).length <= 240 && !/恶意脚本|隐藏秘密/.test(c.text)));
    assert.equal(articleSections({ content_format: 'block', content: '{bad' }).length, 0);
    assert.ok(articleSections({ content_format: 'html', content: '<h2>步骤</h2><p>打开面板</p>' }).some(s => s.title === '步骤' && s.text.includes('打开面板')));
});

test('does not index an incomplete oversized source and preserves Unicode chunk boundaries', () => {
    const chunks = chunkSections([{ title: '表情', text: '🌙夜晚'.repeat(400) }]);
    assert.ok(chunks.length > 1 && chunks.every(c => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(c.text)));
    assert.deepEqual(articleSections({ content: 'x'.repeat(2_000_001) }), []);
    assert.equal(chunkSections([{ text: 'a'.repeat(500_000) }]).length, 0);
});

test('public source cache immediately excludes drafts, deletions and same-timestamp edits', async () => {
    const { db, hit } = fixture(); let calls = 0;
    const service = createKnowledgeSearch({ db, enabled: () => true, request: async () => { calls++; return { matches: [hit], mode: 'hybrid' }; } });
    assert.equal((await service.search('设置语音')).sources.length, 1);
    db.prepare("UPDATE articles SET status='draft' WHERE id=1").run();
    assert.equal((await service.search('设置语音')).sources.length, 0);
    db.prepare("UPDATE articles SET status='published',content='已经修改' WHERE id=1").run();
    assert.equal((await service.search('设置语音')).sources.length, 0);
    db.prepare('DELETE FROM articles WHERE id=1').run();
    assert.equal((await service.search('设置语音')).sources.length, 0);
    assert.equal(calls, 1); db.close();
});

test('never returns private-owner IDs, invalid links, stale static revisions or forbidden spoilers', async () => {
    const { db, hit } = fixture();
    const service = createKnowledgeSearch({ db, enabled: () => true, request: async () => ({ mode: 'hybrid', matches: [
        { ...hit, document_id: 'user:alice', revision: hit.revision }, { ...hit, url: '//evil.test' },
        { ...hit, document_id: 'wiki:character/kaguya', revision: 'f'.repeat(64) }, { ...hit, spoiler: 1 }
    ] }) });
    assert.deepEqual((await service.search('如何设置')).sources, []);
    assert.equal((await service.search('允许剧透', { allowSpoilers: true })).sources.length, 1); db.close();
});

test('limits outstanding retrievals and does not cache transient failures', async () => {
    const { db } = fixture(); let resolve;
    const pending = new Promise(r => { resolve = r; });
    const service = createKnowledgeSearch({ db, enabled: () => true, request: () => pending });
    const a = service.search('问题一'), b = service.search('问题二');
    assert.equal((await service.search('问题三')).mode, 'busy');
    resolve({ mode: 'keyword', matches: [] }); await Promise.all([a, b]);
    let calls = 0;
    const failure = createKnowledgeSearch({ db, enabled: () => true, request: async () => { calls++; throw Error('private details'); } });
    assert.deepEqual(await failure.search('语音'), { sources: [], mode: 'unavailable' });
    await failure.search('语音'); assert.equal(calls, 2); db.close();
});

test('indexer pages integer article IDs, resumes partial documents and removes unpublished sources', async () => {
    process.env.SITE_KNOWLEDGE_ENABLED = 'true';
    const { db } = fixture(); const documents = new Map([['article:99', { id: 'article:99', revision: 'f'.repeat(64), ready: 1 }]]);
    let now = 1000, puts = 0;
    const request = async (route, body) => {
        if (route === '/knowledge/catalog') return { documents: [...documents.values()] };
        if (route === '/knowledge/put') { puts++; documents.set(body.document.id, { ...body.document, ready: 1 }); return { saved: body.chunks.length }; }
        if (route === '/knowledge/delete') { body.ids.forEach(id => documents.delete(id)); return { deleted: body.ids.length }; }
        return { pending: false };
    };
    const worker = createIndexer({ db, request, now: () => now, loadStatic: () => [] });
    for (let i = 0; i < 8; i++) await worker.tick();
    assert.ok(documents.has('article:1')); assert.ok(!documents.has('article:99')); assert.equal(puts, 1);
    db.prepare("UPDATE articles SET status='draft' WHERE id=1").run(); now += 61_000;
    for (let i = 0; i < 5; i++) await worker.tick();
    assert.equal(documents.size, 0); db.close();
});

test('static corpus contains real guides, full Wiki sections and explicit spoiler boundaries', () => {
    const docs = staticDocuments();
    assert.equal(docs.filter(d => d.kind === 'wiki').length, 19);
    assert.ok(docs.some(d => d.id === 'guide:memory' && d.chunks.some(c => c.text.includes('合并'))));
    const yachiyo = docs.find(d => d.id === 'wiki:character/yachiyo');
    assert.ok(yachiyo.chunks.some(c => c.spoiler));
    assert.ok(yachiyo.chunks.some(c => !c.spoiler));
    assert.ok(docs.every(d => d.url.startsWith('/') && d.revision.length === 64 && d.chunks.length));
});


test('overlong encoded article slugs retain a usable ID-only citation', () => {
    const doc = articleDocument({ id: 303, title: '正文', slug: '很长的中文地址'.repeat(60), content: '有用资料。' });
    assert.equal(doc.url, '/articles/303');
});

test('HTTP route validates questions and returns no-store public references', async () => {
    const express = require('express'), service = require('../backend/services/site-knowledge');
    const original = service.search; let seen;
    service.search = async (query, options) => { seen = { query, options }; return { sources: [], mode: 'disabled' }; };
    const app = express(); app.use(express.json({ limit: '4kb' })); app.use('/api/knowledge', require('../backend/routes/site-knowledge'));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/knowledge/search`;
    try {
        for (const query of [null, '', 'x'.repeat(401), {}]) {
            assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).status, 400);
        }
        const result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '怎么配置语音', allowSpoilers: 'true', scope: 'guide' }) });
        assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'private, no-store');
        assert.equal((await result.json()).data.mode, 'disabled'); assert.equal(seen.options.allowSpoilers, false);
        assert.equal((await fetch(url + '?query=语音')).status, 404);
    } finally { service.search = original; await new Promise(resolve => server.close(resolve)); }
});
