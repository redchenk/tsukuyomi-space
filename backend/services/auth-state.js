const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const store = require('./redis-store');

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function verificationKey(email, purpose) {
    return `auth:verification:${purpose}:${String(email).toLowerCase()}`;
}

function verificationCooldownKey(email, purpose) {
    return `auth:verification-cooldown:${purpose}:${String(email).toLowerCase()}`;
}

function loginFailureKey(identity) {
    return `auth:login-fail:${String(identity || '').toLowerCase()}`;
}

function tokenBlacklistKey(token) {
    return `auth:token-blacklist:${sha256(token)}`;
}

async function latestVerificationCode(email, purpose) {
    return store.getJson(verificationKey(email, purpose));
}

async function createVerificationCode({ email, code, purpose, ttlMs, cooldownMs }) {
    const now = Date.now();
    await store.setJson(verificationKey(email, purpose), {
        code_hash: bcrypt.hashSync(String(code), 10),
        used_at: null,
        expires_at: now + ttlMs,
        created_at: now
    }, Math.ceil(ttlMs / 1000));
    await store.set(verificationCooldownKey(email, purpose), '1', Math.ceil(cooldownMs / 1000));
}

async function verificationCooldownTtl(email, purpose) {
    const exists = await store.get(verificationCooldownKey(email, purpose));
    if (!exists) return 0;
    const row = await latestVerificationCode(email, purpose);
    if (!row) return 0;
    return Math.max(0, Math.ceil((config.emailCodeCooldownMs - (Date.now() - row.created_at)) / 1000));
}

async function consumeVerificationCode(email, purpose, code) {
    const key = verificationKey(email, purpose);
    const row = await store.getJson(key);
    const now = Date.now();
    if (!row || row.used_at || row.expires_at < now) return false;
    if (!bcrypt.compareSync(String(code || '').trim(), row.code_hash)) return false;
    row.used_at = now;
    await store.setJson(key, row, Math.max(1, Math.ceil((row.expires_at - now) / 1000)));
    return true;
}

async function recordLoginFailure(identity) {
    return store.incrementWithTtl(loginFailureKey(identity), config.loginFailureWindowSeconds);
}

async function clearLoginFailures(identity) {
    return store.del(loginFailureKey(identity));
}

async function loginFailureState(identity) {
    const value = await store.get(loginFailureKey(identity));
    return Number(value || 0);
}

function tokenTtlSeconds(token) {
    try {
        const decoded = jwt.decode(token);
        if (!decoded?.exp) return 0;
        return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
    } catch (_) {
        return 0;
    }
}

async function blacklistToken(token) {
    const ttl = tokenTtlSeconds(token);
    if (ttl <= 0) return false;
    await store.set(tokenBlacklistKey(token), '1', ttl);
    return true;
}

async function isTokenBlacklisted(token) {
    return Boolean(await store.get(tokenBlacklistKey(token)));
}

module.exports = {
    latestVerificationCode,
    createVerificationCode,
    verificationCooldownTtl,
    consumeVerificationCode,
    recordLoginFailure,
    clearLoginFailures,
    loginFailureState,
    blacklistToken,
    isTokenBlacklisted
};
