const config = require('../config');
const { normalizeEmail } = require('../validators');

const QQ_AUTHORIZE_URL = 'https://graph.qq.com/oauth2.0/authorize';
const QQ_TOKEN_URL = 'https://graph.qq.com/oauth2.0/token';
const QQ_OPENID_URL = 'https://graph.qq.com/oauth2.0/me';
const QQ_USER_INFO_URL = 'https://graph.qq.com/user/get_user_info';
const REQUEST_TIMEOUT_MS = 8000;

function qqConfig() {
    const qq = config.oauth.qq;
    if (!qq.clientId || !qq.clientSecret || !qq.redirectUri) {
        const error = new Error('QQ OAuth is not configured');
        error.code = 'QQ_OAUTH_NOT_CONFIGURED';
        throw error;
    }
    return qq;
}

function authorizationUrl({ state, display = 'pc' }) {
    const qq = qqConfig();
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: qq.clientId,
        redirect_uri: qq.redirectUri,
        state,
        scope: 'get_user_info'
    });
    if (display === 'mobile' || display === 'pc') {
        params.set('display', display);
    }
    return `${QQ_AUTHORIZE_URL}?${params.toString()}`;
}

function parseCallbackJson(text) {
    const trimmed = String(text || '').trim();
    const match = trimmed.match(/^callback\(\s*([\s\S]*?)\s*\);?$/);
    if (!match) return null;
    try {
        return JSON.parse(match[1]);
    } catch (_) {
        return null;
    }
}

function parseMaybeJson(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return {};

    const callbackJson = parseCallbackJson(trimmed);
    if (callbackJson) return callbackJson;

    if (trimmed.startsWith('{')) {
        try {
            return JSON.parse(trimmed);
        } catch (_) {}
    }

    const params = new URLSearchParams(trimmed);
    return Object.fromEntries(params.entries());
}

async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: { Accept: 'application/json, text/plain, */*' },
            signal: controller.signal
        });
        const text = await response.text();
        if (!response.ok) {
            const error = new Error(`QQ OAuth request failed: HTTP ${response.status}`);
            error.responseText = text;
            throw error;
        }
        return text;
    } finally {
        clearTimeout(timer);
    }
}

function assertNoProviderError(payload, step) {
    if (!payload?.error && payload?.ret !== undefined && Number(payload.ret) === 0) return;
    if (!payload?.error && payload?.ret === undefined) return;

    const message = payload.error_description || payload.msg || payload.error || payload.ret || 'unknown error';
    const error = new Error(`QQ OAuth ${step} failed: ${message}`);
    error.providerPayload = payload;
    throw error;
}

async function exchangeCodeForToken(code) {
    const qq = qqConfig();
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: qq.clientId,
        client_secret: qq.clientSecret,
        code,
        redirect_uri: qq.redirectUri,
        fmt: 'json'
    });
    const payload = parseMaybeJson(await fetchText(`${QQ_TOKEN_URL}?${params.toString()}`));
    assertNoProviderError(payload, 'token');
    if (!payload.access_token) {
        throw new Error('QQ OAuth token response missing access_token');
    }
    return payload;
}

async function fetchOpenId(accessToken) {
    const qq = qqConfig();
    const params = new URLSearchParams({
        access_token: accessToken,
        fmt: 'json'
    });
    const payload = parseMaybeJson(await fetchText(`${QQ_OPENID_URL}?${params.toString()}`));
    assertNoProviderError(payload, 'openid');
    if (!payload.openid) {
        throw new Error('QQ OAuth openid response missing openid');
    }
    if (payload.client_id && String(payload.client_id) !== String(qq.clientId)) {
        throw new Error('QQ OAuth client_id mismatch');
    }
    return payload;
}

async function fetchUserInfo({ accessToken, openid }) {
    const qq = qqConfig();
    const params = new URLSearchParams({
        access_token: accessToken,
        oauth_consumer_key: qq.clientId,
        openid
    });
    const payload = parseMaybeJson(await fetchText(`${QQ_USER_INFO_URL}?${params.toString()}`));
    assertNoProviderError(payload, 'profile');
    return payload;
}

function normalizeProfile({ openid, token, openidPayload, userInfo }) {
    const avatar = userInfo.figureurl_qq_2
        || userInfo.figureurl_qq_1
        || userInfo.figureurl_2
        || userInfo.figureurl_1
        || userInfo.figureurl
        || '';
    return {
        provider: 'qq',
        providerUserId: openid,
        unionId: userInfo.unionid || openidPayload.unionid || '',
        email: normalizeEmail(userInfo.email || userInfo.mail || ''),
        nickname: String(userInfo.nickname || '').trim() || 'QQ 用户',
        avatar,
        raw: {
            openid: openidPayload,
            user: userInfo,
            token: {
                expires_in: token.expires_in || '',
                refresh_token_expires_in: token.refresh_token_expires_in || ''
            }
        }
    };
}

async function getProfileFromCode(code) {
    const token = await exchangeCodeForToken(code);
    const openidPayload = await fetchOpenId(token.access_token);
    const userInfo = await fetchUserInfo({
        accessToken: token.access_token,
        openid: openidPayload.openid
    });
    return normalizeProfile({
        openid: openidPayload.openid,
        token,
        openidPayload,
        userInfo
    });
}

module.exports = {
    authorizationUrl,
    getProfileFromCode
};
