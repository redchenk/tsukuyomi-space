const fs = require('node:fs');
const path = require('node:path');
const PostalMime = require('postal-mime');
const { buildVerificationMessage, buildNotificationMessage } = require('../backend/services/mailer');
const { getMailArtwork, escapeHtml } = require('../backend/services/mail-design');

// Render the real MIME output, including its CID attachments, with fixture data.
// This script never connects to SMTP or sends a message.
const samples = [
    ['register', '注册验证码', { purpose: 'register' }],
    ['login', '登录验证码', { purpose: 'login' }],
    ['oauth_bind', '绑定邮箱', { purpose: 'oauth_bind' }],
    ['password_reset', '重设密码', { purpose: 'password_reset' }],
    ['reply', '评论与回复', { type: 'reply', title: '你的文章有了新回复', content: '月色真好。谢谢你分享的故事，下次也一起看看樱花吧。', actorName: '月下访客', link: '/articles/247#comments' }],
    ['like', '点赞提醒', { type: 'like', title: '你的创作收到了新点赞', content: '有人喜欢你分享的「月下樱花」。', actorName: '月下访客', link: '/notifications' }],
    ['moderation', '待审核提醒', { type: 'moderation', content: '一条新的留言需要人工审核，请在网站核对内容与审核原因。', actorName: '月下访客', link: '/terminal?panel=messages' }],
    ['login_alert', '异地登录', { type: 'login_alert', location: 'CN · 江苏 · 苏州', device: 'Safari / iPhone', ip: '203.0.113.2', occurredAt: '2026-10-06T10:00:00Z' }]
];

async function main() {
    const out = path.resolve(process.argv[2] || '.codex_tmp/email-preview');
    fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
    const fixtures = [];
    for (const [name, label, data] of samples) {
        const common = { fromName: '月读空间', fromEmail: 'notice@example.test', toEmail: 'reader@example.test' };
        const message = data.purpose
            ? buildVerificationMessage({ ...common, ...data, code: '628104', ttlMinutes: 10, siteUrl: 'https://yachiyo.hk' })
            : buildNotificationMessage({ ...common, notification: { ...data, siteUrl: 'https://yachiyo.hk' } });
        const parsed = await PostalMime.parse(Buffer.from(message));
        let html = parsed.html;
        for (const asset of getMailArtwork()) {
            const attachment = parsed.attachments.find(item => item.contentId === `<${asset.cid}>`);
            if (!attachment) throw new Error('Preview message is missing its inline artwork');
            fs.writeFileSync(path.join(out, 'assets', asset.filename), Buffer.from(attachment.content));
            html = html.replaceAll(`cid:${asset.cid}`, `assets/${asset.filename}`);
        }
        fs.writeFileSync(path.join(out, `${name}.html`), html);
        fs.writeFileSync(path.join(out, `${name}.eml`), message);
        fixtures.push({ name, label, subject: parsed.subject, bytes: Buffer.byteLength(message) });
    }
    fs.writeFileSync(path.join(out, 'samples.json'), JSON.stringify(fixtures, null, 2) + '\n');
    const links = fixtures.map(({ name, label }) => `<li><a href="${name}.html" target="mail-preview">${escapeHtml(label)}</a><a class="download" href="${name}.eml" download>EML ↓</a></li>`).join('');
    fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>月读空间 · 邮件预览</title><style>
      :root{color-scheme:light only}body{margin:0;background:#f7f9fc;color:#25304a;font:14px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}header{padding:20px;max-width:1100px;margin:auto}h1{margin:0 0 8px;font-size:22px}p{color:#626e84;line-height:1.7}ul{display:flex;flex-wrap:wrap;gap:10px;list-style:none;padding:0}li{display:flex;border:1px solid #eadfe7;border-radius:20px;background:#fff;overflow:hidden}a{display:block;padding:10px 14px;color:#ae496d;text-decoration:none}a:focus-visible{outline:2px solid #ae496d;outline-offset:-3px}.download{font-size:11px;background:#faedf2}iframe{display:block;border:0;width:100%;height:calc(100vh - 225px);min-height:700px}
      </style></head><body><header><h1>月读空间 · 全部自动邮件</h1><p>示例数据预览。可下载 EML 在邮箱客户端检查；此工具不会发送邮件。</p><ul>${links}</ul></header><iframe name="mail-preview" title="邮件正文预览" src="login.html"></iframe></body></html>`);
    console.log(`Email previews: ${path.join(out, 'index.html')}`);
    console.log(`Types: ${fixtures.length}; MIME size: ${Math.min(...fixtures.map(row => row.bytes))}–${Math.max(...fixtures.map(row => row.bytes))} bytes`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { samples };
