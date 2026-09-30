const assert = require('node:assert/strict');
const { test, before, beforeEach, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-memory-import-test-'));
Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'site.db'),
    JWT_SECRET: 'memory-import-test-secret-more-than-32-characters',
    ADMIN_PASSWORD: 'memory-import-admin-test-password', ROOM_WEATHER_OFFLINE: 'true',
    ROOM_MEMORY_BACKEND: 'sqlite', REDIS_URL: '', REQUEST_BODY_LIMIT: '200mb'
});
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const memory = require('../backend/services/room-memory');
const events = require('../backend/services/room-memory-events');
const mem0 = require('../backend/services/room-mem0');
let server, base;
const cookies = new Map();

function record(overrides = {}) {
    return {
        id: 'guest-one', type: 'profile', summary: '访客记忆',
        content: '第一段保留  空格。\r\n\r\n第二段：月亮 🌙\n尾行',
        importance: 0, confidence: 0, tags: ['月亮', '原始格式'],
        createdAt: '2025-02-03T04:05:06.789Z', updatedAt: '2025-03-04T05:06:07.890Z',
        ...overrides
    };
}

function payload(records, userId = 'import-one') { return { expectedUserId: userId, records }; }

async function request(route, { method = 'GET', body, raw, userId = 'import-one' } = {}) {
    const response = await fetch(base + '/api/room' + route, {
        method, headers: {
            Cookie: cookies.get(userId) || '', 'Content-Type': 'application/json',
            Origin: base, 'X-Requested-With': 'XMLHttpRequest'
        }, ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, result: await response.json() };
}

function rows(userId = 'import-one') {
    return db.prepare('SELECT * FROM room_memories WHERE user_id = ? ORDER BY rowid').all(userId);
}

before(async () => {
    const app = createApp();
    for (const user of ['import-one', 'import-two']) {
        db.prepare('INSERT INTO users (id,username,email,password_hash,role) VALUES (?,?,?,?,?)')
            .run(user, user, user + '@example.test', bcrypt.hashSync('import-test-password', 4), 'user');
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const user of ['import-one', 'import-two']) {
        const response = await fetch(base + '/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ username: user, password: 'import-test-password' })
        });
        assert.equal(response.status, 200);
        cookies.set(user, response.headers.getSetCookie().find(value => value.startsWith('tsukuyomi_session=')).split(';')[0]);
    }
});

beforeEach(() => {
    db.prepare('DELETE FROM room_memories').run();
    db.prepare('DELETE FROM room_chat_messages').run();
    db.prepare('DELETE FROM room_memory_vector_deletions').run();
});

after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

test('authenticated import binds the entire batch to the expected current account', async () => {
    const body = payload([record({ userId: 'import-two', user_id: 'import-two', metadata: { sourceKind: 'chat-turn-auto' } })]);
    assert.equal((await request('/memory/import', { method: 'POST', body, userId: '' })).status, 401);
    assert.equal((await request('/memory/import', { method: 'POST', body: payload(body.records, 'import-two') })).status, 409);
    assert.equal((await request('/memory/import', { method: 'POST', body: { records: body.records } })).status, 400);
    assert.equal(rows().length, 0);
    const response = await request('/memory/import', { method: 'POST', body });
    assert.equal(response.status, 201);
    assert.deepEqual(response.result.data, { imported: 1, skipped: 0, count: 1 });
    assert.equal(rows('import-two').length, 0);
    assert.notEqual(rows()[0].id, record().id);
    assert.equal(JSON.parse(rows()[0].metadata).sourceKind, undefined);
    const other = await request('/memory/import', { method: 'POST', body: payload(body.records, 'import-two'), userId: 'import-two' });
    assert.equal(other.status, 201);
    assert.notEqual(rows()[0].id, rows('import-two')[0].id);
    assert.equal((await request('/memory/' + rows()[0].id, { userId: 'import-two' })).status, 404);
});

