const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const githubOAuth = require('../services/github-oauth');
const authRepository = require('../repositories/auth-repository');
const authState = require('../services/auth-state');
const oauthBrowser = require('../services/oauth-browser');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { normalizeEmail, isEmail, isOAuthPlaceholderEmail, publicEmail } = require('../validators');

module.exports = function registerGitHubOAuth(router, helpers) {
    const { httpError, siteUrl, safeRedirectPath, compactOAuthProfile, oauthAccountFromProfile,
        pendingOAuthResponse, createUserFromOAuthProfile, validatedNewPassword,
        setUserLoginSession, userResponse, isUserMissingPublicEmail } = helpers;

    function fail(res, code, action = 'login', redirectUri = config.oauth.github.redirectUri) {
        const url = new URL(action === 'bind' ? '/user-center' : '/login', redirectUri);
        url.searchParams.set('oauth_error', `github_${code}`);
        return res.redirect(url.toString());
    }
    function handleError(res, error) {
        const status = error.status || (/UNIQUE constraint failed/.test(error.message || '') ? 409 : 500);
        // Upstream payloads and credentials must never reach a response or log.
        res.status(status).json({ success: false, message: status === 500 ? 'GitHub 登录处理失败，请重试' :
            (error.status ? error.message : '该 GitHub 或邮箱已绑定其他账号') });
    }
    function ensureLinkable(profile, user) {
        if (!user || user.role === 'banned') throw httpError(403, '账号不可用');
        if (isUserMissingPublicEmail(user)) throw httpError(400, '请先为当前账号绑定邮箱');
        const owner = authRepository.findUserByOAuthAccount('github', profile.providerUserId);
        if (owner && owner.id !== user.id) throw httpError(409, '该 GitHub 已绑定其他账号');
        const other = authRepository.listOAuthAccountsByUser(user.id).find(row => row.provider === 'github' && row.provider_user_id !== profile.providerUserId);
        if (other) throw httpError(409, '当前账号已绑定其他 GitHub，请先解绑');
    }

    router.get('/oauth/github/start', optionalAuth, async (req, res) => {
        const action = req.query.action === 'bind' ? 'bind' : 'login';
        const redirectUri = githubOAuth.redirectUris().find(uri => new URL(uri).origin === String(req.query.site || '')) || config.oauth.github.redirectUri;
        try {
            if (action === 'bind' && !req.user?.id) return fail(res, 'login_required', 'login', redirectUri);
            const state = crypto.randomBytes(24).toString('hex');
            const codeVerifier = crypto.randomBytes(32).toString('base64url');
            const authorizationUrl = githubOAuth.authorizationUrl({ state, codeVerifier, redirectUri });
            const browserBinding = oauthBrowser.begin(res);
            await authState.createOAuthState({ state, provider: 'github', browserBinding,
                userId: req.user?.id || '', action, codeVerifier, redirectUri,
                redirectPath: action === 'bind' ? '/user-center' : safeRedirectPath(req.query.redirect) });
            res.redirect(authorizationUrl);
        } catch (error) {
            return fail(res, error.code === 'GITHUB_OAUTH_NOT_CONFIGURED' ? 'not_configured' : 'start_failed', action, redirectUri);
        }
    });

    router.get('/oauth/github/callback', optionalAuth, async (req, res) => {
        let action = 'login';
        let redirectUri = config.oauth.github.redirectUri;
        try {
            const state = String(req.query.state || '').trim();
            const payload = state && await authState.consumeOAuthState(state, 'github', oauthBrowser.readBinding(req), req.user?.id || '');
            if (!payload) return fail(res, 'invalid_state');
            action = payload.action;
            redirectUri = payload.redirectUri || redirectUri;
            if (req.query.error) return fail(res, 'denied', action, redirectUri);
            const code = String(req.query.code || '').trim();
            if (!code) return fail(res, 'missing_code', action, redirectUri);
            const profile = compactOAuthProfile(await githubOAuth.getProfileFromCode(code, payload.codeVerifier, redirectUri));
            const linkedUser = authRepository.findUserByOAuthAccount('github', profile.providerUserId);
            if (action === 'bind') {
                const user = authRepository.findUserById(payload.userId);
                ensureLinkable(profile, user);
                const updated = authRepository.linkOAuthAccount(oauthAccountFromProfile(profile, user.id));
                setUserLoginSession(req, res, updated);
                const url = new URL('/user-center', redirectUri);
                url.searchParams.set('oauth_linked', 'github');
                return res.redirect(url.toString());
            }
            if (linkedUser && !isUserMissingPublicEmail(linkedUser)) {
                setUserLoginSession(req, res, linkedUser);
                return res.redirect(new URL(safeRedirectPath(payload.redirectPath), redirectUri).toString());
            }
            if (linkedUser?.role === 'banned') return fail(res, 'account_unavailable');
            const ticket = crypto.randomBytes(24).toString('hex');
            await authState.createOAuthPending({ ticket, provider: 'github', profile,
                browserBinding: payload.browserBinding, redirectPath: payload.redirectPath,
                mode: 'bind_email', linkedUserId: linkedUser?.id || '' });
            const url = new URL('/login', redirectUri);
            url.search = new URLSearchParams({ oauth: 'github', ticket, mode: 'email' }).toString();
            return res.redirect(url.toString());
        } catch (error) {
            return fail(res, error.status === 409 ? 'already_bound' : error.status === 403 ? 'account_unavailable' : 'callback_failed', action, redirectUri);
        }
    });

    router.get('/oauth/github/pending', async (req, res) => {
        try {
            const pending = await authState.getOAuthPending(String(req.query.ticket || ''), 'github', oauthBrowser.readBinding(req));
            if (!pending) throw httpError(404, 'GitHub 登录状态已过期，请重新授权');
            res.json({ success: true, data: { ...pendingOAuthResponse(pending.profile, pending), requiresEmailBinding: true } });
        } catch (error) { handleError(res, error); }
    });

    router.post('/oauth/github/email', async (req, res) => {
        try {
            const ticket = String(req.body.ticket || '').trim();
            const binding = oauthBrowser.readBinding(req);
            const pending = await authState.getOAuthPending(ticket, 'github', binding);
            if (!pending) throw httpError(404, 'GitHub 登录状态已过期，请重新授权');
            const email = normalizeEmail(req.body.email);
            if (!isEmail(email) || isOAuthPlaceholderEmail(email)) throw httpError(400, '请输入有效的真实邮箱');
            const emailCode = String(req.body.emailCode || '').trim();
            if (!emailCode) throw httpError(400, '请输入邮箱验证码');
            const profile = compactOAuthProfile(pending.profile);
            const owner = authRepository.findUserByOAuthAccount('github', profile.providerUserId);
            const existingUser = authRepository.findUserByEmail(email);
            if (owner && existingUser && owner.id !== existingUser.id) throw httpError(409, '该 GitHub 已绑定其他账号');
            if (owner && !isUserMissingPublicEmail(owner) && publicEmail(owner.email) !== email) throw httpError(409, '该 GitHub 已绑定其他邮箱账号');
            const target = existingUser || owner;
            if (target?.role === 'banned') throw httpError(403, '账号已停用');
            if (existingUser) ensureLinkable(profile, existingUser);
            // A password is needed only for a new account. Linking never resets an existing password.
            const newPassword = target ? '' : validatedNewPassword(req.body.newPassword);
            if (!(await authState.consumeVerificationCode(email, 'oauth_bind', emailCode))) throw httpError(400, '验证码无效或已过期');
            if (!(await authState.consumeOAuthPending(ticket, 'github', binding))) throw httpError(409, '登录请求已处理，请重新授权');
            let user;
            if (existingUser) user = authRepository.linkOAuthAccount(oauthAccountFromProfile(profile, existingUser.id));
            else if (owner) user = authRepository.updateUserEmailWithOAuthAccount({ userId: owner.id, email,
                account: oauthAccountFromProfile(profile, owner.id) });
            else user = createUserFromOAuthProfile({ ...profile, email }, req.body.username, newPassword);
            const sessionUser = setUserLoginSession(req, res, user);
            res.status(target ? 200 : 201).json({ success: true,
                message: existingUser ? 'GitHub 已绑定到已有邮箱账号' : '邮箱已绑定，GitHub 登录成功',
                data: { user: sessionUser, redirect: safeRedirectPath(pending.redirectPath) } });
        } catch (error) { handleError(res, error); }
    });

    router.post('/oauth/github/unlink', authenticateToken, (req, res) => {
        try {
            const user = authRepository.findUserById(req.user.id);
            if (!user) throw httpError(404, '账号不存在');
            if (isUserMissingPublicEmail(user)) throw httpError(400, '请先绑定邮箱以保留登录方式');
            if (!req.body.currentPassword || !bcrypt.compareSync(String(req.body.currentPassword), user.password_hash)) throw httpError(400, '当前密码错误');
            if (!authRepository.deleteOAuthAccountForUser(user.id, 'github')) throw httpError(404, '当前账号未绑定 GitHub');
            res.json({ success: true, message: 'GitHub 已解绑', data: { user: userResponse(user) } });
        } catch (error) { handleError(res, error); }
    });
};
