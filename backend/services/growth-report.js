const db = require('../db');
const { core } = require('./growth-measurement');
const DAY = 86400000;
const dayOf = (t) => new Date(t + 8 * 3600000).toISOString().slice(0, 10);
const startOf = (day) => Date.parse(day + 'T00:00:00+08:00');
const marks = core.map(() => '?').join(',');
const groupFields = new Set(['source', 'medium', 'campaign', 'content', 'landing', 'device', 'experience']);
const medianAt = (sorted, p) =>
  sorted.length ? Math.round(sorted[Math.ceil(sorted.length * p) - 1] / 1000) : null;
function responseStats(since, now) {
  if (since > now - DAY) return [];
  // Only include subjects with a complete 24-hour observation window. Self replies do not qualify.
  const subjects = db
    .prepare(
      `WITH firsts AS (
        SELECT user_id, MIN(id) id FROM community_messages WHERE user_id IS NOT NULL AND removed=0 GROUP BY user_id
    ), subjects AS (
        SELECT 'chat' type,m.id,m.user_id author,m.created_at at FROM firsts f JOIN community_messages m ON m.id=f.id
        UNION ALL SELECT 'article',id,author_id,1000*unixepoch(COALESCE(published_at,created_at)) FROM articles
            WHERE author_id IS NOT NULL AND COALESCE(status,'published')='published'
    ), replies AS (
        SELECT 'chat' type, reply_to target,user_id who,created_at at FROM community_messages WHERE removed=0 AND reply_to IS NOT NULL
        UNION ALL SELECT 'article',m.article_id,CASE WHEN f.message_id IS NULL THEN m.user_id END,1000*unixepoch(m.created_at) FROM messages m
            LEFT JOIN fushi_reply_submissions f ON f.message_id=m.id
            WHERE m.article_id IS NOT NULL AND m.user_id IS NOT NULL AND COALESCE(m.status,'approved')='approved'
    ), matched AS (
        SELECT s.type,s.id, MAX(r.who IS NOT NULL AND COALESCE(u.role,'')='user') member,
          MAX(r.who IS NOT NULL AND u.role IN ('admin','super_admin')) staff,
          MAX(r.target IS NOT NULL AND r.who IS NULL) ai
        FROM subjects s JOIN users a ON a.id=s.author AND a.role='user'
        LEFT JOIN replies r ON r.type=s.type AND r.target=s.id AND r.at BETWEEN s.at AND s.at+86400000 AND (r.who IS NULL OR r.who<>s.author)
        LEFT JOIN users u ON u.id=r.who WHERE s.at BETWEEN ? AND ? GROUP BY s.type,s.id
    ) SELECT type,COUNT(*) total,SUM(member OR COALESCE(staff,0)) human,SUM(member) member,
        SUM(COALESCE(staff,0)) staff,SUM(ai) ai FROM matched GROUP BY type`
    )
    .all(since, now - DAY);
  return subjects;
}
function report({ group = 'source', days = 30, now = Date.now() } = {}) {
  if (!groupFields.has(group)) group = 'source';
  days = [7, 14, 30].includes(Number(days)) ? Number(days) : 30;
  const today = startOf(dayOf(now)),
    since = today - (days - 1) * DAY;
  const migration = db
    .prepare("SELECT unixepoch(applied_at)*1000 at FROM schema_migrations WHERE version='061'")
    .get();
  const began = migration?.at ?? now;
  const activity = db
    .prepare(
      `SELECT s.actor,a.kind,a.at,s.started FROM growth_actions a JOIN growth_sessions s ON s.id=a.session_id
        WHERE s.actor<>'staff' AND a.at BETWEEN ? AND ? AND a.kind IN (${marks}) ORDER BY a.at,a.id`
    )
    .all(today - 29 * DAY, now, ...core);
  const dayActors = new Map(),
    week = new Set(),
    month = new Set(),
    byKind = new Map();
  for (const a of activity) {
    const d = dayOf(a.at);
    if (!dayActors.has(d)) dayActors.set(d, new Set());
    dayActors.get(d).add(a.actor);
    month.add(a.actor);
    if (a.at >= today - 6 * DAY) week.add(a.actor);
    if (a.at >= since) {
      if (!byKind.has(a.kind)) byKind.set(a.kind, new Set());
      byKind.get(a.kind).add(a.actor);
    }
  }
  const newcomers = db
    .prepare(
      `WITH observed AS (
        SELECT actor,MIN(id) first_id FROM growth_sessions WHERE actor<>'staff' GROUP BY actor
    ) SELECT s.*, (SELECT kind FROM growth_actions a WHERE a.session_id=s.id AND a.kind IN (${marks}) ORDER BY at,id LIMIT 1) first_kind,
        (SELECT MIN(at) FROM growth_actions a WHERE a.session_id=s.id AND a.kind IN (${marks})) first_success,
        (SELECT kind FROM growth_actions a WHERE a.session_id=s.id AND a.kind IN ('login','register','room','chatroom','article_load_failed','room_config','room_attempt','room_login','room_quota','room_failed','room_timeout','article_open') ORDER BY at DESC,id DESC LIMIT 1) last_step
        FROM observed o JOIN growth_sessions s ON s.id=o.first_id WHERE s.started BETWEEN ? AND ?`
    )
    .all(...core, ...core, since, now);
  const firstActive = db
    .prepare(
      `SELECT s.actor, MIN(a.at) at FROM growth_actions a JOIN growth_sessions s ON s.id=a.session_id
        WHERE s.actor<>'staff' AND a.kind IN (${marks}) GROUP BY s.actor HAVING MIN(a.at) BETWEEN ? AND ?`
    )
    .all(...core, since, now);
  const observedByActor = new Map(newcomers.map((s) => [s.actor, s]));
  const retained = { d1: { n: 0, total: 0 }, d7: { n: 0, total: 0 }, within7: { n: 0, total: 0 } };
  for (const a of firstActive) {
    const newcomer = observedByActor.get(a.actor);
    const start = startOf(dayOf(a.at));
    for (const [key, offsets] of [
      ['d1', [1]],
      ['d7', [7]],
      ['within7', [1, 2, 3, 4, 5, 6, 7]]
    ]) {
      if (start + (offsets.at(-1) + 1) * DAY > now) continue;
      retained[key].total++;
      const returned = offsets.some((i) => dayActors.get(dayOf(start + i * DAY))?.has(a.actor));
      if (returned) retained[key].n++;
      if (newcomer && key === 'within7') newcomer.returned7 = Number(returned);
    }
  }
  const groups = new Map(),
    times = [],
    exits = new Map();
  for (const s of newcomers) {
    const label = group === 'experience' ? s.first_kind || '未激活' : s[group] || '未标注';
    if (!groups.has(label))
      groups.set(label, { label, total: 0, activated: 0, mature: 0, returned: 0, exits: {}, experience: {} });
    const row = groups.get(label);
    row.total++;
    if (s.first_success !== null) {
      row.activated++;
      row.experience[s.first_kind] = (row.experience[s.first_kind] || 0) + 1;
      times.push(s.first_success - s.started);
      if (s.returned7 !== undefined) {
        row.mature++;
        row.returned += s.returned7;
      }
    } else {
      const step = s.last_step || 'arrival';
      exits.set(step, (exits.get(step) || 0) + 1);
      row.exits[step] = (row.exits[step] || 0) + 1;
    }
  }
  times.sort((a, b) => a - b);
  const events = db
    .prepare(
      `SELECT a.kind,COUNT(*) n,COUNT(DISTINCT s.actor) people FROM growth_actions a
        JOIN growth_sessions s ON s.id=a.session_id WHERE s.actor<>'staff' AND a.at BETWEEN ? AND ? GROUP BY a.kind`
    )
    .all(since, now);
  const visitorSql = " FROM growth_visit_days v JOIN growth_sessions s ON s.id=v.session_id WHERE s.actor<>'staff' AND v.day BETWEEN ? AND ?";
  const visitors = db.prepare("SELECT COUNT(DISTINCT CASE WHEN v.day=? THEN s.actor END) day,COUNT(DISTINCT CASE WHEN v.day>=? THEN s.actor END) week,COUNT(DISTINCT s.actor) month" + visitorSql)
    .get(dayOf(now),dayOf(today-6*DAY),dayOf(today-29*DAY),dayOf(now));
  const dailyVisitors = new Map(db.prepare("SELECT v.day,COUNT(DISTINCT s.actor) n" + visitorSql + " GROUP BY v.day").all(dayOf(since),dayOf(now)).map(row=>[row.day,row.n]));
  const trend = [];
  for (let i = 0; i < days; i++) {
    const t = since + i * DAY,
      day = dayOf(t);
    trend.push({ day, visitors:t+DAY<=began ? null : dailyVisitors.get(day)||0, active: t + DAY <= began ? null : dayActors.get(day)?.size || 0 });
  }
  const articles = db
    .prepare(
      `WITH totals AS (
        SELECT article_id,SUM(opens) opens,SUM(reads) reads FROM article_read_daily WHERE day BETWEEN ? AND ? GROUP BY article_id
    ), readers AS (
        SELECT CAST(a.object_key AS INTEGER) article_id,COUNT(DISTINCT s.actor) n FROM growth_actions a JOIN growth_sessions s ON s.id=a.session_id
        WHERE a.kind='article_read' AND a.at BETWEEN ? AND ? AND s.actor<>'staff' GROUP BY CAST(a.object_key AS INTEGER)
    ) SELECT ar.id,ar.title,ar.view_count total,t.opens,t.reads,COALESCE(r.n,0) readers FROM totals t JOIN articles ar ON ar.id=t.article_id
      LEFT JOIN readers r ON r.article_id=t.article_id ORDER BY reads DESC,opens DESC,ar.id LIMIT 50`
    )
    .all(dayOf(since), dayOf(now), since, now);
  return {
    days,
    group,
    began,
    exits: Object.fromEntries(exits),
    articles,
    asOf: now,
    trend,
    visitors,
    active: { day: dayActors.get(dayOf(now))?.size || 0, week: week.size, month: month.size },
    newcomers: newcomers.length,
    activated: times.length,
    p50: medianAt(times, 0.5),
    p75: medianAt(times, 0.75),
    retained,
    groups: [...groups.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    types: Object.fromEntries([...byKind].map(([k, v]) => [k, v.size])),
    events,
    replies: responseStats(Math.max(began, since), now)
  };
}
module.exports = { report: db.transaction(report) };
