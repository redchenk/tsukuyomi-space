const { createHash } = require('node:crypto');
const db = require('../db');
const { contentFeatures, featuredScore, MAX_CONTENT_LENGTH } = require('./article-ranking');
const { routineReason } = require('./article-content-policy');
const { buildDailyOrder } = require('./article-recommendations');
const { discoveryEvidence } = require('./article-discovery-metrics');
const { hongKongDate } = require('./user-growth');
function invalidateDiscovery() { db.prepare('UPDATE article_discovery_state SET revision=revision+1 WHERE id=1').run(); }
const snapshotTransaction=db.transaction(({ snapshot='', now=Date.now() }={})=>{
    if(snapshot) {
        if(!/^[a-f0-9]{24}$/.test(snapshot))throw Object.assign(new Error('推荐快照无效'),{statusCode:400});
        const existing=db.prepare('SELECT id FROM article_discovery_snapshots WHERE id=? AND created_at>=?').get(snapshot,now-3*86400000);
        if(!existing)throw Object.assign(new Error('推荐列表已更新，请从第一页重新浏览'),{statusCode:409});
        return existing.id;
    }
    const revision=db.prepare('SELECT revision FROM article_discovery_state WHERE id=1').get().revision;
    const day=hongKongDate(new Date(now));
    const id=createHash('sha256').update(`discovery-v1:${day}:${Math.floor(now/900000)}:${revision}`).digest('hex').slice(0,24);
    if(db.prepare('SELECT 1 FROM article_discovery_snapshots WHERE id=?').get(id))return id;
    const evidence=discoveryEvidence(now);
    const rows=db.prepare(`SELECT a.id,a.title,a.category,a.author_id,a.pinned_at,a.published_at,a.created_at,
        CASE WHEN a.content_format='block' THEN a.content ELSE substr(a.content,1,?) END AS content,a.content_format,a.view_count,
        (SELECT COUNT(*) FROM article_likes l WHERE l.article_id=a.id AND l.user_id!=COALESCE(a.author_id,'')) AS likes,
        (SELECT COUNT(*) FROM article_bookmarks b WHERE b.article_id=a.id AND b.user_id!=COALESCE(a.author_id,'')) AS bookmarks
        FROM articles a WHERE COALESCE(a.status,'published')='published'`).all(MAX_CONTENT_LENGTH);
    const scored=rows.map(a=>{
        const f=contentFeatures(a.content,a.content_format),signal=evidence.get(a.id)||{impressions:0,reads:0};
        const base=featuredScore(f.quality,a.view_count,a.likes,a.bookmarks,a.published_at||a.created_at,now);
        const confidence=signal.impressions/(signal.impressions+30);
        const score=Math.max(0,base+confidence*((signal.feedback??10)-10)*2);
        const {content,...compact}=a;
        return {...compact,content_quality:f.quality,routine_reason:routineReason({...a,features:f}),featured_score:score,
            impressions:signal.impressions,reads:signal.reads,last_day:signal.lastDay||null,consecutive_days:signal.consecutiveDays||0,
            discovery_eligible:f.quality>=6||(f.quality>=1.5&&f.textLength>=24)};
    });
    const ordered=buildDailyOrder(scored,day,id);
    db.prepare('INSERT INTO article_discovery_snapshots(id,day,created_at,revision) VALUES(?,?,?,?)').run(id,day,now,revision);
    const add=db.prepare('INSERT INTO article_discovery_items(snapshot_id,article_id,position,score,recommended,slot,routine) VALUES(?,?,?,?,?,?,?)');
    for(const item of ordered)add.run(id,item.id,item.position,item.routine?item.featured_score*0.05:item.featured_score,item.recommended,item.slot||'rest',item.routine?1:0);
    db.prepare('DELETE FROM article_discovery_snapshots WHERE created_at<?').run(now-3*86400000);
    db.prepare('DELETE FROM article_discovery_receipts WHERE seen_at<?').run(now-7*86400000);
    return id;
});
module.exports={ invalidateDiscovery, ensureDiscoverySnapshot:options=>snapshotTransaction.immediate(options) };
