const crypto = require('node:crypto');
const db = require('../db');
const { credentialVersion } = require('../middleware/auth');
const { readConfig, clientFor, SCOPES, GRANT_IDLE_MS } = require('./fushi-config');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
function fail(code = 'invalid_grant') { const e = new Error(code); e.code = code; throw e; }
function account() {
    const cfg = readConfig();
    if (!cfg.enabled || !cfg.userId) return null;
    const user = db.prepare('SELECT id, username, nickname, role, password_hash FROM users WHERE id = ?').get(cfg.userId);
    // A machine credential never acquires administrator authority, even accidentally.
    return user?.role === 'user' ? user : null;
}
function grantFor(id, scope, now = Date.now()) {
    const grant = db.prepare('SELECT * FROM fushi_grants WHERE id = ?').get(id);
    const user = account();
    const client = grant && clientFor(grant.client_id);
    if (!grant || !user || grant.user_id !== user.id || !client
        || grant.scopes.split(' ').some(value => !client.scopes.includes(value))
        || grant.issuer !== readConfig().origin || grant.resource !== readConfig().resource
        || grant.revoked_at || grant.expires_at <= now || grant.credential_version !== credentialVersion(user.password_hash)
        || (scope && !grant.scopes.split(' ').includes(scope))) return null;
    return { grant, user };
}
function authorizeRequest(params, now = Date.now(), clientProof = null) {
    const cfg = readConfig();
    if (!account()) fail('access_denied');
    const client = clientFor(params.client_id);
    const redirectAllowed = client?.clientMode === 'cimd'
        ? clientProof?.clientId === client.clientId && clientProof.redirectUris.includes(params.redirect_uri)
        : client?.redirectUris.includes(params.redirect_uri);
    if (!client || !redirectAllowed) fail('invalid_client');
    if (params.response_type !== 'code' || params.resource !== cfg.resource || params.code_challenge_method !== 'S256'
        || !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge || '') || typeof params.state !== 'string'
        || !params.state || params.state.length > 1024) fail('invalid_request');
    const scopes = String(params.scope || '').split(' ').filter(Boolean);
    if (!scopes.length || scopes.some(scope => !SCOPES.includes(scope) || !client.scopes.includes(scope))) fail('invalid_scope');
    return { ...params, scopes: [...new Set(scopes)].sort(), now };
}
function issueCode(userId, params, now = Date.now(), clientProof = null) {
    const request = authorizeRequest(params, now, clientProof);
    const user = account();
    if (params.approve === false) {
        const destination = new URL(request.redirect_uri);
        destination.searchParams.set('error', 'access_denied');
        destination.searchParams.set('state', request.state);
        destination.searchParams.set('iss', readConfig().origin);
        return { redirect: destination.toString() };
    }
    if (user.id !== userId || params.approve !== true) fail('access_denied');
    const grantId = crypto.randomUUID(), code = random();
    db.transaction(() => {
        db.prepare(`INSERT INTO fushi_grants VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
            .run(grantId, user.id, request.client_id, credentialVersion(user.password_hash), readConfig().origin, readConfig().resource,
                request.scopes.join(' '), now, now + GRANT_IDLE_MS);
        db.prepare('INSERT INTO fushi_oauth_codes VALUES (?, ?, ?, ?, ?, NULL)')
            .run(hash(code), grantId, request.redirect_uri, request.code_challenge, now + 90000);
    })();
    const destination = new URL(request.redirect_uri);
    destination.searchParams.set('code', code);
    destination.searchParams.set('state', request.state);
    destination.searchParams.set('iss', readConfig().origin);
    return { redirect: destination.toString() };
}
function tokens(grant, now) {
    const access = random(), refresh = random();
    const accessExpiry = Math.min(now + 15 * 60000, grant.expires_at);
    const insert = db.prepare('INSERT INTO fushi_oauth_tokens VALUES (?, ?, ?, ?, NULL)');
    insert.run(hash(access), grant.id, 'access', accessExpiry);
    insert.run(hash(refresh), grant.id, 'refresh', grant.expires_at);
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: Math.floor((accessExpiry - now) / 1000), scope: grant.scopes };
}
function exchange(params, now = Date.now()) {
    const cfg = readConfig();
    if (!clientFor(params.client_id)) fail('invalid_client');
    if (params.resource !== cfg.resource) fail('invalid_target');
    if (params.grant_type === 'authorization_code') {
        const result = db.transaction(() => {
            const code = db.prepare('SELECT * FROM fushi_oauth_codes WHERE hash = ?').get(hash(params.code));
            const context = code && grantFor(code.grant_id, null, now);
            if (!context || context.grant.client_id !== params.client_id || params.redirect_uri !== code.redirect_uri
                || !/^[A-Za-z0-9._~-]{43,128}$/.test(params.code_verifier || '')
                || crypto.createHash('sha256').update(params.code_verifier).digest('base64url') !== code.challenge) fail();
            // Verified code reuse revokes its tokens; a wrong verifier cannot revoke a legitimate grant.
            if (code.used_at) { revokeGrant(code.grant_id, now); return null; }
            if (code.expires_at <= now) fail();
            db.prepare('UPDATE fushi_oauth_codes SET used_at = ? WHERE hash = ?').run(now, code.hash);
            return tokens(context.grant, now);
        })();
        if (!result) fail();
        return result;
    }
    if (params.grant_type === 'refresh_token') {
        // A reused refresh token revokes the family; commit that revocation before reporting failure.
        const result = db.transaction(() => {
            const token = db.prepare("SELECT * FROM fushi_oauth_tokens WHERE hash = ? AND kind = 'refresh'").get(hash(params.refresh_token));
            const owner = token && db.prepare('SELECT client_id FROM fushi_grants WHERE id=?').get(token.grant_id);
            if (!owner || owner.client_id !== params.client_id) return null;
            if (token?.used_at) { revokeGrant(token.grant_id, now); return null; }
            const context = token && grantFor(token.grant_id, null, now);
            if (!context || token.expires_at <= now) return null;
            db.prepare('UPDATE fushi_oauth_tokens SET used_at = ? WHERE hash = ?').run(now, token.hash);
            // Successful rotation extends inactivity expiry, with no absolute
            // monthly cutoff. Access tokens and subscriptions remain short-lived.
            const expiresAt = now + GRANT_IDLE_MS;
            db.prepare('UPDATE fushi_grants SET expires_at = ? WHERE id = ?').run(expiresAt, context.grant.id);
            return tokens({ ...context.grant, expires_at: expiresAt }, now);
        })();
        if (!result) fail();
        return result;
    }
    fail('unsupported_grant_type');
}
function authenticate(token, scope, now = Date.now()) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = db.prepare("SELECT * FROM fushi_oauth_tokens WHERE hash = ? AND kind = 'access'").get(hash(token));
    if (!row || row.expires_at <= now) return null;
    return grantFor(row.grant_id, scope, now);
}
function revokeGrant(id, now = Date.now()) {
    db.prepare('UPDATE fushi_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').run(now, id);
    db.prepare('UPDATE fushi_subscriptions SET active = 0, secret_box = NULL, previous_secret_box = NULL WHERE grant_id = ?').run(id);
}
function revokeToken(token, clientId) {
    if (!clientFor(clientId)) fail('invalid_client');
    const row = db.prepare(`SELECT t.grant_id FROM fushi_oauth_tokens t JOIN fushi_grants g ON g.id=t.grant_id
        WHERE t.hash=? AND g.client_id=?`).get(hash(token), clientId);
    if (row) db.transaction(() => revokeGrant(row.grant_id))();
}
module.exports = { account, grantFor, authorizeRequest, issueCode, exchange, authenticate, revokeGrant, revokeToken, hash };
