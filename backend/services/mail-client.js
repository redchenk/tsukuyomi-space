const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const PostalMime = require('postal-mime');
const sanitizeHtml = require('sanitize-html');
const { resolvePublicUrl } = require('./outbound-url-security');

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_CHARS = 200000;

function safeDate(value) {
    const date = value instanceof Date ? value : new Date(value || 0);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function mailboxAuth(account, credential) {
    return account.auth_type === 'oauth2'
        ? { user: account.email, accessToken: credential }
        : { user: account.email, pass: credential };
}

function firstPublicAddress(records) {
    return records.find(record => Number(record.family) === 4)?.address || records[0]?.address;
}

async function resolveMailHost(hostname) {
    const { records } = await resolvePublicUrl(`https://${hostname}`, { protocols: ['https:'] });
    const address = firstPublicAddress(records);
    if (!address) throw new Error('Mailbox host could not be resolved');
    return address;
}

async function createImapClient(account, credential) {
    const address = await resolveMailHost(account.imap_host);
    return new ImapFlow({
        host: address,
        servername: account.imap_host,
        port: Number(account.imap_port),
        secure: true,
        auth: mailboxAuth(account, credential),
        logger: false,
        disableAutoIdle: true,
        connectionTimeout: 12000,
        greetingTimeout: 8000,
        socketTimeout: 20000,
        tls: {
            servername: account.imap_host,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2'
        }
    });
}

async function withInbox(account, credential, operation) {
    const client = await createImapClient(account, credential);
    let lock;
    try {
        await client.connect();
        lock = await client.getMailboxLock('INBOX');
        return await operation(client);
    } finally {
        if (lock) lock.release();
        if (client.usable) {
            try {
                await client.logout();
            } catch (_) {
                client.close();
            }
        } else {
            client.close();
        }
    }
}

async function createSmtpTransport(account, credential) {
    const address = await resolveMailHost(account.smtp_host);
    const secure = Number(account.smtp_port) === 465;
    return nodemailer.createTransport({
        host: address,
        port: Number(account.smtp_port),
        secure,
        requireTLS: !secure,
        auth: account.auth_type === 'oauth2'
            ? { type: 'OAuth2', user: account.email, accessToken: credential }
            : { user: account.email, pass: credential },
        connectionTimeout: 12000,
        greetingTimeout: 8000,
        socketTimeout: 20000,
        disableFileAccess: true,
        disableUrlAccess: true,
        tls: {
            servername: account.smtp_host,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2'
        }
    });
}

function addressList(value) {
    const source = Array.isArray(value) ? value : (value ? [value] : []);
    return source.flatMap(item => {
        if (Array.isArray(item?.group)) return addressList(item.group);
        const address = String(item?.address || '').trim().slice(0, 254);
        if (!address) return [];
        return [{ name: String(item?.name || '').trim().slice(0, 160), address }];
    }).slice(0, 20);
}

function envelopeMessage(message, account) {
    const flags = message.flags instanceof Set ? message.flags : new Set(message.flags || []);
    const envelope = message.envelope || {};
    return {
        id: `${account.id}:${message.uid}`,
        accountId: account.id,
        provider: account.provider,
        mailbox: account.email,
        uid: Number(message.uid),
        subject: String(envelope.subject || '(无主题)').slice(0, 998),
        from: addressList(envelope.from || envelope.sender),
        to: addressList(envelope.to),
        date: safeDate(envelope.date || message.internalDate),
        seen: flags.has('\\Seen'),
        flagged: flags.has('\\Flagged'),
        size: Number(message.size || 0)
    };
}

async function verifyAccount(account, credential) {
    await withInbox(account, credential, async () => true);
    const transport = await createSmtpTransport(account, credential);
    try {
        await transport.verify();
    } finally {
        transport.close();
    }
    return true;
}

async function listMessages(account, credential, { limit = 30, offset = 0 } = {}) {
    const pageSize = Math.min(50, Math.max(1, Number(limit) || 30));
    const pageOffset = Math.min(500, Math.max(0, Number(offset) || 0));
    return withInbox(account, credential, async client => {
        const exists = Number(client.mailbox?.exists || 0);
        const end = exists - pageOffset;
        if (end < 1) return [];
        const start = Math.max(1, end - pageSize + 1);
        const messages = await client.fetchAll(`${start}:${end}`, {
            uid: true,
            envelope: true,
            flags: true,
            internalDate: true,
            size: true
        });
        return messages.map(message => envelopeMessage(message, account)).reverse();
    });
}

async function getMessage(account, credential, uid) {
    const messageUid = positiveUid(uid);
    return withInbox(account, credential, async client => {
        const metadata = await client.fetchOne(messageUid, {
            uid: true,
            envelope: true,
            flags: true,
            internalDate: true,
            size: true
        }, { uid: true });
        if (!metadata) return null;
        if (Number(metadata.size || 0) > MAX_SOURCE_BYTES) {
            const error = new Error('邮件内容超过安全预览上限');
            error.code = 'MAIL_MESSAGE_TOO_LARGE';
            error.statusCode = 413;
            throw error;
        }
        const full = await client.fetchOne(messageUid, {
            source: { start: 0, maxLength: MAX_SOURCE_BYTES + 1 }
        }, { uid: true });
        if (!full?.source) return null;
        if (full.source.length > MAX_SOURCE_BYTES) {
            const error = new Error('邮件内容超过安全预览上限');
            error.code = 'MAIL_MESSAGE_TOO_LARGE';
            error.statusCode = 413;
            throw error;
        }
        const parsed = await PostalMime.parse(full.source, {
            maxNestingDepth: 40,
            maxHeadersSize: 256 * 1024,
            attachmentEncoding: 'base64'
        });
        const plain = parsed.text || sanitizeHtml(parsed.html || '', {
            allowedTags: [],
            allowedAttributes: {}
        });
        return {
            ...envelopeMessage(metadata, account),
            body: String(plain || '').slice(0, MAX_BODY_CHARS),
            attachments: (parsed.attachments || []).slice(0, 50).map(attachment => ({
                filename: String(attachment.filename || '附件').slice(0, 255),
                mimeType: String(attachment.mimeType || 'application/octet-stream').slice(0, 128),
                disposition: String(attachment.disposition || 'attachment').slice(0, 32),
                size: attachment.content
                    ? Buffer.byteLength(String(attachment.content), attachment.encoding === 'base64' ? 'base64' : 'utf8')
                    : 0
            }))
        };
    });
}

async function updateFlags(account, credential, uid, changes = {}) {
    const messageUid = positiveUid(uid);
    return withInbox(account, credential, async client => {
        if (typeof changes.seen === 'boolean') {
            await (changes.seen
                ? client.messageFlagsAdd(messageUid, ['\\Seen'], { uid: true })
                : client.messageFlagsRemove(messageUid, ['\\Seen'], { uid: true }));
        }
        if (typeof changes.flagged === 'boolean') {
            await (changes.flagged
                ? client.messageFlagsAdd(messageUid, ['\\Flagged'], { uid: true })
                : client.messageFlagsRemove(messageUid, ['\\Flagged'], { uid: true }));
        }
        return { uid: messageUid, seen: changes.seen, flagged: changes.flagged };
    });
}

function validRecipient(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) || email.length > 254) {
        const error = new Error('收件人地址无效');
        error.statusCode = 400;
        error.code = 'MAIL_RECIPIENT_INVALID';
        throw error;
    }
    return email;
}

