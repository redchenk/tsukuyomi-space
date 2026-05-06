const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const authState = require('../services/auth-state');

function readBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    return /^Bearer$/i.test(scheme) ? token : null;
}

async function authenticateToken(req, res, next) {
    const token = readBearerToken(req);

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

        req.user = jwt.verify(token, config.jwtSecret);
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

async function optionalAuth(req, res, next) {
    const token = readBearerToken(req);

    if (!token) return next();

    try {
        if (!(await authState.isTokenBlacklisted(token))) {
            req.user = jwt.verify(token, config.jwtSecret);
        }
    } catch (_) {
        // Optional auth deliberately ignores invalid tokens.
    }
    next();
}

function generateToken(payload, expiresIn = config.jwtExpiresIn) {
    return jwt.sign({ ...payload, jti: payload.jti || crypto.randomUUID() }, config.jwtSecret, { expiresIn });
}

function verifyToken(token) {
    return jwt.verify(token, config.jwtSecret);
}

module.exports = {
    authenticateToken,
    requireAdmin,
    optionalAuth,
    generateToken,
    verifyToken,
    readBearerToken,
    JWT_SECRET: config.jwtSecret
};
