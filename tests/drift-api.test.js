const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'tsukuyomi-drift-'));
Object.assign(process.env,{ NODE_ENV:'test',DATA_DIR:dir,DB_PATH:path.join(dir,'db.sqlite'),JWT_SECRET:'drift-test-secret-that-is-more-than-32-characters',ADMIN_PASSWORD:'drift-test-admin',ENABLE_FRONTEND_DIST:'false',REDIS_URL:'' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
let server, base, tokens = {};
async function call(url, user, method='GET', body) {
    const res = await fetch(base+url,{ method,headers:{ 'Content-Type':'application/json',Origin:base,'X-Requested-With':'XMLHttpRequest',...(tokens[user] ? { Authorization:`Bearer ${tokens[user]}` } : {}) },...(body ? {body:JSON.stringify(body)} : {}) });
    return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control')};
}
before(async()=>{
    server = createApp().listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const name of ['sender','alice','bob','return-owner','return-reader','return-other']) {
        db.prepare('INSERT INTO users(id,username,email,password_hash) VALUES(?,?,?,?)').run(name,name,`${name}@example.test`,'test-hash');
        tokens[name] = generateToken({id:name,username:name,role:'user'});
    }
    tokens.admin = generateToken({id:'admin-001',username:'admin',role:'admin'});
});
after(async()=>{ await new Promise(resolve=>server.close(resolve)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); });
let bottleId, recipient, stranger;
test('requires login and rejects active content without saving', async()=>{
    assert.equal((await call('/api/drift',null)).status,401);
    assert.equal((await call('/api/drift','sender','POST',{content:'<img src=x onerror=alert(1)>'})).status,422);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_bottles').get().n,0);
    assert.equal((await call('/api/drift','sender','POST',{content:'x'.repeat(2001)})).status,422);
});
test('ordinary text is approved using existing rules, no model required', async()=>{
    const created = await call('/api/drift','sender','POST',{content:'今夜的月色真美。',language:'ja',status:'rejected',recipient_id:'bob'});
    assert.equal(created.status,201);
    assert.equal(created.body.data.status,'approved');
    bottleId=created.body.data.id;
    assert.equal((await call('/api/drift/pick','sender','POST')).body.data,null);
    const results=await Promise.all(['alice','bob'].map(user=>call('/api/drift/pick',user,'POST')));
    assert.equal(results.filter(r=>r.body.data).length,1);
    recipient=results[0].body.data ? 'alice':'bob'; stranger=recipient==='alice'?'bob':'alice';
});
test('participants only; no public cache or moderation audit leaks', async()=>{
    assert.equal((await call(`/api/drift/${bottleId}`,stranger)).status,404);
    assert.deepEqual((await call('/api/drift',stranger)).body.data,[]);
    const detail=await call(`/api/drift/${bottleId}`,recipient);
    assert.match(detail.cache,/no-store/);
    assert.equal(detail.body.data.bottle.content,'今夜的月色真美。');
    assert.equal(detail.body.data.bottle.language,'ja');
    assert.equal(detail.body.data.bottle.review,undefined);
    assert.equal(detail.body.data.peer.id,'sender');
    assert.equal((await call(`/api/drift/${bottleId}/replies`,stranger,'POST',{content:'偷看'})).status,403);
});
test('private replies reuse moderation and notify without copying private text', async()=>{
    const sent=await call(`/api/drift/${bottleId}/replies`,recipient,'POST',{content:'谢谢你的瓶子',language:'zh'});
    assert.equal(sent.body.data.status,'approved');
    const detail=await call(`/api/drift/${bottleId}`,'sender');
    assert.equal(detail.body.data.replies[0].content,'谢谢你的瓶子');
    const notification=db.prepare("SELECT * FROM notifications WHERE user_id='sender' AND link=?").get(`/drift?bottle=${bottleId}`);
    assert.equal(notification.content,'');
    assert.equal(notification.link,`/drift?bottle=${bottleId}`);
});
test('pending replies are only visible to their author until admin approves', async()=>{
    await call(`/api/drift/${bottleId}/replies`,recipient,'POST',{content:'关于暴力的讨论'});
    assert.equal((await call(`/api/drift/${bottleId}`,'sender')).body.data.replies.length,1);
    assert.equal((await call(`/api/drift/${bottleId}`,recipient)).body.data.replies.length,2);
    assert.equal((await call('/api/moderation/drift',recipient)).status,403);
    const queue=(await call('/api/moderation/drift','admin')).body.data;
    assert.equal(queue.replies.length,1);
    const url=`/api/moderation/drift/replies/${queue.replies[0].id}`;
    assert.equal((await call(url,'admin','POST',{status:'approved'})).status,200);
    assert.equal((await call(url,'admin','POST',{status:'approved'})).status,409);
    assert.equal((await call(`/api/drift/${bottleId}`,'sender')).body.data.replies.length,2);
});
test('external-only replies notify once after approval; competing review decisions preserve the result', async()=>{
    const link = `/drift?bottle=${bottleId}`;
    const count = () => db.prepare('SELECT count(*) n FROM notifications WHERE user_id=? AND link=?').get('sender',link).n;
    const before = count();
    const sent = await call(`/api/drift/${bottleId}/replies`,recipient,'POST',{content:'https://example.org/private-note'});
    assert.equal(sent.body.data.status,'pending');
    assert.equal(count(),before);
    const row = db.prepare('SELECT * FROM drift_replies WHERE bottle_id=? ORDER BY id DESC LIMIT 1').get(bottleId);
    assert.ok(JSON.parse(row.review).externalHosts.includes('example.org'));
    assert.equal((await call(`/api/drift/${bottleId}`,'sender')).body.data.replies.some(r=>r.id===row.id),false);
    const url = `/api/moderation/drift/replies/${row.id}`;
    const decisions = await Promise.all(['approved','rejected'].map(status=>call(url,'admin','POST',{status})));
    assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);
    const finalStatus = db.prepare('SELECT status FROM drift_replies WHERE id=?').get(row.id).status;
    assert.equal(count(),before + (finalStatus==='approved' ? 1 : 0));
    assert.equal((await call(url,'admin','POST',{status:'approved'})).status,409);
    assert.equal(count(),before + (finalStatus==='approved' ? 1 : 0));
    for (const note of db.prepare('SELECT title,content FROM notifications WHERE link=?').all(link)) {
        assert.equal(note.content,'');
        assert.equal(note.title.includes('example.org'),false);
    }
});
test('external links remain in review, never offered to pickup', async()=>{
    const sent=await call('/api/drift','sender','POST',{content:'看看 https://example.org'});
    assert.equal(sent.body.data.status,'pending');
    assert.equal((await call(`/api/drift/${sent.body.data.id}`,recipient)).status,404);
    assert.equal((await call('/api/drift/pick',stranger,'POST')).body.data,null);
});
test('follow uses the existing social relationship; blocks stop reply and future matching', async()=>{
    assert.equal((await call('/api/user/follow/sender',recipient,'POST')).status,200);
    assert.ok(db.prepare('SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?').get(recipient,'sender'));
    assert.equal((await call(`/api/drift/${bottleId}/block`,recipient,'POST')).status,200);
    assert.equal((await call(`/api/drift/${bottleId}/replies`,'sender','POST',{content:'你好'})).status,403);
    await call('/api/drift','sender','POST',{content:'另一个瓶子'});
    assert.equal((await call('/api/drift/pick',recipient,'POST')).body.data,null);
});
test('reports quarantine content and retain report origin for review', async()=>{
    assert.equal((await call(`/api/drift/${bottleId}/report`,stranger,'POST')).status,404);
    assert.equal((await call(`/api/drift/${bottleId}/report`,recipient,'POST')).status,200);
    const row=db.prepare('SELECT * FROM drift_bottles WHERE id=?').get(bottleId);
    assert.equal(row.status,'pending'); assert.equal(row.closed,1);
    assert.equal(JSON.parse(row.review).reporterId,recipient);
    assert.equal((await call(`/api/drift/${bottleId}/replies`,'sender','POST',{content:'你好'})).status,403);
});
test('manual staging helper creates two login accounts without replacing passwords', async()=>{
    const { spawnSync }=require('node:child_process');
    const script=path.join(__dirname,'../scripts/create-drift-test-users.cjs');
    const password='manual-test-password-only';
    const denied=spawnSync(process.execPath,[script],{env:{...process.env,TSUKUYOMI_STAGING:'',DRIFT_TEST_PASSWORD:password},encoding:'utf8'});
    assert.notEqual(denied.status,0);
    assert.equal(db.prepare("SELECT 1 FROM users WHERE username='drift-a'").get(),undefined);
    const seeded=spawnSync(process.execPath,[script],{env:{...process.env,TSUKUYOMI_STAGING:'drift',DRIFT_TEST_PASSWORD:password},encoding:'utf8'});
    assert.equal(seeded.status,0,seeded.stderr);
    assert.equal(seeded.stdout.includes(password),false);
    const row=db.prepare("SELECT password_hash FROM users WHERE username='drift-a'").get();
    assert.ok(require('bcryptjs').compareSync(password,row.password_hash));
    const again=spawnSync(process.execPath,[script],{env:{...process.env,TSUKUYOMI_STAGING:'drift',DRIFT_TEST_PASSWORD:'a-different-test-password'},encoding:'utf8'});
    assert.equal(again.status,0,again.stderr);
    assert.equal(db.prepare("SELECT password_hash FROM users WHERE username='drift-a'").get().password_hash,row.password_hash);
    assert.equal((await call('/api/auth/login',null,'POST',{username:'drift-b',password})).status,200);
});

