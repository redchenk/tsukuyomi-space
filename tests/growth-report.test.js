const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-report-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATA_DIR: dir,
  DB_PATH: path.join(dir, 'test.db'),
  JWT_SECRET: 'growth-test-local-private-fixture',
  ADMIN_PASSWORD: 'growth-test-local',
  REDIS_URL: '',
  ENABLE_FRONTEND_DIST: 'false'
});
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { record } = require('../backend/services/growth-measurement');
const { report } = require('../backend/services/growth-report');
const DAY = 86400000,
  start = Date.parse('2026-08-10T09:00:00+08:00');
let server, base;
const req = (browser, source = 'bilibili', user, ua = 'Mozilla Mobile') => ({
  user,
  headers: {
    'user-agent': ua,
    'x-site-visit': encodeURIComponent(
      JSON.stringify({
        browser,
        path: '/articles/12/private-slug',
        source,
        campaign: 'readers',
        content: 'clip01',
        referrer: 'x.example/private?secret=123'
      })
    )
  }
});
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  db.prepare("UPDATE schema_migrations SET applied_at='2026-08-10 00:00:00' WHERE version='061'").run();
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test('first visit, deduped actives, mature retention, session boundary and source attribution', () => {
  const a = crypto.randomUUID(),
    b = crypto.randomUUID(),
    c = crypto.randomUUID(),
    staff = crypto.randomUUID();
  record(req(a), '', '', start);
  record(req(a, 'later', { id: 'reader' }), 'article_read', '12', start + 12000);
  record(req(a, 'later', { id: 'reader' }), 'article_read', '12', start + 14000);
  record(req(b, 'github'), '', '', start);
  record(req(b, 'github'), 'room_config', '', start + 1000);
  record(req(b, 'direct'), 'gomoku_finish', 'board', start + 3600000);
  record(req(a, 'direct', { id: 'reader' }), 'chat_post', '100', start + DAY);
  record(req(crypto.randomUUID(), 'other', { id: 'reader' }), 'article_read', '12', start + 7 * DAY);
  record(req(c, 'direct'), 'room_reply', 'turn', start + 8 * DAY);
  record(req(staff), '', '', start);
  record(req(staff, 'direct', { id: 'mod', role: 'admin' }), 'chat_post', 'ignored', start + 500);
  record(req(crypto.randomUUID(), 'robot', null, 'Googlebot'), 'article_read', '12', start);
  const r = report({ now: start + 8 * DAY + 2000, group: 'source' });
  assert.deepEqual(r.visitors,{day:1,week:2,month:3});
  assert.deepEqual(r.active, { day: 1, week: 2, month: 3 });
  assert.equal(r.newcomers, 3);
  assert.equal(r.activated, 2);
  assert.deepEqual(r.retained.d1, { n: 1, total: 2 });
  assert.deepEqual(r.retained.d7, { n: 1, total: 2 });
  assert.deepEqual(r.retained.within7, { n: 1, total: 2 });
  assert.equal(r.exits.room_config, 1);
  assert.equal(r.groups.find((s) => s.label === 'bilibili').returned, 1);
  assert.equal(report({ now: start + DAY, group: 'landing' }).groups[0].label, '/articles/12');
  assert.equal(r.trend[0].active, null);
  assert.equal(r.p75, 12);
  assert.ok(!JSON.stringify(r).includes('private-slug'));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM growth_actions WHERE kind='article_read'").get().n, 2);
});
test('reply window excludes self and counts AI, staff and human separately', () => {
  const add = db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)');
  for (const [id, role] of [
    ['host', 'admin'],
    ['author', 'user'],
    ['audience', 'user']
  ])
    add.run(id, id, id + '@test.invalid', 'hash', role);
  const msg = db.prepare(
    "INSERT INTO community_messages(channel,user_id,content,reply_to,created_at) VALUES('lobby',?,'fixture',?,?)"
  );
  const parent = Number(msg.run('author', null, start).lastInsertRowid);
  msg.run('author', parent, start + 5000);
  msg.run(null, parent, start + 7000);
  msg.run('host', parent, start + 8000);
  msg.run('audience', parent, start + DAY + 1);
  const row = report({ now: start + DAY + 100 }).replies.find((r) => r.type === 'chat');
  assert.deepEqual(row, { type: 'chat', total: 1, human: 1, member: 0, staff: 1, ai: 1 });
});
test('report requires administrator and the event endpoint accepts only supported observations', async () => {
  assert.equal((await fetch(base + '/api/admin/growth-report')).status, 401);
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: base,
    ...req(crypto.randomUUID()).headers
  };
  const post = (data) =>
    fetch(base + '/api/stats/journey', { method: 'POST', headers, body: JSON.stringify(data) });
  assert.equal((await post({ kind: 'article_read', key: '123' })).status, 400);
  assert.equal((await post({ kind: 'gomoku_finish', moves: [1, 2, 3] })).status, 400);
  assert.equal((await post({ kind: 'gomoku_finish', moves: [0, 15, 1, 16, 2, 17, 3, 18, 4] })).status, 204);
});

