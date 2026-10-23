const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const PostalMime = require('postal-mime');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsu-mail-campaign-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir,'test.db'), JWT_SECRET: 'campaign-test-secret-with-at-least-32-characters', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'campaign-admin-password', ENABLE_FRONTEND_DIST: 'false', REDIS_URL: '', SMTP_USER: 'sender@example.test', SMTP_PASS: 'fixture-only' });
const mailer = require('../backend/services/mailer');
mailer.sendCampaignEmail = async () => { throw new Error('A test must inject its mail transport'); };
const { createApp } = require('../backend/app');
const db = require('../backend/db'), campaigns = require('../backend/services/mail-campaigns'), config = require('../backend/config');
const { generateToken } = require('../backend/middleware/auth');
let server, base, adminCookie, staffCookie, creator;
const sent = [];
const send = async (to, campaign) => sent.push({ to, campaign });
const draft = (audience = { mode: 'selected', userIds: ['mail-user-1'] }, extra = {}) => ({ id: crypto.randomUUID(), subject: '月读空间更新', body: '第一段\n\n第二段 <script> & 特殊文字', actionUrl: '/stage', actionLabel: '看看新内容', audience, ...extra });
async function call(pathname, { method='GET', body, cookie=adminCookie, token, origin=base } = {}) {
    const response = await fetch(base+pathname, { method, headers: { 'Content-Type':'application/json', Origin:origin, 'X-Requested-With':'XMLHttpRequest', ...(cookie ? { Cookie:cookie } : {}), ...(token ? { Authorization:`Bearer ${token}` } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) });
    return { status:response.status, body:await response.json(), response };
}
const api = (suffix='', options) => call('/api/admin/mail-campaigns'+suffix, options);
function createUser(id,email,role='user') { db.prepare('INSERT INTO users(id,username,nickname,email,password_hash,role) VALUES(?,?,?,?,?,?)').run(id,id,'月下 '+id,email,'fixture',role); }
before(async () => {
    server = createApp().listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    db.prepare('INSERT INTO admins(username,password_hash,role) VALUES(?,?,?)').run('staff',bcrypt.hashSync('campaign-staff-password',4),'admin');
    for (const [username,password] of [['admin','campaign-admin-password'],['staff','campaign-staff-password']]) {
        const result = await call('/api/admin/login',{method:'POST',body:{username,password},cookie:''});
        assert.equal(result.status,200);
        const cookie = result.response.headers.getSetCookie().find(value=>value.startsWith('tsukuyomi_admin_session=')).split(';')[0];
        if (username==='admin') { adminCookie=cookie; creator=`admin-${result.body.data.admin.id}`; } else staffCookie=cookie;
    }
    for (let i=1;i<=12;i++) createUser(`mail-user-${i}`,`reader${i}@example.test`,i===12?'admin':'user');
    createUser('placeholder-oauth','hidden@oauth.yachiyo.local');
    createUser('placeholder-admin','hidden@admin.yachiyo.local');
    createUser('invalid-address','not-an-email');
    createUser('duplicate-address','READER1@example.test');
});
after(async () => { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); db.close(); fs.rmSync(dataDir,{recursive:true,force:true}); });

