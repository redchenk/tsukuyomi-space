const db = require('../db');
const template = require('./play-test-invitation-content');
function content() {
    return template.build(db.prepare('SELECT invitation_url FROM play_test_settings WHERE id=1').get().invitation_url);
}
function get() {
    const { actionUrl, track } = content();
    return { actionUrl, track };
}
const save = db.transaction(input => {
    const actionUrl = template.normalizeActionUrl(input?.actionUrl);
    const current = get();
    if (input?.previousActionUrl !== current.actionUrl) throw Object.assign(new Error('邀请链接已被更新，请刷新后重新编辑'), { status: 409 });
    db.prepare('UPDATE play_test_settings SET invitation_url=? WHERE id=1').run(actionUrl);
    return get();
});
module.exports = { content, get, save };
