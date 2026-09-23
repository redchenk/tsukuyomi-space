const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const PostalMime = require('postal-mime');

process.env.NODE_ENV = 'test';

const {
    buildVerificationMessage,
    renderVerificationEmail,
    buildNotificationMessage,
    renderNotificationEmail
} = require('../backend/services/mailer');

describe('verification email template', () => {
    it('renders every verification purpose as a branded bilingual email', () => {
        const purposes = [
            ['register', '注册验证码', 'Create your account'],
            ['login', '登录验证码', 'Sign in securely'],
            ['oauth_bind', '绑定邮箱验证码', 'Connect your email'],
            ['password_reset', '重设密码验证码', 'Reset your password']
        ];

        for (const [purpose, title, englishLead] of purposes) {
            const email = renderVerificationEmail({
                code: '123456',
                purpose,
                ttlMinutes: 10,
                siteUrl: 'https://yachiyo.hk'
            });

            assert.match(email.subject, new RegExp(title));
            assert.match(email.text, /123456/);
            assert.match(email.text, new RegExp(englishLead));
            assert.match(email.html, /Tsukuyomi Space/);
            assert.match(email.html, new RegExp(title));
            assert.match(email.html, /123456/);
            assert.match(email.html, /10 分钟/);
            assert.match(email.html, /href="https:\/\/yachiyo\.hk"/);
            assert.doesNotMatch(email.html, /<script/i);
            assert.doesNotMatch(email.html, /<img/i);
        }
    });

    it('escapes dynamic values in the HTML version', () => {
        const email = renderVerificationEmail({
            code: '<123&456>',
            purpose: 'login',
            ttlMinutes: 10,
            siteUrl: 'https://yachiyo.hk/?next="login"&source=mail'
        });

        assert.match(email.html, /&lt;123&amp;456&gt;/);
        assert.match(email.html, /next=&quot;login&quot;&amp;source=mail/);
        assert.doesNotMatch(email.html, /<123&456>/);
    });

    it('puts the verification details first in previews without repeating the moon glyph', () => {
        const email = renderVerificationEmail({
            code: '123456',
            purpose: 'login',
            ttlMinutes: 10,
            siteUrl: 'https://yachiyo.hk'
        });

        assert.match(email.text, /^登录验证码：123456，10 分钟内有效。/);
        assert.match(email.html, /aria-hidden="true" style="[^"]*mso-hide:all/);
        assert.match(email.html, />☾<\/div>/);
        assert.doesNotMatch(email.html, />月<\/div>\s*<\/td>/);
    });

    it('builds a standards-compatible multipart message with text and HTML fallbacks', async () => {
        const message = buildVerificationMessage({
            fromName: '月读空间',
            fromEmail: 'notice@example.com',
            toEmail: 'user@example.com',
            code: '654321',
            purpose: 'password_reset',
            ttlMinutes: 10,
            siteUrl: 'https://yachiyo.hk'
        });

        assert.match(message, /^From: =\?UTF-8\?B\?/);
        assert.match(message, /MIME-Version: 1\.0/);
        assert.match(message, /Content-Type: multipart\/alternative;/);
        assert.match(message, /Content-Type: text\/plain; charset=UTF-8/);
        assert.match(message, /Content-Type: text\/html; charset=UTF-8/);
        assert.match(message, /Content-Transfer-Encoding: base64/);
        assert.match(message, /Message-ID: <[^>]+@example\.com>/);
        assert.doesNotMatch(message, /\r?\nBcc:/i);

        const parsed = await PostalMime.parse(Buffer.from(message));
        assert.match(parsed.text, /654321/);
        assert.match(parsed.html, /654321/);
        assert.match(parsed.subject, /重设密码验证码/);
    });

    it('rejects mailbox header injection', () => {
        assert.throws(() => buildVerificationMessage({
            fromName: '月读空间',
            fromEmail: 'notice@example.com',
            toEmail: 'user@example.com\r\nBcc: attacker@example.com',
            code: '123456',
            purpose: 'login',
            ttlMinutes: 10,
            siteUrl: 'https://yachiyo.hk'
        }), /Invalid mailbox address/);
    });
});

describe('notification email template', () => {
    it('renders branded reply, like and login alerts with readable text fallbacks', async () => {
        for (const type of ['reply', 'like', 'login_alert']) {
            const notification = {
                type,
                title: '月下有新消息',
                content: '一条新的站内动态',
                link: '/notifications',
                actorName: '八千代',
                location: 'CN · 江苏 · 苏州',
                device: 'Safari / iPhone',
                ip: '203.0.113.2',
                occurredAt: '2026-09-23T12:00:00Z',
                siteUrl: 'https://yachiyo.hk'
            };
            const content = renderNotificationEmail(notification);
            assert.match(content.html, /background-color:#0b1020/);
            assert.match(content.html, /月读空间/);
            assert.match(content.html, /border-radius:24px/);
            assert.ok(content.text.startsWith('月下有新消息\r\n'));
            assert.match(content.html, /aria-hidden="true" style="[^"]*mso-hide:all/);
            assert.match(content.html, />☾<\/div>/);
            assert.doesNotMatch(content.html, />月<\/div>\s*<\/td>/);
            assert.match(content.text, /https:\/\/yachiyo\.hk\/notifications/);
            assert.doesNotMatch(content.html, /<script|<img/i);
            const parsed = await PostalMime.parse(Buffer.from(buildNotificationMessage({
                fromName: '月读空间',
                fromEmail: 'notice@example.com',
                toEmail: 'user@example.com',
                notification
            })));
            assert.match(parsed.subject, /月下有新消息/);
            assert.match(parsed.html, /月读空间/);
            assert.match(parsed.text, /月下有新消息/);
            if (type === 'reply') assert.match(parsed.html, /新评论或回复/);
            if (type === 'login_alert') assert.match(parsed.text, /江苏/);
        }
    });

    it('escapes user content and confines action links to the configured site', () => {
        const content = renderNotificationEmail({
            type: 'reply',
            title: '<img src=x onerror=alert(1)>',
            content: '<script>alert(1)</script>',
            actorName: '"坏人"',
            link: 'https://attacker.example/phish',
            siteUrl: 'https://yachiyo.hk'
        });
        assert.match(content.html, /&lt;script&gt;/);
        assert.match(content.html, /&quot;坏人&quot;/);
        assert.doesNotMatch(content.html, /<script|<img|attacker\.example/i);
        assert.match(content.html, /href="https:\/\/yachiyo\.hk\/notifications"/);
        assert.throws(() => buildNotificationMessage({
            fromEmail: 'notice@example.com',
            toEmail: 'user@example.com\r\nBcc: attacker@example.com',
            notification: { type: 'like' }
        }), /Invalid mailbox address/);
    });
});
