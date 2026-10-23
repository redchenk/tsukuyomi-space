const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const { publicEmail, isEmail } = require('../validators');
const mailer = require('./mailer');
const { getMailArtwork } = require('./mail-design');
const MAX_RECIPIENTS = 10000;
const DRAFT_TTL = 30 * 60000;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const configured = () => Boolean(config.smtp.user && config.smtp.pass);
const address = value => {
    const email = publicEmail(value);
    return isEmail(email) && !/[<>\r\n]/.test(email) && email.length <= 254 ? email : '';
};

function filters(input = {}) {
    const search = String(input.search || '').trim();
    const role = String(input.role || 'all');
    if (search.length > 120 || !['all', 'user', 'admin'].includes(role)) fail('筛选条件无效');
    return { search, role };
}

function candidates(input = {}) {
    const { search, role } = filters(input);
    return db.prepare(`SELECT id, username, nickname, email, role FROM users
        WHERE (? = 'all' OR role = ?) AND (? = '' OR instr(lower(id || ' ' || username || ' ' || coalesce(nickname,'') || ' ' || coalesce(email,'')),lower(?)) > 0)
        ORDER BY created_at DESC, id`).iterate(role, role, search, search);
}

function recipients(input = {}) {
    if (!['selected', 'filtered'].includes(input.mode)) fail('请选择收件方式');
    let selected;
    if (input.mode === 'selected') {
        if (!Array.isArray(input.userIds) || !input.userIds.length || input.userIds.length > MAX_RECIPIENTS || input.userIds.some(id => typeof id !== 'string' || id.length > 128)) fail('请选择有效的收件用户');
        selected = new Set(input.userIds);
    }
    const unique = new Map();
    for (const user of candidates(selected ? {} : input)) {
        if (selected && !selected.has(user.id)) continue;
        const email = address(user.email);
        if (email && !unique.has(email)) unique.set(email, { ...user, email });
        if (unique.size > MAX_RECIPIENTS) fail('单次最多发送 10000 个邮箱，请缩小筛选范围后分批发送');
    }
    if (!unique.size) fail('所选用户没有可接收邮件的邮箱');
    return [...unique.values()];
}

