const fs = require('node:fs');
const path = require('node:path');

const MAIL_ARTWORK = Object.freeze([
    Object.freeze({ filename: 'sakura-logo-v1.png', contentType: 'image/png', cid: 'sakura-logo-v1@tsukuyomi' }),
    Object.freeze({ filename: 'sakura-banner-v1.jpg', contentType: 'image/jpeg', cid: 'sakura-banner-v1@tsukuyomi' })
]);
let artwork;

// Small, versioned build assets only: no per-user images, remote fetch or tracking.
function getMailArtwork() {
    if (!artwork) {
        artwork = MAIL_ARTWORK.map(asset => {
            const content = fs.readFileSync(path.join(__dirname, 'mail-assets', asset.filename));
            if (content.length > 160 * 1024) throw new Error('Mail artwork exceeds size budget');
            return Object.freeze({ ...asset, content });
        });
    }
    return artwork;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderMailHeading({ label, title, lead, englishLead, icon = '✉︎' }) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="48" valign="middle"><div class="mail-icon" style="width:44px; height:44px; line-height:44px; border-radius:50%; background-color:#faedf2; color:#ae496d; text-align:center; font-family:Arial,sans-serif; font-size:25px;">${escapeHtml(icon)}</div></td>
      <td valign="middle" style="padding-left:12px;"><p class="mail-accent" style="margin:0; color:#ae496d; font-size:12px; line-height:1.6; font-weight:600;">${escapeHtml(label)}</p><h1 class="mail-title mail-ink" style="margin:2px 0 0; color:#25304a; font-family:'Songti SC',SimSun,Georgia,serif; font-size:28px; line-height:1.4; font-weight:700; text-wrap:balance; overflow-wrap:anywhere; word-break:break-word;">${escapeHtml(title)}</h1></td>
    </tr></table>
    <p class="mail-muted" style="margin:18px 0 0; color:#626e84; font-size:15px; line-height:1.8; overflow-wrap:anywhere; word-break:break-word;">${escapeHtml(lead)}</p>
    ${englishLead ? `<p class="mail-muted" style="margin:3px 0 0; color:#626e84; font-size:12px; line-height:1.7;">${escapeHtml(englishLead)}.</p>` : ''}`;
}

function renderMailPanel(content, { code = false } = {}) {
    return `<table role="presentation" class="${code ? 'mail-code-panel' : 'mail-panel'}" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${code ? '#faedf2' : '#f7f9fc'}" style="width:100%; margin-top:22px; background-color:${code ? '#faedf2' : '#f7f9fc'}; border:1px solid #eadfe7; border-radius:20px; table-layout:fixed;">
      <tr><td class="mail-panel-pad" style="padding:${code ? '22px 12px' : '22px'};">${content}</td></tr>
    </table>`;
}

function renderMailNotice(text) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; margin-top:24px; border-top:1px solid #eadfe7;">
      <tr><td width="36" valign="top" style="padding-top:20px;"><span class="mail-icon" style="display:inline-block; width:28px; height:28px; line-height:28px; border-radius:50%; background-color:#faedf2; color:#ae496d; text-align:center; font-size:16px;">✓</span></td>
      <td class="mail-muted" valign="top" style="padding-top:20px; color:#626e84; font-size:13px; line-height:1.9; overflow-wrap:anywhere; word-break:break-word;">${escapeHtml(text).replace(/\n/g, '<br>')}</td></tr>
    </table>`;
}

