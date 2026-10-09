const crypto = require('crypto');
const config = require('../config');
const { normalizeEmail, isEmail } = require('../validators');

function settings() {
    const github = config.oauth.github;
    if (!github.clientId || !github.clientSecret) {
        const error = new Error('GitHub 登录暂未配置');
        error.code = 'GITHUB_OAUTH_NOT_CONFIGURED';
        throw error;
    }
    return github;
}

function authorizationUrl({ state, codeVerifier, redirectUri = config.oauth.github.redirectUri }) {
    const github = settings();
    const params = new URLSearchParams({ client_id: github.clientId, redirect_uri: redirectUri,
        scope: 'read:user user:email', state, prompt: 'select_account',
        code_challenge: crypto.createHash('sha256').update(codeVerifier).digest('base64url'),
        code_challenge_method: 'S256' });
    return `https://github.com/login/oauth/authorize?${params}`;
}

async function requestJson(url, options = {}) {
    // Never follow redirects carrying the application secret or bearer token.
    const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`GitHub 授权服务请求失败 (${response.status})`);
    const data = await response.json();
    if (data.error) throw new Error('GitHub 授权失败，请重新授权');
    return data;
}

async function getProfileFromCode(code, codeVerifier, redirectUri = config.oauth.github.redirectUri) {
    const github = settings();
    const token = await requestJson('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: github.clientId, client_secret: github.clientSecret,
            redirect_uri: redirectUri, code, code_verifier: codeVerifier }).toString()
    });
    if (!token.access_token || String(token.token_type).toLowerCase() !== 'bearer') throw new Error('GitHub 授权响应无效');
    const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`,
        'User-Agent': 'Tsukuyomi-Space', 'X-GitHub-Api-Version': '2022-11-28' };
    const user = await requestJson('https://api.github.com/user', { headers });
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || !user.login) throw new Error('GitHub 账号资料无效');
    // The provider email only prefills the form. Site verification is always required.
    let emails = [];
    try { emails = await requestJson('https://api.github.com/user/emails?per_page=100', { headers }); }
    catch (_) { /* Private/unavailable email does not prevent site email verification. */ }
    const verified = Array.isArray(emails) ? emails.filter(row => row.verified === true && isEmail(row.email)) : [];
    const email = normalizeEmail((verified.find(row => row.primary) || verified[0])?.email || '');
    let avatar = '';
    try { const url = new URL(user.avatar_url); if (url.protocol === 'https:' && !url.username && !url.password) avatar = url.toString(); } catch (_) {}
    return { provider: 'github', providerUserId: String(user.id), email,
        nickname: String(user.name || user.login).slice(0, 64), avatar,
        raw: { id: user.id, login: user.login } }; // No access token or private profile retained.
}

function redirectUris() {
    return [...new Set([config.oauth.github.redirectUri, ...config.oauth.github.additionalRedirectUris])].filter(value => {
        try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/api/auth/oauth/github/callback'; }
        catch (_) { return false; }
    });
}
module.exports = { authorizationUrl, getProfileFromCode, redirectUris };
