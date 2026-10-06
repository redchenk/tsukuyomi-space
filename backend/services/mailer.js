const crypto = require('crypto');
const tls = require('tls');
const config = require('../config');
const { getMailArtwork, escapeHtml, renderMailFrame, renderMailHeading, renderMailPanel, renderMailNotice, renderMailAction } = require('./mail-design');

const EMAIL_CODE_TTL_MS = config.emailCodeTtlMs;
const EMAIL_CODE_COOLDOWN_MS = config.emailCodeCooldownMs;
const VERIFICATION_COPY = Object.freeze({
    register: {
        title: '注册验证码',
        lead: '完成邮箱验证，开启你的月读空间账户。',
        englishLead: 'Create your account',
        instruction: '请返回注册页面输入验证码。'
    },
    login: {
        title: '登录验证码',
        lead: '使用此验证码安全登录月读空间。',
        englishLead: 'Sign in securely',
        instruction: '请返回登录页面输入验证码。'
    },
    oauth_bind: {
        title: '绑定邮箱验证码',
        lead: '验证邮箱，为你的月读空间账户增加一种安全登录方式。',
        englishLead: 'Connect your email',
        instruction: '请返回账户页面完成邮箱绑定。'
    },
    password_reset: {
        title: '重设密码验证码',
        lead: '验证身份后，即可为账户设置新密码。',
        englishLead: 'Reset your password',
        instruction: '请返回重设密码页面输入验证码。'
    }
});

