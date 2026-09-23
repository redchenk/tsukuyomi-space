const crypto = require('crypto');
const tls = require('tls');
const config = require('../config');

const EMAIL_CODE_TTL_MS = config.emailCodeTtlMs;
const EMAIL_CODE_COOLDOWN_MS = config.emailCodeCooldownMs;
const VERIFICATION_COPY = Object.freeze({
    register: {
        title: '注册验证码',
        lead: '完成邮箱验证，开启你的月读空间账户。',
        englishLead: 'Create your account'
    },
    login: {
        title: '登录验证码',
        lead: '使用此验证码安全登录月读空间。',
        englishLead: 'Sign in securely'
    },
    oauth_bind: {
        title: '绑定邮箱验证码',
        lead: '验证邮箱，为你的月读空间账户增加一种安全登录方式。',
        englishLead: 'Connect your email'
    },
    password_reset: {
        title: '重设密码验证码',
        lead: '验证身份后，即可为账户设置新密码。',
        englishLead: 'Reset your password'
    }
});

function encodeMimeWord(text) {
    return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    return Buffer.from(String(value), 'utf8')
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
    const copy = VERIFICATION_COPY[purpose] || VERIFICATION_COPY.register;
    const safeCode = String(code || '').trim();
    const safeTtlMinutes = Math.max(1, Math.ceil(Number(ttlMinutes) || 10));
    const safeSiteUrl = normalizeSiteUrl(siteUrl);
    const subject = `【月读空间】${copy.title}`;
    const text = [
        `${copy.title}：${safeCode}，${safeTtlMinutes} 分钟内有效。`,
        `${copy.lead} ${copy.englishLead}.`,
        '',
        `打开月读空间：${safeSiteUrl}`,
        '如果不是你本人操作，请忽略这封邮件，不要将验证码告诉任何人。',
        '',
        'Tsukuyomi Space · yachiyo.hk'
    ].join('\r\n');
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subject)}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0; mso-table-rspace: 0; }
    table { border-collapse: separate; border-spacing: 0; }
    @media only screen and (max-width: 620px) {
      .mail-shell { width: 100% !important; }
      .mail-pad { padding-left: 22px !important; padding-right: 22px !important; }
      .mail-code { font-size: 34px !important; letter-spacing: 6px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#0b1020; color:#f4f1ff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei','PingFang SC',Arial,sans-serif;">
  <div aria-hidden="true" style="display:none!important; visibility:hidden; mso-hide:all; max-height:0; max-width:0; overflow:hidden; opacity:0; color:transparent; font-size:1px; line-height:1px;">
    ${escapeHtml(copy.title)}：${escapeHtml(safeCode)}，${safeTtlMinutes} 分钟内有效。
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:#0b1020;">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" class="mail-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; overflow:hidden; background-color:#171e34; border:1px solid #454c70; border-radius:24px;">
          <tr>
            <td class="mail-pad" style="padding:28px 36px; background-color:#1e2742; background-image:linear-gradient(120deg,#172034 0%,#293057 58%,#392851 100%); border-bottom:1px solid #4f587f;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="52" valign="middle">
                    <div style="width:44px; height:44px; line-height:44px; border:1px solid #bdb0ff; border-radius:50%; text-align:center; background-color:#6f5bbb; color:#ffffff; font-size:24px; font-weight:700;">☾</div>
                  </td>
                  <td valign="middle" style="padding-left:12px;">
                    <div style="color:#ffffff; font-size:18px; line-height:1.35; font-weight:750;">月读空间</div>
                    <div style="margin-top:2px; color:#c2b5ff; font-size:11px; line-height:1.4; letter-spacing:1.4px;">TSUKUYOMI SPACE</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:38px 42px 18px;">
              <div style="color:#c2b5ff; font-size:11px; line-height:1.4; font-weight:800; letter-spacing:1.4px;">SECURE VERIFICATION</div>
              <h1 style="margin:10px 0 12px; color:#faf9ff; font-size:28px; line-height:1.35; font-weight:760;">${escapeHtml(copy.title)}</h1>
              <p style="margin:0; color:#cbd3eb; font-size:15px; line-height:1.75;">${escapeHtml(copy.lead)}</p>
              <p style="margin:2px 0 0; color:#9ca9cc; font-size:13px; line-height:1.65;">${escapeHtml(copy.englishLead)}.</p>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:16px 42px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border:1px solid #586184; border-radius:16px; background-color:#242b45;">
                <tr>
                  <td align="center" style="padding:24px 16px 22px;">
                    <div class="mail-code" style="color:#e5ddff; font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace; font-size:40px; line-height:1.2; font-weight:800; letter-spacing:9px; white-space:nowrap;">${escapeHtml(safeCode)}</div>
                    <div style="margin-top:12px; color:#c2b5ff; font-size:12px; line-height:1.5; font-weight:700;">${safeTtlMinutes} 分钟内有效 · Valid for ${safeTtlMinutes} minutes</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:4px 42px 34px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border:1px solid #ad9ef3; border-radius:999px; background-color:#816ed1; background-image:linear-gradient(135deg,#6f5bbb,#9279db);">
                    <a href="${escapeHtml(safeSiteUrl)}" target="_blank" style="display:inline-block; padding:13px 24px; border-radius:999px; color:#ffffff; font-size:14px; line-height:1.2; font-weight:750; text-decoration:none;">前往月读空间&nbsp; Open Tsukuyomi Space</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; margin-top:26px; border-top:1px solid #454c70;">
                <tr>
                  <td style="padding-top:20px;">
                    <p style="margin:0; color:#cbd3eb; font-size:12px; line-height:1.75;">为了你的账户安全，请勿向任何人透露验证码。月读空间不会通过邮件索要密码。</p>
                    <p style="margin:2px 0 0; color:#9ca9cc; font-size:11px; line-height:1.65;">Never share this code. Tsukuyomi Space will never ask for your password by email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:18px 42px 22px; background-color:#11182b; border-top:1px solid #454c70;">
              <p style="margin:0; color:#aeb9d8; font-size:11px; line-height:1.6;">此邮件由月读空间自动发送，请勿直接回复。</p>
              <p style="margin:2px 0 0; color:#8f9bbd; font-size:10px; line-height:1.6;">Automated message from Tsukuyomi Space · yachiyo.hk</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, text, html };
}

