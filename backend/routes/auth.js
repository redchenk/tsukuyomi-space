const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const {
    authenticateToken,
    optionalAuth,
    generateToken,
    readAuthTokens,
    setAuthCookie,
    clearAuthCookie,
    clearAllAuthCookies,
    USER_SESSION_COOKIE,
    ADMIN_SESSION_COOKIE
} = require('../middleware/auth');
const authRepository = require('../repositories/auth-repository');
const adminRepository = require('../repositories/admin-repository');
const authState = require('../services/auth-state');
const qqOAuth = require('../services/qq-oauth');
const { EMAIL_CODE_TTL_MS, EMAIL_CODE_COOLDOWN_MS, sendVerificationEmail } = require('../services/mailer');
const { normalizeEmail, isEmail, isOAuthPlaceholderEmail, publicEmail } = require('../validators');

const router = express.Router();

function issueTokenForUser(user) {
    return generateToken({ id: user.id, username: user.username, role: user.role }, '7d');
}

function publicOAuthAccounts(userId) {
    return authRepository.listOAuthAccountsByUser(userId).map(account => ({
        provider: account.provider,
        provider_email: publicEmail(account.provider_email),
        nickname: account.nickname || '',
        avatar: account.avatar || '',
        created_at: account.created_at,
        updated_at: account.updated_at
    }));
}

function userResponse(user) {
    const email = publicEmail(user.email);
    return {
        id: user.id,
        username: user.username,
        email,
        has_real_email: Boolean(email),
        role: user.role,
        avatar: user.avatar || '',
        created_at: user.created_at,
        oauth_accounts: publicOAuthAccounts(user.id)
    };
}

function setUserLoginSession(req, res, user) {
    if (user?.role === 'banned') throw httpError(403, '账号已停用');
    const token = issueTokenForUser(user);
    clearAuthCookie(req, res, ADMIN_SESSION_COOKIE, 'strict');
    setAuthCookie(req, res, USER_SESSION_COOKIE, token, { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    return userResponse(user);
}

function safeRedirectPath(value) {
    const path = String(value || '').trim() || '/hub';
    if (!path.startsWith('/') || path.startsWith('//') || /[\r\n\\]/.test(path)) return '/hub';
    return path;
}

function siteUrl(path, params = {}) {
    const url = new URL(path, config.publicSiteUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });
    return url.toString();
}

function oauthDisplayForRequest(req) {
    const userAgent = String(req.get('user-agent') || '');
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent) ? 'mobile' : 'pc';
}

function redirectToOAuthError(res, code) {
    return res.redirect(siteUrl('/login', { oauth_error: code }));
}

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function validatedNewPassword(value) {
    const password = String(value || '');
    if (password.length < 8) throw httpError(400, '新密码至少 8 位');
    if (password.length > 128) throw httpError(400, '新密码不能超过 128 位');
    return password;
}

function loginIdentity(value) {
    return normalizeEmail(value) || String(value || '').trim().toLowerCase();
}

async function verifyUserLogin({ username, password, emailCode, loginMethod }) {
    if (!username) {
        throw httpError(400, '请输入用户名或邮箱');
    }

    const identity = loginIdentity(username);
    const failures = await authState.loginFailureState(identity);
    if (failures >= config.loginFailureMax) {
        throw httpError(429, '登录失败次数过多，请稍后再试');
    }

    const user = authRepository.findUserByUsernameOrEmail(username);
    if (!user) {
        await authState.recordLoginFailure(identity);
        throw httpError(401, '用户名或密码错误');
    }

    if (loginMethod === 'code') {
        if (!emailCode) {
            throw httpError(400, '请填写邮箱验证码');
        }
        if (!(await authState.consumeVerificationCode(normalizeEmail(user.email), 'login', emailCode))) {
            await authState.recordLoginFailure(identity);
            throw httpError(401, '验证码无效或已过期');
        }
    } else {
        if (!password) {
            throw httpError(400, '请输入密码');
        }
        if (!bcrypt.compareSync(password, user.password_hash)) {
            await authState.recordLoginFailure(identity);
            throw httpError(401, '用户名或密码错误');
        }
    }

    if (user.role === 'banned') {
        throw httpError(403, '账号已停用');
    }

    await authState.clearLoginFailures(identity);
    return user;
}