function normalizeRecipients(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    const recipients = [...new Set(source.map(validRecipient))];
    if (!recipients.length || recipients.length > 10) {
        const error = new Error('每封邮件需要 1 至 10 位收件人');
        error.statusCode = 400;
        error.code = 'MAIL_RECIPIENT_LIMIT';
        throw error;
    }
    return recipients;
}

async function sendMessage(account, credential, input = {}) {
    const to = normalizeRecipients(input.to);
    const subject = String(input.subject || '').trim().replace(/[\r\n]/g, ' ').slice(0, 200);
    const body = String(input.body || '').replace(/\u0000/g, '').slice(0, MAX_BODY_CHARS);
    if (!body.trim()) {
        const error = new Error('邮件正文不能为空');
        error.statusCode = 400;
        error.code = 'MAIL_BODY_REQUIRED';
        throw error;
    }
    const transport = await createSmtpTransport(account, credential);
    try {
        const result = await transport.sendMail({
            from: account.display_name ? { name: account.display_name, address: account.email } : account.email,
            to,
            subject: subject || '(无主题)',
            text: body,
            disableFileAccess: true,
            disableUrlAccess: true
        });
        return { messageId: String(result.messageId || ''), accepted: (result.accepted || []).map(String) };
    } finally {
        transport.close();
    }
}

function positiveUid(value) {
    const uid = Number(value);
    if (!Number.isSafeInteger(uid) || uid < 1) {
        const error = new Error('邮件编号无效');
        error.statusCode = 400;
        error.code = 'MAIL_UID_INVALID';
        throw error;
    }
    return uid;
}

function publicMailError(error) {
    if (error?.statusCode && error?.code?.startsWith('MAIL_')) return error;
    if (Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 500 && String(error?.message || '').length <= 200) {
        return error;
    }
    const text = String(error?.message || '').toLowerCase();
    const result = new Error('邮箱服务暂时不可用，请稍后重试');
    result.statusCode = 502;
    result.code = 'MAIL_SERVICE_UNAVAILABLE';
    if (/auth|credential|login|password|token|user is authenticated/.test(text)) {
        result.message = '邮箱登录失败，请检查登录方式和凭据';
        result.statusCode = 422;
        result.code = 'MAIL_AUTH_FAILED';
    } else if (/timeout|timed out|etimedout/.test(text)) {
        result.message = '邮箱服务器连接超时';
        result.statusCode = 504;
        result.code = 'MAIL_TIMEOUT';
    } else if (/certificate|tls|ssl|starttls/.test(text)) {
        result.message = '邮箱服务器安全连接失败';
        result.code = 'MAIL_TLS_FAILED';
    } else if (/private|reserved|local|public host|forbidden/.test(text)) {
        result.message = '该邮箱服务器地址不允许访问';
        result.statusCode = 400;
        result.code = 'MAIL_HOST_FORBIDDEN';
    }
    return result;
}

module.exports = {
    getMessage,
    listMessages,
    publicMailError,
    sendMessage,
    updateFlags,
    verifyAccount
};
