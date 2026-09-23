const db = require('../db');

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
    EMAIL_NOTIFICATION_KEYS,
    EMAIL_NOTIFICATION_KEY_SET,
    emailNotificationSettings,
    isEmailNotificationEnabled
};
