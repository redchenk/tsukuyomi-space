const crypto = require('node:crypto');
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');
const mailAccounts = require('../repositories/mail-account-repository');
const mailClient = require('../services/mail-client');
const { decryptCredential, encryptCredential } = require('../services/mail-credential-crypto');
const {
    normalizeAccountInput,
    normalizeCredential,
    publicProviders
} = require('../services/mail-providers');

const router = express.Router();
const MAX_ACCOUNTS = 8;

const accountWriteLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyPrefix: 'mail-account-write',
    keyGenerator: req => req.user?.id || 'anonymous'
});
const sendLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 30,
    keyPrefix: 'mail-send',
    keyGenerator: req => req.user?.id || 'anonymous'
});

router.use(authenticateToken);
router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
});

function accountView(account) {
    return {
        id: account.id,
        provider: account.provider,
        email: account.email,
        displayName: account.display_name || '',
        authType: account.auth_type,
        imapHost: account.imap_host,
        imapPort: Number(account.imap_port),
        smtpHost: account.smtp_host,
        smtpPort: Number(account.smtp_port),
        status: account.status,
        lastSyncAt: account.last_sync_at || null,
        lastError: account.last_error || '',
        createdAt: account.created_at,
        updatedAt: account.updated_at
    };
}

function requireAccount(req) {
    const account = mailAccounts.findForUser(String(req.params.accountId || ''), req.user.id);
    if (!account) {
        const error = new Error('邮箱账号不存在');
        error.statusCode = 404;
        error.code = 'MAIL_ACCOUNT_NOT_FOUND';
        throw error;
    }
    return account;
}

function credentialFor(account, userId) {
    return decryptCredential(account.credential_blob, userId, account.id);
}

function sendError(res, error, fallbackStatus = 500) {
    const publicError = mailClient.publicMailError(error);
    return res.status(Number(publicError.statusCode || fallbackStatus)).json({
        success: false,
        message: publicError.message,
        code: publicError.code || 'MAIL_REQUEST_FAILED'
    });
}