const NOTIFICATION_COPY = Object.freeze({
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
    const copy = NOTIFICATION_COPY[type] || NOTIFICATION_COPY.reply;
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
        type === 'login_alert' ? '如果这不是你本人操作，请立即修改密码。' : '你可以在网站中查看完整通知。',
        '',
        '月读空间 · Tsukuyomi Space'
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\r\n');
    const detailRows = details.map(([label, value], index) => `
                    <tr>
                      <td width="112" valign="top" style="padding:${index === 0 ? '16px' : '4px'} 12px 4px 18px; color:#9ca9cc; font-size:12px; line-height:1.7;">${escapeHtml(label)}</td>
                      <td valign="top" style="padding:${index === 0 ? '16px' : '4px'} 18px 4px 0; color:#f4f1ff; font-size:13px; line-height:1.7; word-break:break-word;">${escapeHtml(value)}</td>
                    </tr>`).join('');
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subject)}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0; mso-table-rspace:0; }
    table { border-collapse:separate; border-spacing:0; }
    @media only screen and (max-width:620px) {
      .mail-shell { width:100% !important; }
      .mail-pad { padding-left:24px !important; padding-right:24px !important; }
      .mail-title { font-size:25px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#0b1020; color:#f4f1ff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei','PingFang SC',Arial,sans-serif;">
  <div aria-hidden="true" style="display:none!important; visibility:hidden; mso-hide:all; max-height:0; max-width:0; overflow:hidden; opacity:0; color:transparent; font-size:1px; line-height:1px;">${escapeHtml(copy.lead)} ${escapeHtml(safeContent)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:#0b1020;">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" class="mail-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; overflow:hidden; background-color:#171e34; border:1px solid #454c70; border-radius:24px;">
          <tr>
            <td class="mail-pad" style="padding:29px 38px; background-color:#1e2742; background-image:linear-gradient(115deg,#172034 0%,#293057 62%,#392851 100%); border-bottom:1px solid #4f587f;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="52" valign="middle">
                    <div style="width:44px; height:44px; line-height:44px; border:1px solid #bdb0ff; border-radius:50%; text-align:center; background-color:#6f5bbb; color:#ffffff; font-size:24px; font-weight:700;">☾</div>
                  </td>
                  <td valign="middle" style="padding-left:13px;">
                    <div style="color:#ffffff; font-size:18px; line-height:1.35; font-weight:700;">月读空间</div>
                    <div style="margin-top:3px; color:#c2b5ff; font-size:11px; line-height:1.4; letter-spacing:1.4px;">TSUKUYOMI SPACE</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:38px 42px 18px;">
              <div style="color:#c2b5ff; font-size:11px; line-height:1.5; font-weight:700; letter-spacing:1.3px;">${escapeHtml(copy.label)}</div>
              <h1 class="mail-title" style="margin:12px 0 14px; color:#faf9ff; font-size:29px; line-height:1.35; font-weight:750;">${escapeHtml(safeTitle)}</h1>
              <p style="margin:0; color:#cbd3eb; font-size:15px; line-height:1.8;">${escapeHtml(copy.lead)}</p>
            </td>
          </tr>
          ${safeActorName && type !== 'login_alert' ? `<tr><td class="mail-pad" style="padding:0 42px 14px; color:#9ca9cc; font-size:13px; line-height:1.7;">来自 <span style="color:#e5ddff; font-weight:700;">${escapeHtml(safeActorName)}</span></td></tr>` : ''}
          ${type === 'login_alert' ? `<tr><td class="mail-pad" style="padding:4px 42px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:#242b45; border:1px solid #586184; border-radius:16px;">${detailRows}<tr><td colspan="2" style="height:12px; line-height:12px; font-size:0;">&nbsp;</td></tr></table></td></tr>` : `<tr><td class="mail-pad" style="padding:5px 42px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:#242b45; border:1px solid #586184; border-radius:16px;"><tr><td style="padding:20px 23px; color:#f4f1ff; font-size:15px; line-height:1.8; word-break:break-word;">${escapeHtml(description)}</td></tr></table></td></tr>`}
          <tr>
            <td class="mail-pad" style="padding:8px 42px 35px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td align="center" style="background-color:#816ed1; border:1px solid #ad9ef3; border-radius:999px;"><a href="${escapeHtml(actionUrl)}" target="_blank" style="display:inline-block; padding:14px 26px; border-radius:999px; color:#ffffff; font-size:14px; line-height:1.2; font-weight:700; text-decoration:none;">${escapeHtml(copy.action)} &nbsp; ↗</a></td></tr>
              </table>
              ${type === 'login_alert' ? '<p style="margin:22px 0 0; color:#eac6cf; font-size:12px; line-height:1.7;">若非本人登录，请立即修改密码，保护你的账户。</p>' : '<p style="margin:22px 0 0; color:#9ca9cc; font-size:12px; line-height:1.7;">你可以在网站中查看完整内容和站内信。</p>'}
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:19px 42px 24px; background-color:#11182b; border-top:1px solid #454c70;">
              <p style="margin:0; color:#aeb9d8; font-size:11px; line-height:1.7;">此邮件由月读空间自动发送，请勿直接回复。</p>
              <p style="margin:3px 0 0; color:#8f9bbd; font-size:10px; line-height:1.7;">Automated message from Tsukuyomi Space</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, text, html };
}

function buildMultipartMessage({ fromName, fromEmail, toEmail, content }) {
    const sender = normalizeMailboxAddress(fromEmail);
    const recipient = normalizeMailboxAddress(toEmail);
    const boundary = `tsukuyomi_${crypto.randomBytes(18).toString('hex')}`;
    const messageId = `${crypto.randomBytes(18).toString('hex')}@${sender.split('@')[1]}`;

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
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        wrapBase64(content.html),
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
    const sender = normalizeMailboxAddress(fromEmail);
    const recipient = normalizeMailboxAddress(toEmail);
    const content = renderVerificationEmail({ code, purpose, ttlMinutes, siteUrl });
    const boundary = `tsukuyomi_${crypto.randomBytes(18).toString('hex')}`;
    const messageId = `${crypto.randomBytes(18).toString('hex')}@${sender.split('@')[1]}`;

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
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        wrapBase64(content.html),
        `--${boundary}--`,
        ''
    ].join('\r\n');
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