function compactOAuthProfile(profile) {
    return {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        unionId: profile.unionId || '',
        email: normalizeEmail(profile.email || ''),
        nickname: String(profile.nickname || '').trim() || 'QQ 用户',
        avatar: profile.avatar || '',
        raw: profile.raw || {}
    };
}

function oauthAccountFromProfile(profile, userId) {
    return {
        id: crypto.randomUUID(),
        userId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        unionId: profile.unionId,
        providerEmail: profile.email,
        nickname: profile.nickname,
        avatar: profile.avatar,
        profile
    };
}

function usernameBase(value) {
    const base = String(value || '')
        .trim()
        .replace(/[\s@/\\]+/g, '_')
        .replace(/[^\p{L}\p{N}_-]/gu, '')
        .slice(0, 24);
    return base || 'qq_user';
}

function uniqueUsername(preferred, providerUserId) {
    const hash = crypto.createHash('sha256').update(String(providerUserId)).digest('hex').slice(0, 6);
    const base = usernameBase(preferred);
    const candidates = [
        base,
        `${base}_${hash}`,
        `qq_${hash}`
    ];

    for (const candidate of candidates) {
        if (!authRepository.isUsernameTaken(candidate)) return candidate;
    }

    for (let index = 2; index < 1000; index += 1) {
        const candidate = `${base.slice(0, 18)}_${hash}_${index}`;
        if (!authRepository.isUsernameTaken(candidate)) return candidate;
    }

    return `qq_${crypto.randomUUID().slice(0, 8)}`;
}

function oauthPlaceholderEmail(provider, providerUserId) {
    const hash = crypto.createHash('sha256').update(`${provider}:${providerUserId}`).digest('hex').slice(0, 24);
    return `${provider}_${hash}@oauth.yachiyo.local`;
}

function createUserFromOAuthProfile(profile, preferredUsername = '', initialPassword = '') {
    const userId = crypto.randomUUID();
    const username = uniqueUsername(preferredUsername || profile.nickname, profile.providerUserId);
    const email = profile.email && !authRepository.findUserByEmail(profile.email)
        ? profile.email
        : oauthPlaceholderEmail(profile.provider, profile.providerUserId);
    const password = String(initialPassword || '') || crypto.randomBytes(32).toString('hex');
    const passwordHash = bcrypt.hashSync(password, 10);

    return authRepository.createUserWithOAuthAccount({
        user: {
            id: userId,
            username,
            email,
            passwordHash,
            avatar: profile.avatar
        },
        account: oauthAccountFromProfile(profile, userId)
    });
}

function pendingOAuthResponse(profile, pending = {}) {
    const email = publicEmail(profile.email);
    const requiresEmailBinding = pending.mode === 'bind_email' || !email;
    return {
        provider: profile.provider,
        nickname: profile.nickname,
        avatar: profile.avatar,
        email,
        requiresEmailBinding,
        hasEmailMatch: Boolean(email && authRepository.findUserByEmail(email)),
        suggestedUsername: uniqueUsername(profile.nickname, profile.providerUserId)
    };
}

function oauthPendingLoginUrl(ticket, mode = 'email') {
    return siteUrl('/login', { oauth: 'qq', ticket, mode });
}

function oauthProfileWithEmail(profile, email) {
    return {
        ...profile,
        email: normalizeEmail(email || '')
    };
}

function isUserMissingPublicEmail(user) {
    return !publicEmail(user?.email) || isOAuthPlaceholderEmail(user?.email);
}

