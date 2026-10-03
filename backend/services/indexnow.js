const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const HOSTS = ['yachiyo.hk', 'tsukuyomi-space.com'];
let timer, running = false;
const enabled = () => process.env.INDEXNOW_ENABLED === 'true';
function verificationKey() {
    const file = path.join(config.dataDir, 'indexnow-key');
    try { fs.writeFileSync(file, crypto.randomBytes(24).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
    const key = fs.readFileSync(file, 'utf8').trim();
    if (!/^[a-f0-9]{48}$/.test(key)) throw new Error('Invalid IndexNow verification file');
    return key;
}
function serveKey(req, res, next) {
    if (!enabled()) return next();
    const key = verificationKey();
    if (req.params.key !== key) return next();
    res.set('X-Robots-Tag', 'noindex');
    return res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(key);
}
function urlFor(host, pathname) {
    if (!HOSTS.includes(host) || !/^\/(?:$|hub$|stage(?:\?page=[1-9]\d*)?$|plaza$|room$|gallery$|wiki(?:\/(?:characters|terms)\/[a-z0-9-]+)?$|friend-links$|reality$|game$|topics\/[a-z0-9-]+$|pixel(?:\?art=[1-9]\d*)?$|articles\/[1-9]\d*(?:\/[^/?#\\]+)?\/?$)/.test(pathname)) throw new Error('Nonpublic IndexNow URL');
    if (host === 'tsukuyomi-space.com' && pathname.startsWith('/articles/')) pathname = pathname.match(/^\/articles\/[1-9]\d*/)[0];
    return new URL(pathname, `https://${host}`).href;
}
async function submit(host, rows, key, transport = fetch) {
    const response = await transport('https://api.indexnow.org/indexnow', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host, key, keyLocation: `https://${host}/indexnow-${key}.txt`, urlList: rows.map(r => urlFor(host, r.path)) })
    });
    // Acknowledgement has no useful response body; cancel rather than buffering.
    if (response.body) await response.body.cancel();
    return response.status;
}
async function drain({ now = Date.now(), transport = fetch } = {}) {
    if (!enabled() || running) return;
    running = true;
    try {
        const key = verificationKey();
        // Recover leases after a crashed process; revision guards protect newer
        // changes arriving while an older batch is in flight.
        db.prepare("UPDATE seo_indexnow_outbox SET status='pending' WHERE status='running' AND available_at <= ?").run(now);
        for (const host of HOSTS) {
            const rows = db.transaction(() => {
                const due = db.prepare("SELECT path, revision, attempts FROM seo_indexnow_outbox WHERE host=? AND status='pending' AND available_at <= ? ORDER BY available_at LIMIT 50").all(host, now);
                const claim = db.prepare("UPDATE seo_indexnow_outbox SET status='running', available_at=? WHERE host=? AND path=? AND revision=? AND status='pending'");
                return due.filter(r => claim.run(now + 120000, host, r.path, r.revision).changes);
            })();
            if (!rows.length) continue;
            let status = 0;
            try { status = await submit(host, rows, key, transport); } catch (_) { /* only status, never keys or submitted URLs */ }
            const accepted = status === 200 || status === 202;
            const finish = db.prepare("UPDATE seo_indexnow_outbox SET status=?, attempts=?, available_at=?, updated_at=?, http_status=? WHERE host=? AND path=? AND revision=? AND status='running'");
            db.transaction(() => {
                for (const r of rows) {
                    const attempts = r.attempts + 1;
                    const terminal = attempts >= 6 || [400, 403, 422].includes(status);
                    finish.run(accepted ? 'done' : terminal ? 'failed' : 'pending', attempts, now + Math.min(21600000, 120000 * 2 ** attempts), now, status, host, r.path, r.revision);
                }
            })();
            console.log(JSON.stringify({ event: 'indexnow_delivery', host, count: rows.length, httpStatus: status, accepted }));
        }
        db.prepare("DELETE FROM seo_indexnow_outbox WHERE status='done' AND updated_at < ?").run(now - 7 * 86400000);
    } finally { running = false; }
}
function start() {
    if (!enabled() || timer) return;
    verificationKey();
    const run = () => drain().catch(() => console.error('{"event":"indexnow_worker_error"}'));
    // Delay the first batch until the regular tick so a rolling deployment can
    // make both domains' verification routes available before submission.
    timer = setInterval(run, 120000); timer.unref();
}
module.exports = { serveKey, start, drain, submit, urlFor, verificationKey };