test('returning an unopened bottle restores the pool without leaking any correspondence', async()=>{
    db.prepare('UPDATE drift_bottles SET closed=1').run();
    const sent=await call('/api/drift','return-owner','POST',{content:'这一张纸条可以继续漂流'});
    const bottle=sent.body.data.id;
    assert.equal((await call('/api/drift/pick','return-reader','POST')).body.data.id,bottle);
    assert.equal((await call(`/api/drift/${bottle}/return`,'return-owner','POST')).status,404);
    assert.equal((await call(`/api/drift/${bottle}/return`,'return-other','POST')).status,404);
    assert.equal((await call(`/api/drift/${bottle}/return`,'return-reader','POST')).status,200);
    assert.equal((await call(`/api/drift/${bottle}`,'return-reader')).status,404);
    assert.equal((await call('/api/drift/pick','return-other','POST')).body.data.id,bottle);
    await call(`/api/drift/${bottle}/replies`,'return-other','POST',{content:'关于暴力的讨论'});
    assert.equal((await call(`/api/drift/${bottle}/return`,'return-other','POST')).status,409);
    db.prepare("UPDATE drift_replies SET status='rejected' WHERE bottle_id=?").run(bottle);
    assert.equal((await call(`/api/drift/${bottle}/return`,'return-other','POST')).status,409);
    assert.equal((await call('/api/drift/pick','return-reader','POST')).body.data,null);
});
