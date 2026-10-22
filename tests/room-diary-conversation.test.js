const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'room-diary-cloud-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: directory, DB_PATH: path.join(directory, 'site.db'),
    JWT_SECRET: 'diary-cloud-test-secret-more-than-32-characters', ADMIN_PASSWORD: 'diary-test-admin',
    ROOM_LOCAL_INTELLIGENCE: 'false', ROOM_MEMORY_BACKEND: 'source', ROOM_WEATHER_OFFLINE: 'true', REDIS_URL: '' });
const db = require('../backend/db');
const chat = require('../backend/repositories/room-chat-repository');
let server, base;
const headers = (owner = 'diary-one') => ({ Authorization: 'Bearer ' + require('../backend/middleware/auth').generateToken({ id: owner, role: 'user' }),
    'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', Origin: base });
const request = async (url, options) => {
    const response = await fetch(base + url, options);
    return { status: response.status, body: await response.json() };
};
before(async () => {
    require('../backend/db/migrations/init').runMigrations();
    for (const id of ['diary-one', 'diary-two', 'capacity']) db.prepare("INSERT INTO users(id,username,email,password_hash) VALUES(?,?,?,'test')").run(id, id, id + '@example.test');
    server = require('../backend/app').createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

test('active cloud chat retains over 100 messages and diary pages include both devices exactly once', async () => {
    for (let i = 0; i < 205; i++) chat.saveTurn('diary-one', { turnId: `device-${i % 2 ? 'phone' : 'desktop'}-${i}`, userMessage: `morning-${i}`, assistantMessage: `reply-${i}` });
    assert.equal(chat.listMessages('diary-one').length, 24);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM room_chat_messages WHERE user_id='diary-one'").get().n, 410);
    assert.equal((await request('/api/room/chat/diary')).status, 401);
    const first = await request('/api/room/chat/diary', { headers: headers() });
    assert.equal(first.status, 200);
    const data = first.body.data;
    assert.equal(data.messages.length, 200);
    assert.equal(data.total, 410);
    assert.equal(data.messages[0].content, 'morning-0');
    const messages = [...data.messages];
    let cursor = data.nextCursor;
    while (cursor) {
        const query = new URLSearchParams({ cursor, ...data.snapshot });
        const page = await request('/api/room/chat/diary?' + query, { headers: headers() });
        assert.equal(page.status, 200);
        messages.push(...page.body.data.messages);
        cursor = page.body.data.nextCursor;
    }
    assert.equal(messages.length, 410);
    assert.equal(new Set(messages.map(message => message.id)).size, 410);
    assert.equal(messages.at(-1).content, 'reply-204');
    assert.equal((await request('/api/room/chat/diary?' + new URLSearchParams(data.snapshot), { headers: headers('diary-two') })).status, 409);
    assert.equal((await request('/api/room/chat/diary?cursor[bad]=1', { headers: headers() })).status, 400);
});

test('finishing a diary preserves later cloud messages and rejects changed snapshots or foreign cursors', async () => {
    chat.clearMessages('diary-one');
    chat.saveTurn('diary-one', { turnId: 'snapshot-old', userMessage: '早上分享了我的旅行', assistantMessage: '我记住了' });
    const snapshot = chat.listDiaryMessages('diary-one').snapshot;
    chat.saveTurn('diary-one', { turnId: 'snapshot-new', userMessage: '生成日记期间在手机上说的话', assistantMessage: '新的回复' });
    const token = headers().Authorization.slice(7);
    const denied = await request('/api/room/chat/finish', { method: 'POST', headers: { Cookie: `tsukuyomi_session=${token}`, 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ snapshot }) });
    assert.equal(denied.status, 403);
    const anonymous = await request('/api/room/chat/finish', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Origin: base }, body: JSON.stringify({ snapshot }) });
    assert.equal(anonymous.status, 401);
    for (const body of [{}, { snapshot: null }, { snapshot: [] }, { snapshot: {} }]) {
        const invalid = await request('/api/room/chat/finish', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
        assert.ok([400, 409].includes(invalid.status));
        assert.equal(chat.listMessages('diary-one').length, 4);
    }
    assert.equal((await request('/api/room/chat/finish', { method: 'POST', headers: headers('diary-two'), body: JSON.stringify({ snapshot }) })).status, 409);
    const ended = await request('/api/room/chat/finish', { method: 'POST', headers: headers(), body: JSON.stringify({ snapshot }) });
    assert.equal(ended.status, 200);
    assert.equal(ended.body.data.deletedCount, 2);
    assert.equal(ended.body.data.remainingCount, 2);
    assert.equal(chat.listDiaryMessages('diary-one').messages[0].content, '生成日记期间在手机上说的话');
    assert.throws(() => chat.clearDiarySnapshot('diary-two', snapshot), /其他设备结束/);
    const current = chat.listDiaryMessages('diary-one');
    chat.replaceLatestTurn('diary-one', { turnId: 'snapshot-new', expectedUserMessage: '生成日记期间在手机上说的话', expectedAssistantMessage: '新的回复', userMessage: '修改后的旅行内容', assistantMessage: '修改后的回复' });
    assert.throws(() => chat.clearDiarySnapshot('diary-one', current.snapshot), /修改/);
    assert.throws(() => chat.listDiaryMessages('diary-one', { cursor: 'foreign', snapshot: chat.listDiaryMessages('diary-one').snapshot }), /分页位置/);
    assert.equal(chat.listMessages('diary-one').length, 2);
    const stale = chat.listDiaryMessages('diary-one').snapshot;
    chat.clearMessages('diary-one');
    chat.saveTurn('diary-one', { turnId: 'new-session', userMessage: '新的一天', assistantMessage: '新的一天开始了' });
    assert.throws(() => chat.clearDiarySnapshot('diary-one', stale), /其他设备结束/);
    assert.equal(chat.listMessages('diary-one')[0].content, '新的一天');
});

test('active-session capacity stops new saves explicitly without pruning previous diary content', () => {
    const insert = db.prepare("INSERT INTO room_chat_messages(id,user_id,turn_id,role,content) VALUES(?,'capacity',?,'assistant','content')");
    db.transaction(() => { for (let i = 0; i < 10000; i++) insert.run('capacity-message-' + i, 'capacity-turn-' + i); })();
    let captured = false;
    assert.throws(() => chat.saveTurn('capacity', { turnId: 'over-limit', userMessage: 'new', assistantMessage: 'new' }, () => { captured = true; }), /已有记录不会删除/);
    assert.equal(captured, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM room_chat_messages WHERE user_id='capacity'").get().n, 10000);
    assert.equal(chat.listDiaryMessages('capacity').messages[0].id, 'capacity-message-0');
});