function listRecipients(input) {
    const page = Math.max(1, Math.min(100000, Number.parseInt(input.page, 10) || 1));
    const limit = 8;
    let total = 0;
    const items = [];
    for (const user of candidates(input)) {
        const email = address(user.email);
        if (!email) continue;
        if (total >= (page - 1) * limit && items.length < limit) items.push({ ...user, email });
        total++;
    }
    return { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function content(input) {
    if (typeof input.subject !== 'string' || typeof input.body !== 'string') fail('请填写邮件主题和正文');
    const subject = input.subject.trim(), body = input.body.replace(/\r\n?/g, '\n').trim();
    if (!subject || subject.length > 120 || /[\u0000-\u001f\u007f]/.test(subject)) fail('主题需为 1–120 个字符，不能包含换行');
    if (!body || body.length > 10000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) fail('正文需为 1–10000 个有效字符');
    let actionUrl = String(input.actionUrl || '').trim();
    const actionLabel = String(input.actionLabel || '查看详情').trim();
    if (actionLabel.length > 30 || /[\u0000-\u001f]/.test(actionLabel)) fail('按钮文字不能超过 30 个字符');
    if (actionUrl) {
        try {
            const base = new URL(config.publicSiteUrl), url = new URL(actionUrl, base);
            if (url.origin !== base.origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || actionUrl.length > 1000) throw new Error();
            actionUrl = url.href;
        } catch { fail('按钮链接需为本站地址，例如 /stage'); }
    }
    return { subject, body, actionUrl, actionLabel: actionLabel || '查看详情' };
}

function getCampaign(id) {
    const row = db.prepare('SELECT * FROM mail_campaigns WHERE id=?').get(id);
    if (!row) fail('发送记录不存在', 404);
    const counts = Object.fromEntries(['pending','sending','sent','failed','unknown','skipped','cancelled'].map(key => [key, 0]));
    for (const group of db.prepare('SELECT status,COUNT(*) n FROM mail_campaign_recipients WHERE campaign_id=? GROUP BY status').all(id)) counts[group.status] = group.n;
    return { id, subject: row.subject, body: row.body, actionUrl: row.action_url, actionLabel: row.action_label,
        status: row.status, createdAt: row.created_at, queuedAt: row.queued_at, counts, total: Object.values(counts).reduce((a,b) => a+b,0),
        audience: (() => { const audience = JSON.parse(row.audience_json); return audience.mode === 'selected' ? { mode: 'selected' } : audience; })() };
}

function previewHtml(campaign) {
    let html = mailer.renderCampaignEmail(campaign).html;
    for (const asset of getMailArtwork()) html = html.replaceAll(`cid:${asset.cid}`, `data:${asset.contentType};base64,${asset.content.toString('base64')}`);
    return html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">');
}

const prepare = db.transaction((creatorId, input) => {
    if (!/^[a-f0-9-]{36}$/i.test(input.id || '')) fail('请求标识无效，请重新预览');
    const mail = content(input);
    const audience = input.audience;
    if (!audience || typeof audience !== 'object') fail('请选择收件人');
    const normalizedAudience = audience.mode === 'selected'
        ? { mode: 'selected', userIds: [...new Set(Array.isArray(audience.userIds) ? audience.userIds : [])].sort() }
        : { mode: audience.mode, ...filters(audience) };
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ mail, audience: normalizedAudience })).digest('hex');
    const previous = db.prepare('SELECT * FROM mail_campaigns WHERE id=?').get(input.id);
    if (previous) {
        if (previous.creator_id !== String(creatorId) || previous.fingerprint !== fingerprint) fail('请求已被使用，请重新预览', 409);
    } else {
        const users = recipients(normalizedAudience);
        const now = Date.now();
        // Discard only expired, unsent previews; sent history remains available.
        db.prepare("DELETE FROM mail_campaigns WHERE status='draft' AND created_at<?").run(now - 86400000);
        db.prepare('INSERT INTO mail_campaigns(id,creator_id,fingerprint,subject,body,action_url,action_label,audience_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(input.id, String(creatorId), fingerprint, mail.subject, mail.body, mail.actionUrl, mail.actionLabel, JSON.stringify(normalizedAudience), now);
        const add = db.prepare('INSERT INTO mail_campaign_recipients(campaign_id,user_id,email,updated_at) VALUES(?,?,?,?)');
        for (const user of users) add.run(input.id,user.id,user.email,now);
    }
    const campaign = getCampaign(input.id);
    return { campaign, html: previewHtml(campaign), recipients: campaignRecipients(input.id, 1) };
});

function campaignRecipients(id, page = 1) {
    getCampaign(id);
    page = Math.max(1, Number.parseInt(page, 10) || 1);
    return db.prepare('SELECT user_id AS userId,email,status,result FROM mail_campaign_recipients WHERE campaign_id=? ORDER BY id LIMIT 20 OFFSET ?').all(id,(page-1)*20);
}

function ownCampaign(id, creatorId) {
    const row = db.prepare('SELECT * FROM mail_campaigns WHERE id=?').get(id);
    if (!row) fail('发送记录不存在', 404);
    if (row.creator_id !== String(creatorId)) fail('只能操作本人创建的邮件', 403);
    return row;
}

const enqueue = db.transaction((id, creatorId) => {
    const row = ownCampaign(id, creatorId);
    if (row.status !== 'draft') return getCampaign(id);
    if (!configured()) fail('邮件通道未配置，暂时无法发送', 503);
    if (Date.now() - row.created_at > DRAFT_TTL) fail('预览已过期，请重新确认收件人和内容', 409);
    db.prepare("UPDATE mail_campaigns SET status='queued',queued_at=? WHERE id=? AND status='draft'").run(Date.now(),id);
    return getCampaign(id);
});