test('only a super administrator can read recipients, preview or send',async () => {
    assert.equal((await api('',{cookie:''})).status,401);
    for (const cookie of [staffCookie,'']) {
        const token = cookie ? undefined : generateToken({id:'mail-user-1',username:'mail-user-1',role:'user'});
        for (const [suffix,method,body] of [['','GET'],['/recipients','GET'],['/preview','POST',draft()],['/missing/send','POST',{}]]) assert.equal((await api(suffix,{cookie,token,method,body})).status,403);
    }
    assert.equal((await api('/preview',{method:'POST',body:draft(),origin:'https://unrelated.example'})).status,403);
});
test('recipients support keyword, role and pagination without placeholder addresses',async () => {
    const first = await api('/recipients?search=mail-user-&role=user&page=1');
    assert.equal(first.status,200); assert.equal(first.body.data.total,11); assert.equal(first.body.data.items.length,8);
    assert.equal((await api('/recipients?search=mail-user-&role=user&page=2')).body.data.items.length,3);
    assert.equal((await api('/recipients?search=reader12%40example.test&role=admin')).body.data.total,1);
    assert.equal((await api('/recipients?search=hidden')).body.data.total,0);
    assert.equal((await api('/recipients?search=not-an-email')).body.data.total,0);
    assert.equal((await api('/recipients?role=super_admin')).status,400);
});
test('preview fixes the recipient snapshot, escapes content and never sends',async () => {
    const before=sent.length, input=draft({mode:'filtered',search:'mail-user-',role:'user'});
    const result=await api('/preview',{method:'POST',body:input});
    assert.equal(result.status,200); assert.equal(result.body.data.campaign.total,11); assert.equal(result.body.data.campaign.status,'draft');
    assert.match(result.body.data.html,/data:image\/png;base64,/); assert.match(result.body.data.html,/&lt;script&gt;/); assert.doesNotMatch(result.body.data.html,/<script>/);
    assert.equal(sent.length,before); assert.equal(await campaigns.runOnce({send}),false);
    createUser('mail-user-new','new-reader@example.test');
    const replay=await api('/preview',{method:'POST',body:input});
    assert.equal(replay.body.data.campaign.total,11,'new user must not enter an already reviewed batch');
    assert.equal((await api('/preview',{method:'POST',body:{...input,subject:'changed'}})).status,409);
});
test('single-recipient send is idempotent and preserves the reviewed content',async () => {
    const input=draft();
    await api('/preview',{method:'POST',body:input});
    for(let i=0;i<2;i++) assert.equal((await api(`/${input.id}/send`,{method:'POST',body:{subject:'unreviewed',userIds:['mail-user-2']}})).status,200);
    const before=sent.length;
    assert.equal(await campaigns.runOnce({send}),true);
    assert.equal(sent.length-before,1); assert.equal(sent.at(-1).to,'reader1@example.test'); assert.equal(sent.at(-1).campaign.subject,input.subject);
    assert.equal(campaigns.getCampaign(input.id).counts.sent,1);
    await api(`/${input.id}/send`,{method:'POST',body:{}});
    assert.equal(await campaigns.runOnce({send}),false);
});
test('selected duplicate emails are deduplicated and placeholders excluded',async () => {
    const input=draft({mode:'selected',userIds:['mail-user-1','duplicate-address','placeholder-oauth','placeholder-admin','invalid-address']});
    const result=await api('/preview',{method:'POST',body:input});
    assert.equal(result.body.data.campaign.total,1);
    assert.equal((await api('/preview',{method:'POST',body:draft({mode:'selected',userIds:['placeholder-oauth']})})).status,400);
});
test('invalid content and external/action script URLs cannot create a batch',async () => {
    for(const extra of [{subject:''},{subject:'hello\nBcc: attacker@example.test'},{body:'x'.repeat(10001)},{actionUrl:'javascript:alert(1)'},{actionUrl:'https://other.example/path'},{actionUrl:'https://user:pass@yachiyo.hk/stage'}]) assert.equal((await api('/preview',{method:'POST',body:draft(undefined,extra)})).status,400);
});
test('mail configuration, ownership and preview expiry are checked when sending',async () => {
    const input=draft(); campaigns.prepare(creator,input);
    const pass=config.smtp.pass;
    try { config.smtp.pass=''; assert.equal((await api(`/${input.id}/send`,{method:'POST',body:{}})).status,503); }
    finally { config.smtp.pass=pass; }
    assert.throws(()=>campaigns.enqueue(input.id,'other-admin'),/只能操作本人/);
    db.prepare('UPDATE mail_campaigns SET created_at=? WHERE id=?').run(Date.now()-31*60000,input.id);
    assert.equal((await api(`/${input.id}/send`,{method:'POST',body:{}})).status,409);
    assert.equal(campaigns.getCampaign(input.id).status,'draft');
});
test('concurrent workers claim different recipients, without holding a transaction during SMTP',async () => {
    const input=draft({mode:'selected',userIds:['mail-user-2','mail-user-3']}); campaigns.prepare(creator,input); campaigns.enqueue(input.id,creator);
    const recipients=[];
    await Promise.all([1,2].map(()=>campaigns.runOnce({send:async to=>{assert.equal(db.inTransaction,false);recipients.push(to);await new Promise(resolve=>setTimeout(resolve,5));}})));
    assert.equal(new Set(recipients).size,2); assert.equal(campaigns.getCampaign(input.id).counts.sent,2); assert.equal(campaigns.getCampaign(input.id).status,'completed');
});
test('deleted or changed addresses are skipped before dispatch',async () => {
    const input=draft({mode:'selected',userIds:['mail-user-4','mail-user-5']}); campaigns.prepare(creator,input); campaigns.enqueue(input.id,creator);
    db.prepare('DELETE FROM users WHERE id=?').run('mail-user-4'); db.prepare('UPDATE users SET email=? WHERE id=?').run('changed@example.test','mail-user-5');
    const before=sent.length; await campaigns.runOnce({send}); await campaigns.runOnce({send});
    assert.equal(sent.length,before); assert.equal(campaigns.getCampaign(input.id).counts.skipped,2);
});
test('SMTP rejections and uncertain results are recorded separately without secret leakage or retry',async () => {
    const input=draft({mode:'selected',userIds:['mail-user-6','mail-user-7']}); campaigns.prepare(creator,input); campaigns.enqueue(input.id,creator);
    await campaigns.runOnce({send:async()=>{throw new Error('SMTP 550: secret diagnostic');}});
    await campaigns.runOnce({send:async()=>{throw new Error('socket lost secret diagnostic');}});
    const result=campaigns.getCampaign(input.id); assert.equal(result.counts.failed,1); assert.equal(result.counts.unknown,1);
    assert.doesNotMatch(JSON.stringify(campaigns.campaignRecipients(input.id)),/secret diagnostic/);
    assert.equal(await campaigns.runOnce({send}),false);
});
test('a cancelled batch stops pending recipients while the current send finishes',async () => {
    const input=draft({mode:'selected',userIds:['mail-user-8','mail-user-9']}); campaigns.prepare(creator,input); campaigns.enqueue(input.id,creator);
    await campaigns.runOnce({send:async()=>{campaigns.cancel(input.id,creator);}});
    const result=campaigns.getCampaign(input.id); assert.equal(result.status,'cancelled'); assert.equal(result.counts.sent,1); assert.equal(result.counts.cancelled,1);
    assert.equal(await campaigns.runOnce({send}),false);
});
test('an interrupted send is marked uncertain after restart, never automatically duplicated',async () => {
    const input=draft(); campaigns.prepare(creator,input); campaigns.enqueue(input.id,creator);
    db.prepare("UPDATE mail_campaign_recipients SET status='sending',updated_at=? WHERE campaign_id=?").run(Date.now()-6*60000,input.id);
    assert.equal(await campaigns.runOnce({send}),false);
    assert.equal(campaigns.getCampaign(input.id).counts.unknown,1); assert.equal(campaigns.getCampaign(input.id).status,'completed');
});
test('history and per-recipient results survive new reads and omit full mail bodies from list',async () => {
    const list=await api(); assert.equal(list.status,200); assert.equal(list.body.data.configured,true);
    assert.ok(list.body.data.campaigns.length); assert.ok(list.body.data.campaigns.every(row=>!Object.hasOwn(row,'body')));
    const detail=await api('/'+list.body.data.campaigns[0].id); assert.equal(detail.status,200); assert.ok(detail.body.data.recipients.length);
    const reopened=new (require('better-sqlite3'))(config.dbPath,{readonly:true});
    assert.ok(reopened.prepare("SELECT COUNT(*) n FROM mail_campaigns WHERE status!='draft'").get().n); reopened.close();
});
test('custom email uses existing MIME artwork, full text, line breaks and a private single recipient',async () => {
    const campaign={subject:'更新 <测试>',body:'第一段\n\n第二段 & 结束',actionUrl:'/stage',actionLabel:'打开主舞台'};
    const eml=mailer.buildCampaignMessage({fromName:'月读空间',fromEmail:'sender@example.test',toEmail:'reader@example.test',campaign});
    const parsed=await PostalMime.parse(eml);
    assert.equal(parsed.to.length,1); assert.equal(parsed.to[0].address,'reader@example.test'); assert.equal(parsed.subject,'【月读空间】更新 <测试>');
    assert.match(parsed.text,/第一段\n\n第二段 & 结束/); assert.match(parsed.html,/第一段<br><br>第二段 &amp; 结束/);
    assert.equal(parsed.attachments.length,2); assert.match(parsed.html,/sakura-banner-v2@tsukuyomi/); assert.match(parsed.html,/name="color-scheme" content="light only"/);
    assert.ok(Buffer.byteLength(eml)<96*1024); assert.doesNotMatch(eml,/^Bcc:/m);
});
