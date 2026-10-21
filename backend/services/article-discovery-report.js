const db=require('../db');
const {hongKongDate}=require('./user-growth');
function report(days=7,now=new Date()) {
    days=Math.min(30,Math.max(1,Number.parseInt(days,10)||7));
    const today=hongKongDate(now),start=new Date(`${today}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-days+1);
    const since=start.toISOString().slice(0,10);
    const summary=db.prepare(`SELECT COALESCE(SUM(d.impressions),0) impressions,COALESCE(SUM(d.reads),0) reads,
        COALESCE(SUM(d.likes),0) likes,COALESCE(SUM(d.bookmarks),0) bookmarks,
        COUNT(DISTINCT CASE WHEN d.impressions>0 THEN a.author_id END) authors,
        COALESCE(SUM(CASE WHEN julianday(d.day)-julianday(substr(COALESCE(a.published_at,a.created_at),1,10))>=30 THEN d.impressions ELSE 0 END),0) oldWorkImpressions,
        COALESCE(SUM(CASE WHEN julianday(d.day)-julianday(substr(COALESCE(a.published_at,a.created_at),1,10)) BETWEEN 0 AND 7 THEN d.impressions ELSE 0 END),0) newWorkImpressions
        FROM article_discovery_daily d JOIN articles a ON a.id=d.article_id WHERE d.day BETWEEN ? AND ?`).get(since,today);
    const byPosition=db.prepare(`SELECT source,bucket,SUM(impressions) impressions,SUM(reads) reads,SUM(likes) likes,SUM(bookmarks) bookmarks
        FROM article_discovery_daily WHERE day BETWEEN ? AND ? GROUP BY source,bucket ORDER BY source,bucket`).all(since,today);
    const firstExposure=db.prepare(`SELECT COUNT(*) articles,AVG(delay_seconds) meanSeconds FROM (
        SELECT r.article_id,MAX(0,MIN(r.seen_at)/1000-CAST(strftime('%s',a.published_at) AS INTEGER)) delay_seconds
        FROM article_discovery_receipts r JOIN articles a ON a.id=r.article_id
        WHERE r.day BETWEEN ? AND ? AND a.published_at>=? GROUP BY r.article_id)`).get(since,today,since);
    return {engine:'native-v1',since,through:today,summary:{...summary,qualifiedReadRate:summary.impressions?summary.reads/summary.impressions:0},byPosition,
        firstExposure:{...firstExposure,receiptRetentionDays:7},note:'No historical impressions are inferred from legacy view counts.'};
}
module.exports={report};
