const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tsu-discovery-'));
Object.assign(process.env,{NODE_ENV:'test',DATA_DIR:directory,DB_PATH:path.join(directory,'test.db'),JWT_SECRET:'discovery-fixture-secret-with-at-least-32-characters',ADMIN_PASSWORD:'fixture-admin-password',ENABLE_FRONTEND_DIST:'false',REDIS_URL:''});
const {createApp}=require('../backend/app');
const db=require('../backend/db');
const {routineReason}=require('../backend/services/article-content-policy');
const metrics=require('../backend/services/article-discovery-metrics');
const {ensureDiscoverySnapshot,invalidateDiscovery}=require('../backend/services/article-discovery');
const {buildDailyOrder}=require('../backend/services/article-recommendations');
const engagement=require('../backend/services/article-engagement');
const growth=require('../backend/services/user-growth');
const repository=require('../backend/repositories/article-repository');
const {generateToken}=require('../backend/middleware/auth');
const now=Date.parse('2026-10-21T12:00:00Z');
let server,base,article;
const prose=Array.from({length:45},(_,i)=>`第${i}步记录独立的创作过程与验证方法，包含问题${i}的解决思路。`).join('\n\n');
before(async()=>{
 server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
 for(const id of ['writer','reader','other'])db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)').run(id,id,id+'@test.invalid','fixture','user');
 article=Number(db.prepare("INSERT INTO articles(title,content,category,author_id,published_at) VALUES('绘画过程',?,'二创','writer','2026-10-01')").run(prose).lastInsertRowid);
});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();fs.rmSync(directory,{recursive:true,force:true});});
function session(user='reader',time=now,items=[{id:article,position:0}]) {
 let cookie='';const req={headers:{'user-agent':'Discovery fixture',cookie:''},user:user?{id:user}:undefined,ip:'192.0.2.1'};
 const res={cookie(name,value){cookie=`${name}=${value}`;}};
 const proof=metrics.issueSession(req,res,items,'stage-featured',time);req.headers.cookie=cookie;
 return {req,proof,cookie};
}
function measure(s,time=now+2000,ids=[article]){s.req.body={token:s.proof.token,ids};return metrics.recordImpressions(s.req,time);}
test('classification recognizes task intent and meaningless placeholders without relabelling works by length alone',()=>{
 for(const [title,content] of [['任务','任务'],['签到~','曼波'],['每日一签','彩辉牛逼'],['每日任务让我发文章','![作品](/a.webp)'],['留一个打卡签到的楼','d13打卡签到'],['新人报道','签到✓'],['可爱的八千代','1'],['无','1. **列表项**'],['ee','ee'],['标题','分享正文']])assert.ok(routineReason({title,content,category:'其他'}),title);
 for(const article of [
  {title:'任务调度系统教程',content:prose},
  {title:'彩叶的AR眼镜能不能在2030年实现啊？',content:'.'},
  {title:'有大佬知道這之後要怎麼用嗎',content:'##',category:'技术'},
  {title:'签到功能开发详解',content:prose},
  {title:'月',content:'夜里仍有微光，照着归来的路。也照见我们没有说出口的话。'},
  {title:'可爱的八千代',content:'![画作](/a.webp)'},
  {title:'短诗',content:'<p>月</p><img src="/a.webp">',content_format:'html'},
  {title:'单字书法',content:JSON.stringify([{type:'paragraph',text:'月'},{type:'image',url:'/a.webp'}]),content_format:'block'},
  {title:'资源',content:'[1](/api/assets/proxy/example)'},
  {title:'每日任务和小游戏记得玩哦~',content:'每日任务和辉夜快跑小游戏大家都可以体验一下哈~ [每日任务](/growth)'}
 ])assert.equal(routineReason(article),'',article.title);
});
test('an impression requires a signed identity-bound receipt, one-second delay, valid article and deduplicates per day',()=>{
 const s=session();assert.equal(measure(s,now).reason,'invalid_session');
 assert.deepEqual(measure(s).counted,[article]);assert.deepEqual(measure(s).counted,[]);
 const forged=session('other');forged.req.headers.cookie=s.cookie;assert.equal(measure(forged).reason,'invalid_session');
 s.req.body={token:s.proof.token+'x',ids:[article]};assert.equal(metrics.recordImpressions(s.req,now+2000).reason,'invalid_session');
 const own=session('writer');assert.deepEqual(measure(own).counted,[]);
 const injected=session('other',now,[{id:article,position:0}]);assert.deepEqual(measure(injected,now+2000,[99999]).counted,[]);
 assert.equal(db.prepare('SELECT SUM(impressions) n FROM article_discovery_daily WHERE article_id=?').get(article).n,1);
});
test('qualified reads and endorsements are attributable only after a real impression and do not duplicate XP',()=>{
 const s=session('reader');measure(s);
 const start=engagement.beginRead(s.req,{cookie(){}},article,now);
 s.req.params={id:String(article)};s.req.body={token:start.token,discoveryToken:s.proof.token};
 assert.equal(engagement.completeRead(s.req,now+13000).counted,true);
 assert.equal(engagement.completeRead(s.req,now+14000).counted,false);
 engagement.rewardInteraction(article,'reader','like',now+15000);engagement.rewardInteraction(article,'reader','like',now+16000);
 engagement.rewardInteraction(article,'reader','bookmark',now+17000);
 const row=db.prepare('SELECT SUM(reads) reads,SUM(likes) likes,SUM(bookmarks) bookmarks FROM article_discovery_daily WHERE article_id=?').get(article);
 assert.deepEqual(row,{reads:1,likes:1,bookmarks:1});
 assert.equal(db.prepare("SELECT SUM(xp) n FROM user_growth_events WHERE user_id='writer' AND event_key IN ('article_view','article_like','article_bookmark')").get().n,8);
});
test('guest cookie resets do not manufacture new daily exposure on the same network',()=>{
 const first=session('',now,[{id:article,position:1}]),second=session('',now,[{id:article,position:1}]);
 assert.deepEqual(measure(first).counted,[article]);assert.deepEqual(measure(second).counted,[]);
});
test('guest login and an account on a second device share the original exposure receipt',()=>{
 const id=Number(db.prepare("INSERT INTO articles(title,content,category,author_id) VALUES('跨设备作品',?,'二创','writer')").run(prose).lastInsertRowid);
 const guest=session('',now,[{id,position:0}]);assert.deepEqual(measure(guest,now+2000,[id]).counted,[id]);
 guest.req.user={id:'other'};const loggedProof=metrics.issueSession(guest.req,{cookie(){}},[{id,position:0}],'stage-featured',now);
 guest.proof=loggedProof;assert.deepEqual(measure(guest,now+2000,[id]).counted,[]);
 const anotherDevice=session('other',now,[{id,position:1}]);assert.deepEqual(measure(anotherDevice,now+2000,[id]).counted,[]);
 assert.equal(db.prepare('SELECT SUM(impressions) n FROM article_discovery_daily WHERE article_id=?').get(id).n,1);
 const proof=engagement.beginRead(anotherDevice.req,{cookie(){}},id,now);anotherDevice.req.params={id:String(id)};
 anotherDevice.req.body={token:proof.token,discoveryToken:anotherDevice.proof.token};engagement.completeRead(anotherDevice.req,now+13000);
 guest.req.body={token:engagement.beginRead(guest.req,{cookie(){}},id,now).token,discoveryToken:guest.proof.token};guest.req.params={id:String(id)};
 engagement.completeRead(guest.req,now+14000);
 assert.equal(db.prepare('SELECT SUM(reads) n FROM article_discovery_daily WHERE article_id=?').get(id).n,1);
});
test('recommendation snapshots pin pagination but a newly published work enters the next visitor pool immediately',()=>{
 const first=ensureDiscoverySnapshot({now});
 const id=Number(db.prepare("INSERT INTO articles(title,content,category,author_id,published_at) VALUES('新作品',?,'技术','other','2026-10-21')").run(prose).lastInsertRowid);invalidateDiscovery();
 const next=ensureDiscoverySnapshot({now:now+1000});assert.notEqual(first,next);
 assert.equal(ensureDiscoverySnapshot({snapshot:first,now:now+2000}),first);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM article_discovery_items WHERE snapshot_id=? AND article_id=?').get(first,id).n,0);
 assert.equal(db.prepare('SELECT recommended FROM article_discovery_items WHERE snapshot_id=? AND article_id=?').get(next,id).recommended,1);
 assert.throws(()=>ensureDiscoverySnapshot({snapshot:'f'.repeat(24),now}),{statusCode:409});
 assert.throws(()=>ensureDiscoverySnapshot({snapshot:"' OR 1=1",now}),{statusCode:400});
});
test('six-slot discovery mixes new work, potential work and old work with author and category diversity',()=>{
 const candidates=Array.from({length:80},(_,id)=>({id:id+100,title:`作品${id}`,category:`分类${id%4}`,author_id:`作者${id%12}`,
  published_at:id%3?'2026-07-01':'2026-10-20',content_quality:24,featured_score:40+id%5,impressions:id%3?1000:0,reads:id%3?100:0}));
 const order=buildDailyOrder(candidates,'2026-10-21','fixture-seed');const picks=order.filter(a=>a.recommended);
 assert.deepEqual(order,buildDailyOrder(candidates,'2026-10-21','fixture-seed'));
 assert.equal(picks.length,12);assert.equal(picks[1].published_at,'2026-10-20');assert.equal(picks[4].published_at,'2026-07-01');
 assert.ok(picks.some(a=>a.slot==='explore'));assert.ok(new Set(picks.map(a=>a.author_id)).size>=6);assert.ok(new Set(picks.map(a=>a.category)).size>=3);
 const counts={};for(const p of picks)counts[p.author_id]=(counts[p.author_id]||0)+1;assert.ok(Math.max(...Object.values(counts))<=2);
});
test('a legacy publication completion is preserved and cannot receive the replacement engagement reward again',()=>{
 let date=new Date('2026-10-21T04:00:00Z');for(let i=0;i<5;i++){if(growth.getState('other',date).today.tasks[2].key==='daily_article_engage')break;date=new Date(+date+86400000);}
 growth.ensureProfile('other');growth.insertEvent({userId:'other',eventKey:'daily_article_publish',eventDate:growth.hongKongDate(date),xp:20});
 const state=growth.getState('other',date);assert.equal(state.today.tasks[2].completed,true);
 const like=growth.recordDailyActivity('other','article_like','public-article',date);assert.equal(like.award.xp,0);assert.equal(like.state.level.totalXp,20);
 assert.equal(growth.recordDailyActivity('other','stage_visit','',date),null);
 assert.equal(growth.recordDailyActivity('other','article_publish','new-post',date),null);
});
test('HTTP measurement sessions derive article IDs and positions from server lists, never from supplied counters',async()=>{
 const auth=generateToken({id:'reader',username:'reader',role:'user'});
 const headers={'Content-Type':'application/json',Origin:base,'X-Requested-With':'XMLHttpRequest',Authorization:`Bearer ${auth}`};
 const response=await fetch(base+'/api/articles/discovery/session',{method:'POST',headers,body:JSON.stringify({sort:'featured',page:1,limit:6,ids:[99999],position:-100,xp:9999})});
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 const payload=await response.json(),claims=require('jsonwebtoken').decode(payload.data.token);
 assert.ok(claims.items.every(a=>a.id!==99999&&a.position>=0));assert.equal(claims.source,'stage-featured');
 const rejectedToken=await fetch(base+'/api/growth/check-in',{method:'POST',headers:{...headers,Authorization:`Bearer ${payload.data.token}`}});
 assert.ok([401,403].includes(rejectedToken.status),'measurement tokens cannot authenticate as site sessions');
 const noReport=await fetch(base+'/api/articles/discovery/report',{headers});assert.equal(noReport.status,403);
 const report=require('../backend/services/article-discovery-report').report(7,new Date(now));assert.ok(report.summary.impressions>=2);assert.equal('actor' in report,false);
 const before=growth.getState('reader').level.totalXp;
 await fetch(base+'/api/articles/discovery/impressions',{method:'POST',headers,body:JSON.stringify({token:'forged',ids:[article],xp:99999})});
 assert.equal(growth.getState('reader').level.totalXp,before);
 const stage=await fetch(base+'/api/growth/actions/stage-visit',{method:'POST',headers,body:JSON.stringify({xp:999999,userId:'writer'})});
 assert.equal(stage.status,200);const result=await stage.json();assert.equal(result.data.award.xp,0);
 const twice=await (await fetch(base+'/api/growth/actions/stage-visit',{method:'POST',headers})).json();assert.equal(twice.data.award.xp,0);
 assert.equal((await fetch(base+'/api/growth/actions/stage-visit',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Requested-With':'XMLHttpRequest'}})).status,401);
});

test('optional recommendation telemetry cannot turn a valid read into a failed primary operation',()=>{
 const id=Number(db.prepare("INSERT INTO articles(title,content,category,author_id) VALUES('正常阅读',?,'二创','writer')").run(prose).lastInsertRowid);
 const s=session('reader',now,[{id,position:0}]),proof=engagement.beginRead(s.req,{cookie(){}},id,now);
 s.req.params={id:String(id)};s.req.body={token:proof.token};
 const original=metrics.recordQualified,log=console.error;metrics.recordQualified=()=>{throw new Error('fixture unavailable');};console.error=()=>{};
 try{assert.equal(engagement.completeRead(s.req,now+13000).counted,true);assert.equal(db.prepare('SELECT view_count FROM articles WHERE id=?').get(id).view_count,1);}
 finally{metrics.recordQualified=original;console.error=log;}
});

test('an existing snapshot immediately suppresses a post reclassified as a task',()=>{
 const version=ensureDiscoverySnapshot({now});
 const options={limit:100,offset:0,sort:'featured',snapshot:version,now};
 const before=repository.listArticles(options).articles.find(a=>a.id===article);
 db.prepare("UPDATE articles SET category='任务' WHERE id=?").run(article);
 try{
  const after=repository.listArticles(options).articles.find(a=>a.id===article);
  assert.equal(after.daily_recommended,0);assert.ok(after.featured_score<=before.featured_score*0.051);
  assert.ok(!repository.listArticles({...options,sort:'daily'}).articles.some(a=>a.id===article));
 }finally{db.prepare("UPDATE articles SET category='二创' WHERE id=?").run(article);}
});
