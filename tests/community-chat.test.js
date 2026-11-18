const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'moon-chat-test-'));
Object.assign(process.env,{NODE_ENV:'test',DATA_DIR:dir, DB_PATH:path.join(dir,'site.db'), REDIS_URL:'', ENABLE_FRONTEND_DIST:'false'});
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const chat = require('../backend/services/community-chat');
const model = require('../backend/services/community-yachiyo');
const wallet = require('../backend/services/site-wallet');
const { generateToken } = require('../backend/middleware/auth');
const { once } = require('node:events');
let base, server;
const tokens = {};
function post(channel,user,content,extra={}) {
    return request(channel+'/messages',user,'POST',{content,requestId:randomUUID(),...extra});
}
async function request(url,user,method='GET',body) {
    const r = await fetch(base+'/api/chatroom/'+url,{method,headers:{Origin:base,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json',...(user?{Authorization:'Bearer '+tokens[user]}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,...await r.json()};
}
before(async () => {
    server=createApp().listen(0,'127.0.0.1');
    await once(server,'listening');
    base='http://127.0.0.1:'+server.address().port;
    for (const name of ['alice','bob','mod']) {
        db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)').run(name,name,name+'@example.test','fixture',name==='mod'?'admin':'user');
        tokens[name]=generateToken({id:name});
    }
});
after(async () => { await new Promise(resolve=>server.close(resolve)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); });

test('a zero-balance member can summon Yachiyo in a public channel once per submitted message',async () => {
    const before=wallet.wallet('alice');
    assert.equal(before.balance_atoms,'0');
    let calls=0;
    const ask=model.ask;
    model.ask=async (_,turns) => { calls++; assert.deepEqual(turns,[{role:'user',content:'alice：@八千代 晚上好！'}]); return '晚上好，一起来聊聊吧。'; };
    try {
        const requestId=randomUUID();
        const [first,retry]=await Promise.all([1,2].map(()=>post('lobby','alice','@八千代 晚上好！',{requestId,model:'ignored',xp:999})));
        assert.equal(first.status,200); assert.equal(retry.status,200);
        assert.equal(first.data.message.id,retry.data.message.id);
        assert.equal([first,retry].filter(r=>r.data.growth?.award.xp===5).length,1);
        assert.equal(calls,1);
        const messages=(await request('lobby/history')).data.messages;
        assert.equal(messages.length,2);
        assert.equal(messages[0].aiStatus,'done');
        assert.equal(messages[1].userId,null);
        assert.equal(messages[1].replyTo,messages[0].id);
        assert.equal(messages[1].content,'晚上好，一起来聊聊吧。');
        assert.deepEqual(wallet.wallet('alice'),before);
        assert.equal(db.prepare('SELECT count(*) AS n FROM billing_requests').get().n,0);
        assert.equal(db.prepare("SELECT total_xp FROM user_growth_profiles WHERE user_id='alice'").get().total_xp,5);
        assert.equal((await post('tech','bob','其他频道引用',{replyTo:messages[0].id})).status,409);
        assert.equal((await post('lobby',null,'guest')).status,401);
        assert.equal((await post('tech','bob','<script>')).status,422);
        assert.equal((await request('tech/history')).data.messages.length,0);
        assert.equal((await request('messages/'+messages[0].id,'bob','DELETE')).status,403);
        await request('messages/'+messages[0].id,'alice','DELETE');
        assert.equal((await request('lobby/history')).data.messages[1].quote,null);
    } finally { model.ask=ask; }
});
test('reports, moderator mute, request throttling and service failure do not disrupt channel history',async () => {
    const ask=model.ask;
    model.ask=async()=>{ throw new Error('upstream unavailable'); };
    try {
        const sent=await post('tech','bob','@八千代 想听听你的看法');
        assert.equal(sent.status,200);
        const id=sent.data.message.id;
        assert.equal((await request('tech/history')).data.messages[0].aiStatus,'failed');
        assert.equal((await post('games','bob','太快了')).status,429);
        assert.equal((await request('messages/'+id+'/report','alice','POST',{})).status,200);
        assert.equal((await request('reports','bob')).status,403);
        const queue=await request('reports','mod');
        assert.equal(queue.data.items[0].id,id);
        assert.equal(queue.data.activeToday,2);
        assert.equal((await request('messages/'+id+'/mute','mod','POST',{})).status,200);
        assert.equal((await post('studio','bob','你好')).status,403);
        assert.equal((await request('messages/'+id,'mod','DELETE')).status,200);
        assert.equal((await request('reports','mod')).data.items.length,0);
        assert.equal(chat.history('tech').messages[0].content,'');
    } finally { model.ask=ask; }
});

test('finite HTTP sync preserves presence, edits, unread activity and the current cursor', async () => {
    const begin = await request('lobby/sync','bob');
    assert.equal(begin.status,200);
    assert.equal(begin.data.packets[0].type,'snapshot');
    assert.ok(begin.data.packets.at(-1).members.some(member => member.id==='bob'));
    const created = await post('lobby','mod','月读频道同步验证');
    assert.equal(created.status,200);
    const cursor = encodeURIComponent(begin.data.cursor);
    const delta = await request('lobby/sync?cursor='+cursor);
    assert.ok(delta.data.packets.some(p => p.type==='message' && p.message.id===created.data.message.id));
    const other = await request('tech/sync?cursor='+cursor);
    assert.ok(other.data.packets.some(p => p.type==='activity' && p.channel==='lobby'));
    await request('messages/'+created.data.message.id,'mod','DELETE');
    const updated = await request('lobby/sync?cursor='+encodeURIComponent(delta.data.cursor));
    assert.ok(updated.data.packets.some(p => p.type==='message' && p.message.removed));
    const idle = await request('lobby/sync?cursor='+encodeURIComponent(updated.data.cursor));
    assert.deepEqual(idle.data.packets.map(p=>p.type),['presence']);
});
