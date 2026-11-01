const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { normalizeEmail, isEmail } = require('../validators');
const { fetchGoogleOAuthUrl } = require('./google-oauth-transport');

let certificates;
let certificatesPending;
function settings() {
    const google = config.oauth.google;
    if (!google.clientId || !google.clientSecret) {
        throw Object.assign(new Error('Google 登录暂未配置'), { code: 'GOOGLE_OAUTH_NOT_CONFIGURED' });
    }
    return google;
}
function authorizationUrl({ state, codeVerifier, redirectUri = config.oauth.google.redirectUri }) {
    const params = new URLSearchParams({ client_id: settings().clientId, redirect_uri: redirectUri,
        response_type: 'code', scope: 'openid email profile', state, nonce: state, prompt: 'select_account',
        code_challenge: crypto.createHash('sha256').update(codeVerifier).digest('base64url'),
        code_challenge_method: 'S256' });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
async function requestJson(url, options = {}) {
    const response = await fetchGoogleOAuthUrl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Google 授权服务请求失败');
    const data = await response.json();
    if (!data || data.error) throw new Error('Google 授权失败，请重新授权');
    return { data, response };
}
async function signingKey(kid) {
    // A fixed Google endpoint only; no token-supplied URLs or keys are trusted.
    // Refresh unknown keys at most once per minute, including during key rotation.
    const now = Date.now();
    if (!certificates || now >= certificates.expiresAt
        || (!certificates.keys.has(kid) && now - certificates.fetchedAt > 60000)) {
        if (!certificatesPending) {
            certificatesPending = (async () => {
                const { data, response } = await requestJson('https://www.googleapis.com/oauth2/v3/certs');
                if (!Array.isArray(data.keys)) throw new Error('Google 签名密钥无效');
                const keys = new Map();
                for (const key of data.keys) {
                    if (key.kty !== 'RSA' || key.use !== 'sig' || (key.alg && key.alg !== 'RS256') || !key.kid) continue;
                    keys.set(key.kid, crypto.createPublicKey({ key, format: 'jwk' }));
                }
                if (!keys.size) throw new Error('Google 签名密钥无效');
                const age = Number(/max-age=(\d+)/i.exec(response.headers.get('cache-control') || '')?.[1] || 3600);
                certificates = { keys, fetchedAt: Date.now(), expiresAt: Date.now() + Math.min(age, 21600) * 1000 };
            })().finally(() => { certificatesPending = null; });
        }
        await certificatesPending;
    }
    const key = certificates.keys.get(kid);
    if (!key) throw new Error('Google 签名密钥不存在');
    return key;
}
async function getProfileFromCode(code, codeVerifier, redirectUri = config.oauth.google.redirectUri, nonce) {
    const google = settings();
    const { data: token } = await requestJson('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: google.clientId, client_secret: google.clientSecret,
            redirect_uri: redirectUri, code, code_verifier: codeVerifier, grant_type: 'authorization_code' }).toString()
    });
    if (typeof token.id_token !== 'string' || token.id_token.length > 16384 || !nonce) throw new Error('Google 授权响应无效');
    const decoded = jwt.decode(token.id_token, { complete: true });
    if (decoded?.header.alg !== 'RS256' || typeof decoded.header.kid !== 'string' || decoded.header.kid.length > 256) throw new Error('Google 身份签名无效');
    const claims = jwt.verify(token.id_token, await signingKey(decoded.header.kid), {
        algorithms: ['RS256'], audience: google.clientId, issuer: ['https://accounts.google.com', 'accounts.google.com']
    });
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255
        || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || claims.iat > Date.now() / 1000 + 60
        || claims.nonce !== nonce || (claims.azp && claims.azp !== google.clientId)
        || (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== google.clientId)) throw new Error('Google 身份资料无效');
    let avatar = '';
    try { const url = new URL(claims.picture); if (url.protocol === 'https:' && !url.username && !url.password) avatar = url.toString(); } catch (_) {}
    // The stable subject identifies the account. Email only prefills site verification.
    return { provider: 'google', providerUserId: claims.sub,
        email: claims.email_verified === true && isEmail(claims.email) ? normalizeEmail(claims.email) : '',
        nickname: String(claims.name || 'Google 用户').slice(0, 64), avatar, raw: { sub: claims.sub } };
}
function redirectUris() {
    return [...new Set([config.oauth.google.redirectUri, ...config.oauth.google.additionalRedirectUris])].filter(value => {
        try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
            && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/api/auth/oauth/google/callback'; }
        catch (_) { return false; }
    });
}
module.exports = { authorizationUrl, getProfileFromCode, redirectUris };
