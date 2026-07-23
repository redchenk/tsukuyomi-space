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
        `月读空间 · ${copy.title}`,
        `${copy.lead} ${copy.englishLead}.`,
        '',
        `验证码：${safeCode}`,
        `有效时间：${safeTtlMinutes} 分钟`,
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
    table { border-collapse: collapse !important; }
    @media only screen and (max-width: 620px) {
      .mail-shell { width: 100% !important; }
      .mail-pad { padding-left: 22px !important; padding-right: 22px !important; }
      .mail-code { font-size: 34px !important; letter-spacing: 6px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#edf6ff; color:#263044; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei','PingFang SC',Arial,sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
    ${escapeHtml(copy.title)}：${escapeHtml(safeCode)}，${safeTtlMinutes} 分钟内有效。
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:#edf6ff;">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" class="mail-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; overflow:hidden; background-color:#ffffff; border:1px solid #d8e6f3; border-radius:20px; box-shadow:0 18px 48px rgba(38,48,68,0.12);">
          <tr>
            <td class="mail-pad" style="padding:28px 36px; background-color:#111827; background-image:linear-gradient(120deg,#0b1020 0%,#172033 58%,#2a2240 100%);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="52" valign="middle">
                    <div style="width:44px; height:44px; line-height:44px; border-radius:50%; text-align:center; background-color:#aef2ff; color:#172033; font-size:20px; font-weight:800;">月</div>
                  </td>
                  <td valign="middle" style="padding-left:12px;">
                    <div style="color:#ffffff; font-size:18px; line-height:1.35; font-weight:750;">月读空间</div>
                    <div style="margin-top:2px; color:#aef2ff; font-size:11px; line-height:1.4; letter-spacing:1.4px;">TSUKUYOMI SPACE</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:38px 42px 18px;">
              <div style="color:#6f62d9; font-size:11px; line-height:1.4; font-weight:800; letter-spacing:1.4px;">SECURE VERIFICATION</div>
              <h1 style="margin:10px 0 12px; color:#111827; font-size:28px; line-height:1.35; font-weight:760;">${escapeHtml(copy.title)}</h1>
              <p style="margin:0; color:#647086; font-size:15px; line-height:1.75;">${escapeHtml(copy.lead)}</p>
              <p style="margin:2px 0 0; color:#8791a3; font-size:13px; line-height:1.65;">${escapeHtml(copy.englishLead)}.</p>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:16px 42px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border:1px solid #d7c2ff; border-radius:14px; background-color:#f5f0ff;">
                <tr>
                  <td align="center" style="padding:24px 16px 22px;">
                    <div class="mail-code" style="color:#5c4db4; font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace; font-size:40px; line-height:1.2; font-weight:800; letter-spacing:9px; white-space:nowrap;">${escapeHtml(safeCode)}</div>
                    <div style="margin-top:12px; color:#6f62d9; font-size:12px; line-height:1.5; font-weight:700;">${safeTtlMinutes} 分钟内有效 · Valid for ${safeTtlMinutes} minutes</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:4px 42px 34px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border-radius:999px; background-color:#7b8cf6; background-image:linear-gradient(135deg,#7b8cf6,#a481ff);">
                    <a href="${escapeHtml(safeSiteUrl)}" target="_blank" style="display:inline-block; padding:13px 24px; border-radius:999px; color:#ffffff; font-size:14px; line-height:1.2; font-weight:750; text-decoration:none;">前往月读空间&nbsp; Open Tsukuyomi Space</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; margin-top:26px; border-top:1px solid #e6edf5;">
                <tr>
                  <td style="padding-top:20px;">
                    <p style="margin:0; color:#647086; font-size:12px; line-height:1.75;">为了你的账户安全，请勿向任何人透露验证码。月读空间不会通过邮件索要密码。</p>
                    <p style="margin:2px 0 0; color:#98a2b3; font-size:11px; line-height:1.65;">Never share this code. Tsukuyomi Space will never ask for your password by email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mail-pad" style="padding:18px 42px 22px; background-color:#f7faff; border-top:1px solid #e6edf5;">
              <p style="margin:0; color:#8791a3; font-size:11px; line-height:1.6;">此邮件由月读空间自动发送，请勿直接回复。</p>
              <p style="margin:2px 0 0; color:#a0a9b8; font-size:10px; line-height:1.6;">Automated message from Tsukuyomi Space · yachiyo.hk</p>
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

    let buffer = '';
    const pending = [];

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

    const client = createSmtpClient();
    const message = buildVerificationMessage({
        fromName: smtp.fromName,
        fromEmail: smtp.user,
        toEmail: email,
        code,
        purpose,
        ttlMinutes: Math.floor(EMAIL_CODE_TTL_MS / 60000),
        siteUrl: config.publicSiteUrl
    });

    try {
        await client.read([220]);
        await client.write(`EHLO ${smtp.host}`, [250]);
        await client.write('AUTH LOGIN', [334]);
        await client.write(Buffer.from(smtp.user).toString('base64'), [334]);
        await client.write(Buffer.from(smtp.pass).toString('base64'), [235]);
        await client.write(`MAIL FROM:<${smtp.user}>`, [250]);
        await client.write(`RCPT TO:<${email}>`, [250, 251]);
        await client.write('DATA', [354]);
        client.socket.write(`${message}\r\n.\r\n`);
        await client.read([250]);
        await client.write('QUIT', [221]);
    } finally {
        client.socket.end();
    }
}

module.exports = {
    EMAIL_CODE_TTL_MS,
    EMAIL_CODE_COOLDOWN_MS,
    buildVerificationMessage,
    renderVerificationEmail,
    sendVerificationEmail
};
