const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'play-invitations-'));
Object.assign(process.env,{ NODE_ENV:'test', DATA_DIR:dataDir, DB_PATH:path.join(dataDir,'test.db'), JWT_SECRET:'play-invitation-test-secret-at-least-32-characters', ADMIN_USERNAME:'admin', ADMIN_PASSWORD:'admin-test-password', SMTP_USER:'sender@example.test', SMTP_PASS:'fixture-only', REDIS_URL:'' });
const mailer = require('../backend/services/mailer');
const deliveries=[]; let transport=async email=>deliveries.push(email);
mailer.sendPlayTestInvitation=async email=>transport(email);
const {createApp}=require('../backend/app'),db=require('../backend/db'),config=require('../backend/config');
const {generateToken}=require('../backend/middleware/auth');
const content=require('../backend/services/play-test-invitation-content');
const invitations=require('../backend/services/play-test-invitations');
const PostalMime=require('postal-mime');
let server,base,admin,user,staff,seq=0;
function applicant(id,status='pending') {
 const now=new Date().toISOString();
 db.prepare('INSERT INTO play_test_applications(id,email,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id+'@example.test',status,'2026-10-23',now,now);
 return id;
}
async function api(id,suffix,body,token=admin,options={}) {
 const response=await fetch(`${base}/api/admin/play-testing/${id}/${suffix}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Requested-With':'XMLHttpRequest','X-Real-IP':`2001:db8::${++seq}`,...(token?{Authorization:'Bearer '+token}:{}),...options},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,...await response.json()};
}
const payload=p=>({confirmation:'SEND_PLAY_INVITATION',confirmTesterAdded:true,email:p.email,version:p.version,attemptId:p.attemptId,previousAttemptId:p.previousAttemptId});
before(async()=>{
 server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
 const a=db.prepare("SELECT * FROM admins WHERE role='super_admin'").get();admin=generateToken({scope:'admin',adminId:a.id,role:a.role});
 db.prepare("INSERT INTO users(id,username,email,password_hash,role) VALUES('reader','reader','reader@example.test','fixture','user')").run();user=generateToken({id:'reader',role:'user'});
 const s=db.prepare("INSERT INTO admins(username,password_hash,role) VALUES('staff','fixture','admin')").run();staff=generateToken({scope:'admin',adminId:Number(s.lastInsertRowid),role:'admin'});
});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dataDir,{recursive:true,force:true});});
test('private preview displays exact internal link and recipient without sending or modifying legacy records',async()=>{
 const id=applicant('legacy','invited');
 for(const token of [null,user,staff]) assert.equal((await api(id,'invitation-preview',undefined,token)).status,token?403:401);
 const p=await api(id,'invitation-preview');assert.equal(p.status,200);assert.equal(p.data.email,'legacy@example.test');assert.equal(p.data.delivery,null);
 assert.equal(p.data.subject,mailer.renderPlayTestInvitation().subject);
 assert.equal(p.data.actionUrl,'https://play.google.com/apps/internaltest/4701667283312409674');assert.match(p.data.body,/不计入.*连续 14 天/);
 assert.match(p.data.html,/sakura|data:image/);assert.equal(deliveries.length,0);assert.equal(db.prepare('SELECT count(*) n FROM play_test_invitations').get().n,0);
});
test('confirmation, current content, recipient, credentials and CSRF are required',async()=>{
 const id=applicant('validation'),p=(await api(id,'invitation-preview')).data;
 for(const change of [{confirmation:''},{confirmTesterAdded:false},{version:'old'},{email:'other@example.test'},{attemptId:'bad'}]) assert.ok([409,422].includes((await api(id,'invite',{...payload(p),...change})).status));
 assert.equal((await api(id,'invite',payload(p),null,{Origin:'https://evil.test','Sec-Fetch-Site':'cross-site',Cookie:'tsukuyomi_admin_session='+admin})).status,403);
 assert.equal((await api(id,'invite',payload(p),user)).status,403);
 const pass=config.smtp.pass;config.smtp.pass='';assert.equal((await api(id,'invite',payload(p))).status,503);config.smtp.pass=pass;
 assert.equal(invitations.state(id),null);assert.equal(deliveries.length,0);
});
test('one SMTP acceptance records sent and marks invited; retries and separate previews cannot duplicate it',async()=>{
 const id=applicant('once'),p=(await api(id,'invitation-preview')).data;
 const result=await api(id,'invite',{...payload(p),actionUrl:'https://evil.test',body:'not reviewed'});
 assert.equal(result.status,200);assert.equal(result.data.delivery.status,'sent');assert.equal(db.prepare('SELECT status FROM play_test_applications WHERE id=?').get(id).status,'invited');
 assert.deepEqual(deliveries,['once@example.test']);
 assert.equal((await api(id,'invite',payload(p))).data.alreadySent,true);
 const fresh=(await api(id,'invitation-preview')).data;assert.equal((await api(id,'invite',payload(fresh))).data.alreadySent,true);assert.equal(deliveries.length,1);
 const persisted=new (require('better-sqlite3'))(config.dbPath,{readonly:true});assert.equal(persisted.prepare('SELECT status FROM play_test_invitations WHERE application_id=?').get(id).status,'sent');persisted.close();
});
test('legacy manual registration can send exactly one invitation when explicitly requested',async()=>{
 const p=(await api('legacy','invitation-preview')).data;assert.equal((await api('legacy','invite',payload(p))).data.delivery.status,'sent');assert.equal(deliveries.filter(x=>x==='legacy@example.test').length,1);
});
test('concurrent clicks claim one delivery and block deletion while SMTP is active',async()=>{
 const id=applicant('parallel'),p=(await api(id,'invitation-preview')).data;
 let release,started;const ready=new Promise(r=>started=r);transport=async email=>{assert.equal(db.inTransaction,false);deliveries.push(email);started();await new Promise(r=>release=r)};
 const first=api(id,'invite',payload(p));await ready;
 assert.equal((await api(id,'invite',payload(p))).status,409);
 assert.throws(()=>require('../backend/services/play-testing').remove(id,{confirmation:'DELETE_APPLICATION'}),/正在发送/);
 release();assert.equal((await first).data.delivery.status,'sent');assert.equal(deliveries.filter(x=>x==='parallel@example.test').length,1);transport=async email=>deliveries.push(email);
});
test('SMTP rejection keeps pending and retries require a new preview; diagnostics do not leak',async()=>{
 const id=applicant('reject'),p=(await api(id,'invitation-preview')).data;
 transport=async()=>{throw Error('SMTP 550: private credentials and diagnostic')};
 const r=await api(id,'invite',payload(p));assert.equal(r.data.delivery.status,'failed');assert.doesNotMatch(JSON.stringify(r),/private credentials/);assert.equal(db.prepare('SELECT status FROM play_test_applications WHERE id=?').get(id).status,'pending');
 assert.equal((await api(id,'invite',payload(p))).status,409);
 transport=async email=>deliveries.push(email);const next=(await api(id,'invitation-preview')).data;
 assert.equal((await api(id,'invite',payload(next))).data.delivery.status,'sent');
 assert.equal(db.prepare('SELECT count(*) n FROM play_test_invitations WHERE application_id=?').get(id).n,2);
});
test('unknown outcome and stale in-flight delivery never auto-resend or falsely mark invited',async()=>{
 const id=applicant('uncertain'),p=(await api(id,'invitation-preview')).data;
 transport=async()=>{throw Error('socket closed; private diagnostic')};
 assert.equal((await api(id,'invite',payload(p))).data.delivery.status,'unknown');
 transport=async email=>deliveries.push(email);const next=(await api(id,'invitation-preview')).data;assert.equal((await api(id,'invite',payload(next))).status,409);
 assert.equal(db.prepare('SELECT status FROM play_test_applications WHERE id=?').get(id).status,'pending');
 db.prepare("UPDATE play_test_invitations SET status='sending',updated_at=? WHERE application_id=?").run(Date.now()-6*60000,id);
 assert.equal(invitations.state(id).status,'unknown');assert.equal(deliveries.filter(x=>x==='uncertain@example.test').length,0);
});
test('MIME retains branded artwork, actual Google CTA and one private recipient',async()=>{
 const mime=mailer.buildPlayTestInvitationMessage({fromName:'月读空间',fromEmail:'sender@example.test',toEmail:'recipient@example.test'});
 const parsed=await PostalMime.parse(mime);assert.equal(parsed.subject,'【月读空间】'+content.subject);assert.equal(parsed.to.length,1);assert.equal(parsed.to[0].address,'recipient@example.test');
 assert.ok(parsed.text.includes(content.actionUrl));assert.ok(parsed.html.includes('href="'+content.actionUrl+'"'));assert.equal(parsed.attachments.length,2);assert.doesNotMatch(mime,/^Bcc:/m);
 assert.match(parsed.text,/不计入.*连续 14 天/);assert.ok(Buffer.byteLength(mime)<100*1024);
 const general=mailer.renderCampaignEmail({subject:'general',body:'body',actionUrl:content.actionUrl});assert.ok(!general.html.includes('href="'+content.actionUrl+'"'),'general campaign URL protection remains');
});
