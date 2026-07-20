const crypto = require('node:crypto');
const config = require('../config');

const VERSION = 'v1';
const KEY = crypto
    .createHash('sha256')
    .update('tsukuyomi-space/mail-credential/v1\0')
    .update(config.mailCredentialSecret)
    .digest();

function aad(userId, accountId) {
    return Buffer.from(`${VERSION}\0${userId}\0${accountId}`, 'utf8');
}

function encryptCredential(credential, userId, accountId) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    cipher.setAAD(aad(userId, accountId));
    const encrypted = Buffer.concat([
        cipher.update(String(credential), 'utf8'),
        cipher.final()
    ]);
    return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptCredential(blob, userId, accountId) {
    try {
        const [version, ivPart, tagPart, encryptedPart, ...extra] = String(blob || '').split('.');
        if (version !== VERSION || !ivPart || !tagPart || !encryptedPart || extra.length) throw new Error('Invalid blob');
        const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivPart, 'base64url'));
        decipher.setAAD(aad(userId, accountId));
        decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
        return Buffer.concat([
            decipher.update(Buffer.from(encryptedPart, 'base64url')),
            decipher.final()
        ]).toString('utf8');
    } catch (_) {
        const error = new Error('Saved mailbox credential cannot be decrypted');
        error.code = 'MAIL_CREDENTIAL_INVALID';
        throw error;
    }
}

module.exports = {
    decryptCredential,
    encryptCredential
};