async function mapLimited(items, limit, operation) {
    const results = new Array(items.length);
    let cursor = 0;
    async function worker() {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await operation(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

router.get('/providers', (req, res) => {
    res.json({ success: true, data: publicProviders() });
});

router.get('/accounts', (req, res) => {
    res.json({ success: true, data: mailAccounts.listForUser(req.user.id).map(accountView) });
});

router.post('/accounts', accountWriteLimiter, async (req, res) => {
    if (mailAccounts.countForUser(req.user.id) >= MAX_ACCOUNTS) {
        return res.status(409).json({ success: false, message: '最多可连接 8 个邮箱', code: 'MAIL_ACCOUNT_LIMIT' });
    }
    const id = crypto.randomUUID();
    try {
        const normalized = normalizeAccountInput(req.body || {});
        const credential = normalizeCredential(req.body?.credential);
        const account = { id, user_id: req.user.id, ...normalized };
        await mailClient.verifyAccount(account, credential);
        account.credential_blob = encryptCredential(credential, req.user.id, id);
        const created = mailAccounts.create(account);
        res.status(201).json({ success: true, data: accountView(created) });
    } catch (error) {
        if (String(error?.message || '').includes('MAIL_ACCOUNT_LIMIT')) {
            return res.status(409).json({ success: false, message: '最多可连接 8 个邮箱', code: 'MAIL_ACCOUNT_LIMIT' });
        }
        if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
            return res.status(409).json({ success: false, message: '该邮箱已经连接', code: 'MAIL_ACCOUNT_EXISTS' });
        }
        return sendError(res, error);
    }
});

router.put('/accounts/:accountId', accountWriteLimiter, async (req, res) => {
    try {
        const current = requireAccount(req);
        const normalized = normalizeAccountInput(req.body || {}, current);
        const hasNewCredential = typeof req.body?.credential === 'string' && req.body.credential.trim().length > 0;
        const credential = hasNewCredential
            ? normalizeCredential(req.body.credential)
            : credentialFor(current, req.user.id);
        const candidate = { ...current, ...normalized };
        await mailClient.verifyAccount(candidate, credential);
        const updated = mailAccounts.update(current.id, req.user.id, {
            ...normalized,
            credential_blob: hasNewCredential
                ? encryptCredential(credential, req.user.id, current.id)
                : undefined
        });
        res.json({ success: true, data: accountView(updated) });
    } catch (error) {
        if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
            return res.status(409).json({ success: false, message: '该邮箱已经连接', code: 'MAIL_ACCOUNT_EXISTS' });
        }
        return sendError(res, error);
    }
});

router.delete('/accounts/:accountId', accountWriteLimiter, (req, res) => {
    try {
        const current = requireAccount(req);
        mailAccounts.remove(current.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        return sendError(res, error);
    }
});

router.post('/accounts/:accountId/test', accountWriteLimiter, async (req, res) => {
    try {
        const account = requireAccount(req);
        await mailClient.verifyAccount(account, credentialFor(account, req.user.id));
        mailAccounts.setSyncState(account.id, req.user.id, { ok: true });
        res.json({ success: true });
    } catch (error) {
        const publicError = mailClient.publicMailError(error);
        const accountId = String(req.params.accountId || '');
        mailAccounts.setSyncState(accountId, req.user.id, { ok: false, error: publicError.message });
        return sendError(res, publicError);
    }
});

router.get('/inbox', async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const offset = Math.min(100, Math.max(0, Number(req.query.offset) || 0));
    const selectedId = String(req.query.accountId || '');
    const query = String(req.query.query || '').trim().toLowerCase().slice(0, 120);
    let accounts = selectedId
        ? [mailAccounts.findForUser(selectedId, req.user.id)].filter(Boolean)
        : mailAccounts.listForUser(req.user.id).map(item => mailAccounts.findForUser(item.id, req.user.id));
    if (selectedId && !accounts.length) {
        return res.status(404).json({ success: false, message: '邮箱账号不存在', code: 'MAIL_ACCOUNT_NOT_FOUND' });
    }
    const errors = [];
    const pages = await mapLimited(accounts, 3, async account => {
        try {
            const messages = await mailClient.listMessages(account, credentialFor(account, req.user.id), {
                limit: selectedId ? limit : Math.min(50, limit + offset),
                offset: selectedId ? offset : 0
            });
            mailAccounts.setSyncState(account.id, req.user.id, { ok: true });
            return messages;
        } catch (error) {
            const publicError = mailClient.publicMailError(error);
            mailAccounts.setSyncState(account.id, req.user.id, { ok: false, error: publicError.message });
            errors.push({ accountId: account.id, message: publicError.message, code: publicError.code });
            return [];
        }
    });
    let messages = pages.flat().sort((left, right) => Date.parse(right.date || 0) - Date.parse(left.date || 0));
    if (!selectedId) messages = messages.slice(offset, offset + limit);
    if (query) {
        messages = messages.filter(message => {
            const addresses = [...message.from, ...message.to].map(item => `${item.name} ${item.address}`).join(' ');
            return `${message.subject} ${addresses}`.toLowerCase().includes(query);
        });
    }
    res.json({ success: true, data: messages, errors, hasMore: messages.length === limit });
});

router.get('/accounts/:accountId/messages/:uid', async (req, res) => {
    try {
        const account = requireAccount(req);
        const message = await mailClient.getMessage(account, credentialFor(account, req.user.id), req.params.uid);
        if (!message) return res.status(404).json({ success: false, message: '邮件不存在', code: 'MAIL_MESSAGE_NOT_FOUND' });
        res.json({ success: true, data: message });
    } catch (error) {
        return sendError(res, error);
    }
});

router.patch('/accounts/:accountId/messages/:uid', async (req, res) => {
    const changes = {};
    if (typeof req.body?.seen === 'boolean') changes.seen = req.body.seen;
    if (typeof req.body?.flagged === 'boolean') changes.flagged = req.body.flagged;
    if (!Object.keys(changes).length) {
        return res.status(400).json({ success: false, message: '没有可更新的邮件状态', code: 'MAIL_FLAGS_REQUIRED' });
    }
    try {
        const account = requireAccount(req);
        const result = await mailClient.updateFlags(account, credentialFor(account, req.user.id), req.params.uid, changes);
        res.json({ success: true, data: result });
    } catch (error) {
        return sendError(res, error);
    }
});

router.post('/accounts/:accountId/send', sendLimiter, async (req, res) => {
    try {
        const account = requireAccount(req);
        const result = await mailClient.sendMessage(account, credentialFor(account, req.user.id), req.body || {});
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        return sendError(res, error);
    }
});

module.exports = router;
