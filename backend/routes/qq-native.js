const crypto = require('crypto');
const { optionalAuth } = require('../middleware/auth');
const authState = require('../services/auth-state');
const binding = require('../services/oauth-browser');
const qq = require('../services/qq-native');
const repository = require('../repositories/auth-repository');

module.exports = (router, { safeRedirectPath, setUserLoginSession, oauthAccountFromProfile, isUserMissingPublicEmail }) => {
    function fail(res, error) {
        const status = [400, 401, 403, 409, 503].includes(error.status) ? error.status : 503;
        return res.status(status).json({ success: false, message: status === 503 ? 'QQ 登录服务暂不可用，请稍后重试' : error.message });
    }
    router.post('/oauth/qq/native/start', optionalAuth, async (req, res) => {
        try {
            const appId = qq.appId();
            const action = req.body?.action === 'bind' || req.user?.id ? 'bind' : 'login';
            if (action === 'bind' && !req.user?.id) return res.status(401).json({ success: false, message: '请先登录当前账号' });
            const state = crypto.randomBytes(24).toString('hex');
            await authState.createOAuthState({ state, provider: 'qq_native', browserBinding: binding.begin(res),
                userId: req.user?.id || '', action, redirectPath: safeRedirectPath(req.body?.redirect), redirectUri: appId });
            return res.json({ success: true, data: { appId, state } });
        } catch (error) { return fail(res, error); }
    });
    router.post('/oauth/qq/native/complete', optionalAuth, async (req, res) => {
        try {
            const flow = await authState.consumeOAuthState(String(req.body?.state || ''), 'qq_native', binding.readBinding(req), req.user?.id || '');
            if (!flow || flow.redirectUri !== qq.appId()) return res.status(401).json({ success: false, message: 'QQ 登录状态已过期，请重新授权' });
            const profile = await qq.verify(req.body || {});
            let user;
            if (flow.action === 'bind') {
                user = repository.findUserById(flow.userId);
                if (!user || user.role === 'banned') return res.status(403).json({ success: false, message: '当前账号不可用' });
                user = repository.linkOAuthAccount(oauthAccountFromProfile(profile, user.id));
            } else {
                user = repository.findUserByOAuthAccount('qq', profile.providerUserId);
            }
            if (user?.role === 'banned') return res.status(403).json({ success: false, message: '账号已停用' });
            if (user && !isUserMissingPublicEmail(user)) {
                const sessionUser = setUserLoginSession(req, res, user);
                return res.json({ success: true, data: { user: sessionUser, redirect: flow.redirectPath } });
            }
            const ticket = crypto.randomBytes(24).toString('hex');
            await authState.createOAuthPending({ ticket, provider: 'qq', profile, browserBinding: flow.browserBinding,
                redirectPath: flow.redirectPath, mode: 'bind_email', linkedUserId: user?.id || '' });
            return res.json({ success: true, data: { ticket, redirect: flow.redirectPath } });
        } catch (error) { return fail(res, error); }
    });
};
