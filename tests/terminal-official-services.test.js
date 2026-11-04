const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-services-'));
Object.assign(process.env, { NODE_ENV:'test', DATA_DIR:root, DB_PATH:path.join(root,'test.db'), PUBLIC_SITE_URL:'https://yachiyo.hk',
    ADMIN_USERNAME:'test-owner', ADMIN_PASSWORD:'fixture-password', JWT_SECRET:'terminal-test-only-secret-more-than-32-chars', REDIS_URL:'' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
const { settings } = require('../backend/services/official-tts-settings');
const file = path.join(root,'official-tts.json');
let api, gateway, origin, cookies, siteId, ordinaryToken, upstreamOperator = true, upstreamSubject;
const calls = [];
async function start(server) { server.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve)); }
async function request(route, { cookie=cookies, method='GET', body, account } = {}) {
    const res = await fetch(origin + '/api/admin/official-services/' + route, { method,
        headers:{ Origin:origin, Cookie:cookie, 'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json',
            ...(account ? {'X-Official-Expected-Account':account} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
    return { status:res.status, ...await res.json() };
}
before(async () => {
    api = http.createServer(createApp()); await start(api); origin = 'http://127.0.0.1:'+api.address().port;
    const login = await fetch(origin+'/api/admin/login',{method:'POST', headers:{Origin:origin,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json'},
        body:JSON.stringify({username:'test-owner',password:'fixture-password'})});
    assert.equal(login.status,200); cookies=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
    siteId=(await login.json()).data.user.id; upstreamSubject=siteId;
    const bcrypt=require('bcryptjs');
    const regular=db.prepare('INSERT INTO admins(username,password_hash,role) VALUES(?,?,?)').run('regular',bcrypt.hashSync('fixture',4),'admin');
    ordinaryToken=generateToken({id:'admin-'+regular.lastInsertRowid,adminId:Number(regular.lastInsertRowid),scope:'admin',role:'admin'});
    gateway=http.createServer(async(req,res)=>{
        const chunks=[]; for await (const chunk of req) chunks.push(chunk);
        calls.push({url:req.url,method:req.method,headers:req.headers,body:chunks.length ? JSON.parse(Buffer.concat(chunks)) : null});
        const data=req.url.endsWith('/me') ? {account_id:'acct-fixture',site_user_id:upstreamSubject,operator:upstreamOperator} : {revision:7,enabled:true};
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
    });
    await start(gateway);process.env.OFFICIAL_LLM_LOOPBACK_PORT=String(gateway.address().port);
});
after(async()=>{for(const server of [api,gateway])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    db.close();fs.rmSync(root,{recursive:true,force:true});});
test('only a live Terminal super-admin session can read or write either service',async()=>{
    const siteOnly=cookies.split('; ').find(v=>v.startsWith('tsukuyomi_session='));
    for(const route of ['tts','llm/settings']) {
        assert.equal((await request(route,{cookie:''})).status,401);
        assert.notEqual((await request(route,{cookie:siteOnly})).status,200);
        assert.equal((await request(route,{cookie:'tsukuyomi_admin_session='+ordinaryToken})).status,403);
    }
    assert.equal(calls.length,0);
});
test('TTS changes reach synthesis settings, retain private fields and reject stale or unsafe writes',async()=>{
    const original={OFFICIAL_TTS_ENABLED:true,OFFICIAL_TTS_URL:'http://127.0.0.1:9880/tts',OFFICIAL_TTS_REF_AUDIO_PATH:'private.wav',
        OFFICIAL_TTS_FISH_API_KEY:'secret-fixture-value',OFFICIAL_TTS_FISH_ENABLED:true,custom:'preserve'};
    fs.writeFileSync(file,JSON.stringify(original),{mode:0o600});
    const read=await request('tts');assert.equal(read.status,200);assert.equal(read.data.fish.hasKey,true);
    assert.doesNotMatch(JSON.stringify(read),/secret-fixture|private\.wav|9880/);
    const change={revision:read.data.revision,engine:'fish-audio',enabled:true,language:'ja',voice:'a'.repeat(32),model:'s2.1-pro-free',models:['s2.1-pro-free','drama-3']};
    const saved=await request('tts',{method:'PUT',body:change});assert.equal(saved.status,200);
    assert.deepEqual(settings('fish-audio').publicModels,change.models);assert.equal(settings().reference,'private.wav');
    assert.equal(settings('fish-audio').key,original.OFFICIAL_TTS_FISH_API_KEY);assert.equal(fs.statSync(file).mode & 0o777,0o600);
    assert.equal(JSON.parse(fs.readFileSync(file)).custom,'preserve');assert.equal((await request('tts',{method:'PUT',body:change})).status,409);
    const fresh={...change,revision:saved.data.revision};
    for(const extra of [{models:['other']},{voice:'invalid'},{endpoint:'https://example.test'},{apiKey:'not valid'}])
        assert.equal((await request('tts',{method:'PUT',body:{...fresh,...extra}})).status,400);
    const next=await request('tts',{method:'PUT',body:{...fresh,apiKey:'new-fixture-key',enabled:false}});assert.equal(next.status,200);
    assert.equal(settings('fish-audio'),null);assert.doesNotMatch(JSON.stringify(next),/new-fixture-key/);
    assert.equal((await request('tts',{method:'PUT',body:{revision:next.data.revision,engine:'default',enabled:false,language:'ja'}})).status,200);
    assert.equal(settings(),null);
});
test('LLM uses linked site and operator identity on each read/write and sends only the site cookie',async()=>{
    const identity=await request('llm/me');assert.deepEqual(identity.data,{account:'acct-fixture'});
    assert.equal((await request('llm/settings',{account:'old-account'})).status,409);
    assert.equal((await request('llm/settings',{account:'acct-fixture'})).data.revision,7);
    const update={revision:7,model:'fixture-model'};assert.equal((await request('llm/settings',{method:'POST',body:update,account:'acct-fixture'})).status,200);
    const sent=calls.at(-1);assert.equal(sent.url,'/official-api/api/admin/settings');assert.deepEqual(sent.body,update);
    assert.equal(sent.headers['x-official-expected-account'],'acct-fixture');assert.equal(sent.headers.host,'yachiyo.hk');assert.equal(sent.headers.origin,'https://yachiyo.hk');
    assert.match(sent.headers.cookie,/^tsukuyomi_session=[\w.-]+$/);assert.equal(sent.headers.authorization,undefined);
    upstreamSubject='unrelated';assert.equal((await request('llm/settings',{account:'acct-fixture'})).status,409);assert.equal(calls.at(-1).url,'/official-api/api/me');
    upstreamSubject=siteId;upstreamOperator=false;assert.equal((await request('llm/settings',{method:'POST',body:update,account:'acct-fixture'})).status,403);
    assert.equal(calls.at(-1).url,'/official-api/api/me');
});
