const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const { credentialVersion } = require('../middleware/auth');

const SCOPE = 'profile.basic';
const CODE_MS = 90000;
const TOKEN_MS = 300000;
const REQUEST_MS = 600000;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
function fail(error, status = 400) { throw Object.assign(new Error(error), { oauthError: error, status }); }
function equal(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function issuer() {
    const value = process.env.PARTNER_OAUTH_ISSUER || 'https://yachiyo.hk';
    const url = new URL(value);
    const local = !config.isProduction && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (value !== url.origin || url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
        throw new Error('PARTNER_OAUTH_ISSUER must be a canonical HTTPS origin without trailing slash');
    }
    return value;
}
function validateRedirect(value) {
    try {
        const url = new URL(value);
        if (typeof value !== 'string' || value.length > 2048 || url.protocol !== 'https:' || url.username || url.password
            || /[\s\\*?#]/.test(value)) fail('invalid_request');
        return value;
    } catch (_) { fail('invalid_request'); }
}
function client(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
    const row = db.prepare('SELECT * FROM partner_oauth_clients WHERE id=?').get(id);
    return row?.enabled === 1 ? row : null;
}
function validateRegistration({ id, name, redirectUris }) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id || '') || typeof name !== 'string' || !name.trim()
        || name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name) || !Array.isArray(redirectUris)
        || !redirectUris.length || redirectUris.length > 8) fail('invalid_request');
    redirectUris.forEach(validateRedirect);
}
function registerClient({ id, name, redirectUris, secret }, now = Date.now()) {
    validateRegistration({ id, name, redirectUris });
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(secret)) fail('invalid_request');
    db.prepare('INSERT INTO partner_oauth_clients(id,name,redirect_uris,secret_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)')
        .run(id, name.trim(), JSON.stringify([...new Set(redirectUris)]), hash(secret), now, now);
}
function basic(header) {
    if (typeof header !== 'string' || header.length > 2048 || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header)) fail('invalid_client', 401);
    const encoded = header.slice(6), bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) fail('invalid_client', 401);
    const value = bytes.toString('utf8'), index = value.indexOf(':');
    if (index < 1) fail('invalid_client', 401);
    let id, secret;
    try {
        id = decodeURIComponent(value.slice(0, index).replace(/\+/g, ' '));
        secret = decodeURIComponent(value.slice(index + 1).replace(/\+/g, ' '));
    } catch (_) { fail('invalid_client', 401); }
    const row = client(id);
    if (!equal(hash(secret), row?.secret_hash || '0'.repeat(64)) || !row) fail('invalid_client', 401);
    return row;
}
function strings(params, allowed) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) fail('invalid_request');
    for (const [key, value] of Object.entries(params)) {
        if (!allowed.includes(key) || typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) fail('invalid_request');
    }
}
function validateAuthorization(params) {
    strings(params, ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'code_challenge', 'code_challenge_method']);
    const c = client(params.client_id);
    if (!c || !JSON.parse(c.redirect_uris).includes(params.redirect_uri)) fail('invalid_client');
    if (params.response_type !== 'code') fail('unsupported_response_type');
    if (params.scope !== SCOPE) fail('invalid_scope');
    if (!params.state || params.state.length > 1024 || params.code_challenge_method !== 'S256'
        || !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge || '')) fail('invalid_request');
    return { ...params, clientVersion: c.version, issuer: issuer(), name: c.name };
}
function clean(now) {
    db.prepare('DELETE FROM partner_oauth_requests WHERE expires_at<=?').run(now);
    // Keep used codes past their token lifetime to detect authenticated replay.
    db.prepare('DELETE FROM partner_oauth_codes WHERE expires_at<?').run(now - REQUEST_MS);
}
function createRequest(userId, session, action, payload, now = Date.now()) {
    clean(now);
    const ticket = random();
    db.prepare('INSERT INTO partner_oauth_requests VALUES(?,?,?,?,?,?)')
        .run(hash(ticket), userId, hash(session), action, JSON.stringify(payload), now + REQUEST_MS);
    return ticket;
}
function consumeRequest(ticket, userId, session, action, now) {
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) fail('invalid_request');
    const row = db.prepare('SELECT * FROM partner_oauth_requests WHERE hash=?').get(hash(ticket));
    if (!row || row.user_id !== userId || !equal(row.session_hash, hash(session)) || row.action !== action || row.expires_at <= now) fail('invalid_request');
    db.prepare('DELETE FROM partner_oauth_requests WHERE hash=?').run(row.hash);
    return JSON.parse(row.payload);
}
function account(userId) {
    const user = db.prepare('SELECT id,nickname,avatar,password_hash,role FROM users WHERE id=?').get(userId);
    if (!user || user.role === 'banned') fail('access_denied', 403);
    return user;
}
function decide({ ticket, userId, session, approve }, now = Date.now()) {
    if (!['yes', 'no'].includes(approve)) fail('invalid_request');
    return db.transaction(() => {
        const request = consumeRequest(ticket, userId, session, 'authorize', now);
        const current = validateAuthorization(Object.fromEntries(Object.entries(request).filter(([k]) => !['clientVersion', 'issuer', 'name'].includes(k))));
        if (current.clientVersion !== request.clientVersion || current.issuer !== request.issuer) fail('invalid_request');
        const user = account(userId);
        const destination = new URL(request.redirect_uri);
        destination.searchParams.set('state', request.state);
        destination.searchParams.set('iss', request.issuer);
        if (approve === 'no') { destination.searchParams.set('error', 'access_denied'); return destination.href; }
        let identity = db.prepare('SELECT * FROM partner_oauth_identities WHERE issuer=? AND client_id=? AND user_id=?')
            .get(request.issuer, request.client_id, user.id);
        if (!identity) {
            const sub = 'tsu_' + random();
            db.prepare('INSERT INTO partner_oauth_identities(sub,issuer,client_id,user_id,authorized_at) VALUES(?,?,?,?,?)')
                .run(sub, request.issuer, request.client_id, user.id, now);
            identity = db.prepare('SELECT * FROM partner_oauth_identities WHERE sub=?').get(sub);
        } else db.prepare('UPDATE partner_oauth_identities SET revoked_at=NULL,authorized_at=? WHERE sub=?').run(now, identity.sub);
        const code = random();
        db.prepare('INSERT INTO partner_oauth_codes VALUES(?,?,?,?,?,?,?,?,NULL)')
            .run(hash(code), identity.sub, current.clientVersion, identity.version, credentialVersion(user.password_hash), request.redirect_uri, request.code_challenge, now + CODE_MS);
        destination.searchParams.set('code', code);
        return destination.href;
    })();
}
function context(code) {
    if (!code) return null;
    const identity = db.prepare('SELECT * FROM partner_oauth_identities WHERE sub=?').get(code.sub);
    const c = identity && client(identity.client_id);
    const user = identity && db.prepare('SELECT id,nickname,avatar,password_hash,role FROM users WHERE id=?').get(identity.user_id);
    if (!identity || !c || !user || user.role === 'banned' || identity.revoked_at !== null
        || identity.issuer !== issuer() || identity.version !== code.identity_version || c.version !== code.client_version
        || code.credential_version !== credentialVersion(user.password_hash)) return null;
    return { identity, client: c, user };
}
function exchange(c, params, now = Date.now()) {
    strings(params, ['grant_type', 'code', 'redirect_uri', 'code_verifier']);
    if (params.grant_type !== 'authorization_code') fail('unsupported_grant_type');
    if (!params.code || !params.redirect_uri || !params.code_verifier) fail('invalid_request');
    const result = db.transaction(() => {
        const code = db.prepare('SELECT * FROM partner_oauth_codes WHERE hash=?').get(hash(params.code));
        const ctx = context(code);
        if (!ctx || ctx.client.id !== c.id || c.version !== ctx.client.version || code.redirect_uri !== params.redirect_uri
            || !/^[A-Za-z0-9._~-]{43,128}$/.test(params.code_verifier)
            || !equal(crypto.createHash('sha256').update(params.code_verifier).digest('base64url'), code.challenge)) fail('invalid_grant');
        if (code.used_at !== null) {
            db.prepare('UPDATE partner_oauth_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE code_hash=?').run(now, code.hash);
            return null;
        }
        if (code.expires_at <= now) fail('invalid_grant');
        db.prepare('UPDATE partner_oauth_codes SET used_at=? WHERE hash=?').run(now, code.hash);
        const token = random();
        db.prepare('INSERT INTO partner_oauth_tokens VALUES(?,?,?,NULL)').run(hash(token), code.hash, now + TOKEN_MS);
        return { access_token: token, token_type: 'Bearer', expires_in: TOKEN_MS / 1000, scope: SCOPE };
    })();
    if (!result) fail('invalid_grant');
    return result;
}
function userinfo(token, now = Date.now()) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail('invalid_token', 401);
    const row = db.prepare('SELECT * FROM partner_oauth_tokens WHERE hash=?').get(hash(token));
    const ctx = row && context(db.prepare('SELECT * FROM partner_oauth_codes WHERE hash=?').get(row.code_hash));
    if (!row || row.revoked_at !== null || row.expires_at <= now || !ctx) fail('invalid_token', 401);
    let avatar = '';
    try {
        const url = new URL(ctx.user.avatar, issuer());
        if (ctx.user.avatar && url.protocol === 'https:' && !url.username && !url.password) avatar = url.href;
    } catch (_) { /* Missing or unsafe avatars use the partner's fallback. */ }
    return { sub: ctx.identity.sub, nickname: ctx.user.nickname || '', avatar };
}
function revokeToken(c, params, now = Date.now()) {
    strings(params, ['token', 'token_type_hint']);
    if (!params.token) fail('invalid_request');
    const row = db.prepare(`SELECT t.hash FROM partner_oauth_tokens t JOIN partner_oauth_codes c ON c.hash=t.code_hash
        JOIN partner_oauth_identities i ON i.sub=c.sub WHERE t.hash=? AND i.client_id=?`).get(hash(params.token), c.id);
    if (row) db.prepare('UPDATE partner_oauth_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE hash=?').run(now, row.hash);
}
function connections(userId) {
    return db.prepare(`SELECT i.sub,i.client_id,c.name,c.enabled,i.authorized_at FROM partner_oauth_identities i
        JOIN partner_oauth_clients c ON c.id=i.client_id WHERE i.user_id=? AND i.issuer=? AND i.revoked_at IS NULL
        ORDER BY i.authorized_at DESC`).all(userId, issuer());
}
function revokeConnection(ticket, userId, session, now = Date.now()) {
    db.transaction(() => {
        const { sub } = consumeRequest(ticket, userId, session, 'revoke', now);
        db.prepare('UPDATE partner_oauth_identities SET version=version+1,revoked_at=? WHERE sub=? AND user_id=?')
            .run(now, sub, userId);
        // Consent pages opened before revocation cannot re-authorize silently.
        db.prepare('DELETE FROM partner_oauth_requests WHERE user_id=?').run(userId);
    })();
}
module.exports = { issuer, SCOPE, hash, random, fail, strings, client, basic, validateRegistration, registerClient,
    validateAuthorization, createRequest, decide, exchange, userinfo, revokeToken, connections, revokeConnection };
