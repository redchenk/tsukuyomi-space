const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');

const WINDOW = 30 * 60 * 1000;
const automation =
  /bot\b|curl\/|wget\/|python-requests|crawler|spider|headless|preview|facebookexternalhit|lighthouse|playwright|uptimerobot/i;
const core = [
  'article_read',
  'room_reply',
  'room_local_reply',
  'chat_post',
  'article_publish',
  'pixel_publish',
  'gallery_publish',
  'gomoku_finish',
  'runner_100'
];
const safeLabel = (value) =>
  typeof value === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(value) ? value.toLowerCase() : '';
const hash = (value) =>
  crypto
    .createHmac('sha256', config.jwtSecret)
    .update('growth:' + value)
    .digest('hex');
function landing(path) {
  const article = /^\/articles\/(\d{1,12})(?:\/|$)/.exec(path);
  if (article) return '/articles/' + article[1];
  const route = String(path || '').split('/')[1] || '';
  return [
    '',
    'access',
    'hub',
    'stage',
    'room',
    'chatroom',
    'wiki',
    'gallery',
    'pixel',
    'pixel-art',
    'plaza',
    'drift',
    'games',
    'game',
    'gomoku',
    'downloads',
    'download',
    'growth',
    'login',
    'register',
    'guides',
    'topics',
    'articles'
  ].includes(route)
    ? '/' + route
    : '/other';
}
function metadata(req) {
  const header = req.headers['x-site-visit'];
  if (!header || header.length > 2000 || automation.test(req.headers['user-agent'] || '')) return null;
  let data;
  try {
    data = JSON.parse(decodeURIComponent(header));
  } catch {
    return null;
  }
  if (!data || !/^[a-f0-9-]{36}$/i.test(data.browser || '') || typeof data.path !== 'string') return null;
  const staff = req.user?.scope === 'admin' || ['admin', 'super_admin', 'banned'].includes(req.user?.role);
  const browser = hash(data.browser);
  const account = staff ? 'staff' : req.user?.id ? 'u:' + hash(String(req.user.id)) : '';
  let referrer = '';
  if (
    typeof data.referrer === 'string' &&
    /^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/i.test(data.referrer) &&
    data.referrer.length <= 100
  )
    referrer = data.referrer.toLowerCase();
  return {
    browser,
    account,
    source: safeLabel(data.source) || referrer || 'direct',
    medium: safeLabel(data.medium),
    campaign: safeLabel(data.campaign),
    content: safeLabel(data.content),
    landing: landing(data.path),
    device: /mobile|android|iphone|ipad/i.test(req.headers['user-agent'] || '') ? 'mobile' : 'desktop'
  };
}
function touch(meta, now) {
  const last = db
    .prepare('SELECT * FROM growth_sessions WHERE browser=? ORDER BY id DESC LIMIT 1')
    .get(meta.browser);
  const live = last && now - last.last_seen < WINDOW;
  const guest = last?.actor.startsWith('g:');
  if (live && (last.actor === meta.account || guest)) {
    db.prepare('UPDATE growth_sessions SET last_seen=MAX(last_seen,?), actor=? WHERE id=?').run(
      now,
      meta.account || last.actor,
      last.id
    );
    return last.id;
  }
  if (meta.account === 'staff') return null;
  const actor = meta.account || (guest ? last.actor : 'g:' + meta.browser + ':' + (last?.id || 0));
  return db
    .prepare(
      `INSERT INTO growth_sessions(browser,actor,started,last_seen,source,medium,campaign,content,landing,device)
        VALUES(?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      meta.browser,
      actor,
      now,
      now,
      meta.source,
      meta.medium,
      meta.campaign,
      meta.content,
      meta.landing,
      meta.device
    ).lastInsertRowid;
}
const write = db.transaction((meta, kind, key, now) => {
  const id = touch(meta, now);
  if (!id || meta.account === 'staff') return;
  db.prepare("INSERT OR IGNORE INTO growth_visit_days(day,session_id) VALUES(date(? / 1000,'unixepoch','+8 hours'),?)").run(now,id);
  if (kind)
    db.prepare('INSERT OR IGNORE INTO growth_actions(session_id,kind,object_key,at) VALUES(?,?,?,?)').run(
      id,
      kind,
      String(key).slice(0, 120),
      now
    );
});
function record(req, kind = '', key = '', now = Date.now()) {
  const meta = metadata(req);
  if (meta) write.immediate(meta, kind, key, now);
}
function observe(req, kind, key) {
  // Optional analytics must never fail an already committed post or a Room sync.
  try {
    record(req, kind, key);
  } catch (error) {
    console.error('Growth observation failed:', error.code || error.name);
  }
}
module.exports = { record, observe, core, automation, WINDOW, hash };
