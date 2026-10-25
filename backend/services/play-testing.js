const { randomUUID } = require('node:crypto');
const db = require('../db');
const policy = require('../../shared/play-testing.json');
const invitations = require('./play-test-invitations');
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function text(value, max, field) {
    if (value == null) return '';
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail(422, `${field}格式不正确`);
    return value.trim();
}
function settings() {
    const row = db.prepare('SELECT * FROM play_test_settings WHERE id=1').get();
    return { registrationOpen: Boolean(row.registration_open), joinUrl: row.join_url, consentVersion: policy.consentVersion };
}
function saveSettings(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(422, '设置格式不正确');
    if (typeof input.registrationOpen !== 'boolean') fail(422, '请选择是否开放报名');
    const joinUrl = text(input.joinUrl, 300, '测试链接');
    if (joinUrl && joinUrl !== `https://play.google.com/apps/testing/${policy.packageName}`) fail(422, '仅支持本应用 Google Play 封闭测试的加入链接');
    if (joinUrl && input.confirmPublished !== true) fail(422, '请先确认封闭测试已发布，且已配置测试名单');
    db.prepare('UPDATE play_test_settings SET registration_open=?,join_url=? WHERE id=1').run(Number(input.registrationOpen), joinUrl);
    return settings();
}
function apply(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(422, '申请格式不正确');
    if (!settings().registrationOpen) fail(409, '本轮报名已暂停，请稍后查看本页');
    if (input.website) return { received: true };
    const email = text(input.email, 254, 'Google 账号邮箱').toLowerCase();
    // Google accounts need not use Gmail. Restrict control/formula characters
    // so the single-column, BOM-free Play Console CSV is safe to open too.
    if (!/^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) fail(422, '请填写有效的 Google 账号邮箱');
    if (input.consent !== true || input.eligible !== true || input.consentVersion !== policy.consentVersion) fail(422, '请确认参与条件与邮箱使用说明');
    const device = text(input.device, 80, '设备型号');
    const version = text(input.androidVersion, 30, 'Android 版本');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO play_test_applications(id,email,device,android_version,consent_version,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING`).run(randomUUID(), email, device, version, policy.consentVersion, now, now);
    // Identical new/duplicate receipts do not disclose who already applied.
    // An unauthenticated resubmission must never overwrite another application.
    return { received: true };
}
function filter(query = {}) {
    const status = query.status || 'pending';
    if (!['all','pending','invited'].includes(status)) fail(422, '申请状态无效');
    const search = text(query.search, 100, '搜索内容');
    return { where: `${status === 'all' ? '1=1' : 'status=@status'} AND (instr(email,@search)>0 OR instr(lower(device),@search)>0)`, args: { status, search: search.toLowerCase() } };
}
function list(query = {}) {
    const { where, args } = filter(query);
    const total = db.prepare(`SELECT count(*) total FROM play_test_applications WHERE ${where}`).get(args).total;
    const totalPages = Math.max(1, Math.ceil(total / 30));
    const page = Math.min(totalPages, Math.max(1, Math.floor(Number(query.page) || 1)));
    const items = db.prepare(`SELECT * FROM play_test_applications WHERE ${where} ORDER BY created_at DESC,id LIMIT 30 OFFSET @offset`).all({ ...args, offset: (page - 1) * 30 });
    return { items: items.map(item => ({ ...item, delivery: invitations.state(item.id), previousDelivery: invitations.previousDelivery(item.id) })), total, page, totalPages };
}
function csv(query) {
    const { where, args } = filter(query);
    const rows = db.prepare(`SELECT email FROM play_test_applications WHERE ${where} ORDER BY email LIMIT 10001`).all(args);
    if (rows.length > 10000) fail(422, '结果超过 10000 条，请缩小筛选范围');
    return rows.map(row => row.email).join('\n') + (rows.length ? '\n' : '');
}
function update(id, input = {}) {
    if (!input || typeof input !== 'object') fail(422, '申请状态无效');
    if (!['pending','invited'].includes(input.status)) fail(422, '申请状态无效');
    if (input.status === 'invited') fail(409, '请使用发送邀请邮件功能，邮件服务接收后会自动登记');
    invitations.assertNotSending(id);
    const result = db.prepare('UPDATE play_test_applications SET status=?,updated_at=? WHERE id=?').run(input.status, new Date().toISOString(), id);
    if (!result.changes) fail(404, '申请不存在');
    return { updated: true };
}
function remove(id, input = {}) {
    if (!input || typeof input !== 'object') fail(422, '请确认删除申请及邮箱资料');
    if (input.confirmation !== 'DELETE_APPLICATION') fail(422, '请确认删除申请及邮箱资料');
    invitations.assertNotSending(id);
    db.prepare('DELETE FROM play_test_applications WHERE id=?').run(id);
    return { deleted: true };
}
module.exports = { settings, saveSettings, apply, list, csv, update, remove };