function encodeMimeWord(text) {
    return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function normalizeMailboxAddress(value) {
    const address = String(value || '').trim();
    if (!/^[^@\s<>\r\n]+@[^@\s<>\r\n]+$/.test(address)) {
        throw new Error('Invalid mailbox address');
    }
    return address;
}

function normalizeSiteUrl(value) {
    const siteUrl = String(value || '').trim();
    try {
        const parsed = new URL(siteUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
        return siteUrl.replace(/\/$/, '');
    } catch (_) {
        return 'https://yachiyo.hk';
    }
}

function wrapBase64(value) {
    return (Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8'))
        .toString('base64')
        .match(/.{1,76}/g)
        ?.join('\r\n') || '';
}

function renderVerificationEmail({
    code,
    purpose = 'register',
    ttlMinutes = 10,
    siteUrl = config.publicSiteUrl
}) {
    const copy = Object.hasOwn(VERIFICATION_COPY, purpose) ? VERIFICATION_COPY[purpose] : VERIFICATION_COPY.register;
    const safeCode = String(code || '').trim();
    const safeTtlMinutes = Math.max(1, Math.ceil(Number(ttlMinutes) || 10));
    const safeSiteUrl = normalizeSiteUrl(siteUrl);
    const subject = `【月读空间】${copy.title}`;
    const instruction = copy.instruction;
    const text = [
        `${copy.title}：${safeCode}，${safeTtlMinutes} 分钟内有效。`,
        `${copy.lead} ${copy.englishLead}.`,
        instruction,
        '',
        `打开月读空间：${safeSiteUrl}`,
        '如果不是你本人操作，请忽略这封邮件，不要将验证码告诉任何人。',
        '',
        `Tsukuyomi Space · ${new URL(safeSiteUrl).hostname}`
    ].join('\r\n');
    const body = renderMailHeading({ label: '邮箱验证', title: copy.title, lead: copy.lead, englishLead: copy.englishLead })
        + renderMailPanel(`<div class="mail-code" style="color:#25304a; font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace; font-size:40px; line-height:1.3; font-weight:700; letter-spacing:2px; text-align:center; overflow-wrap:anywhere; word-break:break-word;">${escapeHtml(safeCode)}</div>
            <p class="mail-muted" style="margin:12px 0 0; color:#626e84; font-size:13px; line-height:1.7; text-align:center;">${safeTtlMinutes} 分钟内有效 · Valid for ${safeTtlMinutes} minutes</p>`, { code: true })
        + renderMailNotice(`${instruction}\n如果不是你本人操作，请忽略这封邮件。\n请勿向任何人透露验证码。月读空间不会通过邮件索要密码。`)
        + renderMailAction(safeSiteUrl, '返回月读空间');
    const html = renderMailFrame({ subject, preheader: `${copy.title}：${safeCode}，${safeTtlMinutes} 分钟内有效。`, body, siteUrl: safeSiteUrl });
    return { subject, text, html };
}

const NOTIFICATION_COPY = Object.freeze({
    moderation: {
        label: 'CONTENT REVIEW / 待审核留言',
        defaultTitle: '有新的内容需要审核',
        lead: '网站有留言、评论或回复等待人工审核。请核对内容和审核原因后再决定是否公开。',
        action: '前往审核',
        defaultPath: '/terminal?panel=messages'
    },
    reply: {
        label: 'NEW COMMENT OR REPLY / 新评论或回复',
        defaultTitle: '你的内容有了新评论或回复',
        lead: '你分享的内容收到了新评论或回复。',
        action: '查看内容',
        defaultPath: '/notifications'
    },
    like: {
        label: 'NEW LIKE / 新点赞',
        defaultTitle: '你的创作收到了新点赞',
        lead: '有人喜欢你在月读空间分享的内容。',
        action: '查看动态',
        defaultPath: '/notifications'
    },
    login_alert: {
        label: 'ACCOUNT SECURITY / 账户安全',
        defaultTitle: '新地点登录提醒',
        lead: '你的账户从新的地点登录。若这是你本人操作，无需处理；若不是，请尽快检查账户并修改密码。',
        action: '检查账户',
        defaultPath: '/user-center'
    }
});

function mailPreview(value, maxLength = 360) {
    const clean = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function notificationActionUrl(link, siteUrl, defaultPath) {
    const base = new URL(normalizeSiteUrl(siteUrl));
    try {
        const candidate = String(link || defaultPath).trim();
        const target = new URL(candidate, base);
        if (target.origin !== base.origin || !['http:', 'https:'].includes(target.protocol)) {
            return new URL(defaultPath, base).href;
        }
        return target.href;
    } catch (_) {
        return new URL(defaultPath, base).href;
    }
}

function notificationDate(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

function renderNotificationEmail({
    type = 'reply',
    title,
    content,
    link,
    actorName,
    location,
    device,
    ip,
    occurredAt,
    siteUrl = config.publicSiteUrl
} = {}) {
    const copy = Object.hasOwn(NOTIFICATION_COPY, type) ? NOTIFICATION_COPY[type] : NOTIFICATION_COPY.reply;
    const safeTitle = mailPreview(title, 100) || copy.defaultTitle;
    const safeContent = mailPreview(content);
    const safeActorName = mailPreview(actorName, 80);
    const actionUrl = notificationActionUrl(link, siteUrl, copy.defaultPath);
    const details = type === 'login_alert'
        ? [
            ['登录地点', mailPreview(location, 120) || '未知地点'],
            ['设备 / 浏览器', mailPreview(device, 160) || '未知设备'],
            ['IP 地址', mailPreview(ip, 80) || '未提供'],
            ['登录时间', notificationDate(occurredAt) || '未提供']
        ]
        : [];
    const description = type === 'login_alert' ? copy.lead : (safeContent || copy.lead);
    const subject = `【月读空间】${safeTitle}`;
    const text = [
        safeTitle,
        copy.lead,
        safeActorName && type !== 'login_alert' ? `来自：${safeActorName}` : '',
        safeContent ? `\n${safeContent}` : '',
        ...details.map(([label, value]) => `${label}：${value}`),
        '',
        `${copy.action}：${actionUrl}`,
        type === 'moderation' ? '你已开启审核邮件提醒，可在 Terminal → 通知设置中关闭。' : type === 'login_alert' ? '如果这不是你本人操作，请立即修改密码。' : '你可以在网站中查看完整通知。',
        '',
        '月读空间 · Tsukuyomi Space'
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\r\n');
    const detailRows = details.map(([label, value], index) => `
        <tr><td width="88" class="mail-muted" valign="top" style="padding:${index ? '10px' : '0'} 12px 0 0; color:#626e84; font-size:12px; line-height:1.8; overflow-wrap:anywhere; word-break:break-word;">${escapeHtml(label)}</td>
        <td class="mail-ink" valign="top" style="padding:${index ? '10px' : '0'} 0 0; color:#25304a; font-size:13px; line-height:1.8; overflow-wrap:anywhere; word-break:break-word;">${escapeHtml(value)}</td></tr>`).join('');
    const notice = type === 'moderation'
        ? '你已开启审核邮件提醒，可在 Terminal → 通知设置中关闭。\n请在网站审核页面核对内容和审核原因。'
        : type === 'login_alert'
            ? '若非本人登录，请立即修改密码，保护你的账户。\n月读空间不会通过邮件索要密码或验证码。'
            : '你可以在网站中查看完整内容和站内信。';
    const body = renderMailHeading({ label: copy.label, title: safeTitle, lead: copy.lead, icon: type === 'login_alert' ? '✓' : type === 'like' ? '♡' : '✉︎' })
        + (safeActorName && type !== 'login_alert' ? `<p class="mail-muted" style="margin:14px 0 0; color:#626e84; font-size:13px; line-height:1.8; overflow-wrap:anywhere; word-break:break-word;">来自 <strong class="mail-ink" style="color:#25304a;">${escapeHtml(safeActorName)}</strong></p>` : '')
        + renderMailPanel(type === 'login_alert'
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; table-layout:fixed;">${detailRows}</table>`
            : `<div class="mail-ink" style="color:#25304a; font-size:15px; line-height:1.9; overflow-wrap:anywhere; word-break:break-word;">${escapeHtml(description)}</div>`)
        + renderMailNotice(notice)
        + renderMailAction(actionUrl, copy.action);
    const html = renderMailFrame({ subject, preheader: `${copy.lead} ${safeContent}`, body, siteUrl: normalizeSiteUrl(siteUrl) });
    return { subject, text, html };
}

function buildMultipartMessage({ fromName, fromEmail, toEmail, content }) {
    const sender = normalizeMailboxAddress(fromEmail);
    const recipient = normalizeMailboxAddress(toEmail);
    const boundary = `tsukuyomi_${crypto.randomBytes(18).toString('hex')}`;
    const related = `${boundary}_images`;
    const htmlId = `${boundary}@tsukuyomi`;
    const messageId = `${crypto.randomBytes(18).toString('hex')}@${sender.split('@')[1]}`;
    const imageParts = getMailArtwork().flatMap(asset => [
        `--${related}`,
        `Content-Type: ${asset.contentType}; name="${asset.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${asset.cid}>`,
        `Content-Disposition: inline; filename="${asset.filename}"`,
        '',
        wrapBase64(asset.content)
    ]);
    return [
        `From: ${encodeMimeWord(fromName || '月读空间')} <${sender}>`,
        `To: <${recipient}>`,
        `Subject: ${encodeMimeWord(content.subject)}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <${messageId}>`,
        'Auto-Submitted: auto-generated',
        'X-Auto-Response-Suppress: All',
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        wrapBase64(content.text),
        `--${boundary}`,
        `Content-Type: multipart/related; boundary="${related}"; type="text/html"; start="<${htmlId}>"`,
        '',
        `--${related}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${htmlId}>`,
        '',
        wrapBase64(content.html),
        ...imageParts,
        `--${related}--`,
        `--${boundary}--`,
        ''
    ].join('\r\n');
}

function buildNotificationMessage({ fromName, fromEmail, toEmail, notification = {} }) {
    return buildMultipartMessage({
        fromName,
        fromEmail,
        toEmail,
        content: renderNotificationEmail(notification)
    });
}

function buildVerificationMessage({
    fromName,
    fromEmail,
    toEmail,
    code,
    purpose,
    ttlMinutes,
    siteUrl
}) {
    return buildMultipartMessage({
        fromName, fromEmail, toEmail,
        content: renderVerificationEmail({ code, purpose, ttlMinutes, siteUrl })
    });
}

function createSmtpClient() {
    const smtp = config.smtp;
    const socket = tls.connect({
        host: smtp.host,
        port: smtp.port,
        servername: smtp.host,
        rejectUnauthorized: true
    });
    socket.setEncoding('utf8');
    socket.setTimeout(15000);

    let buffer = '';
    const pending = [];

    const failPending = (error) => {
        while (pending.length) pending.shift().reject(error);
    };
    socket.on('error', failPending);
    socket.on('timeout', () => {
        failPending(new Error('SMTP connection timed out'));
        socket.destroy();
    });
    socket.on('close', () => failPending(new Error('SMTP connection closed')));

    socket.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index + 1).replace(/\r?\n$/, '');
            buffer = buffer.slice(index + 1);
            const waiter = pending[0];
            if (waiter) waiter.lines.push(line);
            if (/^\d{3} /.test(line) && waiter) {
                pending.shift();
                const code = Number(line.slice(0, 3));
                if (waiter.expected.includes(code)) {
                    waiter.resolve(waiter.lines.join('\n'));
                } else {
                    waiter.reject(new Error(`SMTP ${code}: ${waiter.lines.join('\n')}`));
                }
            }
        }
    });

    const read = (expected) => new Promise((resolve, reject) => {
        pending.push({ expected, lines: [], resolve, reject });
    });

    const write = async (line, expected = [250]) => {
        socket.write(`${line}\r\n`);
        return read(expected);
    };

    return { socket, read, write };
}

async function sendVerificationEmail(email, code, purpose) {
    const smtp = config.smtp;
    if (!smtp.user || !smtp.pass) {
        throw new Error('SMTP credentials are not configured');
    }

    const message = buildVerificationMessage({
        fromName: smtp.fromName,
        fromEmail: smtp.user,
        toEmail: email,
        code,
        purpose,
        ttlMinutes: Math.floor(EMAIL_CODE_TTL_MS / 60000),
        siteUrl: config.publicSiteUrl
    });

    await sendSmtpMessage(email, message);
}

async function sendSmtpMessage(email, message) {
    const smtp = config.smtp;
    const recipient = normalizeMailboxAddress(email);
    const client = createSmtpClient();
    try {
        await client.read([220]);
        await client.write(`EHLO ${smtp.host}`, [250]);
        await client.write('AUTH LOGIN', [334]);
        await client.write(Buffer.from(smtp.user).toString('base64'), [334]);
        await client.write(Buffer.from(smtp.pass).toString('base64'), [235]);
        await client.write(`MAIL FROM:<${smtp.user}>`, [250]);
        await client.write(`RCPT TO:<${recipient}>`, [250, 251]);
        await client.write('DATA', [354]);
        client.socket.write(`${message}\r\n.\r\n`);
        await client.read([250]);
        await client.write('QUIT', [221]);
    } finally {
        client.socket.end();
    }
}

async function sendNotificationEmail(toEmail, notification) {
    const smtp = config.smtp;
    if (!smtp.user || !smtp.pass) throw new Error('SMTP credentials are not configured');
    const message = buildNotificationMessage({
        fromName: smtp.fromName,
        fromEmail: smtp.user,
        toEmail,
        notification: { ...notification, siteUrl: config.publicSiteUrl }
    });
    await sendSmtpMessage(toEmail, message);
}

module.exports = {
    EMAIL_CODE_TTL_MS,
    EMAIL_CODE_COOLDOWN_MS,
    buildVerificationMessage,
    buildNotificationMessage,
    renderVerificationEmail,
    renderNotificationEmail,
    sendVerificationEmail,
    sendNotificationEmail
};