function renderMailAction(url, label) {
    return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0; max-width:100%;">
      <tr><td align="center" bgcolor="#ae496d" style="background-color:#ae496d; border:1px solid #ae496d; border-radius:999px; mso-padding-alt:14px 26px;">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:14px 26px; border-radius:999px; color:#ffffff; font-size:15px; line-height:1.4; font-weight:600; text-align:center; text-decoration:none;">${escapeHtml(label)}&nbsp;&nbsp; →</a>
      </td></tr>
    </table>`;
}

// All essential information is live HTML. The two CID illustrations are optional.
// Use inline styles, presentation tables and physical colors for email clients.
function renderMailFrame({ subject, preheader, body, siteUrl }) {
    const domain = new URL(siteUrl).hostname;
    return `<!doctype html>
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
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { color:#ae496d; }
    .mail-code { font-size:48px !important; letter-spacing:3px !important; }
    @media only screen and (max-width:620px) {
      .mail-outer-pad { padding:16px 10px !important; }
      .mail-shell { width:100% !important; }
      .mail-pad { padding-left:20px !important; padding-right:20px !important; }
      .mail-brand { font-size:26px !important; }
      .mail-brand-sub { font-size:9px !important; letter-spacing:2px !important; }
      .mail-logo { width:48px !important; height:48px !important; }
      .mail-logo-cell { width:52px !important; }
      .mail-title { font-size:22px !important; }
      .mail-code { font-size:36px !important; letter-spacing:4px !important; }
      .mail-panel-pad { padding:20px 14px !important; }
      .mail-banner { height:auto !important; }
    }
    :root { color-scheme:light only; }
    .mail-background, [data-ogsc] .mail-background { background-color:#f7f9fc !important; }
    .mail-shell, [data-ogsc] .mail-shell { background-color:#ffffff !important; border-color:#e2e7f0 !important; }
    .mail-panel, [data-ogsc] .mail-panel { background-color:#f7f9fc !important; border-color:#eadfe7 !important; }
    .mail-code-panel, .mail-icon, [data-ogsc] .mail-code-panel, [data-ogsc] .mail-icon { background-color:#faedf2 !important; }
    .mail-ink, .mail-code, [data-ogsc] .mail-ink, [data-ogsc] .mail-code { color:#25304a !important; }
    .mail-muted, [data-ogsc] .mail-muted { color:#626e84 !important; }
    .mail-accent, .mail-icon, [data-ogsc] .mail-accent, [data-ogsc] .mail-icon { color:#ae496d !important; }
  </style>
</head>
<body class="mail-background" style="margin:0; padding:0; background-color:#f7f9fc; color:#25304a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei','PingFang SC',Arial,sans-serif;">
  <div aria-hidden="true" style="display:none!important; visibility:hidden; mso-hide:all; max-height:0; max-width:0; overflow:hidden; opacity:0; color:transparent; font-size:1px; line-height:1px;">${escapeHtml(preheader)}</div>
  <table role="presentation" class="mail-background" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f9fc" style="width:100%; background-color:#f7f9fc;">
    <tr><td class="mail-outer-pad" align="center" style="padding:28px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="mail-shell" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%; max-width:600px; background-color:#ffffff; border:1px solid #e2e7f0; border-radius:28px; box-shadow:0 8px 28px rgba(37,48,74,0.06); table-layout:fixed;">
        <tr><td class="mail-pad" align="center" style="padding:26px 34px 20px;">
          <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr>
            <td class="mail-logo-cell" width="66" valign="middle"><img class="mail-logo" src="cid:${MAIL_ARTWORK[0].cid}" width="62" height="62" alt="" style="display:block; width:62px; height:62px;"></td>
            <td valign="middle" style="padding-left:12px;"><div class="mail-brand mail-ink" style="color:#25304a; font-family:'Songti SC',SimSun,Georgia,serif; font-size:32px; line-height:1.4; font-weight:700; letter-spacing:2px;">月读空间</div><div class="mail-brand-sub mail-muted" style="margin-top:2px; color:#626e84; font-size:10px; line-height:1.6; letter-spacing:3px;">TSUKUYOMI SPACE</div></td>
          </tr></table>
        </td></tr>
        <tr><td class="mail-pad" style="padding:0 34px;">
          <img class="mail-banner" src="cid:${MAIL_ARTWORK[1].cid}" width="532" height="215" alt="月下樱花与八千代" style="display:block; width:100%; max-width:532px; height:auto; border-radius:18px; background-color:#faedf2; color:#626e84; font-size:12px;">
        </td></tr>
        <tr><td class="mail-pad" style="padding:28px 34px 30px;">${body}</td></tr>
        <tr><td class="mail-pad" align="center" style="padding:0 34px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><div style="height:1px; background-color:#f0dae3; font-size:0; line-height:1px;">&nbsp;</div></td><td width="36" align="center" class="mail-accent" style="color:#d995b0; font-size:18px; line-height:1.4;">✿</td><td valign="middle"><div style="height:1px; background-color:#f0dae3; font-size:0; line-height:1px;">&nbsp;</div></td></tr></table>
          <p class="mail-muted" style="margin:14px 0 0; color:#626e84; font-size:11px; line-height:1.8;">此邮件由月读空间自动发送，请勿直接回复。</p>
          <p class="mail-muted" style="margin:3px 0 0; color:#626e84; font-size:11px; line-height:1.8;">Tsukuyomi Space · ${escapeHtml(domain)}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { MAIL_ARTWORK, getMailArtwork, escapeHtml, renderMailFrame, renderMailHeading, renderMailPanel, renderMailNotice, renderMailAction };
