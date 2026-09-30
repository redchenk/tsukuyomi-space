const crypto = require('node:crypto');
const db = require('../db');
const { readConfig } = require('./fushi-config');
const auth = require('./fushi-auth');
const webhooks = require('./fushi-webhooks');
const NAME = 'community.reply.approved';
const DAY = 86400000;
const cursor = seq => `f1.${seq}`;
function parseCursor(value) {
    if (typeof value !== 'string' || !/^f1\.(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value.slice(3)))) throw new Error('Invalid event cursor');
    return Number(value.slice(3));
}
function subscriptionId(userId, name, url, args) {
    return `sub_${crypto.createHash('sha256').update(JSON.stringify([userId, url, name, canonical(args)])).digest('hex')}`;
}
function canonical(args) { return JSON.stringify(Object.fromEntries(Object.keys(args).sort().map(key => [key, args[key]]))); }
function latest(userId) { return db.prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM fushi_events WHERE owner_id = ?').get(userId).n; }
function watermark(sub, assumingAccepted = null) {
    const earliest = db.prepare(`SELECT MIN(event_seq) AS n FROM fushi_deliveries
        WHERE subscription_id = ? AND status IN ('pending','inflight','dead') AND event_seq != ?`).get(sub.id, assumingAccepted || -1).n;
    return cursor(earliest ? Math.min(sub.scan_cursor, earliest - 1) : sub.scan_cursor);
}
function matches(args, event) {
    return (!args.thread_id || args.thread_id === String(event.thread_id)) && (!args.kind || args.kind === event.kind);
}
function refill(sub, now) {
    const args = JSON.parse(sub.arguments);
    const rows = db.prepare('SELECT * FROM fushi_events WHERE owner_id = ? AND seq > ? ORDER BY seq LIMIT 100').all(sub.owner_id, sub.scan_cursor);
    const insert = db.prepare('INSERT OR IGNORE INTO fushi_deliveries (subscription_id,event_seq,next_attempt) VALUES (?,?,?)');
    for (const event of rows) if (matches(args, event)) insert.run(sub.id, event.seq, now);
    if (rows.length) {
        sub.scan_cursor = rows.at(-1).seq;
        db.prepare('UPDATE fushi_subscriptions SET scan_cursor = ? WHERE id = ?').run(sub.scan_cursor, sub.id);
    }
    return rows.length === 100;
}
function validateArguments(args, userId, recheck = true) {
    if (!args || typeof args !== 'object' || Array.isArray(args)
        || Object.keys(args).some(key => !['thread_id', 'kind'].includes(key))
        || (args.kind !== undefined && !['plaza', 'article'].includes(args.kind))
        || (args.thread_id !== undefined && (typeof args.thread_id !== 'string' || !/^[1-9]\d*$/.test(args.thread_id)
            || !Number.isSafeInteger(Number(args.thread_id))))) throw new Error('Invalid event arguments');
    if (args.thread_id && recheck) {
        const community = require('./fushi-community');
        const thread = community.publicContext(Number(args.thread_id));
        const owned = thread?.root.id === Number(args.thread_id) && (thread.root.user_id === userId || thread.article?.author_id === userId
            || db.prepare("SELECT id FROM messages WHERE parent_id=? AND user_id=? AND status='approved' LIMIT 1").get(thread.root.id, userId));
        const notifications = db.prepare("SELECT id FROM notifications WHERE user_id = ? AND type = 'reply' AND related_message_id IN (SELECT id FROM messages WHERE id = ? OR parent_id = ?) ORDER BY id DESC LIMIT 100")
            .all(userId, Number(args.thread_id), Number(args.thread_id));
        if (!owned && !notifications.some(row => community.relevantNotification(userId, row.id)?.root.id === Number(args.thread_id))) throw new Error('Thread not authorized');
    }
    return args;
}
function enqueueNotification(notification) {
    const cfg = readConfig();
    if (!cfg.enabled || notification?.type !== 'reply' || notification.user_id !== cfg.userId
        || !notification.actor_id || notification.actor_id === cfg.userId || !auth.account()) return;
    const context = require('./fushi-community').relevantNotification(cfg.userId, notification.id);
    if (!context) return;
    const now = Date.now();
    db.prepare(`INSERT OR IGNORE INTO fushi_events
        (event_id,owner_id,notification_id,message_id,thread_id,kind,article_id,occurred_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(`evt_${crypto.randomUUID()}`, cfg.userId, notification.id, context.message.id, context.root.id,
            context.article ? 'article' : 'plaza', context.article?.id || null, now);
    // No network or per-event payload serialization on the website request path.
    wake();
}
async function subscribe(context, params, options = {}) {
    const now = options.now ?? Date.now();
    if (params.name !== NAME || params.delivery?.mode !== 'webhook') throw new Error('Unsupported event or delivery');
    const args = validateArguments(params.arguments, context.user.id);
    const url = webhooks.validateCallback(params.delivery.url);
    webhooks.signingKey(params.delivery.secret);
    if (params.ttlMs !== undefined && params.ttlMs !== null && (!Number.isSafeInteger(params.ttlMs) || params.ttlMs <= 0)) throw new Error('Invalid ttlMs');
    const id = subscriptionId(context.user.id, NAME, url, args);
    const callbackHash = auth.hash(url);
    const existing = db.prepare('SELECT * FROM fushi_subscriptions WHERE id = ?').get(id);
    const activeCount = db.prepare('SELECT count(*) AS n FROM fushi_subscriptions WHERE owner_id = ? AND active = 1 AND expires_at > ?').get(context.user.id, now).n;
    if ((!existing || !existing.active || existing.expires_at <= now) && activeCount >= 5) throw new Error('Subscription limit exceeded');
    const oldSecret = existing?.secret_box ? webhooks.unseal(existing.secret_box, id) : null;
    const cached = db.prepare('SELECT * FROM fushi_subscriptions WHERE owner_id=? AND callback_hash=? AND active=1 AND verified_at>? ORDER BY verified_at DESC LIMIT 1')
        .get(context.user.id, callbackHash, now - 5 * 60000);
    let verifiedAt = cached?.verified_at;
    // The cache is durable, owner + URL scoped, and invalidated by secret replacement.
    if (!cached?.secret_box || webhooks.unseal(cached.secret_box, cached.id) !== params.delivery.secret) {
        const challenge = crypto.randomBytes(32).toString('base64url');
        try {
            const response = await webhooks.postSigned({ id, url, secret: params.delivery.secret }, `msg_verification_${crypto.randomUUID()}`,
                { type: 'verification', challenge }, { fetch: options.fetch, now, verification: true });
            const actual = Buffer.from(typeof response.data?.challenge === 'string' ? response.data.challenge : '');
            const expected = Buffer.from(challenge);
            if (!response.accepted || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new Error('challenge_failed');
            verifiedAt = now;
        } catch (cause) {
            const error = new Error('Callback verification failed');
            error.rpcCode = -32015;
            error.reason = cause.name === 'TimeoutError' || cause.name === 'AbortError' ? 'timeout' : 'challenge_failed';
            throw error;
        }
    }
    // Callback verification may have taken seconds; authorization must still be current.
    if (!auth.grantFor(context.grant.id, 'fushi:events', options.now ?? Date.now())) throw new Error('Authorization revoked');
    return db.transaction(() => {
        const current = db.prepare('SELECT * FROM fushi_subscriptions WHERE id=?').get(id);
        const activeCount = db.prepare('SELECT count(*) AS n FROM fushi_subscriptions WHERE owner_id=? AND active=1 AND expires_at>?').get(context.user.id, now).n;
        if ((!current?.active || current.expires_at <= now) && activeCount >= 5) throw new Error('Subscription limit exceeded');
        const floor = db.prepare('SELECT floor_seq FROM fushi_history WHERE owner_id = ?').get(context.user.id)?.floor_seq || 0;
        const max = Math.max(latest(context.user.id), floor);
        const requested = params.cursor == null ? (existing?.scan_cursor ?? max) : parseCursor(params.cursor);
        if (requested > max) throw new Error('Cursor is ahead of retained history');
        const start = Math.max(requested, floor);
        const ttl = Math.max(60000, Math.min(params.ttlMs ?? DAY, DAY));
        const expiry = Math.min(now + ttl, context.grant.expires_at);
        const rotate = oldSecret && oldSecret !== params.delivery.secret;
        db.prepare(`INSERT INTO fushi_subscriptions
            (id,owner_id,grant_id,name,arguments,callback_box,callback_hash,secret_box,previous_secret_box,rotate_until,expires_at,active,verified_at,scan_cursor,base_cursor,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET grant_id=excluded.grant_id,
            secret_box=excluded.secret_box, previous_secret_box=excluded.previous_secret_box,rotate_until=excluded.rotate_until,
            expires_at=excluded.expires_at,active=1,verified_at=excluded.verified_at,
            scan_cursor=MIN(fushi_subscriptions.scan_cursor,excluded.scan_cursor), updated_at=excluded.updated_at`)
            .run(id, context.user.id, context.grant.id, NAME, canonical(args), webhooks.seal(url, `${id}:callback`), callbackHash, webhooks.seal(params.delivery.secret, id),
                rotate ? existing.secret_box : existing?.previous_secret_box || null,
                rotate ? now + 5 * 60000 : existing?.rotate_until || null, expiry, verifiedAt, start, start, now);
        // Explicit replay also retries dead letters, but never discards pending deliveries.
        if (params.cursor != null) db.prepare("UPDATE fushi_deliveries SET status = 'pending', attempts = 0, next_attempt = ? WHERE subscription_id = ? AND event_seq > ? AND status IN ('dead','accepted','cancelled')").run(now, id, start);
        const sub = db.prepare('SELECT * FROM fushi_subscriptions WHERE id = ?').get(id);
        refill(sub, now);
        wake();
        return { id, refreshBefore: new Date(expiry).toISOString(), cursor: watermark(sub), truncated: requested < floor };
    })();
}
function unsubscribe(context, params) {
    if (params.name !== NAME || params.delivery?.mode !== 'webhook') throw new Error('Unsupported event or delivery');
    const args = validateArguments(params.arguments, context.user.id, false);
    const id = subscriptionId(context.user.id, NAME, webhooks.validateCallback(params.delivery.url), args);
    db.transaction(() => {
        db.prepare('UPDATE fushi_subscriptions SET active=0,secret_box=NULL,previous_secret_box=NULL WHERE id=? AND owner_id=?').run(id, context.user.id);
        db.prepare("UPDATE fushi_deliveries SET status='cancelled' WHERE subscription_id=? AND status IN ('pending','inflight','dead')").run(id);
    })();
    return {};
}
async function drain({ fetch, now = Date.now(), batch = 8 } = {}) {
    let backlog = false;
    const subs = db.prepare('SELECT * FROM fushi_subscriptions WHERE owner_id=? AND active=1').all(readConfig().userId);
    for (const sub of subs) {
        if (sub.expires_at <= now || !auth.grantFor(sub.grant_id, 'fushi:events', now)) {
            db.prepare('UPDATE fushi_subscriptions SET active=0,secret_box=NULL,previous_secret_box=NULL WHERE id=?').run(sub.id);
            continue;
        }
        backlog = db.transaction(() => refill(sub, now))() || backlog;
        if (sub.rotate_until && sub.rotate_until <= now) db.prepare('UPDATE fushi_subscriptions SET previous_secret_box=NULL,rotate_until=NULL WHERE id=?').run(sub.id);
    }
    db.prepare("UPDATE fushi_deliveries SET status='pending',lease_until=NULL WHERE status='inflight' AND lease_until<=?").run(now);
    const due = db.prepare(`SELECT d.* FROM fushi_deliveries d JOIN fushi_subscriptions s ON s.id=d.subscription_id
        WHERE s.owner_id=? AND s.active=1 AND s.expires_at>? AND d.status='pending' AND d.next_attempt<=? ORDER BY d.next_attempt,d.event_seq LIMIT ?`).all(readConfig().userId, now, now, batch);
    for (const delivery of due) {
        const sub = db.prepare('SELECT * FROM fushi_subscriptions WHERE id=?').get(delivery.subscription_id);
        const event = db.prepare('SELECT * FROM fushi_events WHERE seq=?').get(delivery.event_seq);
        const realNow = fetch ? now : Date.now();
        if (!sub.active || sub.expires_at <= realNow || !auth.grantFor(sub.grant_id, 'fushi:events', realNow)) continue;
        const community = require('./fushi-community');
        const context = community.relevantNotification(sub.owner_id, event.notification_id);
        if (!context) {
            db.prepare("UPDATE fushi_deliveries SET status='cancelled',last_error='content_unavailable' WHERE subscription_id=? AND event_seq=?").run(sub.id, event.seq);
            continue;
        }
        const claimed = db.prepare("UPDATE fushi_deliveries SET status='inflight',attempts=attempts+1,lease_until=? WHERE subscription_id=? AND event_seq=? AND status='pending' AND next_attempt<=?")
            .run(realNow + 60000, sub.id, event.seq, realNow).changes;
        if (!claimed) continue;
        let accepted = false, status = null, reason = null;
        try {
            const secret = webhooks.unseal(sub.secret_box, sub.id);
            const previousSecret = sub.previous_secret_box && sub.rotate_until > realNow ? webhooks.unseal(sub.previous_secret_box, sub.id) : null;
            const response = await webhooks.postSigned({ id: sub.id, url: webhooks.unseal(sub.callback_box, `${sub.id}:callback`), secret, previousSecret }, event.event_id,
                { eventId: event.event_id, name: NAME, timestamp: new Date(event.occurred_at).toISOString(),
                    data: { content_id: String(event.message_id), thread_id: String(event.thread_id), kind: event.kind,
                        notification_id: String(event.notification_id), url: community.link(context) }, cursor: watermark(sub, event.seq) }, { fetch, now: realNow });
            accepted = response.accepted; status = response.status;
        } catch (_) { reason = 'transport_failed'; }
        const attempts = db.prepare('SELECT attempts FROM fushi_deliveries WHERE subscription_id=? AND event_seq=?').get(sub.id, event.seq).attempts;
        const transient = status == null || status === 408 || status === 429 || status >= 500;
        const state = accepted ? 'accepted' : transient && attempts < 6 ? 'pending' : 'dead';
        db.prepare(`UPDATE fushi_deliveries SET status=?,next_attempt=?,lease_until=NULL,received_at=?,last_status=?,last_error=?
            WHERE subscription_id=? AND event_seq=? AND status='inflight'`)
            .run(state, realNow + Math.min(3600000, 30000 * 2 ** (attempts - 1)), accepted ? realNow : null, status,
                accepted ? null : reason || 'callback_rejected', sub.id, event.seq);
        if (status === 410) db.prepare('UPDATE fushi_subscriptions SET active=0,secret_box=NULL,previous_secret_box=NULL WHERE id=?').run(sub.id);
    }
    return { attempted: due.length, backlog: backlog || due.length === batch };
}
function cleanup(now = Date.now()) {
    db.transaction(() => {
        const rows = db.prepare('SELECT owner_id,seq FROM fushi_events WHERE occurred_at < ? ORDER BY seq LIMIT 500').all(now - 30 * DAY);
        for (const row of rows) {
            db.prepare('INSERT INTO fushi_history VALUES (?,?) ON CONFLICT(owner_id) DO UPDATE SET floor_seq=MAX(floor_seq,excluded.floor_seq)').run(row.owner_id, row.seq);
            db.prepare('DELETE FROM fushi_events WHERE seq=?').run(row.seq);
        }
        db.prepare('DELETE FROM fushi_oauth_codes WHERE hash IN (SELECT hash FROM fushi_oauth_codes WHERE expires_at < ? LIMIT 500)').run(now - DAY);
        db.prepare('DELETE FROM fushi_oauth_tokens WHERE hash IN (SELECT hash FROM fushi_oauth_tokens WHERE expires_at < ? LIMIT 500)').run(now - DAY);
        db.prepare('DELETE FROM fushi_subscriptions WHERE id IN (SELECT id FROM fushi_subscriptions WHERE active=0 AND updated_at < ? LIMIT 100)').run(now - 30 * DAY);
        db.prepare('DELETE FROM fushi_grants WHERE id IN (SELECT id FROM fushi_grants WHERE expires_at < ? LIMIT 5)').run(now - DAY);
        // Keep tiny idempotency tombstones for the life of their source content.
        // Deleting them on a timer would allow a delayed duplicate to publish again.
    })();
}
let timer = null, running = false, enabled = false, dirty = false, lastCleanup = 0;
function wake(delay = 0) {
    if (!enabled) return;
    if (running) { dirty = true; return; }
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delay); timer.unref();
}
async function tick() {
    timer = null; running = true; dirty = false;
    let backlog = false;
    try {
        const result = await drain(); backlog = result.backlog;
        if (Date.now() - lastCleanup > 3600000) { cleanup(); lastCleanup = Date.now(); }
    } catch (_) { console.warn('Fushi queue worker failed; retry scheduled'); }
    finally { running = false; if (enabled) wake(backlog || dirty ? 0 : 30000); }
}
function start() { if (readConfig().enabled && !enabled) { enabled = true; wake(); } }
function stop() { enabled = false; if (timer) clearTimeout(timer); timer = null; }
module.exports = { NAME, subscribe, unsubscribe, enqueueNotification, drain, cleanup, start, stop,
    parseCursor, watermark, cursor, canonical, subscriptionId };