test('import preserves full paragraph text, zero scores and safe original timestamps', async () => {
    const source = record();
    const result = memory.importMemories('import-one', payload([source]));
    const saved = memory.getMemory('import-one', result.memoryIds[0]);
    assert.equal(saved.content, source.content);
    assert.equal(saved.summary, source.summary);
    assert.equal(saved.importance, 0);
    assert.equal(saved.confidence, 0);
    assert.deepEqual(saved.tags, source.tags);
    assert.equal(saved.createdAt, source.createdAt);
    assert.equal(saved.updatedAt, source.updatedAt);
    assert.equal(saved.metadata.source, 'manual-import');
    assert.equal(saved.metadata.embeddingProvider, 'local');
    assert.equal(rows()[0].vector_synced_at, null);
    assert.equal(memory.invalidateAutoTurnMemories('import-one', source.id).length, 0);
    const list = await request('/memory?view=manage');
    assert.equal(list.result.data.total, 1);
    const retrieved = await memory.retrieveChatMemories('import-one', '月亮', 6, { sourceOnly: true });
    assert.equal(retrieved.memories[0].id, saved.id);
});

test('all records validate before any memory or import receipt is written or event is published', async () => {
    memory.importMemories('import-one', payload([record()]));
    const before = rows();
    const originalPublish = events.publish;
    let published = 0;
    events.publish = () => { published += 1; };
    try {
        const invalid = [
            { importance: '0.5' }, { confidence: null }, { importance: true }, { confidence: -0.1 },
            { importance: 1.01 }, { type: 'unknown' }, { summary: '  \n' }, { content: '' },
            { tags: 'profile' }, { tags: [''] }, { createdAt: 'yesterday' },
            { createdAt: '2025-02-30T00:00:00Z' }, { updatedAt: '2024-01-01T00:00:00Z' }
        ];
        for (const change of invalid) {
            const result = await request('/memory/import', { method: 'POST', body: payload([
                record({ id: 'would-have-written-receipt' }), record({ id: 'invalid', content: '新增记忆', ...change })
            ]) });
            assert.equal(result.status, 400, JSON.stringify(change));
            assert.deepEqual(rows(), before);
        }
        const overflow = JSON.stringify(payload([record({ id: 'overflow', content: '非有限数值' })])).replace('"importance":0', '"importance":1e999');
        assert.equal((await request('/memory/import', { method: 'POST', raw: overflow })).status, 400);
        assert.throws(() => memory.importMemories('import-one', payload([record({ importance: NaN })])), { statusCode: 400 });
        assert.throws(() => memory.importMemories('import-one', payload([record({ confidence: Infinity })])), { statusCode: 400 });
        assert.equal(published, 0);
    } finally { events.publish = originalPublish; }
});

test('conflicting guest IDs reject the whole batch and database failures roll back dedup receipts', () => {
    assert.throws(() => memory.importMemories('import-one', payload([
        record(), record({ content: '相同标识的冲突内容' })
    ])), { statusCode: 400 });
    assert.equal(rows().length, 0);
    memory.importMemories('import-one', payload([record()]));
    const before = rows();
    db.exec(`CREATE TEMP TRIGGER reject_memory_import BEFORE INSERT ON room_memories
        WHEN NEW.summary = 'abort' BEGIN SELECT RAISE(ABORT, 'test rollback'); END`);
    try {
        assert.throws(() => memory.importMemories('import-one', payload([
            record({ id: 'dedup-receipt' }), record({ id: 'abort', summary: 'abort', content: '新的不同内容' })
        ])), /test rollback/);
        assert.deepEqual(rows(), before);
    } finally { db.exec('DROP TRIGGER reject_memory_import'); }
});

test('bounded import accepts 200 records and rejects count, text and raw JSON oversize without partial writes', async () => {
    const records = Array.from({ length: 200 }, (_, index) => record({ id: 'limit-' + index, content: '完整导入记录 ' + index }));
    assert.equal((await request('/memory/import', { method: 'POST', body: payload([...records, record({ id: '201' })]) })).status, 413);
    assert.equal(rows().length, 0);
    assert.equal((await request('/memory/import', { method: 'POST', body: payload([record({ summary: '摘'.repeat(801) })]) })).status, 413);
    assert.equal((await request('/memory/import', { method: 'POST', body: payload([record({ content: '文'.repeat(memory.memoryStats('import-one').maxContentLength + 1) })]) })).status, 413);
    const large = JSON.stringify(payload([record()])) + ' '.repeat(1024 * 1024);
    assert.equal((await request('/memory/import', { method: 'POST', raw: large })).status, 413);
    assert.equal((await request('/memory/import', { method: 'POST', raw: '{"expectedUserId":"import-one","records":[],"records":[]}' })).status, 400);
    assert.equal(rows().length, 0);
    const accepted = await request('/memory/import', { method: 'POST', body: payload(records) });
    assert.equal(accepted.status, 201);
    assert.deepEqual(accepted.result.data, { imported: 200, skipped: 0, count: 200 });
    assert.throws(() => memory.importMemories('import-one', { ...payload([record()]), ignored: '🌙'.repeat(300000) }), { statusCode: 413 });
    assert.equal(rows().length, 200);
});

