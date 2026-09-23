const crypto = require('crypto');
const ipaddr = require('ipaddr.js');
const db = require('../db');
const { isEmail, publicEmail } = require('../validators');
const { isEmailNotificationEnabled } = require('./notification-settings');
const { sendNotificationEmail } = require('./mailer');

function publicIp(value) {
    const raw = String(value || '').trim().replace(/^\[|\]$/g, '');
    if (!ipaddr.isValid(raw)) return '';
    const address = ipaddr.process(raw);
    return address.range() === 'unicast' ? address.toString() : '';
}

function locationChanged(before, after) {
    if (!before || !after?.country_code) return false;
    if (before.country_code !== after.country_code) return true;
    if (before.city && after.city) return before.city !== after.city || before.region !== after.region;
    return Boolean(before.region && after.region && before.region !== after.region);
}

function locationLabel(location) {
    return [location.country_code, location.region, location.city].filter(Boolean).join(' · ');
}

async function lookupIpLocation(ip) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
        const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
            signal: controller.signal,
            redirect: 'error',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) return null;
        const payload = await response.json();
        if (payload.success !== true || !/^[A-Z]{2}$/.test(String(payload.country_code || ''))) return null;
        return {
            country_code: String(payload.country_code).slice(0, 4).toUpperCase(),
            region: String(payload.region || '').slice(0, 100),
            city: String(payload.city || '').slice(0, 100)
        };
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function loadLocation(userId) {
    return db.prepare('SELECT * FROM user_login_location_state WHERE user_id = ?').get(userId);
}

function saveLocation(userId, fingerprint, location) {
    db.prepare(`
        INSERT INTO user_login_location_state (user_id, ip_fingerprint, country_code, region, city)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            ip_fingerprint = excluded.ip_fingerprint,
            country_code = excluded.country_code,
            region = excluded.region,
            city = excluded.city,
            updated_at = CURRENT_TIMESTAMP
    `).run(userId, fingerprint, location.country_code, location.region, location.city);
}

async function recordSuccessfulLogin({ user, ip, userAgent = '' }, dependencies = {}) {
    const {
        enabled = isEmailNotificationEnabled,
        load = loadLocation,
        save = saveLocation,
        lookup = lookupIpLocation,
        mail = sendNotificationEmail
    } = dependencies;
    if (!user?.id || !enabled('emailNotifyUnusualLogin')) return false;
    const email = publicEmail(user.email);
    const address = publicIp(ip);
    if (!isEmail(email) || !address) return false;
    const fingerprint = crypto.createHash('sha256').update(address).digest('hex');
    const previous = load(user.id);
    if (previous?.ip_fingerprint === fingerprint) return false;
    const location = await lookup(address);
    if (!location?.country_code) return false;
    save(user.id, fingerprint, location);
    if (!locationChanged(previous, location)) return false;
    await mail(email, {
        type: 'login_alert',
        title: '新地点登录提醒',
        location: locationLabel(location),
        device: String(userAgent).slice(0, 160),
        ip: address,
        occurredAt: new Date(),
        link: '/user-center'
    });
    return true;
}

function queueLoginLocationCheck(req, user) {
    const ip = req.ip || req.socket?.remoteAddress || '';
    const userAgent = req.get('user-agent') || '';
    setImmediate(() => {
        recordSuccessfulLogin({ user, ip, userAgent }).catch((error) => {
            console.error('Login location alert failed:', error.message);
        });
    });
}

module.exports = {
    publicIp,
    locationChanged,
    lookupIpLocation,
    recordSuccessfulLogin,
    queueLoginLocationCheck
};
