const { randomUUID } = require('node:crypto');
const db = require('../db');
const config = require('../config');
const mailer = require('./mailer');
const settings = require('./play-test-invitation-settings');
const { getMailArtwork } = require('./mail-design');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const configured = () => Boolean(config.smtp.user && config.smtp.pass);
function application(id) {
    const row = db.prepare('SELECT * FROM play_test_applications WHERE id=?').get(id);
    if (!row) fail(404, '申请不存在');
    return row;
}
function state(id, actionUrl = settings.get().actionUrl) {
    // An interrupted SMTP exchange may have delivered the message. Never
    // retry uncertain sends automatically, including after a process restart.
    db.prepare("UPDATE play_test_invitations SET status='unknown',result='发送中断，结果待核实，未自动重发',updated_at=? WHERE application_id=? AND status='sending' AND updated_at<?").run(Date.now(), id, Date.now() - 5 * 60000);
    return db.prepare('SELECT id,status,result,sent_at,updated_at,action_url FROM play_test_invitations WHERE application_id=? AND action_url=? ORDER BY created_at DESC,id DESC LIMIT 1').get(id, actionUrl) || null;
}
function previousDelivery(id) {
    return db.prepare('SELECT status,sent_at,action_url FROM play_test_invitations WHERE application_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(id) || null;
}
function preview(id) {
    const content = settings.content(), row = application(id), delivery = state(id, content.actionUrl);
    const rendered = mailer.renderPlayTestInvitation(content.actionUrl);
    let html = rendered.html;
    for (const asset of getMailArtwork()) html = html.replaceAll(`cid:${asset.cid}`, `data:${asset.contentType};base64,${asset.content.toString('base64')}`);
    html = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">');
    return { applicationId: id, email: row.email, ...content, subject: rendered.subject, html, configured: configured(), delivery, attemptId: randomUUID(), previousAttemptId: delivery?.id || null };
}
const claim = db.transaction((id, input, creatorId) => {
    const row = application(id), content = settings.content();
    if (!input || input.confirmation !== 'SEND_PLAY_INVITATION' || input.confirmTesterAdded !== true) fail(422, '请确认收件人已加入该链接对应的 Google Play 测试名单，并确认发送');
    if (input.version !== content.version || input.email !== row.email) fail(409, '邀请内容或收件人已变化，请重新预览');
    if (!/^[a-f0-9-]{36}$/i.test(input.attemptId || '')) fail(422, '发送标识无效，请重新预览');
    const delivery = state(id);
    if (delivery?.status === 'sent') return { existing: delivery };
    if (delivery?.status === 'sending') fail(409, '邀请正在发送，请稍后刷新记录，不要重复发送');
    if (delivery?.status === 'unknown') fail(409, '发送结果待核实，请先检查邮件服务记录，未自动重发');
    assertNotSending(id);
    const previous = db.prepare('SELECT application_id FROM play_test_invitations WHERE id=?').get(input.attemptId);
    if (previous) fail(409, '此发送请求已处理，请重新预览后重试');
    if ((input.previousAttemptId || null) !== (delivery?.id || null)) fail(409, '发送记录已变化，请重新预览');
    if (!configured()) fail(503, '邮件通道未配置，暂时无法发送');
    const now = Date.now();
    db.prepare("INSERT INTO play_test_invitations(id,application_id,email,action_url,invitation_version,status,creator_id,created_at,updated_at) VALUES(?,?,?,?,?,'sending',?,?,?)")
        .run(input.attemptId, id, row.email, content.actionUrl, content.version, String(creatorId), now, now);
    return { email: row.email, attemptId: input.attemptId, actionUrl: content.actionUrl };
});
async function send(id, input, creatorId) {
    const claimed = claim(id, input, creatorId);
    if (claimed.existing) return { delivery: claimed.existing, alreadySent: true };
    let status = 'sent', result = '邮件服务已接收（不代表已读或已加入 Google 测试）';
    try { await mailer.sendPlayTestInvitation(claimed.email, claimed.actionUrl); }
    catch (error) {
        const code = /^SMTP ([45]\d\d):/.exec(String(error.message || ''))?.[1];
        status = code ? 'failed' : 'unknown';
        result = code ? `邮件服务拒绝（${code}），可重新预览后重试` : '发送结果待核实，请检查邮件服务记录，未自动重发';
    }
    db.transaction(() => {
        const now = Date.now();
        db.prepare('UPDATE play_test_invitations SET status=?,result=?,sent_at=?,updated_at=? WHERE id=?').run(status, result, status === 'sent' ? now : null, now, claimed.attemptId);
        if (status === 'sent') db.prepare("UPDATE play_test_applications SET status='invited',updated_at=? WHERE id=?").run(new Date(now).toISOString(), id);
    })();
    return { delivery: state(id, claimed.actionUrl), alreadySent: false };
}
function assertNotSending(id) {
    state(id);
    if (db.prepare("SELECT id FROM play_test_invitations WHERE application_id=? AND status='sending' LIMIT 1").get(id)) fail(409, '邮件正在发送，请完成后再修改或删除申请');
}
module.exports = { state, previousDelivery, preview, send, assertNotSending };
