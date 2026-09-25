const express = require('express');
const config = require('../config');
const { moderationEmailPreference, saveModerationEmailPreference } = require('../services/notification-settings');

// Mounted behind each router's existing administrator authentication. The
// recipient always comes from the session, never a client-supplied account ID.
const router = express.Router();
function userId(req) { return req.user.scope === 'admin' ? req.user.siteUserId : req.user.id; }
function settings(req) {
    return { ...moderationEmailPreference(userId(req)), mailConfigured: Boolean(config.smtp.user && config.smtp.pass) };
}

router.get('/', (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, data: settings(req) });
});

router.post('/', (req, res) => {
    if (Object.keys(req.body || {}).some(key => key !== 'emailNotifyModeration') || typeof req.body?.emailNotifyModeration !== 'boolean') {
        return res.status(400).json({ success: false, message: '请使用开关设置当前账号的待审核留言邮件提醒' });
    }
    const enabled = req.body.emailNotifyModeration;
    if (!userId(req) || (enabled && !settings(req).canReceive)) {
        return res.status(400).json({ success: false, message: '当前管理员账号未绑定可接收邮件的真实邮箱，请先绑定邮箱' });
    }
    saveModerationEmailPreference(userId(req), enabled);
    res.json({ success: true, data: settings(req), message: '我的审核邮件提醒已保存' });
});

module.exports = router;
