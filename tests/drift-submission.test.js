const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-submission-'));
Object.assign(process.env, { NODE_ENV:'test', DATA_DIR:dir, DB_PATH:path.join(dir,'db.sqlite'), JWT_SECRET:'drift-submission-test-secret-more-than-32-characters', ADMIN_PASSWORD:'test-password', ENABLE_FRONTEND_DIST:'false', REDIS_URL:'' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
let server, base;
async function call(url, user, body) {
    const response = await fetch(base+url, { method:'POST', headers:{ Origin:base, 'X-Requested-With':'XMLHttpRequest', 'Content-Type':'application/json', Authorization:'Bearer '+generateToken({ id:user, username:user, role:'user' }) }, body:JSON.stringify(body) });
    return { status:response.status, body:await response.json() };
}
function fixture(owner, reader) {
    return Number(db.prepare("INSERT INTO drift_bottles(user_id,recipient_id,content,language,status,review) VALUES(?,?,'Test note','zh','approved','{}')").run(owner,reader).lastInsertRowid);
}
before(async () => {
    server = createApp().listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const name of ['one','two','reader','stranger','validation','rollback','rollback-reader']) {
        db.prepare('INSERT INTO users(id,username,email,password_hash) VALUES(?,?,?,?)').run(name,name,`${name}@example.test`,'test-hash');
    }
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); });

test('bottle retry returns the original durable receipt, including after moderation changes', async () => {
    const body = { requestId:randomUUID(), content:'A retryable note', language:'zh' };
    const first = await call('/api/drift','one',body);
    assert.equal(first.status,201);
    const replies = await Promise.all(Array.from({ length:15 },() => call('/api/drift','one',body)));
    for (const reply of replies) assert.deepEqual(reply,first);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_bottles WHERE user_id=?').get('one').n,1);
    assert.ok(db.prepare('SELECT fingerprint,result_json FROM drift_submissions WHERE user_id=? AND request_id=?').get('one',body.requestId));
    db.prepare("UPDATE drift_bottles SET status='pending',closed=1 WHERE id=?").run(first.body.data.id);
    assert.deepEqual(await call('/api/drift','one',body),first);
    const another = await call('/api/drift','one',{ ...body, requestId:randomUUID() });
    assert.equal(another.status,201);
    assert.notEqual(another.body.data.id,first.body.data.id);
});

test('request IDs are scoped to the authenticated sender and conflict on changed content, language or operation', async () => {
    const body = { requestId:randomUUID(), content:'Same ID for independent users', language:'zh' };
    const first = await call('/api/drift','one',body);
    const second = await call('/api/drift','two',body);
    assert.equal(second.status,201);
    assert.notEqual(second.body.data.id,first.body.data.id);
    for (const changed of [{ ...body,content:'Changed text' }, { ...body,language:'ja' }]) {
        const conflict = await call('/api/drift','one',changed);
        assert.equal(conflict.status,409);
        assert.equal(conflict.body.code,'DRIFT_SUBMISSION_CONFLICT');
    }
    const conflict = await call(`/api/drift/${first.body.data.id}/replies`,'one',body);
    assert.equal(conflict.status,409);
});

test('reply retries save and notify once, while reuse on another bottle is rejected', async () => {
    const id = fixture('two','reader');
    const body = { requestId:randomUUID(), content:'A retryable reply', language:'zh' };
    const before = db.prepare('SELECT count(*) n FROM notifications WHERE user_id=?').get('two').n;
    const first = await call(`/api/drift/${id}/replies`,'reader',body);
    assert.equal(first.status,201);
    for (const result of await Promise.all(Array.from({ length:4 },() => call(`/api/drift/${id}/replies`,'reader',body)))) assert.deepEqual(result,first);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_replies WHERE bottle_id=?').get(id).n,1);
    assert.equal(db.prepare('SELECT count(*) n FROM notifications WHERE user_id=?').get('two').n,before+1);
    const other = fixture('two','reader');
    assert.equal((await call(`/api/drift/${other}/replies`,'reader',body)).status,409);
    assert.equal((await call(`/api/drift/${id}/replies`,'stranger',body)).status,403);
    db.prepare('UPDATE drift_bottles SET closed=1 WHERE id=?').run(id);
    assert.deepEqual(await call(`/api/drift/${id}/replies`,'reader',body),first);
    assert.equal((await call(`/api/drift/${id}/replies`,'reader',{ ...body,requestId:randomUUID() })).status,403);
    assert.equal(db.prepare('SELECT count(*) n FROM notifications WHERE user_id=?').get('two').n,before+1);
});

