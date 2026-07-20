const { domainToASCII } = require('node:url');
const net = require('node:net');

const PROVIDERS = Object.freeze({
    qq: {
        id: 'qq', name: 'QQ 邮箱', domains: ['qq.com', 'foxmail.com'],
        imapHost: 'imap.qq.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp.qq.com', smtpPort: 465, smtpSecure: true,
        authTypes: ['app_password'], credentialLabel: '授权码',
        hint: '请在 QQ 邮箱设置中开启 IMAP/SMTP，并使用授权码。'
    },
    netease163: {
        id: 'netease163', name: '网易 163 邮箱', domains: ['163.com'],
        imapHost: 'imap.163.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp.163.com', smtpPort: 465, smtpSecure: true,
        authTypes: ['app_password'], credentialLabel: '客户端授权码',
        hint: '请开启 IMAP/SMTP 服务并使用客户端授权码。'
    },
    netease126: {
        id: 'netease126', name: '网易 126 邮箱', domains: ['126.com'],
        imapHost: 'imap.126.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp.126.com', smtpPort: 465, smtpSecure: true,
        authTypes: ['app_password'], credentialLabel: '客户端授权码',
        hint: '请开启 IMAP/SMTP 服务并使用客户端授权码。'
    },
    gmail: {
        id: 'gmail', name: 'Gmail', domains: ['gmail.com', 'googlemail.com'],
        imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true,
        authTypes: ['oauth2', 'app_password'], credentialLabel: 'OAuth2 Access Token 或应用专用密码',
        hint: '推荐 OAuth2；使用应用专用密码时需先开启 Google 两步验证。'
    },
    outlook: {
        id: 'outlook', name: 'Outlook / Microsoft 365', domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
        imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp-mail.outlook.com', smtpPort: 587, smtpSecure: false,
        authTypes: ['oauth2'], credentialLabel: 'OAuth2 Access Token',
        hint: 'Outlook 要求 Modern Auth，请使用具有 IMAP 与 SMTP.Send 权限的 OAuth2 Access Token。'
    },
    yahoo: {
        id: 'yahoo', name: 'Yahoo Mail', domains: ['yahoo.com', 'yahoo.co.jp'],
        imapHost: 'imap.mail.yahoo.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465, smtpSecure: true,
        authTypes: ['app_password'], credentialLabel: '应用密码',
        hint: '请在 Yahoo 账户安全设置中创建应用密码。'
    },
    icloud: {
        id: 'icloud', name: 'iCloud Mail', domains: ['icloud.com', 'me.com', 'mac.com'],
        imapHost: 'imap.mail.me.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp.mail.me.com', smtpPort: 587, smtpSecure: false,
        authTypes: ['app_password'], credentialLabel: 'App 专用密码',
        hint: '请在 Apple 账户中创建 App 专用密码。'
    },
    fastmail: {
        id: 'fastmail', name: 'Fastmail', domains: ['fastmail.com', 'fastmail.fm'],
        imapHost: 'imap.fastmail.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp.fastmail.com', smtpPort: 465, smtpSecure: true,
        authTypes: ['app_password'], credentialLabel: '应用密码',
        hint: '请在 Fastmail 设置中创建应用密码。'
    },
    zoho: {
        id: 'zoho', name: 'Zoho Mail', domains: ['zoho.com', 'zohomail.com'],
        imapHost: 'imap.zoho.com', imapPort: 993, imapSecure: true,
        smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpSecure: true,
        authTypes: ['password', 'app_password'], credentialLabel: '密码或应用密码',
        hint: '开启两步验证的账户请使用应用密码。'
    },
    custom: {
        id: 'custom', name: '其他 IMAP / SMTP', domains: [],
        imapHost: '', imapPort: 993, imapSecure: true,
        smtpHost: '', smtpPort: 465, smtpSecure: true,
        authTypes: ['password', 'app_password', 'oauth2'], credentialLabel: '密码、授权码或 Access Token',
        hint: '仅支持公网 TLS IMAP 993，以及 SMTP 465 或 STARTTLS 587。'
    }
});

function cleanText(value, maxLength = 120) {
    return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

function normalizeEmail(value) {
    const email = cleanText(value, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const error = new Error('请输入有效的邮箱地址');
        error.statusCode = 400;
        throw error;
    }
    return email;
}

function normalizeHost(value, field) {
    const source = cleanText(value, 253).replace(/\.$/, '').toLowerCase();
    const host = domainToASCII(source);
    if (!host || net.isIP(host) || host.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) {
        const error = new Error(`${field}不是有效的公网主机名`);
        error.statusCode = 400;
        throw error;
    }
    return host;
}

function detectProvider(email) {
    const domain = String(email || '').split('@').pop()?.toLowerCase() || '';
    return Object.values(PROVIDERS).find(provider => provider.id !== 'custom' && provider.domains.includes(domain))?.id || 'custom';
}

function publicProviders() {
    return Object.values(PROVIDERS).map(provider => ({ ...provider }));
}

function normalizeAccountInput(input = {}, current = null) {
    const email = normalizeEmail(input.email ?? current?.email);
    const requestedProvider = cleanText(input.provider ?? current?.provider, 32) || detectProvider(email);
    const provider = PROVIDERS[requestedProvider];
    if (!provider) {
        const error = new Error('不支持的邮箱提供商');
        error.statusCode = 400;
        throw error;
    }

    const authType = cleanText(input.authType ?? input.auth_type ?? current?.auth_type, 24)
        || provider.authTypes[0];
    if (!provider.authTypes.includes(authType)) {
        const error = new Error(`${provider.name}不支持这种登录方式`);
        error.statusCode = 400;
        throw error;
    }

    const custom = provider.id === 'custom';
    const imapHost = normalizeHost(custom ? (input.imapHost ?? current?.imap_host) : provider.imapHost, 'IMAP 主机');
    const smtpHost = normalizeHost(custom ? (input.smtpHost ?? current?.smtp_host) : provider.smtpHost, 'SMTP 主机');
    const imapPort = Number(custom ? (input.imapPort ?? current?.imap_port ?? 993) : provider.imapPort);
    const smtpPort = Number(custom ? (input.smtpPort ?? current?.smtp_port ?? 465) : provider.smtpPort);
    if (imapPort !== 993 || ![465, 587].includes(smtpPort)) {
        const error = new Error('仅支持 IMAP 993，以及 SMTP 465 或 587');
        error.statusCode = 400;
        throw error;
    }

    return {
        provider: provider.id,
        email,
        display_name: cleanText(input.displayName ?? input.display_name ?? current?.display_name, 64),
        auth_type: authType,
        imap_host: imapHost,
        imap_port: imapPort,
        imap_secure: 1,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_secure: smtpPort === 465 ? 1 : 0
    };
}

function normalizeCredential(value) {
    const credential = String(value || '').trim();
    if (credential.length < 4 || credential.length > 8192 || /[\u0000\r\n]/.test(credential)) {
        const error = new Error('邮箱登录凭据格式无效');
        error.statusCode = 400;
        throw error;
    }
    return credential;
}

module.exports = {
    PROVIDERS,
    detectProvider,
    normalizeAccountInput,
    normalizeCredential,
    normalizeEmail,
    publicProviders
};
