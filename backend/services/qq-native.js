const config = require('../config');

function failure(status, message) { return Object.assign(new Error(message), { status }); }
function appId() {
    const id = config.oauth.qq.nativeAppId;
    if (!/^\d{5,20}$/.test(id || '')) throw failure(503, 'QQ 原生登录暂未配置');
    return id;
}

// Tokens stay in memory for this exchange. Do not log provider URLs, payloads,
// or errors: QQ APIs carry the access token in their query parameters.
async function qqJson(path, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(`https://graph.qq.com/${path}?${new URLSearchParams(params)}`, {
            headers: { Accept: 'application/json' }, redirect: 'error', signal: controller.signal
        });
        if (!response.ok) throw new Error('provider');
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
            size += chunk.length;
            if (size > 64 * 1024) { controller.abort(); throw new Error('size'); }
            chunks.push(Buffer.from(chunk));
        }
        const text = Buffer.concat(chunks).toString('utf8').trim();
        const value = JSON.parse(text.replace(/^callback\(\s*([\s\S]*?)\s*\);?$/, '$1'));
        if (!value || typeof value !== 'object' || value.error || (value.ret !== undefined && Number(value.ret) !== 0)) throw new Error('provider');
        return value;
    } catch (_) {
        throw failure(401, 'QQ 授权校验失败，请重新打开 QQ 授权');
    } finally { clearTimeout(timer); }
}

async function verify({ accessToken, openId, clientId }) {
    const id = appId();
    if (clientId !== id || typeof accessToken !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(accessToken)
        || typeof openId !== 'string' || !/^[a-fA-F0-9]{32}$/.test(openId)) {
        throw failure(400, 'QQ 授权数据无效，请重新授权');
    }
    const identity = await qqJson('oauth2.0/me', { access_token: accessToken, fmt: 'json' });
    if (String(identity.client_id || '') !== id || typeof identity.openid !== 'string'
        || identity.openid.toUpperCase() !== openId.toUpperCase()) {
        throw failure(401, 'QQ 授权身份与移动应用不匹配');
    }
    const profile = await qqJson('user/get_user_info', {
        access_token: accessToken, oauth_consumer_key: id, openid: identity.openid, fmt: 'json'
    });
    if (Number(profile.ret) !== 0) throw failure(401, 'QQ 用户资料校验失败');
    let avatar = '';
    try {
        const url = new URL(profile.figureurl_qq_2 || profile.figureurl_qq_1 || '');
        if (url.protocol === 'https:' && !url.username && !url.password && /(^|\.)(qlogo|qpic)\.cn$/.test(url.hostname)) avatar = url.toString();
    } catch (_) {}
    return {
        provider: 'qq', providerUserId: `mobile:${id}:${openId.toUpperCase()}`,
        // Website and mobile OpenIDs are app-specific. Never merge accounts by
        // nickname, avatar, unverified email, or a client-provided union ID.
        email: '', unionId: '', nickname: String(profile.nickname || 'QQ 用户').slice(0, 64), avatar,
        raw: { appId: id, platform: 'android' }
    };
}

module.exports = { appId, verify };