test('retry and exact content dedup preserve cloud edits and never blend similar memories', async () => {
    const source = record();
    const first = memory.importMemories('import-one', payload([source]));
    const id = first.memoryIds[0];
    await memory.updateMemory('import-one', id, { summary: '云端编辑', content: '云端专属段落\n\n保留', importance: 1, confidence: 0.25, tags: ['云端'] });
    const edited = memory.getMemory('import-one', id);
    const retry = await request('/memory/import', { method: 'POST', body: payload([source]) });
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.result.data, { imported: 0, skipped: 1, count: 1 });
    assert.deepEqual(memory.getMemory('import-one', id), edited);
    const duplicate = memory.importMemories('import-one', payload([record({ id: 'new-guest-id', content: edited.content, summary: '本地旧摘要' })]));
    assert.equal(duplicate.imported, 0);
    const cloudValues = ({ metadata, ...values }) => values;
    assert.deepEqual(cloudValues(memory.getMemory('import-one', id)), cloudValues(edited));
    await memory.updateMemory('import-one', id, { content: '又一次云端编辑' });
    assert.equal(memory.importMemories('import-one', payload([record({ id: 'new-guest-id', content: edited.content, summary: '本地旧摘要' })])).imported, 0);
    assert.equal(memory.importMemories('import-one', payload([
        record({ id: 'different-type', type: 'semantic', content: '又一次云端编辑' }),
        record({ id: 'different-whitespace', content: '又一次云端编辑 ' })
    ])).imported, 2);
});

test('explicit import protects an exact automatic-memory duplicate from source regeneration', () => {
    const [id] = memory.captureChatTurn('import-one', {
        turnId: 'auto-imported-turn', userMessage: '我叫白桃', assistantMessage: '白桃，晚上好。', memoryEnabled: true
    });
    const before = memory.getMemory('import-one', id);
    assert.equal(before.metadata.sourceKind, 'chat-turn-auto');
    const result = memory.importMemories('import-one', payload([record({
        id: 'guest-same-fact', type: before.type, content: before.content, summary: '访客自己写的摘要'
    })]));
    assert.equal(result.imported, 0);
    const after = memory.getMemory('import-one', id);
    for (const field of ['type', 'summary', 'content', 'importance', 'confidence', 'createdAt', 'updatedAt']) {
        assert.deepEqual(after[field], before[field]);
    }
    assert.equal(after.metadata.source, 'manual-import');
    assert.equal(after.metadata.sourceKind, undefined);
    assert.deepEqual(memory.invalidateAutoTurnMemories('import-one', 'auto-imported-turn'), []);
    assert.equal(rows().length, 1);
});

test('surviving batch receipts prevent deleted entries from reappearing on reordered retry', async () => {
    const records = [record(), record({ id: 'guest-two', content: '第二条独立记忆' })];
    const first = memory.importMemories('import-one', payload(records));
    await memory.deleteMemory('import-one', first.memoryIds[0]);
    await memory.updateMemory('import-one', first.memoryIds[1], { summary: '留下的云端编辑', content: '编辑之后的第二条' });
    const survivor = memory.getMemory('import-one', first.memoryIds[1]);
    const retry = memory.importMemories('import-one', payload([...records].reverse()));
    assert.deepEqual({ ...retry, memoryIds: [] }, { imported: 0, skipped: 2, count: 1, memoryIds: [] });
    assert.equal(memory.getMemory('import-one', first.memoryIds[0]), null);
    assert.deepEqual(memory.getMemory('import-one', first.memoryIds[1]), survivor);
});