const cancel = db.transaction((id, creatorId) => {
    const row = ownCampaign(id, creatorId);
    if (['draft','queued','running'].includes(row.status)) {
        db.prepare("UPDATE mail_campaigns SET status='cancelled' WHERE id=?").run(id);
        db.prepare("UPDATE mail_campaign_recipients SET status='cancelled',updated_at=? WHERE campaign_id=? AND status='pending'").run(Date.now(),id);
    }
    return getCampaign(id);
});

const claim = db.transaction(() => {
    const now = Date.now();
    // A process may have stopped after SMTP accepted a message. Never resend it automatically.
    db.prepare("UPDATE mail_campaign_recipients SET status='unknown',result='发送中断，收件结果待核实，未自动重发',updated_at=? WHERE status='sending' AND updated_at<?").run(now,now-5*60000);
    db.prepare("UPDATE mail_campaigns SET status='completed' WHERE status IN ('queued','running') AND NOT EXISTS (SELECT 1 FROM mail_campaign_recipients r WHERE r.campaign_id=mail_campaigns.id AND r.status IN ('pending','sending'))").run();
    const row = db.prepare("SELECT r.*,c.subject,c.body,c.action_url,c.action_label FROM mail_campaign_recipients r JOIN mail_campaigns c ON c.id=r.campaign_id WHERE r.status='pending' AND c.status IN ('queued','running') ORDER BY c.queued_at,r.id LIMIT 1").get();
    if (!row) return null;
    db.prepare("UPDATE mail_campaign_recipients SET status='sending',updated_at=? WHERE id=?").run(now,row.id);
    db.prepare("UPDATE mail_campaigns SET status='running' WHERE id=?").run(row.campaign_id);
    return row;
});

async function runOnce({ send = mailer.sendCampaignEmail } = {}) {
    if (!configured()) return false;
    const row = claim();
    if (!row) return false;
    let status = 'sent', result = '邮件服务已接收';
    const user = db.prepare('SELECT email FROM users WHERE id=?').get(row.user_id);
    if (!user || address(user.email) !== row.email) { status = 'skipped'; result = '账号已删除或邮箱已变更'; }
    else {
        try { await send(row.email, { subject: row.subject, body: row.body, actionUrl: row.action_url, actionLabel: row.action_label }); }
        catch (error) {
            const code = /^SMTP ([45]\d\d):/.exec(String(error.message || ''))?.[1];
            status = code ? 'failed' : 'unknown';
            result = code ? `邮件服务拒绝（${code}）` : '发送结果待核实，未自动重发';
        }
    }
    db.prepare("UPDATE mail_campaign_recipients SET status=?,result=?,updated_at=? WHERE id=? AND status='sending'").run(status,result,Date.now(),row.id);
    db.prepare("UPDATE mail_campaigns SET status='completed' WHERE id=? AND status='running' AND NOT EXISTS (SELECT 1 FROM mail_campaign_recipients WHERE campaign_id=? AND status IN ('pending','sending'))").run(row.campaign_id,row.campaign_id);
    return true;
}

let timer, busy = false;
function start() {
    if (timer) return;
    timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try { await runOnce(); } catch (error) { console.error('Mail campaign worker failed:', error.code || error.name); }
        finally { busy = false; }
    }, 1000);
    timer.unref();
}
function list() {
    return db.prepare("SELECT id FROM mail_campaigns WHERE status!='draft' ORDER BY created_at DESC LIMIT 30").all().map(row => {
        const { body, actionUrl, actionLabel, ...summary } = getCampaign(row.id);
        return summary;
    });
}
module.exports = { configured, listRecipients, prepare, enqueue, cancel, getCampaign, campaignRecipients, previewHtml, list, runOnce, start };
