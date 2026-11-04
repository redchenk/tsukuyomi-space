const express = require('express');
const http = require('node:http');
const config = require('../config');
const { requireSuperAdmin, USER_SESSION_COOKIE } = require('../middleware/auth');
const speech = require('../services/official-tts-settings');
const tts = require('../services/official-tts');

const router = express.Router();
router.use(requireSuperAdmin);
const fail = (status, message) => Object.assign(new Error(message), { status });
const handle = fn => async (req, res) => {
    try { res.json({ success: true, data: await fn(req) }); }
    catch (error) {
        const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
        res.status(status).json({ success: false, message: status === 500 ? '暂时无法读取或保存官方服务配置' : error.message });
    }
};
router.get('/tts', handle(() => speech.view()));
router.put('/tts', handle(req => speech.save(req.body)));
router.get('/tts/status', handle(async () => {
    const [primary, fish] = await Promise.all([tts.status(), tts.status('fish-audio')]);
    return { primary, fish };
}));

// The plugin owns its encrypted keys, operator ACL, prices and ledger. Only
// forward a single site session, never a Terminal token or a caller-selected URL.
function gateway(cookie, route, { account, body } = {}) {
    const origin = new URL(config.publicSiteUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const request = http.request({
            hostname: '127.0.0.1', port: Number(process.env.OFFICIAL_LLM_LOOPBACK_PORT || 8799),
            path: '/official-api/api/' + route, method: payload === null ? 'GET' : 'POST', signal: AbortSignal.timeout(12000),
            headers: { Host: origin.host, Origin: origin.origin, Cookie: cookie, Accept: 'application/json',
                ...(account ? { 'X-Official-Expected-Account': account } : {}),
                ...(payload === null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }) }
        }, response => {
            let bytes = 0; const chunks = [];
            response.on('error', () => reject(fail(502, '站内 LLM 服务暂不可用')));
            response.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > 1024 * 1024) { response.destroy(); reject(fail(502, '站内 LLM 响应过大')); }
                else chunks.push(chunk);
            });
            response.on('end', () => {
                try {
                    const result = JSON.parse(Buffer.concat(chunks).toString());
                    if (response.statusCode !== 200) throw fail(response.statusCode >= 400 && response.statusCode < 500 ? response.statusCode : 502,
                        result?.error?.message || '站内 LLM 服务暂不可用');
                    resolve(result);
                } catch (error) { reject(error.status ? error : fail(502, '站内 LLM 服务响应无效')); }
            });
        });
        request.on('error', () => reject(fail(502, '站内 LLM 服务暂不可用')));
        request.end(payload);
    });
}
async function llm(req, route) {
    const cookies = (req.headers.cookie || '').split(';').map(part => part.trim())
        .filter(part => part.startsWith(USER_SESSION_COOKIE + '='));
    if (cookies.length !== 1 || !/^tsukuyomi_session=[A-Za-z0-9_.-]{1,8192}$/.test(cookies[0])) throw fail(401, '请重新登录 Terminal，以关联站内账号');
    const me = await gateway(cookies[0], 'me');
    if (!me.account_id || !req.user.siteUserId || me.site_user_id !== req.user.siteUserId) throw fail(409, '站内账号已切换，请重新登录 Terminal');
    if (!me.operator) throw fail(403, '此超级管理员的站内账号尚未加入 LLM 服务维护者名单');
    if (route === 'me') return { account: me.account_id };
    if (req.get('X-Official-Expected-Account') !== me.account_id) throw fail(409, '站内账号已切换，请重新登录 Terminal');
    return gateway(cookies[0], 'admin/' + route, { account: me.account_id, body: req.method === 'POST' ? req.body : undefined });
}
for (const route of ['me', 'settings', 'reconciliation']) router.get('/llm/' + route, handle(req => llm(req, route)));
for (const route of ['settings', 'reconcile']) router.post('/llm/' + route, handle(req => llm(req, route)));
module.exports = router;