test('optional index reconciliation cannot hold up or roll back an authoritative import', async () => {
    await new Promise(resolve => setImmediate(resolve));
    const original = mem0.reconcile;
    let invoked = 0;
    mem0.reconcile = () => { invoked += 1; return new Promise(() => {}); };
    try {
        const result = await request('/memory/import', { method: 'POST', body: payload([record()]) });
        assert.equal(result.status, 201);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(invoked, 1);
        assert.equal(rows().length, 1);
        assert.equal(memory.getMemory('import-one', rows()[0].id).content, record().content);
    } finally { mem0.reconcile = original; }
});

test('score edits keep omitted prior values, accept zero and reject supplied invalid numbers', async () => {
    const id = memory.importMemories('import-one', payload([record({ importance: 0.73, confidence: 0.91 })])).memoryIds[0];
    await memory.updateMemory('import-one', id, { summary: '只改摘要' });
    assert.equal(memory.getMemory('import-one', id).importance, 0.73);
    assert.equal(memory.getMemory('import-one', id).confidence, 0.91);
    for (const value of [null, '0.5', false, -0.1, 1.1]) {
        const response = await request('/memory/' + id, { method: 'PUT', body: { importance: value } });
        assert.equal(response.status, 400);
        assert.equal(memory.getMemory('import-one', id).importance, 0.73);
    }
    assert.equal((await request('/memory/' + id, { method: 'PUT', body: { importance: 0, confidence: 0 } })).status, 200);
    assert.equal(memory.getMemory('import-one', id).importance, 0);
    assert.equal(memory.getMemory('import-one', id).confidence, 0);
});

test('cloud clear checks the expected account before deletion and only clears the authenticated account', async () => {
    memory.importMemories('import-one', payload([record()]));
    memory.importMemories('import-two', payload([record({ id: 'other-account' })], 'import-two'));
    const beforeCurrent = rows();
    const beforeOther = rows('import-two');
    const mismatch = await request('/memory?expectedUserId=import-two', { method: 'DELETE' });
    assert.equal(mismatch.status, 409);
    assert.deepEqual(rows(), beforeCurrent);
    assert.deepEqual(rows('import-two'), beforeOther);
    const matched = await request('/memory?expectedUserId=import-one', { method: 'DELETE' });
    assert.equal(matched.status, 200);
    assert.equal(matched.result.data.count, 1);
    assert.deepEqual(rows(), []);
    assert.deepEqual(rows('import-two'), beforeOther);
    // Existing clients remain compatible when they omit the optional guard.
    assert.equal((await request('/memory', { method: 'DELETE', userId: 'import-two' })).status, 200);
    assert.deepEqual(rows('import-two'), []);
});

test('explicit local source syncs chat text without creating or retiring cloud memories', async () => {
    const first = { turnId: 'source-choice', userMessage: '我叫白桃', assistantMessage: '白桃，晚上好。', memoryEnabled: true };
    assert.equal((await request('/chat/turn', { method: 'POST', body: first })).status, 201);
    const cloud = rows();
    assert.equal(cloud.length, 1);
    const replacement = {
        expectedUserMessage: first.userMessage, expectedAssistantMessage: first.assistantMessage,
        userMessage: '我叫青梅', assistantMessage: '青梅，晚上好。', memoryEnabled: true, memorySource: 'local'
    };
    assert.equal((await request('/chat/turn/' + first.turnId, { method: 'PUT', body: replacement })).status, 200);
    assert.deepEqual(rows(), cloud);
    const chat = await request('/chat');
    assert.equal(chat.result.data[0].content, replacement.userMessage);
    const newLocal = { ...first, turnId: 'local-only-turn', userMessage: '我叫雪糕', memorySource: 'local' };
    assert.equal((await request('/chat/turn', { method: 'POST', body: newLocal })).status, 201);
    assert.deepEqual(rows(), cloud);
    // Plain disabled memory still retires the old generated source on replace.
    const plainCloud = { ...first, turnId: 'plain-cloud-turn', userMessage: '我叫星河' };
    assert.equal((await request('/chat/turn', { method: 'POST', body: plainCloud })).status, 201);
    assert.equal(rows().length, 2);
    assert.equal((await request('/chat/turn/' + plainCloud.turnId, { method: 'PUT', body: {
        expectedUserMessage: plainCloud.userMessage, expectedAssistantMessage: plainCloud.assistantMessage,
        userMessage: '我叫星河', assistantMessage: '星河，晚上好。', memoryEnabled: false
    } })).status, 200);
    assert.deepEqual(rows(), cloud);
});