router.post('/email-code', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const requestedPurpose = String(req.body.purpose || '').trim();
        const purpose = ['login', 'register', 'oauth_bind', 'password_reset'].includes(requestedPurpose) ? requestedPurpose : 'register';

        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }
        if (isOAuthPlaceholderEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入真实邮箱' });
        }

        const existingUser = authRepository.findUserByEmail(email);
        if (purpose === 'register' && existingUser) {
            return res.status(400).json({ success: false, message: '该邮箱已注册' });
        }
        if (purpose === 'login' && !existingUser) {
            return res.status(404).json({ success: false, message: '该邮箱尚未注册' });
        }
        if (purpose === 'password_reset' && !existingUser) {
            return res.json({ success: true, message: '如果该邮箱已注册，验证码将发送到邮箱' });
        }

        const wait = await authState.verificationCooldownTtl(email, purpose);
        if (wait > 0) {
            return res.status(429).json({ success: false, message: `请 ${wait} 秒后再发送验证码` });
        }

        const code = crypto.randomInt(100000, 999999).toString();
        await authState.createVerificationCode({
            email,
            code,
            purpose,
            ttlMs: EMAIL_CODE_TTL_MS,
            cooldownMs: EMAIL_CODE_COOLDOWN_MS
        });

        await sendVerificationEmail(email, code, purpose);
        res.json({ success: true, message: '验证码已发送' });
    } catch (error) {
        console.error('Send email code failed:', error);
        if (error.message === 'SMTP credentials are not configured') {
            return res.status(503).json({ success: false, message: '邮件服务未配置，请先设置 SMTP_USER 和 SMTP_PASS' });
        }
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/register', async (req, res) => {
    try {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        const emailCode = String(req.body?.emailCode || '').trim();
        const email = normalizeEmail(req.body.email);

        if (!username || !email || !password || !emailCode) {
            return res.status(400).json({ success: false, message: '请完整填写注册信息和验证码' });
        }
        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }
        if (username.length > 32 || /[\u0000-\u001f\u007f<>/\\]/.test(username)) {
            return res.status(400).json({ success: false, message: '用户名格式无效' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, message: '密码至少需要 8 位' });
        }

        const existingUser = authRepository.findUserByUsernameOrEmailPair(username, email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: '用户名或邮箱已被注册' });
        }
        if (!(await authState.consumeVerificationCode(email, 'register', emailCode))) {
            return res.status(400).json({ success: false, message: '验证码无效或已过期' });
        }

        const userId = crypto.randomUUID();
        authRepository.createUser({ id: userId, username, email, passwordHash: bcrypt.hashSync(password, 10) });

        const token = generateToken({ id: userId, username, role: 'user' }, '7d');
        clearAuthCookie(req, res, ADMIN_SESSION_COOKIE, 'strict');
        setAuthCookie(req, res, USER_SESSION_COOKIE, token, { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
        res.status(201).json({
            success: true,
            message: '注册成功',
            data: {
                user: { id: userId, username, email, role: 'user' }
            }
        });
    } catch (error) {
        console.error('Register failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password, emailCode } = req.body;
        const loginMethod = req.body.loginMethod === 'code' ? 'code' : 'password';
        const user = await verifyUserLogin({ username, password, emailCode, loginMethod });
        const sessionUser = setUserLoginSession(req, res, user);
        res.json({
            success: true,
            message: '登录成功',
            data: { user: sessionUser }
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        console.error('Login failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/password/reset', async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const emailCode = String(req.body?.emailCode || '').trim();
        const newPassword = validatedNewPassword(req.body?.newPassword);
        if (!isEmail(email) || isOAuthPlaceholderEmail(email) || !emailCode) {
            return res.status(400).json({ success: false, message: '邮箱或验证码无效' });
        }

        const user = authRepository.findUserByEmail(email);
        if (!user || user.role === 'banned') {
            return res.status(400).json({ success: false, message: '邮箱或验证码无效' });
        }
        if (!(await authState.consumeVerificationCode(email, 'password_reset', emailCode))) {
            return res.status(400).json({ success: false, message: '验证码无效或已过期' });
        }

        const changed = adminRepository.resetUserPassword(user.id, bcrypt.hashSync(newPassword, 10));
        if (!changed) return res.status(400).json({ success: false, message: '密码重设失败' });
        await Promise.all([
            authState.clearLoginFailures(loginIdentity(user.email)),
            authState.clearLoginFailures(loginIdentity(user.username))
        ]);

        const freshUser = authRepository.findUserById(user.id);
        const sessionUser = setUserLoginSession(req, res, freshUser);
        res.json({
            success: true,
            message: '密码已重设',
            data: { user: sessionUser, redirect: safeRedirectPath(req.body?.redirect || '/hub') }
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        console.error('Reset password failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.get('/oauth/qq/start', async (req, res) => {
    try {
        const state = crypto.randomBytes(24).toString('hex');
        const redirectPath = safeRedirectPath(req.query.redirect || '/hub');
        await authState.createOAuthState({ state, provider: 'qq', redirectPath });
        res.redirect(qqOAuth.authorizationUrl({ state, display: oauthDisplayForRequest(req) }));
    } catch (error) {
        console.error('Start QQ OAuth failed:', error);
        redirectToOAuthError(res, error.code === 'QQ_OAUTH_NOT_CONFIGURED' ? 'qq_not_configured' : 'qq_start_failed');
    }
});

router.get('/oauth/qq/callback', optionalAuth, async (req, res) => {
    try {
        if (req.query.error) return redirectToOAuthError(res, 'qq_denied');

        const code = String(req.query.code || '').trim();
        const state = String(req.query.state || '').trim();
        if (!state) return redirectToOAuthError(res, 'qq_invalid_state');
        if (!code) return redirectToOAuthError(res, 'qq_missing_code');

        const statePayload = await authState.consumeOAuthState(state, 'qq');
        if (!statePayload) return redirectToOAuthError(res, 'qq_invalid_state');

        const profile = compactOAuthProfile(await qqOAuth.getProfileFromCode(code));
        const linkedUser = authRepository.findUserByOAuthAccount('qq', profile.providerUserId);
        if (linkedUser) {
            if (isUserMissingPublicEmail(linkedUser)) {
                const ticket = crypto.randomBytes(24).toString('hex');
                await authState.createOAuthPending({
                    ticket,
                    provider: 'qq',
                    profile,
                    redirectPath: statePayload.redirectPath,
                    mode: 'bind_email',
                    linkedUserId: linkedUser.id
                });
                return res.redirect(oauthPendingLoginUrl(ticket));
            }
            setUserLoginSession(req, res, linkedUser);
            return res.redirect(siteUrl(safeRedirectPath(statePayload.redirectPath)));
        }

        if (req.user?.id) {
            const currentUser = authRepository.findUserById(req.user.id);
            if (currentUser) {
                const linkedCurrentUser = authRepository.linkOAuthAccount(oauthAccountFromProfile(profile, currentUser.id));
                setUserLoginSession(req, res, linkedCurrentUser || currentUser);
                return res.redirect(siteUrl(safeRedirectPath(statePayload.redirectPath)));
            }
        }

        const matchedEmailUser = profile.email ? authRepository.findUserByEmail(profile.email) : null;
        if (matchedEmailUser) {
            const ticket = crypto.randomBytes(24).toString('hex');
            await authState.createOAuthPending({
                ticket,
                provider: 'qq',
                profile,
                redirectPath: statePayload.redirectPath,
                mode: 'bind'
            });
            return res.redirect(oauthPendingLoginUrl(ticket, 'bind'));
        }

        if (!publicEmail(profile.email)) {
            const ticket = crypto.randomBytes(24).toString('hex');
            await authState.createOAuthPending({
                ticket,
                provider: 'qq',
                profile,
                redirectPath: statePayload.redirectPath,
                mode: 'bind_email'
            });
            return res.redirect(oauthPendingLoginUrl(ticket));
        }

        const createdUser = createUserFromOAuthProfile(profile);
        setUserLoginSession(req, res, createdUser);
        return res.redirect(siteUrl(safeRedirectPath(statePayload.redirectPath)));
    } catch (error) {
        console.error('QQ OAuth callback failed:', error);
        return redirectToOAuthError(res, 'qq_callback_failed');
    }
});

router.get('/oauth/qq/pending', async (req, res) => {
    try {
        const ticket = String(req.query.ticket || '').trim();
        const pending = await authState.getOAuthPending(ticket, 'qq');
        if (!pending) {
            return res.status(404).json({ success: false, message: 'QQ 登录状态已过期，请重新授权' });
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({
            success: true,
            data: pendingOAuthResponse(pending.profile, pending)
        });
    } catch (error) {
        console.error('Read QQ OAuth pending failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/oauth/qq/create', async (req, res) => {
    try {
        const ticket = String(req.body.ticket || '').trim();
        const pending = await authState.getOAuthPending(ticket, 'qq');
        if (!pending) {
            return res.status(404).json({ success: false, message: 'QQ 登录状态已过期，请重新授权' });
        }

        const profile = compactOAuthProfile(pending.profile);
        if (pending.mode === 'bind_email' || !publicEmail(profile.email)) {
            return res.status(400).json({ success: false, message: '请先绑定邮箱后再完成 QQ 登录' });
        }
        const linkedUser = authRepository.findUserByOAuthAccount('qq', profile.providerUserId);
        if (linkedUser) {
            await authState.consumeOAuthPending(ticket, 'qq');
            const sessionUser = setUserLoginSession(req, res, linkedUser);
            return res.json({ success: true, message: '登录成功', data: { user: sessionUser, redirect: safeRedirectPath(pending.redirectPath) } });
        }

        const user = createUserFromOAuthProfile(profile, req.body.username);
        await authState.consumeOAuthPending(ticket, 'qq');
        const sessionUser = setUserLoginSession(req, res, user);
        res.status(201).json({
            success: true,
            message: 'QQ 登录成功',
            data: { user: sessionUser, redirect: safeRedirectPath(pending.redirectPath) }
        });
    } catch (error) {
        if (/UNIQUE constraint failed/.test(error.message || '')) {
            return res.status(409).json({ success: false, message: '该 QQ 已绑定其他账号，或用户名已被使用' });
        }
        console.error('Create QQ OAuth account failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/oauth/qq/email', async (req, res) => {
    try {
        const ticket = String(req.body.ticket || '').trim();
        const pending = await authState.getOAuthPending(ticket, 'qq');
        if (!pending) {
            return res.status(404).json({ success: false, message: 'QQ 登录状态已过期，请重新授权' });
        }

        const email = normalizeEmail(req.body.email);
        const emailCode = String(req.body.emailCode || '').trim();
        const newPassword = validatedNewPassword(req.body.newPassword);
        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }
        if (isOAuthPlaceholderEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入真实邮箱' });
        }
        if (!emailCode) {
            return res.status(400).json({ success: false, message: '请输入邮箱验证码' });
        }
        if (!(await authState.consumeVerificationCode(email, 'oauth_bind', emailCode))) {
            return res.status(400).json({ success: false, message: '验证码无效或已过期' });
        }

        const profile = oauthProfileWithEmail(compactOAuthProfile(pending.profile), email);
        const existingEmailUser = authRepository.findUserByEmail(email);
        const linkedUser = authRepository.findUserByOAuthAccount('qq', profile.providerUserId);
        let user = null;
        let createdWithPassword = false;

        if (existingEmailUser) {
            user = authRepository.linkOAuthAccount(oauthAccountFromProfile(profile, existingEmailUser.id));
        } else if (linkedUser) {
            if (!isUserMissingPublicEmail(linkedUser) && publicEmail(linkedUser.email) !== email) {
                return res.status(409).json({ success: false, message: '该 QQ 已绑定其他邮箱账号' });
            }
            user = authRepository.updateUserEmailWithOAuthAccount({
                userId: linkedUser.id,
                email,
                account: oauthAccountFromProfile(profile, linkedUser.id)
            });
        } else {
            user = createUserFromOAuthProfile(profile, req.body.username, newPassword);
            createdWithPassword = true;
        }

        if (!createdWithPassword) {
            const passwordChanged = adminRepository.resetUserPassword(user.id, bcrypt.hashSync(newPassword, 10));
            if (!passwordChanged) {
                throw httpError(400, '密码设置失败');
            }
            user = authRepository.findUserById(user.id);
        }

        await authState.consumeOAuthPending(ticket, 'qq');
        const sessionUser = setUserLoginSession(req, res, user);
        res.status(existingEmailUser ? 200 : 201).json({
            success: true,
            message: existingEmailUser ? 'QQ 已绑定到已有邮箱账号' : '邮箱已绑定，QQ 登录成功',
            data: { user: sessionUser, redirect: safeRedirectPath(pending.redirectPath) }
        });
    } catch (error) {
        if (/UNIQUE constraint failed/.test(error.message || '')) {
            return res.status(409).json({ success: false, message: '该邮箱或 QQ 已绑定其他账号' });
        }
        console.error('Complete QQ OAuth email binding failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/oauth/qq/bind', optionalAuth, async (req, res) => {
    try {
        const ticket = String(req.body.ticket || '').trim();
        const pending = await authState.getOAuthPending(ticket, 'qq');
        if (!pending) {
            return res.status(404).json({ success: false, message: 'QQ 登录状态已过期，请重新授权' });
        }

        const profile = compactOAuthProfile(pending.profile);
        const existingOAuthUser = authRepository.findUserByOAuthAccount('qq', profile.providerUserId);
        if (existingOAuthUser) {
            await authState.consumeOAuthPending(ticket, 'qq');
            const sessionUser = setUserLoginSession(req, res, existingOAuthUser);
            return res.json({ success: true, message: '登录成功', data: { user: sessionUser, redirect: safeRedirectPath(pending.redirectPath) } });
        }

        let user = null;
        if (req.user?.id) {
            user = authRepository.findUserById(req.user.id);
        } else {
            const loginMethod = req.body.loginMethod === 'code' ? 'code' : 'password';
            user = await verifyUserLogin({
                username: req.body.username,
                password: req.body.password,
                emailCode: req.body.emailCode,
                loginMethod
            });
        }

        if (!user) {
            return res.status(401).json({ success: false, message: '请先登录或验证要绑定的邮箱账号' });
        }

        const linkedUser = authRepository.linkOAuthAccount(oauthAccountFromProfile(profile, user.id));
        await authState.consumeOAuthPending(ticket, 'qq');
        const sessionUser = setUserLoginSession(req, res, linkedUser || user);
        res.json({
            success: true,
            message: 'QQ 已绑定到当前账号',
            data: { user: sessionUser, redirect: safeRedirectPath(pending.redirectPath) }
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        if (/UNIQUE constraint failed/.test(error.message || '')) {
            return res.status(409).json({ success: false, message: '该 QQ 已绑定其他账号' });
        }
        console.error('Bind QQ OAuth account failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/oauth/qq/unlink', authenticateToken, (req, res) => {
    try {
        const currentPassword = String(req.body?.currentPassword || '');
        if (!currentPassword) {
            return res.status(400).json({ success: false, message: '请输入当前密码' });
        }

        const user = authRepository.findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: '账号不存在' });
        }
        if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
            return res.status(400).json({ success: false, message: '当前密码错误' });
        }

        const removed = authRepository.deleteOAuthAccountForUser(req.user.id, 'qq');
        if (!removed) {
            return res.status(404).json({ success: false, message: '当前账号未绑定 QQ' });
        }

        const updatedUser = authRepository.findUserById(req.user.id);
        res.json({
            success: true,
            message: 'QQ 已解绑',
            data: { user: userResponse(updatedUser) }
        });
    } catch (error) {
        console.error('Unlink QQ OAuth account failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/logout', async (req, res) => {
    const tokens = readAuthTokens(req);
    await Promise.all(tokens.map(token => authState.blacklistToken(token)));
    clearAllAuthCookies(req, res);
    res.json({ success: true, message: '已退出登录' });
});

router.get('/me', authenticateToken, (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        const user = authRepository.findCurrentUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }
        res.json({ success: true, data: userResponse(user) });
    } catch (error) {
        console.error('Get current user failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