test('pending reply retry does not expose content or send notifications', async () => {
    const id = fixture('two','reader');
    const body = { requestId:randomUUID(), content:'如何预防诈骗', language:'zh' };
    const before = db.prepare('SELECT count(*) n FROM notifications WHERE user_id=?').get('two').n;
    const first = await call(`/api/drift/${id}/replies`,'reader',body);
    assert.equal(first.body.data.status,'pending');
    assert.deepEqual(await call(`/api/drift/${id}/replies`,'reader',body),first);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_replies WHERE bottle_id=?').get(id).n,1);
    assert.equal(db.prepare('SELECT count(*) n FROM notifications WHERE user_id=?').get('two').n,before);
});

test('invalid keys and validation failures do not reserve IDs or insert content', async () => {
    for (const requestId of ['',null,5,'invalid', 'x'.repeat(500)]) assert.equal((await call('/api/drift','validation',{ requestId,content:'A note' })).status,400);
    const requestId = randomUUID();
    assert.equal((await call('/api/drift','validation',{ requestId,content:'<script>test</script>' })).status,422);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_submissions WHERE user_id=?').get('validation').n,0);
    assert.equal((await call('/api/drift','validation',{ requestId,content:'A corrected note' })).status,201);
    assert.equal((await call('/api/drift','validation',{ content:'An older client without request IDs' })).status,201);
});

test('failed receipt insert rolls back content and notifications; retry can succeed', async () => {
    const id = fixture('rollback','rollback-reader');
    const requestId = randomUUID();
    const body = { requestId, content:'Atomic reply' };
    const before = db.prepare('SELECT count(*) n FROM notifications WHERE user_id=?').get('rollback').n;
    db.exec(`CREATE TRIGGER fail_drift_receipt BEFORE INSERT ON drift_submissions WHEN NEW.request_id='${requestId}' BEGIN SELECT RAISE(ABORT,'test receipt failure'); END;`);
    assert.equal((await call(`/api/drift/${id}/replies`,'rollback-reader',body)).status,500);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_replies WHERE bottle_id=?').get(id).n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM notifications WHERE user_id=?').get('rollback').n,before);
    db.exec('DROP TRIGGER fail_drift_receipt');
    assert.equal((await call(`/api/drift/${id}/replies`,'rollback-reader',body)).status,201);
    assert.equal(db.prepare('SELECT count(*) n FROM notifications WHERE user_id=?').get('rollback').n,before+1);
});

test('migration upgrades an existing bottle database without changing its history', () => {
    const existing = new (require('better-sqlite3'))(':memory:');
    try {
        existing.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES(\'legacy\');');
        require('../backend/db/migrations/055_create_drift_bottles').up(existing);
        existing.prepare("INSERT INTO drift_bottles(user_id,content,language,status,review) VALUES('legacy','Existing history','zh','approved','{}')").run();
        require('../backend/db/migrations/056_create_drift_submissions').up(existing);
        assert.equal(existing.prepare('SELECT content FROM drift_bottles').get().content,'Existing history');
        assert.equal(existing.prepare('SELECT count(*) n FROM drift_submissions').get().n,0);
    } finally { existing.close(); }
});
