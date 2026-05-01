const jwt = require('jsonwebtoken');
const config = require('../config');

function readBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    return /^Bearer$/i.test(scheme) ? token : null;
}

function authenticateToken(req, res, next) {
    const token = readBearerToken(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: '未提供认证令牌',
            code: 'UNAUTHORIZED'
        });
    }

    jwt.verify(token, config.jwtSecret, (err, user) => {
        if (err) {
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

        req.user = user;
        next();
    });
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

function optionalAuth(req, res, next) {
    const token = readBearerToken(req);

    if (!token) return next();

    jwt.verify(token, config.jwtSecret, (err, user) => {
        if (!err) req.user = user;
        next();
    });
}

function generateToken(payload, expiresIn = config.jwtExpiresIn) {
    return jwt.sign(payload, config.jwtSecret, { expiresIn });
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
    JWT_SECRET: config.jwtSecret
};
