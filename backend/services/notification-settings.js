const db = require('../db');
const { isEmail, publicEmail } = require('../validators');

const MODERATION_EMAIL_PREFIX = 'emailNotifyModeration:';

function moderationEmailPreference(userId) {
    const user = db.prepare('SELECT role, email FROM users WHERE id = ?').get(userId || '');
    const email = publicEmail(user?.email);
    const eligible = ['admin', 'super_admin'].includes(user?.role) && isEmail(email);
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(`${MODERATION_EMAIL_PREFIX}${userId}`);
    return { emailNotifyModeration: row?.value === 'true', email: eligible ? email : '', canReceive: Boolean(eligible) };
}

function saveModerationEmailPreference(userId, enabled) {
    db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(`${MODERATION_EMAIL_PREFIX}${userId}`, String(enabled));
}

const EMAIL_NOTIFICATION_KEYS = Object.freeze([
    'emailNotifyReplies',
    'emailNotifyLikes',
    'emailNotifyUnusualLogin'
]);

const EMAIL_NOTIFICATION_KEY_SET = new Set(EMAIL_NOTIFICATION_KEYS);

function emailNotificationSettings() {
    const settings = Object.fromEntries(EMAIL_NOTIFICATION_KEYS.map(key => [key, false]));
    const rows = db.prepare(`
        SELECT key, value FROM site_settings
        WHERE key IN ('emailNotifyReplies', 'emailNotifyLikes', 'emailNotifyUnusualLogin')
    `).all();
    for (const { key, value } of rows) settings[key] = value === 'true';
    return settings;
}

function isEmailNotificationEnabled(key) {
    if (!EMAIL_NOTIFICATION_KEY_SET.has(key)) return false;
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
    return row?.value === 'true';
}

module.exports = {
    MODERATION_EMAIL_PREFIX,
    moderationEmailPreference,
    saveModerationEmailPreference,
    EMAIL_NOTIFICATION_KEYS,
    EMAIL_NOTIFICATION_KEY_SET,
    emailNotificationSettings,
    isEmailNotificationEnabled
};