test('lifetime reconciles old counters, gaps and dated content without extending modern tracking backwards', () => {
  const addView = db.prepare("INSERT INTO stats(event_type,event_data,created_at) VALUES ('view',?,?)");
  addView.run('{"ip":"fixture-only"}', '2026-04-28 15:10:00');
  addView.run('{"ip":"fixture-only"}', '2026-04-28 15:12:00');
  addView.run('{"ip":"fixture-only"}', '2026-04-28 16:05:00');
  const insert = db.prepare('INSERT INTO articles(title,slug,status,published_at,view_count) VALUES(?,?,?,?,?)');
  const article = Number(insert.run('Historic article', 'historic', 'published', '2026-04-19 12:00:00', 37).lastInsertRowid);
  insert.run('Unpublished fixture', 'historic-draft', 'draft', '2026-04-18 12:00:00', 999);
  db.prepare("INSERT INTO users(id,username,email,password_hash,role,created_at) VALUES('hist','hist','history@example.test','fixture','user','2026-04-20 17:00:00')").run();
  const impression = db.prepare("INSERT INTO article_discovery_daily(day,article_id,source,bucket,impressions,reads) VALUES(?,?,'feed',0,?,?)");
  impression.run('2026-07-01',article,10,0);
  impression.run('2026-07-03',article,5,1);
  const now = start + 45 * DAY;
  const full = report({days:'all', now});
  const recent = report({days:30, now});
  const h = full.history;
  const get = (day) => h.daily.find((r) => r.day === day);
  assert.equal(h.from, '2026-03-30');
  assert.equal(h.daily.at(-1).day,h.through);
  assert.equal(h.recordedVisitDays,2);
  assert.equal(h.totals.visits,2);
  assert.equal(get('2026-03-30').visits,null);
  assert.equal(get('2026-04-28').visits,1);
  assert.equal(get('2026-04-29').visits,1);
  assert.equal(get('2026-04-30').visits,null);
  assert.equal(get('2026-04-21').accounts,1);
  assert.equal(get('2026-04-22').accounts,0);
  assert.equal(h.articles.find((a) => a.id === article).views,37);
  assert.ok(!h.articles.some((a) => a.title==='Unpublished fixture'));
  assert.equal(h.coverage.discovery,'2026-07-01');
  assert.equal(get('2026-07-01').reads,0);
  assert.equal(get('2026-07-02').reads,null);
  assert.equal(h.totals.reads,1);
  assert.equal(full.days,'all');
  assert.equal(full.trend[0].day,'2026-08-10');
  assert.deepEqual(full.active,recent.active);
  assert.equal(full.active.month,0);
  assert.equal(full.types.article_read,1);
  assert.equal(full.retained.d7.n,1);
  assert.equal(recent.types.article_read,undefined);
  assert.equal(recent.history,undefined);
  assert.ok(!JSON.stringify(h).includes('fixture-only'));
});
