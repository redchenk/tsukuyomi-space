const express = require('express');
const config = require('../config');
const oauth = require('../services/partner-oauth');
const { optionalAuth, readAuthToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const style = `:root{color-scheme:light dark;font:16px/1.65 system-ui,-apple-system,sans-serif;color:#302c40;background:#f7f3f7}*{box-sizing:border-box}body{margin:0;padding:clamp(16px,5vw,60px);min-height:100vh;display:grid;place-items:center}main{width:100%;max-width:580px;background:#fff;border:1px solid #e4dce7;border-radius:24px;padding:clamp(24px,5vw,42px);box-shadow:0 16px 70px #58406512}header{font-size:.85rem;color:#796575;letter-spacing:.08em}h1{font-size:1.65rem;line-height:1.4;margin:14px 0}h2{font-size:1.05rem}p{overflow-wrap:anywhere}.muted{color:#6c6577}.scope{padding:16px 22px;background:#f7f3fa;border-radius:14px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}button,.button{min-height:46px;border:1px solid #d7cddd;border-radius:12px;padding:10px 20px;font:inherit;cursor:pointer;text-decoration:none;display:inline-block;color:inherit;background:#fff}button.primary,.button.primary{background:#705475;color:#fff;border-color:#705475}a{color:#705475}a:focus-visible,button:focus-visible{outline:3px solid #b88dbf;outline-offset:3px}.connection{border-top:1px solid #e4dce7;padding:18px 0}.error{padding:12px 16px;border-radius:12px;background:#fff1f1;color:#873b45}footer{margin-top:28px;font-size:.85rem}@media(prefers-color-scheme:dark){:root{color:#e8e0ed;background:#17141d}main{background:#231e2a;border-color:#493d50}.muted,header{color:#bdb0c6}.scope{background:#302738}button,.button{background:#302738;border-color:#65526e}a{color:#d8afd9}.connection{border-color:#493d50}.error{background:#492c36;color:#ffd3db}}`;
function page(res, title, body, status = 200) {
    return res.status(status).type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · 月读空间</title><style>${style}</style></head><body><main><header>月读空间 · 账号授权</header><h1>${escape(title)}</h1>${body}<footer><a href="/user-center">返回用户中心</a></footer></main></body></html>`);
}
function sensitive(req, res, next) {
    res.set({ 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'Surrogate-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
    if (config.isProduction && req.get('host') !== new URL(oauth.issuer()).host) {
        return res.status(400).json({ error: 'invalid_request' });
    }
    next();
}
function fields(input) {
    const result = Object.create(null);
    for (const [key, value] of new URLSearchParams(input)) {
        if (Object.hasOwn(result, key)) oauth.fail('invalid_request');
        result[key] = value;
    }
    return result;
}
function query(req) {
    if (req.originalUrl.length > 8192) oauth.fail('invalid_request');
    return fields(new URL(req.originalUrl, oauth.issuer()).search);
}
const messages = {
    invalid_client: '这个应用尚未开通，或回调地址与登记信息不一致。请联系第八千代开发者。',
    invalid_request: '授权请求已过期或无效，请回到应用重新发起。',
    invalid_scope: '该应用申请了未开放的权限。',
    unsupported_response_type: '该应用使用了不支持的授权方式。',
    access_denied: '请先登录可用的月读账号，再重新发起授权。'
};
function htmlError(error, req, res, next) {
    const code = error.oauthError || (error.type ? 'invalid_request' : 'temporarily_unavailable');
    return page(res, '暂时无法授权', `<p role="alert" class="error">${escape(messages[code] || '服务暂时不可用，请稍后重试。')}</p>`, error.oauthError ? error.status : (error.type ? 400 : 503));
}
function apiError(error, req, res, next) {
    const code = error.oauthError || (error.type ? 'invalid_request' : 'temporarily_unavailable');
    const status = error.oauthError ? error.status : (error.type ? 400 : 503);
    if (code === 'invalid_client') res.set('WWW-Authenticate', 'Basic realm="partner-oauth"');
    if (code === 'invalid_token') res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    return res.status(status).json({ error: code });
}
function form(req, res, next) {
    if (!req.is('application/x-www-form-urlencoded') || typeof req.body !== 'string') return next(Object.assign(new Error(), { oauthError: 'invalid_request', status: 400 }));
    try { req.oauthFields = fields(req.body); next(); } catch (error) { next(error); }
}
function login(res, returnTo) {
    return page(res, '登录月读账号', `<p>登录后，你可以查看应用信息并选择是否授权。</p><div class="actions"><a class="button primary" href="/login?redirect=${escape(encodeURIComponent(returnTo))}">前往登录</a></div>`);
}
function trustedForm(req, res, next) {
    const origin = req.get('origin');
    const localOrigin = !config.isProduction ? `${req.protocol}://${req.get('host')}` : '';
    // no-referrer makes native POST navigations serialize Origin as "null".
    // Accept that only with browser-provided same-origin Fetch Metadata; the
    // one-use ticket still binds this action to the exact logged-in session.
    const sameOrigin = origin === oauth.issuer() || (localOrigin && origin === localOrigin)
        || (origin === 'null' && req.get('sec-fetch-site') === 'same-origin');
    if (!sameOrigin || req.get('sec-fetch-site') === 'cross-site'
        || !req.user || req.user.scope || req.get('authorization')) return next(Object.assign(new Error(), { oauthError: 'access_denied', status: 403 }));
    next();
}
function createRouters() {
    const browser = express.Router();
    browser.use(sensitive);
    browser.use(createRateLimiter({ windowMs: 600000, max: 120, keyPrefix: 'partner-browser',
        onLimit: (req, res) => page(res, '操作过于频繁', '<p role="alert">请稍后重新发起授权。</p>', 429) }));
    browser.use((req, res, next) => req.get('authorization') ? res.status(400).end() : next());
    browser.use(optionalAuth);
    browser.use(express.text({ type: 'application/x-www-form-urlencoded', limit: '8kb' }));
    browser.get('/authorize', (req, res) => {
        const params = query(req);
        const request = oauth.validateAuthorization(params);
        if (!req.user) return login(res, '/oauth/authorize?' + new URLSearchParams(params));
        // Browsers also apply form-action to the final 303 destination.
        res.set('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self' ${new URL(request.redirect_uri).origin}; frame-ancestors 'none'`);
        const ticket = oauth.createRequest(req.user.id, readAuthToken(req), 'authorize', request);
        return page(res, `授权给${request.name}`, `<p>当前月读账号：<strong>${escape(req.user.nickname)}</strong></p><p>允许 <strong>${escape(request.name)}</strong> 读取以下资料，用于识别和展示你的账号：</p><ul class="scope"><li>稳定用户标识</li><li>昵称</li><li>头像</li></ul><p class="muted">授权后将返回 ${escape(new URL(request.redirect_uri).hostname)}。你可以随时在用户中心撤销授权。</p><form method="post" action="/oauth/authorize"><input type="hidden" name="ticket" value="${escape(ticket)}"><div class="actions"><button class="primary" name="approve" value="yes" type="submit">同意并继续</button><button name="approve" value="no" type="submit">取消授权</button></div></form>`);
    });
    browser.post('/authorize', trustedForm, form, (req, res) => {
        oauth.strings(req.oauthFields, ['ticket', 'approve']);
        const redirect = oauth.decide({ ...req.oauthFields, userId: req.user.id, session: readAuthToken(req) });
        res.redirect(303, redirect);
    });
    browser.get('/connections', (req, res) => {
        if (!req.user) return login(res, '/oauth/connections');
        const list = oauth.connections(req.user.id);
        const content = list.map(item => {
            const ticket = oauth.createRequest(req.user.id, readAuthToken(req), 'revoke', { sub: item.sub });
            return `<section class="connection"><h2>${escape(item.name)}</h2><p class="muted">已授权：稳定标识、昵称、头像${item.enabled ? '' : ' · 应用已停用'}</p><form method="post" action="/oauth/connections"><input type="hidden" name="ticket" value="${escape(ticket)}"><button type="submit">撤销${escape(item.name)}授权</button></form></section>`;
        }).join('');
        return page(res, '已授权应用', `<p class="muted">撤销后，应用不能再用原令牌读取你的资料。应用自己的登录状态由对方管理。</p>${content || '<p>你还没有授权任何合作应用。</p>'}`);
    });
    browser.post('/connections', trustedForm, form, (req, res) => {
        oauth.strings(req.oauthFields, ['ticket']);
        oauth.revokeConnection(req.oauthFields.ticket, req.user.id, readAuthToken(req));
        res.redirect(303, '/oauth/connections');
    });
    browser.use((req, res) => page(res, '页面不存在', '<p>请从应用重新发起授权。</p>', 404));
    browser.use(htmlError);

    const api = express.Router();
    api.use(sensitive);
    api.use(createRateLimiter({ windowMs: 60000, max: 120, keyPrefix: 'partner-api',
        onLimit: (req, res) => res.status(429).json({ error: 'rate_limited' }) }));
    // These are back-channel endpoints: no browser cookies, CORS or site JWTs.
    api.use((req, res, next) => {
        if (req.get('origin') || req.get('cookie') || req.get('sec-fetch-site')) return res.status(403).json({ error: 'invalid_request' });
        if (Object.keys(query(req)).length) oauth.fail('invalid_request');
        next();
    });
    api.use(express.text({ type: 'application/x-www-form-urlencoded', limit: '8kb' }));
    api.post('/token', form, (req, res) => res.json(oauth.exchange(oauth.basic(req.get('authorization')), req.oauthFields)));
    api.get('/userinfo', (req, res) => {
        if (Object.keys(query(req)).length) oauth.fail('invalid_request');
        const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('authorization') || '');
        res.json(oauth.userinfo(match?.[1]));
    });
    api.post('/revoke', form, (req, res) => {
        oauth.revokeToken(oauth.basic(req.get('authorization')), req.oauthFields);
        res.status(200).end();
    });
    api.use((req, res) => res.status(405).json({ error: 'invalid_request' }));
    api.use(apiError);
    return { browser, api };
}
module.exports = { createRouters };
