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
