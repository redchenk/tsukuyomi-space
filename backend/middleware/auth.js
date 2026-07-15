const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const authState = require('../services/auth-state');
const authRepository = require('../repositories/auth-repository');
const adminRepository = require('../repositories/admin-repository');

const USER_SESSION_COOKIE = 'tsukuyomi_session';
const ADMIN_SESSION_COOKIE = 'tsukuyomi_admin_session';

function parseCookies(req) {
    const header = String(req.headers.cookie || '');
    return header.split(';').reduce((cookies, part) => {
        const index = part.indexOf('=');
        if (index < 0) return cookies;
        const name = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!name) return cookies;
        try {
            cookies[name] = decodeURIComponent(value);
        } catch (_) {
            cookies[name] = value;
        }
        return cookies;
    }, {});
}

function readBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    return /^Bearer$/i.test(scheme) ? token : null;
}

function readCookieToken(req, preferred = '') {
    const cookies = parseCookies(req);
    if (preferred && cookies[preferred]) return cookies[preferred];
    const url = String(req.originalUrl || req.baseUrl || req.path || '');
    if (url.startsWith('/api/admin')) return cookies[ADMIN_SESSION_COOKIE] || null;
    return cookies[USER_SESSION_COOKIE] || cookies[ADMIN_SESSION_COOKIE] || null;
}

function readAuthToken(req, preferredCookie = '') {
    return readBearerToken(req) || readCookieToken(req, preferredCookie);
}

function readAuthTokens(req) {
    const tokens = new Set();
    const bearer = readBearerToken(req);
    const cookies = parseCookies(req);
    if (bearer) tokens.add(bearer);
    if (cookies[USER_SESSION_COOKIE]) tokens.add(cookies[USER_SESSION_COOKIE]);
    if (cookies[ADMIN_SESSION_COOKIE]) tokens.add(cookies[ADMIN_SESSION_COOKIE]);
    return [...tokens].filter(Boolean);
}

function isSecureRequest(req) {
    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (req?.secure || forwardedProto === 'https') return true;
    try {
        const publicUrl = new URL(config.publicSiteUrl);
        const host = String(req?.headers?.host || '').split(',')[0].trim().split(':')[0].toLowerCase();
        return publicUrl.protocol === 'https:' && host === publicUrl.hostname.toLowerCase();
    } catch (_) {
        return false;
    }
}

function cookieOptions({ req = null, maxAge, sameSite = 'lax' } = {}) {
    return {
        httpOnly: true,
        secure: config.isProduction ? isSecureRequest(req) : false,
        sameSite,
        path: '/',
        ...(config.authCookieDomain ? { domain: config.authCookieDomain } : {}),
        ...(maxAge ? { maxAge } : {})
    };
}

function setAuthCookie(req, res, name, token, options = {}) {
    res.cookie(name, token, cookieOptions({ ...options, req }));
}

function clearAuthCookie(req, res, name, sameSite = 'lax') {
    res.clearCookie(name, cookieOptions({ req, sameSite }));
}

function clearAllAuthCookies(req, res) {
    clearAuthCookie(req, res, USER_SESSION_COOKIE, 'lax');
    clearAuthCookie(req, res, ADMIN_SESSION_COOKIE, 'strict');
}

function credentialVersion(passwordHash) {
    return crypto
        .createHmac('sha256', config.jwtSecret)
        .update(String(passwordHash || ''))
        .digest('base64url');
}

function hasCurrentCredentials(claims, passwordHash) {
    const expected = Buffer.from(credentialVersion(passwordHash));
    const actual = Buffer.from(String(claims?.credentialVersion || ''));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function currentUserForClaims(claims) {
    if (claims?.scope === 'admin') {
        const adminId = Number(claims.adminId);
        if (!Number.isInteger(adminId) || adminId <= 0) return null;
        const admin = adminRepository.findAdminById(adminId);
        if (!admin || !['admin', 'super_admin'].includes(admin.role) || !hasCurrentCredentials(claims, admin.password_hash)) {
            return null;
        }
        return {
            ...claims,
            id: `admin-${admin.id}`,
            adminId: admin.id,
            username: admin.username,
            role: admin.role,
            scope: 'admin'
        };
    }

    const user = authRepository.findUserById(claims?.id);
    if (!user || user.role === 'banned' || !hasCurrentCredentials(claims, user.password_hash)) return null;
    return { ...claims, id: user.id, username: user.username, role: user.role };
}

async function authenticateToken(req, res, next) {
    const token = readAuthToken(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: '未提供认证令牌',
            code: 'UNAUTHORIZED'
        });
    }

    try {
        if (await authState.isTokenBlacklisted(token)) {
            return res.status(401).json({
                success: false,
                message: '令牌已失效，请重新登录',
                code: 'TOKEN_REVOKED'
            });
        }

        const claims = jwt.verify(token, config.jwtSecret);
        req.user = currentUserForClaims(claims);
        if (!req.user) {
            clearAllAuthCookies(req, res);
            return res.status(403).json({
                success: false,
                message: '账号已停用',
                code: 'ACCOUNT_DISABLED'
            });
        }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: '令牌已过期，请重新登录',
                code: 'TOKEN_EXPIRED'
            });
        }
        return res.status(403).json({
            success: false,
            message: '令牌无效',
            code: 'TOKEN_INVALID'
        });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: '请先登录',
            code: 'UNAUTHORIZED'
        });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
            success: false,
            message: '需要管理员权限',
            code: 'FORBIDDEN'
        });
    }

    next();
}

function requireSuperAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '请先登录', code: 'UNAUTHORIZED' });
    }
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: '需要超级管理员权限', code: 'FORBIDDEN' });
    }
    next();
}

async function optionalAuth(req, res, next) {
    const token = readAuthToken(req);

    if (!token) return next();

    try {
        if (!(await authState.isTokenBlacklisted(token))) {
            req.user = currentUserForClaims(jwt.verify(token, config.jwtSecret)) || undefined;
        }
    } catch (_) {
        // Optional auth deliberately ignores invalid tokens.
    }
    next();
}

function generateToken(payload, expiresIn = config.jwtExpiresIn) {
    const account = payload?.scope === 'admin'
        ? adminRepository.findAdminById(Number(payload.adminId))
        : authRepository.findUserById(payload?.id);
    if (!account?.password_hash) throw new Error('Cannot issue a token for a missing account');
    return jwt.sign({
        ...payload,
        credentialVersion: credentialVersion(account.password_hash),
        jti: payload.jti || crypto.randomUUID()
    }, config.jwtSecret, { expiresIn });
}

function verifyToken(token) {
    return jwt.verify(token, config.jwtSecret);
}

module.exports = {
    authenticateToken,
    requireAdmin,
    requireSuperAdmin,
    optionalAuth,
    generateToken,
    verifyToken,
    readBearerToken,
    readAuthToken,
    readAuthTokens,
    setAuthCookie,
    clearAuthCookie,
    clearAllAuthCookies,
    isSecureRequest,
    USER_SESSION_COOKIE,
    ADMIN_SESSION_COOKIE
};
