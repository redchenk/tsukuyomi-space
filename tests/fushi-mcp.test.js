const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-fushi-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dir, DB_PATH: path.join(dir, 'test.db'),
    JWT_SECRET: 'fushi-test-only-session-key-never-production', REDIS_URL: '', ADMIN_PASSWORD: 'fixture-only-password',
    ENABLE_FRONTEND_DIST: 'false', ROOM_WEATHER_OFFLINE: 'true', PUBLIC_SITE_URL: 'https://site.example.test',
    FUSHI_ENABLED: 'true', FUSHI_USER_ID: 'fixture-fushi', FUSHI_ORIGIN: 'https://site.example.test',
    FUSHI_OAUTH_CLIENT_ID: 'fixture-public-client', FUSHI_OAUTH_REDIRECT_URI: 'https://client.example.test/return',
    FUSHI_SECRET_KEY: Buffer.alloc(32, 9).toString('base64') });

const deliveries = [];
let responseStatus = 200, invalidSignature = false, timeout = false, verifications = 0;
// This independent receiver checks Standard Webhooks framing, not the project's signing helper.
async function receiver(url, options) {
    if (timeout) { const e = new Error('fixture timeout'); e.name = 'TimeoutError'; throw e; }
    assert.equal(new URL(url).protocol, 'https:');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    const h = options.headers;
    const timestamp = Number(h['webhook-timestamp']);
    const expected = crypto.createHmac('sha256', Buffer.alloc(32, 3)).update(`${h['webhook-id']}.${timestamp}.${options.body}`).digest('base64');
    const verified = h['webhook-signature'].split(' ').includes(`v1,${expected}`) && !invalidSignature;
    if (!verified) return new Response('{}', { status: 401 });
    const payload = JSON.parse(options.body);
    assert.ok(h['X-MCP-Subscription-Id'].startsWith('sub_'));
    if (payload.type === 'verification') { verifications++; return new Response(JSON.stringify({ challenge: payload.challenge }), { status: 200 }); }
    assert.equal(h['webhook-id'], payload.eventId);
    deliveries.push({ url, payload, headers: h });
    return new Response('{}', { status: responseStatus });
}
const outbound = require('../backend/services/outbound-url-security');
outbound.fetchPinnedUrl = receiver;
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const auth = require('../backend/services/fushi-auth');
const events = require('../backend/services/fushi-events');
const community = require('../backend/services/fushi-community');
const hooks = require('../backend/services/fushi-webhooks');
const { commitMessage, submitReply } = require('../backend/services/message-submission');
const { approveAndNotify, notifyApprovedMessage } = require('../backend/services/approved-reply-notification');
const { generateToken } = require('../backend/middleware/auth');
const secret = `whsec_${Buffer.alloc(32, 3).toString('base64')}`;
let server, base, context, bearer, fushi, actor, other, siteBearer;
function requestParams(extra = {}) {
    const verifier = 'v'.repeat(48);
    return { client_id: process.env.FUSHI_OAUTH_CLIENT_ID, redirect_uri: process.env.FUSHI_OAUTH_REDIRECT_URI,
        response_type: 'code', resource: `${process.env.FUSHI_ORIGIN}/api/fushi/mcp`, scope: 'fushi:read fushi:reply fushi:events',
        state: 'fixture-state', code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        approve: true, ...extra };
}
function grant(scopes = 'fushi:read fushi:reply fushi:events') {
    const params = requestParams({ scope: scopes });
    const code = new URL(auth.issueCode(fushi.id, params).redirect).searchParams.get('code');
    const tokens = auth.exchange({ grant_type: 'authorization_code', client_id: params.client_id,
        redirect_uri: params.redirect_uri, resource: params.resource, code, code_verifier: 'v'.repeat(48) });
    return { tokens, context: auth.authenticate(tokens.access_token) };
}
function subscription(extra = {}) {
    return { name: events.NAME, arguments: {}, delivery: { mode: 'webhook', url: 'https://receiver.example.test/callback', secret }, ...extra };
}
function interaction({ content = '你好，Fushi', article = false, pending = false } = {}) {
    let root;
    if (article) {
        const row = db.prepare("INSERT INTO articles (title,content,author_id,status,slug) VALUES ('fixture article','公开上下文',?,'published',?)")
            .run(fushi.id, `fixture-${crypto.randomUUID()}`);
        root = commitMessage({ userId: actor.id, author: actor.username, content, articleId: row.lastInsertRowid, status: pending ? 'pending' : 'approved' }, actor);
    } else {
        root = commitMessage({ userId: fushi.id, author: fushi.username, content: 'Fushi 的公开留言', status: 'approved' }, fushi);
        root = submitReply({ user: actor, targetId: root.id, content: pending ? '诈骗案例讨论' : content }).message;
    }
    const notification = db.prepare("SELECT * FROM notifications WHERE user_id=? AND related_message_id=? AND type='reply' ORDER BY id DESC LIMIT 1").get(fushi.id, root.id);
    return { message: root, notification };
}
async function call(pathname, { method = 'GET', body, token, headers = {} } = {}) {
    const response = await fetch(`${base}${pathname}`, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { response, status: response.status, data: text ? JSON.parse(text) : null };
}
async function rpc(method, args = {}, overrides = {}) {
    const params = { ...args, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } };
    return call('/api/fushi/mcp', { method: 'POST', token: bearer,
        body: { jsonrpc: '2.0', id: 1, method, params }, headers: { Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method, ...(method === 'tools/call' ? { 'Mcp-Name': args.name } : {}), ...overrides } });
}
function replyArgs(item, extra = {}) {
    return { notification_id: String(item.notification.id), target_id: String(item.message.id), content: '谢谢分享，我在这里。',
        idempotency_key: 'fixture_reply_key_0001', ...extra };
}
before(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const [id, username] of [['fixture-fushi', 'Fushi'], ['fixture-actor', '测试用户'], ['fixture-other', '无关用户']]) {
        db.prepare('INSERT INTO users(id,username,nickname,email,password_hash,role) VALUES (?,?,?,?,?,?)')
            .run(id, username, username, `${id}@example.test`, bcrypt.hashSync('fictional-fixture-password', 4), 'user');
    }
    [fushi, actor, other] = ['fixture-fushi', 'fixture-actor', 'fixture-other'].map(id => db.prepare('SELECT * FROM users WHERE id=?').get(id));
    siteBearer = generateToken({ id: actor.id });
});
beforeEach(() => {
    events.stop(); deliveries.length = 0; responseStatus = 200; invalidSignature = false; timeout = false; verifications = 0;
    process.env.FUSHI_ENABLED = 'true'; process.env.FUSHI_USER_ID = fushi.id;
    db.prepare("UPDATE users SET role='user' WHERE id=?").run(fushi.id);
    for (const table of ['fushi_deliveries','fushi_subscriptions','fushi_oauth_codes','fushi_oauth_tokens','fushi_grants','fushi_reply_submissions','fushi_events','fushi_history','notifications','messages']) db.prepare(`DELETE FROM ${table}`).run();
    const link = grant(); context = link.context; bearer = link.tokens.access_token;
});
after(async () => { events.stop(); await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('MCP 2.0 discover, four tools and webhook event schemas are available', async () => {
    const discovery = await rpc('server/discover');
    assert.equal(discovery.status, 200); assert.equal(discovery.data.result.resultType, 'complete');
    assert.deepEqual(discovery.data.result.supportedVersions, ['2026-07-28']);
    assert.deepEqual(discovery.data.result.capabilities, { tools: {}, events: {} });
    assert.equal((await rpc('tools/list')).data.result.tools.length, 4);
    const catalog = await rpc('events/list');
    assert.deepEqual(catalog.data.result.events[0].delivery, ['webhook']);
    assert.deepEqual(catalog.data.result.events[0].inputSchema.properties.kind.enum, ['plaza','article']);
});
test('modern metadata, mirrored headers, Accept and version are enforced', async () => {
    const missing = await call('/api/fushi/mcp', { method: 'POST', token: bearer, body: { jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} } });
    assert.equal(missing.status, 400); assert.equal(missing.data.error.code, -32602);
    assert.equal((await rpc('server/discover', {}, { 'Mcp-Method': 'tools/call' })).data.error.code, -32020);
    assert.equal((await rpc('server/discover', {}, { Accept: 'application/json' })).status, 406);
    const old = await call('/api/fushi/mcp', { method:'POST',token:bearer,headers:{'MCP-Protocol-Version':'2025-11-25','Mcp-Method':'server/discover'},
        body:{jsonrpc:'2.0',id:2,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2025-11-25','io.modelcontextprotocol/clientCapabilities':{}}}} });
    assert.equal(old.data.error.code, -32022);
});
test('no browser cookies, website sessions, cross-origin calls or alternate account binding', async () => {
    const challenge=await call('/api/fushi/mcp',{method:'POST',body:{}});
    assert.equal(challenge.status,401); assert.match(challenge.response.headers.get('www-authenticate'),/resource_metadata=/);
    assert.equal((await call('/api/fushi/mcp',{method:'POST',token:siteBearer,body:{}})).status,401);
    assert.equal((await rpc('server/discover', {}, { Cookie: 'tsukuyomi_session=fixture' })).status,403);
    assert.equal((await rpc('server/discover', {}, { Origin: 'https://evil.example.test' })).status,403);
    assert.throws(() => auth.issueCode(actor.id, requestParams()), /access_denied/);
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(fushi.id);
    assert.equal(auth.authenticate(bearer),null);
});
test('OAuth metadata, PKCE, exact redirect, audience and consent', async () => {
    const metadata = await call('/.well-known/oauth-authorization-server');
    assert.equal(metadata.data.authorization_response_iss_parameter_supported,true);
    assert.deepEqual(metadata.data.code_challenge_methods_supported,['S256']);
    const denied = new URL(auth.issueCode(fushi.id,requestParams({approve:false})).redirect);
    assert.equal(denied.searchParams.get('error'),'access_denied'); assert.equal(denied.searchParams.get('iss'),process.env.FUSHI_ORIGIN);
    assert.throws(() => auth.issueCode(fushi.id,requestParams({redirect_uri:'https://evil.example.test'})), /invalid_client/);
    assert.throws(() => auth.issueCode(fushi.id,requestParams({resource:'https://other.example.test'})), /invalid_request/);
    const code = new URL(auth.issueCode(fushi.id,requestParams()).redirect).searchParams.get('code');
    const params = {grant_type:'authorization_code',client_id:process.env.FUSHI_OAUTH_CLIENT_ID,resource:requestParams().resource,redirect_uri:requestParams().redirect_uri,code};
    assert.throws(() => auth.exchange({...params,code_verifier:'z'.repeat(48)}),/invalid_grant/);
    const tokens=auth.exchange({...params,code_verifier:'v'.repeat(48)});
    assert.throws(() => auth.exchange({...params,code_verifier:'z'.repeat(48)}),/invalid_grant/);
    assert.ok(auth.authenticate(tokens.access_token));
    assert.throws(() => auth.exchange({...params,code_verifier:'v'.repeat(48)}),/invalid_grant/);
    assert.equal(auth.authenticate(tokens.access_token),null);
});
test('refresh rotation, reuse detection, token expiry and revocation', async () => {
    const linked = grant();
    const params = {grant_type:'refresh_token',client_id:requestParams().client_id,resource:requestParams().resource,refresh_token:linked.tokens.refresh_token};
    const fresh = auth.exchange(params);
    assert.ok(auth.authenticate(fresh.access_token));
    assert.equal(auth.authenticate(fresh.access_token,null,Date.now()+16*60000),null);
    assert.throws(()=>auth.exchange(params),/invalid_grant/);
    assert.equal(auth.authenticate(fresh.access_token),null);
    const again = grant(); auth.revokeToken(again.tokens.access_token,requestParams().client_id);
    assert.equal(auth.authenticate(again.tokens.access_token),null);
});
test('normal website reply creates a committed outbox event, but never calls network', async () => {
    const root = commitMessage({userId:fushi.id,author:fushi.username,content:'root',status:'approved'},fushi);
    const posted = await call(`/api/messages/${root.id}/reply`,{method:'POST',token:siteBearer,body:{content:'公开的回复'}});
    assert.equal(posted.status,201);
    assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_events').get().n,1);
    assert.equal(deliveries.length,0);
    const read = await rpc('tools/call',{name:'fushi_notifications',arguments:{}});
    const item = read.data.result.structuredContent.items[0];
    assert.equal(item.content,'公开的回复'); assert.equal(item.processed,false); assert.match(item.timestamp,/Z$/);
    assert.ok(item.url.startsWith('https://site.example.test/plaza#msg-'));
});
test('pending moderation waits for approval; repeated approval preserves one event ID', () => {
    const item=interaction({pending:true});
    assert.equal(item.notification,undefined); assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_events').get().n,0);
    approveAndNotify(item.message.id);
    const event=db.prepare('SELECT * FROM fushi_events').get(); assert.ok(event);
    approveAndNotify(item.message.id); notifyApprovedMessage(item.message.id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_events').get().n,1);
    assert.equal(db.prepare('SELECT event_id FROM fushi_events').get().event_id,event.event_id);
});
test('failed database transaction rolls back reply, notification and event together', () => {
    assert.throws(()=>db.transaction(()=>{interaction();throw new Error('fixture rollback');})(),/fixture rollback/);
    for(const table of ['messages','notifications','fushi_events']) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
});
test('only relevant plaza/article replies are visible; no unrelated or private material', async () => {
    const plaza=interaction(), article=interaction({article:true});
    const unrelated=commitMessage({userId:other.id,author:other.username,content:'unrelated',status:'approved'},other);
    submitReply({user:actor,targetId:unrelated.id,content:'none'});
    db.prepare("INSERT INTO notifications(user_id,actor_id,type,title,content) VALUES (?,?,'mail','private','secret fixture')").run(fushi.id,actor.id);
    const data=community.listNotifications(fushi.id,{limit:1}); assert.equal(data.items.length,1); assert.ok(data.next_cursor);
    const second=community.listNotifications(fushi.id,{cursor:data.cursor,limit:1}); assert.equal(second.items[0].kind,'article');
    assert.ok(community.readThread(fushi.id,{notification_id:String(article.notification.id),thread_id:String(article.message.id)}).article);
    assert.throws(()=>community.readThread(fushi.id,{notification_id:String(plaza.notification.id),thread_id:String(unrelated.id)}),/授权范围/);
    db.prepare("UPDATE articles SET status='draft' WHERE id=?").run(article.message.article_id);
    assert.throws(()=>community.readThread(fushi.id,{notification_id:String(article.notification.id),thread_id:String(article.message.id)}),/授权范围/);
});
test('callback verification, encrypted storage, refresh identity and unsubscribe', async () => {
    const item=interaction();
    const params=subscription({arguments:{thread_id:String(item.message.parent_id),kind:'plaza'}});
    const first=await events.subscribe(context,params,{fetch:receiver});
    const second=await events.subscribe(context,{...params,arguments:{kind:'plaza',thread_id:String(item.message.parent_id)}},{fetch:receiver});
    assert.equal(first.id,second.id); assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_subscriptions').get().n,1);
    const row=db.prepare('SELECT * FROM fushi_subscriptions').get(); assert.ok(!row.secret_box.includes(secret));
    assert.equal(hooks.unseal(row.secret_box,row.id),secret);
    assert.ok(!row.callback_box.includes('https:'));
    assert.equal(hooks.unseal(row.callback_box,`${row.id}:callback`),params.delivery.url);
    events.unsubscribe(context,{...params,delivery:{mode:'webhook',url:params.delivery.url}});
    events.unsubscribe(context,{...params,delivery:{mode:'webhook',url:params.delivery.url}});
    assert.equal(db.prepare('SELECT active FROM fushi_subscriptions').get().active,0);
});
test('bad signature and callback timeout never activate subscriptions', async () => {
    invalidSignature=true;
    const bad=await rpc('events/subscribe',subscription());
    assert.equal(bad.data.error.code,-32015); assert.equal(bad.data.error.data.reason,'challenge_failed');
    assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_subscriptions').get().n,0);
    invalidSignature=false; timeout=true;
    const timed=await rpc('events/subscribe',subscription());
    assert.equal(timed.data.error.data.reason,'timeout');
});
test('Standard Webhooks detects payload tampering and authenticates the secret envelope', async () => {
    const stamp=Math.floor(Date.now()/1000).toString(),body='{"fixture":true}',messageId='evt_fixture';
    const signed=hooks.signature(secret,messageId,stamp,body);
    const expected=crypto.createHmac('sha256',Buffer.alloc(32,3)).update(`${messageId}.${stamp}.${body}`).digest('base64');
    assert.equal(signed,`v1,${expected}`);
    assert.notEqual(signed,hooks.signature(secret,messageId,stamp,body+' '));
    assert.throws(()=>hooks.signingKey('whsec_YQ=='));
    const box=hooks.seal(secret,'sub_fixture'); assert.throws(()=>hooks.unseal(box,'different_owner'));
});
test('SSRF blocks private, mapped IPv6, mixed DNS answers and redirects are prohibited', async () => {
    for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','fc00::1','::ffff:127.0.0.1']) assert.equal(outbound.isPrivateAddress(ip),true);
    assert.throws(()=>hooks.validateCallback('http://public.example.test/hook'));
    assert.throws(()=>hooks.validateCallback('https://user:password@public.example.test/hook'));
    const dns=require('node:dns').promises, original=dns.lookup;
    try {
        dns.lookup=async()=>[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}];
        await assert.rejects(()=>outbound.resolvePublicUrl('https://rebind.example.test'),/禁止访问/);
        dns.lookup=async()=>[{address:'93.184.216.34',family:4}];
        const resolved=await outbound.resolvePublicUrl('https://rebind.example.test');
        dns.lookup=async()=>[{address:'127.0.0.1',family:4}];
        await new Promise((resolve,reject)=>outbound.pinnedLookup(resolved.records)('rebind.example.test',{},(e,address)=>{if(e)reject(e);else{assert.equal(address,'93.184.216.34');resolve();}}));
        await assert.rejects(()=>outbound.resolvePublicUrl('https://rebind.example.test'),/禁止访问/);
    } finally {dns.lookup=original;}
});
test('event retries retain identity and occurrence time, with fresh signing timestamp', async () => {
    await events.subscribe(context,subscription(),{fetch:receiver}); const item=interaction();
    const now=Date.now(); responseStatus=500;
    await events.drain({fetch:receiver,now}); assert.equal(deliveries.length,1);
    const failed=db.prepare('SELECT * FROM fushi_deliveries').get(); assert.equal(failed.status,'pending'); assert.equal(failed.attempts,1);
    await events.drain({fetch:receiver,now:now+1000}); assert.equal(deliveries.length,1);
    responseStatus=200; await events.drain({fetch:receiver,now:now+31000});
    assert.equal(deliveries.length,2); assert.equal(deliveries[0].payload.eventId,deliveries[1].payload.eventId);
    assert.equal(deliveries[0].payload.timestamp,deliveries[1].payload.timestamp);
    assert.notEqual(deliveries[0].headers['webhook-timestamp'],deliveries[1].headers['webhook-timestamp']);
    assert.equal(deliveries[1].payload.data.content_id,String(item.message.id));
    assert.equal(Object.hasOwn(deliveries[1].payload.data,'content'),false);
    assert.equal(db.prepare('SELECT received_at FROM fushi_deliveries').get().received_at,now+31000);
    assert.equal(community.listNotifications(fushi.id).items[0].processed,false);
});
test('out of order acceptance never advances cursor past an earlier pending event', async () => {
    const sub=await events.subscribe(context,subscription(),{fetch:receiver});
    interaction(); interaction(); const now=Date.now();
    let count=0;
    const outOfOrder=async(url,opts)=>{responseStatus=++count===1?500:200;return receiver(url,opts);};
    await events.drain({fetch:outOfOrder,now});
    const row=db.prepare('SELECT * FROM fushi_subscriptions WHERE id=?').get(sub.id);
    const pending=db.prepare("SELECT * FROM fushi_deliveries WHERE status='pending'").get();
    assert.ok(events.parseCursor(events.watermark(row))<pending.event_seq);
    assert.ok(events.parseCursor(deliveries[1].payload.cursor)<pending.event_seq);
});
test('restart/lease recovery resends persisted event and preserves same ID', async () => {
    await events.subscribe(context,subscription(),{fetch:receiver}); interaction(); const now=Date.now();
    await events.drain({fetch:receiver,now}); const first=deliveries[0].payload.eventId;
    db.prepare("UPDATE fushi_deliveries SET status='inflight',lease_until=?,next_attempt=?,received_at=NULL").run(now-1,now);
    const output=require('node:child_process').execFileSync(process.execPath,['-e',`
        const outgoing=[];
        require('./backend/services/outbound-url-security').fetchPinnedUrl=async(url,opts)=>{
            outgoing.push(JSON.parse(opts.body).eventId); return new Response('{}',{status:200});
        };
        require('./backend/services/fushi-events').drain().then(()=>{console.log(JSON.stringify(outgoing));require('./backend/db').close();});
    `],{cwd:path.resolve(__dirname,'..'),env:process.env,encoding:'utf8',timeout:15000});
    assert.equal(JSON.parse(output)[0],first); assert.equal(db.prepare('SELECT status FROM fushi_deliveries').get().status,'accepted');
});
test('expired subscription stops delivery; cursor refresh catches up across interruption', async () => {
    const sub=await events.subscribe(context,subscription({ttlMs:60000}),{fetch:receiver});
    const now=Date.now(); interaction(); await events.drain({fetch:receiver,now:now+61000});
    assert.equal(deliveries.length,0); assert.equal(db.prepare('SELECT active FROM fushi_subscriptions').get().active,0);
    interaction();
    await events.subscribe(context,subscription({cursor:sub.cursor}),{fetch:receiver,now:now+62000});
    await events.drain({fetch:receiver,now:now+62000}); assert.equal(deliveries.length,2);
});
test('revoked access, password changes, unpublished content stop delivery', async () => {
    await events.subscribe(context,subscription(),{fetch:receiver}); interaction();
    auth.revokeGrant(context.grant.id); await events.drain({fetch:receiver}); assert.equal(deliveries.length,0);
    const next=grant(); await events.subscribe(next.context,subscription(),{fetch:receiver}); interaction();
    const original=fushi.password_hash;
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run('fixture-changed',fushi.id);
    await events.drain({fetch:receiver}); assert.equal(deliveries.length,0); assert.equal(auth.authenticate(next.tokens.access_token),null);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(original,fushi.id);
});
test('410 and 413 are terminal and not retried', async () => {
    for(const status of [410,413]) {
        const url=`https://receiver.example.test/callback-${status}`;
        await events.subscribe(context,subscription({delivery:{mode:'webhook',url,secret}}),{fetch:receiver}); interaction();
        responseStatus=status; await events.drain({fetch:receiver});
        assert.ok(db.prepare("SELECT * FROM fushi_deliveries WHERE status='dead'").get());
    }
    const before=deliveries.length; await events.drain({fetch:receiver,now:Date.now()+10*60000}); assert.equal(deliveries.length,before);
});
test('finite retry cap produces a dead letter', async () => {
    await events.subscribe(context,subscription(),{fetch:receiver}); interaction();responseStatus=503;
    const now=Date.now(); for(let attempt=0;attempt<8;attempt++) await events.drain({fetch:receiver,now:now+attempt*3600000});
    assert.equal(db.prepare('SELECT status,attempts FROM fushi_deliveries').get().status,'dead');
    assert.equal(db.prepare('SELECT attempts FROM fushi_deliveries').get().attempts,6);
});
test('reply persistence + lost response + duplicate/event retries publish exactly once', async () => {
    const item=interaction();const args=replyArgs(item);
    const first=community.reply(fushi,args); // response intentionally discarded by the simulated client
    assert.equal(community.result(fushi.id,args.idempotency_key).message_id,first.message_id);
    const duplicate=await rpc('tools/call',{name:'fushi_reply',arguments:args});
    assert.equal(duplicate.data.result.structuredContent.message_id,first.message_id);
    const otherKey=community.reply(fushi,{...args,idempotency_key:'fixture_reply_key_0002'});
    assert.equal(otherKey.message_id,first.message_id);assert.equal(otherKey.already_processed,true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_reply_submissions').get().n,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM messages WHERE user_id=? AND parent_id IS NOT NULL').get(fushi.id).n,1);
    assert.equal(community.listNotifications(fushi.id).items[0].processed,true);
});
test('idempotency conflicts, account spoofing, unauthorized reads/replies and self replies fail', async () => {
    const item=interaction(),args=replyArgs(item);community.reply(fushi,args);
    assert.throws(()=>community.reply(fushi,{...args,content:'different'}),/幂等键/);
    const extra=await rpc('tools/call',{name:'fushi_reply',arguments:{...args,user_id:actor.id}});
    assert.equal(extra.data.error.code,-32602);
    const root=commitMessage({userId:other.id,author:other.username,content:'unrelated',status:'approved'},other);
    assert.throws(()=>community.reply(fushi,{...args,idempotency_key:'fixture_other_key_0001',target_id:String(root.id)}),/授权范围/);
    assert.throws(()=>community.reply(fushi,{...args,idempotency_key:'fixture_self_key_0001',target_id:String(item.message.parent_id)}),/授权范围/);
    assert.deepEqual(community.result(actor.id,args.idempotency_key),{status:'not_found',idempotency_key:args.idempotency_key});
});
test('assistant replies use ordinary moderation and never create a self-trigger event', () => {
    const item=interaction();const initial=db.prepare('SELECT count(*) AS n FROM fushi_events').get().n;
    const pending=community.reply(fushi,replyArgs(item,{content:'关于诈骗的讨论'}));
    assert.equal(pending.status,'pending_review');assert.ok(pending.moderation.reasons.length);
    assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_events').get().n,initial);
    approveAndNotify(Number(pending.message_id));
    assert.equal(community.result(fushi.id,pending.idempotency_key).status,'published');
    assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_events').get().n,initial);
});
test('scope filtering and payload limits reject privilege expansion', async () => {
    const readOnly=grant('fushi:read'); bearer=readOnly.tokens.access_token;
    assert.equal((await rpc('tools/list')).data.result.tools.length,3);
    assert.equal((await rpc('events/list')).data.error.code,-32602);
    const item=interaction(); assert.equal((await rpc('tools/call',{name:'fushi_reply',arguments:replyArgs(item)})).data.error.code,-32602);
    assert.throws(()=>auth.issueCode(fushi.id,requestParams({scope:'admin'})),/invalid_scope/);
    const huge=await call('/api/fushi/mcp',{method:'POST',token:bearer,body:{x:'a'.repeat(17000)}});assert.equal(huge.status,413);
});
test('retention reports truncation and permanent idempotency prevents delayed reposts', async () => {
    const item=interaction(),args=replyArgs(item);community.reply(fushi,args);
    const seq=db.prepare('SELECT seq FROM fushi_events').get().seq;
    db.prepare('UPDATE fushi_events SET occurred_at=?').run(Date.now()-31*86400000);
    events.cleanup();assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_events').get().n,0);
    const replay=await events.subscribe(context,subscription({cursor:'f1.0'}),{fetch:receiver});assert.equal(replay.truncated,true);
    assert.equal(events.parseCursor(replay.cursor),seq);
    assert.equal(community.listNotifications(fushi.id).items[0].processed,true);
    assert.equal(community.reply(fushi,{...args,idempotency_key:'fixture_delayed_key_0001'}).already_processed,true);
});
test('event filters exclude unmatched content and malformed signing keys', async () => {
    await events.subscribe(context,subscription({arguments:{kind:'article'}}),{fetch:receiver});
    interaction();interaction({article:true});await events.drain({fetch:receiver});
    assert.equal(deliveries.length,1);assert.equal(deliveries[0].payload.data.kind,'article');
    await assert.rejects(()=>events.subscribe(context,subscription({delivery:{mode:'webhook',url:'https://receiver.example.test/other',secret:'whsec_YQ=='}}),{fetch:receiver}));
});
test('disabled feature is inert and never enqueues or exposes interfaces', async () => {
    process.env.FUSHI_ENABLED='false';interaction();
    assert.equal(db.prepare('SELECT count(*) AS n FROM fushi_events').get().n,0);
    assert.equal((await rpc('server/discover')).status,404);
    assert.equal((await call('/.well-known/oauth-authorization-server')).status,404);
});

test('verification cache is owner/URL scoped and never extends beyond the last challenge', async () => {
    const now=Date.now();
    await events.subscribe(context,subscription(),{fetch:receiver,now});
    await events.subscribe(context,subscription({arguments:{kind:'plaza'}}),{fetch:receiver,now:now+4*60000});
    assert.equal(verifications,1);
    await events.subscribe(context,subscription(),{fetch:receiver,now:now+6*60000});
    assert.equal(verifications,2);
});
test('signing key refresh verifies the new key, signs with both keys briefly, then retires old key', async () => {
    const first=await events.subscribe(context,subscription(),{fetch:receiver});
    const now=Date.now(), replacement=`whsec_${Buffer.alloc(32,4).toString('base64')}`;
    const rotatingReceiver=async(url,opts)=>{
        const h=opts.headers, payload=JSON.parse(opts.body);
        const expected=crypto.createHmac('sha256',Buffer.alloc(32,4)).update(`${h['webhook-id']}.${h['webhook-timestamp']}.${opts.body}`).digest('base64');
        assert.ok(h['webhook-signature'].split(' ').includes(`v1,${expected}`));
        if(payload.type==='verification')return new Response(JSON.stringify({challenge:payload.challenge}));
        deliveries.push({payload,headers:h});return new Response('{}');
    };
    const renewed=await events.subscribe(context,subscription({delivery:{mode:'webhook',url:subscription().delivery.url,secret:replacement}}),{fetch:rotatingReceiver,now});
    assert.equal(renewed.id,first.id); interaction();await events.drain({fetch:rotatingReceiver,now});
    assert.equal(deliveries[0].headers['webhook-signature'].split(' ').length,2);
    interaction();await events.drain({fetch:rotatingReceiver,now:now+6*60000});
    assert.equal(deliveries[1].headers['webhook-signature'].split(' ').length,1);
    assert.equal(db.prepare('SELECT previous_secret_box FROM fushi_subscriptions').get().previous_secret_box,null);
});
test('requested subscription lifetimes are finite and unsubscribe survives withdrawn content', async () => {
    const item=interaction(),now=Date.now();
    const params=subscription({arguments:{thread_id:String(item.message.parent_id)},ttlMs:120000});
    const first=await events.subscribe(context,params,{fetch:receiver,now});
    assert.equal(Date.parse(first.refreshBefore),now+120000);
    const indefinite=await events.subscribe(context,{...params,ttlMs:null},{fetch:receiver,now});
    assert.equal(Date.parse(indefinite.refreshBefore),now+86400000);
    db.prepare("UPDATE messages SET status='pending' WHERE id=?").run(item.message.parent_id);
    events.unsubscribe(context,params);await events.drain({fetch:receiver});
    assert.equal(deliveries.length,0);
});
test('thread pagination includes legacy nested replies and ignores pending content', () => {
    const item=interaction();
    const child=commitMessage({userId:fushi.id,author:fushi.username,content:'nested',status:'approved',parentId:item.message.id,
        replyToId:item.message.id,replyToAuthor:actor.username},fushi);
    commitMessage({userId:actor.id,author:actor.username,content:'pending',status:'pending',parentId:child.id},actor);
    const args={notification_id:String(item.notification.id),thread_id:String(item.message.parent_id),limit:1};
    let cursor='0',ids=[];
    for(let page=0;page<5;page++){
        const result=community.readThread(fushi.id,{...args,cursor});ids.push(...result.items.map(m=>m.id));
        if(!result.next_cursor)break;cursor=result.next_cursor;
    }
    assert.deepEqual(ids,[String(item.message.parent_id),String(item.message.id),String(child.id)]);
});
test('public client token exchange works without cookies and consent retains existing CSRF protection', async () => {
    const params=requestParams();
    const code=new URL(auth.issueCode(fushi.id,params).redirect).searchParams.get('code');
    const issued=await call('/fushi/oauth/token',{method:'POST',body:{grant_type:'authorization_code',client_id:params.client_id,
        redirect_uri:params.redirect_uri,resource:params.resource,code,code_verifier:'v'.repeat(48)}});
    assert.equal(issued.status,200); assert.ok(auth.authenticate(issued.data.access_token));
    const loginCookie=`tsukuyomi_session=${generateToken({id:fushi.id})}`;
    const csrf=await call('/api/fushi/oauth/authorize',{method:'POST',body:params,headers:{Cookie:loginCookie,Origin:'https://evil.example.test'}});
    assert.equal(csrf.status,403);
    const trusted=await call('/api/fushi/oauth/authorize',{method:'POST',body:params,headers:{Cookie:loginCookie,Origin:base,'X-Requested-With':'XMLHttpRequest'}});
    assert.equal(trusted.status,200);
    assert.equal((await call('/api/messages/1',{method:'DELETE',token:issued.data.access_token})).status,403);
});
test('unpublished article is rechecked just before delivery, and unsigned receiver challenge is rejected', async () => {
    await events.subscribe(context,subscription(),{fetch:receiver});const item=interaction({article:true});
    db.prepare("UPDATE articles SET status='draft' WHERE id=?").run(item.message.article_id);
    await events.drain({fetch:receiver});assert.equal(deliveries.length,0);
    const wrongEcho=async()=>new Response(JSON.stringify({challenge:'wrong'}));
    await assert.rejects(()=>events.subscribe(context,subscription({delivery:{mode:'webhook',url:'https://receiver.example.test/other',secret}}),{fetch:wrongEcho}),e=>e.rpcCode===-32015);
});
test('replay is bounded in batches and concurrent workers cannot claim a delivery twice', async () => {
    await events.subscribe(context,subscription(),{fetch:receiver});
    for(let i=0;i<105;i++)interaction();
    await Promise.all([events.drain({fetch:receiver,batch:1}),events.drain({fetch:receiver,batch:1})]);
    const ids=deliveries.map(d=>d.payload.eventId);assert.equal(new Set(ids).size,ids.length);
    assert.ok(db.prepare('SELECT count(*) AS n FROM fushi_deliveries').get().n<=105);
    assert.ok(db.prepare("SELECT count(*) AS n FROM fushi_deliveries WHERE status='pending'").get().n>=100);
});

test('malformed and duplicate JSON produce protocol errors without exposing input', async () => {
    for (const [body, code] of [['{"fixture":', -32700], ['{"jsonrpc":"2.0","id":1,"id":2}', -32600]]) {
        const response=await fetch(`${base}/api/fushi/mcp`,{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body});
        assert.equal(response.status,400); const data=await response.json();
        assert.equal(data.error.code,code); assert.equal(data.id,null);
        assert.equal(JSON.stringify(data).includes('fixture'),false);
    }
    const metadata=await call('/.well-known/oauth-protected-resource/api/fushi/mcp');
    assert.equal(metadata.data.resource,requestParams().resource);
});
test('Fushi can subscribe to its public thread before the first notification', async () => {
    const root=commitMessage({userId:fushi.id,author:fushi.username,content:'new public thread',status:'approved'},fushi);
    const params=subscription({arguments:{thread_id:String(root.id)}});
    await events.subscribe(context,params,{fetch:receiver});
    submitReply({user:actor,targetId:root.id,content:'公开回复'});
    await events.drain({fetch:receiver});
    assert.equal(deliveries.length,1); assert.equal(deliveries[0].payload.data.thread_id,String(root.id));
});
test('callback deadline includes stalled DNS resolution, not just a connected socket', async () => {
    let signal;
    await assert.rejects(()=>hooks.postSigned({id:'fixture',url:'https://receiver.example.test/callback',secret},'fixture-event',{},
        {timeoutMs:20,fetch:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}}),e=>e.name==='TimeoutError');
    assert.equal(signal.aborted,true);
});
