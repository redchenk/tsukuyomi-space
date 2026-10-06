const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-mem0-test-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'site.db'),
    JWT_SECRET: 'mem0-test-secret-more-than-32-characters', ADMIN_PASSWORD: 'mem0-admin-test-password',
    ROOM_WEATHER_OFFLINE: 'true', ROOM_MEMORY_BACKEND: 'mem0', REDIS_URL: '' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const memory = require('../backend/services/room-memory');
const chat = require('../backend/repositories/room-chat-repository');
const { memoryExcerpt } = require('../shared/room-memory-retrieval.cjs');
let server, base, cookie;
async function request(route, method = 'GET', body) {
    const response = await fetch(base + '/api/room' + route, { method, headers: {
        Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Origin: base
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    assert.ok(response.ok, `${method} ${route}: ${response.status} ${result.message}`);
    return result;
}
before(async () => {
    const app = createApp();
    for (const user of ['mem0-one', 'mem0-two']) db.prepare('INSERT INTO users (id,username,email,password_hash,role) VALUES (?,?,?,?,?)')
        .run(user, user, user + '@example.test', bcrypt.hashSync('mem0-test-password', 4), 'user');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ username: 'mem0-one', password: 'mem0-test-password' }) });
    assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().find(value => value.startsWith('tsukuyomi_session=')).split(';')[0];
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('target/recent turn isolation and owned snapshot validation apply before source fallback', async () => {
    const ids = [];
    for (const turnId of ['scope-old', 'scope-recent', 'scope-target']) ids.push(...memory.captureChatTurn('mem0-one', {
        turnId, userMessage: '边界试验观测站在周六开放。', assistantMessage: '这是已结束的旧回复。'
    }));
    const options = { sourceOnly: true, excludeTurnIds: ['scope-recent', 'scope-target'] };
    const result = await memory.retrieveChatMemories('mem0-one', '边界试验观测站', 12, options);
    assert.ok(result.memories.some(row => row.id === ids[0]));
    assert.ok(result.memories.every(row => !ids.slice(1).includes(row.id)));
    const semantic = await memory.retrieveChatMemories('mem0-one', '边界试验观测站', 1,
        { excludeTurnIds: options.excludeTurnIds });
    assert.equal(semantic.retrieval.backend, 'mem0');
    assert.deepEqual(semantic.memories.map(row => row.id), [ids[0]], 'filter indexed target/recent sources before applying the limit');
    const params = new URLSearchParams({ purpose: 'chat', q: '边界试验观测站', retrieval: 'source',
        excludeTurnIds: JSON.stringify(options.excludeTurnIds), memoryIds: JSON.stringify(ids) });
    const api = await request('/memory?' + params);
    assert.deepEqual(api.data.map(row => row.id), [ids[0]]);
    assert.equal(api.retrieval.selection, 'snapshot');
    assert.deepEqual((await memory.retrieveChatMemories('mem0-two', '边界试验观测站', 6, { snapshotIds: ids })).memories, []);
    assert.deepEqual((await memory.retrieveChatMemories('mem0-one', '边界试验观测站', 6, { snapshotIds: [] })).memories, []);
    const original = api.data[0];
    await memory.updateMemory('mem0-one', ids[0], { content: '边界试验观测站改为周日。', summary: '新安排' });
    const edited = await memory.retrieveChatMemories('mem0-one', '边界试验观测站', 6, { snapshotIds: [ids[0]], excludeTurnIds: ['scope-old'] });
    assert.match(edited.memories[0].context, /周日/);
    assert.notEqual(edited.memories[0].retrievalRevision, original.retrievalRevision);
    db.prepare('DELETE FROM room_memories WHERE user_id=? AND id=?').run('mem0-one', ids[0]);
    assert.deepEqual((await memory.retrieveChatMemories('mem0-one', '边界试验观测站', 6, { snapshotIds: [ids[0]] })).memories, []);
    db.prepare('DELETE FROM room_memories WHERE user_id=? AND id IN (?,?)').run('mem0-one', ids[1], ids[2]);
});

test('invalid retrieval scopes are rejected with HTTP 400 without broadening access', async () => {
    for (const bad of ['not-json', 'null', JSON.stringify(Array(41).fill('turn')), JSON.stringify(['x'.repeat(161)])]) {
        const response = await fetch(base + '/api/room/memory?purpose=chat&q=test&excludeTurnIds=' + encodeURIComponent(bad),
            { headers: { Cookie: cookie } });
        assert.equal(response.status, 400);
    }
});

test('chat transaction preserves short facts; real Mem0 survives restart, pruning and new conversations', async () => {
    const first = { memoryEnabled: true, turnId: 'mem0-cat', userMessage: '我的猫叫雪糕', assistantMessage: '雪糕，好可爱的名字。' };
    await request('/chat/turn', 'POST', first);
    await request('/chat/turn', 'POST', first);
    assert.equal(memory.memoryStats('mem0-one').count, 1, 'idempotent save must not duplicate memories');
    // More than the old 800-row search window and 100-message history limit.
    const fill = db.transaction(() => {
        for (let i = 0; i < 805; i++) {
            const turn = { turnId: 'filler-' + i, userMessage: `散步记录第 ${i} 次`, assistantMessage: '今晚月色不错。' };
            chat.saveTurn('mem0-one', turn, () => memory.captureChatTurn('mem0-one', turn));
        }
    });
    fill();
    assert.equal(chat.listMessages('mem0-one', 100).some(row => row.content.includes('雪糕')), false);
    await request('/chat', 'DELETE');
    const query = '/memory?purpose=chat&q=' + encodeURIComponent('我的猫叫什么名字');
    let result;
    // Production bounds each catch-up pass to four seconds. A cold, slower CI
    // disk may need several passes for 806 records; each pass keeps its writes.
    // Still require the real Mem0 path, and verify the fact survives even while
    // the authoritative-source fallback serves the unfinished index.
    for (let attempt = 0; attempt < 8; attempt++) {
        result = await request(query);
        assert.match(result.data[0]?.context || '', /雪糕/);
        if (result.retrieval.backend === 'mem0') break;
    }
    assert.equal(result.retrieval.backend, 'mem0');
    assert.equal(result.retrieval.fallback, false);
    assert.match(result.data[0].context, /雪糕/);
    assert.equal((await memory.retrieveChatMemories('mem0-two', '我的猫叫什么名字')).memories.length, 0);
    const restarted = JSON.parse(execFileSync(process.execPath, ['-e', `
        const memory = require('./backend/services/room-memory');
        memory.retrieveChatMemories('mem0-one', '我的猫叫什么名字').then(r => process.stdout.write(JSON.stringify(r)));
    `], { cwd: path.resolve(__dirname, '..'), env: process.env, encoding: 'utf8' }));
    assert.equal(restarted.retrieval.backend, 'mem0');
    assert.match(restarted.memories[0].context, /雪糕/);
});

test('full-content excerpts reach the prompt beyond the old summary limit', async () => {
    const detail = '今天聊了一会儿日常。'.repeat(100) + '我的观星约定是周六晚上八点，在青岚天文台见。';
    await request('/chat/turn', 'POST', { memoryEnabled: true, turnId: 'mem0-detail', userMessage: detail, assistantMessage: '好，到时见。' });
    const result = await request('/memory?purpose=chat&q=' + encodeURIComponent('观星约定几点在哪里'));
    assert.match(result.data[0].context, /周六晚上八点.*青岚天文台/);
    const { packRoomContext } = await import('../src/frontend/services/room/roomContext.mjs');
    const prompt = packRoomContext({ knowledge: '角色资料'.repeat(900), memories: result.data.map(item => ({ id: item.id, content: item.context })) }, { maxChars: 4000 });
    assert.match(prompt.text, /青岚天文台/);
    assert.ok(prompt.trace.some(item => item.source === 'memories'));
    assert.ok(prompt.text.length <= 4000);
    assert.match(memoryExcerpt(detail, '观星约定几点在哪里'), /青岚天文台/);
});

test('disable, editing, replacement, deletion and clear are reflected in real Mem0 retrieval', async () => {
    const before = memory.memoryStats('mem0-one').count;
    await request('/chat/turn', 'POST', { turnId: 'memory-off', userMessage: '我的代号是霜月', assistantMessage: '收到。', memoryEnabled: false });
    assert.equal(memory.memoryStats('mem0-one').count, before);
    await request('/chat/turn', 'POST', { turnId: 'legacy-no-opt-in', userMessage: '旧页面没有发送记忆开关', assistantMessage: '收到。' });
    assert.equal(memory.memoryStats('mem0-one').count, before, 'legacy clients retain their own memory opt-in behavior');
    const turn = { memoryEnabled: true, turnId: 'mem0-replace', userMessage: '我叫白桃', assistantMessage: '白桃，晚上好。' };
    await request('/chat/turn', 'POST', turn);
    await request('/memory?purpose=chat&q=' + encodeURIComponent('我叫什么名字'));
    await request('/chat/turn/mem0-replace', 'PUT', { expectedUserMessage: turn.userMessage, expectedAssistantMessage: turn.assistantMessage,
        userMessage: '我叫青梅', assistantMessage: '青梅，晚上好。', memoryEnabled: true });
    let result = await request('/memory?purpose=chat&q=' + encodeURIComponent('我叫什么名字'));
    assert.equal(result.data.some(row => row.context.includes('白桃')), false);
    const item = result.data.find(row => row.context.includes('青梅'));
    assert.ok(item);
    await request('/memory/' + item.id, 'PUT', { content: '用户的名字是星河。', summary: '名字：星河', type: 'profile', importance: 0.8, confidence: 1, tags: [] });
    result = await request('/memory?purpose=chat&q=' + encodeURIComponent('我叫什么名字'));
    assert.equal(result.data.some(row => row.context.includes('青梅')), false);
    assert.ok(result.data.some(row => row.context.includes('星河')));
    await request('/memory/' + item.id, 'DELETE');
    result = await request('/memory?purpose=chat&q=' + encodeURIComponent('我叫什么名字'));
    assert.equal(result.data.some(row => /星河|青梅|白桃/.test(row.context)), false);
    await request('/memory', 'DELETE');
    result = await request('/memory?purpose=chat&q=' + encodeURIComponent('我的猫叫什么名字'));
    assert.deepEqual(result.data, []);
    assert.equal(result.retrieval.backend, 'mem0');
});

test('an unavailable Mem0 index falls back to owned full source without losing facts', async () => {
    const turn = { turnId: 'fallback-cat', userMessage: '我的猫叫棉花', assistantMessage: '记下啦。' };
    chat.saveTurn('mem0-two', turn, () => memory.captureChatTurn('mem0-two', turn));
    const result = JSON.parse(execFileSync(process.execPath, ['-e', `
        require('./backend/services/room-memory').retrieveChatMemories('mem0-two', '我的猫叫什么名字')
          .then(r => process.stdout.write(JSON.stringify(r)));
    `], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ROOM_MEM0_DB_PATH: '/dev/null/impossible.db' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(result.retrieval.fallback, true);
    assert.equal(result.retrieval.backend, 'sqlite');
    assert.match(result.memories[0].context, /棉花/);
});

test('a deletion during Mem0 search cannot inject stale indexed text', async () => {
    const turn = { turnId: 'racing-deletion', userMessage: '我的生日是十一月三日', assistantMessage: '记下了。' };
    chat.saveTurn('mem0-two', turn, () => memory.captureChatTurn('mem0-two', turn));
    const { Memory } = require('mem0ai/oss');
    const original = Memory.prototype.search;
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const searching = new Promise(resolve => { started = resolve; });
    Memory.prototype.search = async function (...args) {
        const result = await original.apply(this, args);
        started();
        await gate;
        return result;
    };
    try {
        const pending = memory.retrieveChatMemories('mem0-two', '我的生日是哪天');
        await searching;
        db.prepare('DELETE FROM room_memories WHERE user_id = ?').run('mem0-two');
        release();
        assert.deepEqual((await pending).memories, []);
    } finally { release(); Memory.prototype.search = original; }
});

test('source-only retry bypasses Mem0, uses full excerpts and enforces account ownership', async () => {
    const turn = { turnId: 'source-retry', userMessage: '日常记录。'.repeat(180) + '我的雨伞放在青岚天文台前台', assistantMessage: '记下啦。' };
    chat.saveTurn('mem0-one', turn, () => memory.captureChatTurn('mem0-one', turn));
    const { Memory } = require('mem0ai/oss');
    const original = Memory.prototype.search;
    Memory.prototype.search = async () => { throw new Error('source-only must not call the index'); };
    try {
        const result = await request('/memory?purpose=chat&retrieval=source&q=' + encodeURIComponent('雨伞放在哪里'));
        assert.equal(result.retrieval.backend, 'sqlite');
        assert.equal(result.retrieval.fallback, true);
        assert.match(result.data[0].context, /青岚天文台前台/);
        const other = await memory.retrieveChatMemories('mem0-two', '雨伞放在哪里', 6, { sourceOnly: true });
        assert.deepEqual(other.memories, []);
        const unmatched = await memory.retrieveChatMemories('mem0-one', 'unmatched-query', 6, { sourceOnly: true });
        assert.deepEqual(unmatched.memories, [], 'a broken index must not turn unrelated old dialogue into the current task');
    } finally { Memory.prototype.search = original; }
});

test('a stalled Mem0 search falls back within its deadline without queuing repeated work or reviving deleted facts', async (t) => {
    const { Memory } = require('mem0ai/oss');
    const original = Memory.prototype.search;
    let release, started, calls = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const searching = new Promise(resolve => { started = resolve; });
    Memory.prototype.search = async () => { calls++; started(); await gate; return { results: [] }; };
    try {
        t.mock.timers.enable(['setTimeout']);
        const pending = memory.retrieveChatMemories('mem0-one', '雨伞放在哪里');
        await searching;
        const busy = await memory.retrieveChatMemories('mem0-one', '雨伞放在哪里');
        assert.equal(busy.retrieval.reason, 'index_busy');
        assert.match(busy.memories[0].context, /青岚天文台前台/);
        db.prepare('DELETE FROM room_memories WHERE user_id = ?').run('mem0-one');
        t.mock.timers.tick(5000);
        const result = await pending;
        assert.equal(result.retrieval.reason, 'index_timeout');
        assert.deepEqual(result.memories, []);
        assert.equal(calls, 1);
    } finally {
        t.mock.timers.reset();
        release(); Memory.prototype.search = original;
        await new Promise(resolve => setTimeout(resolve, 30));
    }
});
