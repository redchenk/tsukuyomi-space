const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-mail-test-'));
process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, 'tsukuyomi.db');
process.env.JWT_SECRET = 'mail-test-jwt-secret-with-more-than-32-characters';
process.env.MAIL_CREDENTIAL_KEY = 'mail-test-independent-key-with-more-than-32-characters';
process.env.REDIS_URL = '';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'admin-test-password';
process.env.ENABLE_FRONTEND_DIST = 'false';

const mailClient = require('../backend/services/mail-client');
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
const { decryptCredential, encryptCredential } = require('../backend/services/mail-credential-crypto');
const { normalizeAccountInput } = require('../backend/services/mail-providers');

let server;
let baseUrl;
let firstToken;
let secondToken;
let firstAccountId;

function headers(token) {
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

async function api(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    return { response, body: await response.json() };
}

before(async () => {
    mailClient.verifyAccount = async (account, credential) => {
        assert.ok(account.imap_host);
        assert.equal(credential, 'test-app-password');
        return true;
    };
    mailClient.listMessages = async account => [{
        id: `${account.id}:7`, accountId: account.id, provider: account.provider,
        mailbox: account.email, uid: 7, subject: `Inbox ${account.email}`,
        from: [{ name: 'Sender', address: 'sender@example.test' }], to: [],
        date: '2026-07-21T08:00:00.000Z', seen: false, flagged: false, size: 120
    }];
    mailClient.getMessage = async account => ({
        id: `${account.id}:7`, accountId: account.id, uid: 7,
        subject: 'Safe message', body: 'plain text', attachments: []
    });
    mailClient.updateFlags = async (_account, _credential, uid, changes) => ({ uid: Number(uid), ...changes });
    mailClient.sendMessage = async () => ({ messageId: 'test-message', accepted: ['to@example.test'] });

    const app = createApp();
    server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const insert = db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)');
    insert.run('mail-user-1', 'mail-user-1', 'one@example.test', bcrypt.hashSync('password-one', 10), 'user');
    insert.run('mail-user-2', 'mail-user-2', 'two@example.test', bcrypt.hashSync('password-two', 10), 'user');
    firstToken = generateToken({ id: 'mail-user-1', username: 'mail-user-1', role: 'user' });
    secondToken = generateToken({ id: 'mail-user-2', username: 'mail-user-2', role: 'user' });
});

after(async () => {
    await new Promise(resolve => server.close(resolve));
});

describe('mail credential security', () => {
    it('authenticates encrypted credentials to their account and user', () => {
        const blob = encryptCredential('secret-value', 'user-a', 'account-a');
        assert.ok(!blob.includes('secret-value'));
        assert.equal(decryptCredential(blob, 'user-a', 'account-a'), 'secret-value');
        assert.throws(() => decryptCredential(blob, 'user-b', 'account-a'), /cannot be decrypted/);
    });

    it('restricts custom accounts to TLS hostnames and ports', () => {
        assert.throws(() => normalizeAccountInput({
            provider: 'custom', email: 'me@example.com', authType: 'password',
            imapHost: '127.0.0.1', imapPort: 993,
            smtpHost: 'mail.example.com', smtpPort: 465
        }));
        assert.throws(() => normalizeAccountInput({
            provider: 'custom', email: 'me@example.com', authType: 'password',
            imapHost: 'imap.example.com', imapPort: 143,
            smtpHost: 'smtp.example.com', smtpPort: 25
        }));
    });

    it('enforces the per-user mailbox limit inside SQLite', () => {
        const insert = db.prepare(`
            INSERT INTO mail_accounts (
                id, user_id, provider, email, auth_type, credential_blob,
                imap_host, imap_port, smtp_host, smtp_port
            ) VALUES (?, 'mail-user-2', 'qq', ?, 'app_password', 'test', 'imap.qq.com', 993, 'smtp.qq.com', 465)
        `);
        for (let index = 0; index < 8; index += 1) insert.run(`limit-${index}`, `limit-${index}@qq.com`);
        assert.throws(() => insert.run('limit-8', 'limit-8@qq.com'), /MAIL_ACCOUNT_LIMIT/);
        db.prepare("DELETE FROM mail_accounts WHERE user_id = 'mail-user-2'").run();
    });
});

describe('mail API', () => {
    it('requires a signed-in site account', async () => {
        const { response } = await api('/api/mail/accounts');
        assert.equal(response.status, 401);
    });

    it('lists supported providers', async () => {
        const { response, body } = await api('/api/mail/providers', { headers: headers(firstToken) });
        assert.equal(response.status, 200);
        assert.ok(body.data.some(provider => provider.id === 'gmail'));
        assert.ok(body.data.some(provider => provider.id === 'custom'));
    });

    it('connects an account without exposing or storing plaintext credentials', async () => {
        const { response, body } = await api('/api/mail/accounts', {
            method: 'POST', headers: headers(firstToken), body: JSON.stringify({
                provider: 'qq', email: 'owner@qq.com', displayName: 'Owner',
                authType: 'app_password', credential: 'test-app-password'
            })
        });
        assert.equal(response.status, 201);
        firstAccountId = body.data.id;
        assert.equal(body.data.credential, undefined);
        assert.equal(body.data.credentialBlob, undefined);
        const stored = db.prepare('SELECT * FROM mail_accounts WHERE id = ?').get(firstAccountId);
        assert.ok(stored.credential_blob.startsWith('v1.'));
        assert.ok(!stored.credential_blob.includes('test-app-password'));
    });

    it('isolates mailbox accounts by site user', async () => {
        const own = await api('/api/mail/accounts', { headers: headers(firstToken) });
        const other = await api('/api/mail/accounts', { headers: headers(secondToken) });
        assert.equal(own.body.data.length, 1);
        assert.equal(other.body.data.length, 0);
        const detail = await api(`/api/mail/accounts/${firstAccountId}/messages/7`, { headers: headers(secondToken) });
        assert.equal(detail.response.status, 404);
    });

    it('aggregates messages and supports safe mail actions', async () => {
        const inbox = await api('/api/mail/inbox', { headers: headers(firstToken) });
        assert.equal(inbox.response.status, 200);
        assert.equal(inbox.body.data[0].uid, 7);

        const detail = await api(`/api/mail/accounts/${firstAccountId}/messages/7`, { headers: headers(firstToken) });
        assert.equal(detail.body.data.body, 'plain text');

        const flags = await api(`/api/mail/accounts/${firstAccountId}/messages/7`, {
            method: 'PATCH', headers: headers(firstToken), body: JSON.stringify({ seen: true, flagged: true })
        });
        assert.deepEqual(flags.body.data, { uid: 7, seen: true, flagged: true });

        const sent = await api(`/api/mail/accounts/${firstAccountId}/send`, {
            method: 'POST', headers: headers(firstToken),
            body: JSON.stringify({ to: ['to@example.test'], subject: 'Hello', body: 'Text only' })
        });
        assert.equal(sent.response.status, 201);
        assert.equal(sent.body.data.messageId, 'test-message');
    });

    it('deletes only the current user mailbox', async () => {
        const forbidden = await api(`/api/mail/accounts/${firstAccountId}`, { method: 'DELETE', headers: headers(secondToken) });
        assert.equal(forbidden.response.status, 404);
        const removed = await api(`/api/mail/accounts/${firstAccountId}`, { method: 'DELETE', headers: headers(firstToken) });
        assert.equal(removed.response.status, 200);
        assert.equal(db.prepare('SELECT id FROM mail_accounts WHERE id = ?').get(firstAccountId), undefined);
    });
});
