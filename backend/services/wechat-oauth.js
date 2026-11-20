const config = require('../config');

function isConfigured() {
    const { appId, appSecret } = config.oauth.wechat;
    return Boolean(appId && appSecret);
}

function authorizationUrl({ state, redirectUri }) {
    if (!isConfigured()) {
        throw Object.assign(new Error('微信登录暂未配置'), { code: 'WECHAT_OAUTH_NOT_CONFIGURED' });
    }
    const params = new URLSearchParams({
        appid: config.oauth.wechat.appId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'snsapi_login',
        state
    });
    return `https://open.weixin.qq.com/connect/qrconnect?${params}#wechat_redirect`;
}

async function request(path, params) {
    const url = new URL(path, 'https://api.weixin.qq.com');
    url.search = new URLSearchParams(params).toString();
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('微信授权服务连接失败');
    const data = await response.json();
    if (!data || (data.errcode !== undefined && Number(data.errcode) !== 0)) throw new Error('微信授权失败');
    return data;
}

async function getProfileFromCode(code) {
    const { appId, appSecret } = config.oauth.wechat;
    if (!isConfigured()) throw new Error('微信登录暂未配置');
    const token = await request('/sns/oauth2/access_token', {
        appid: appId, secret: appSecret, code, grant_type: 'authorization_code'
    });
    if (typeof token.access_token !== 'string' || !token.access_token ||
        typeof token.openid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(token.openid)) {
        throw new Error('微信授权响应无效');
    }
    const user = await request('/sns/userinfo', {
        access_token: token.access_token, openid: token.openid, lang: 'zh_CN'
    });
    if (user.openid !== token.openid) throw new Error('微信账号资料无效');
    // OpenIDs are scoped to one WeChat application.
    return {
        provider: 'wechat', providerUserId: `${appId}:${token.openid}`,
        nickname: String(user.nickname || '微信用户').slice(0, 64)
    };
}

module.exports = { isConfigured, authorizationUrl, getProfileFromCode };
