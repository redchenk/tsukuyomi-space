// 统一认证中间件
// 月读空间 - 统一鉴权系统

const jwt = require('jsonwebtoken');

// JWT 密钥（生产环境请修改）
const JWT_SECRET = 'tsukuyomi_space_secret_key_2024_change_in_production';

/**
 * JWT 认证中间件
 * 验证请求头中的 Bearer Token 是否有效
 * 验证通过后将用户信息附加到 req.user
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: '未提供认证令牌',
            code: 'UNAUTHORIZED'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
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

/**
 * 管理员权限中间件
 * 验证用户是否具有管理员角色
 * 必须在 authenticateToken 之后使用
 */
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

/**
 * 可选认证中间件
 * 如果提供了 Token 则验证，但不强制要求
 * 用于部分公开、部分需要登录的接口
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (!err) {
                req.user = user;
            }
        });
    }
    next();
}

/**
 * 生成 JWT Token
 * @param {Object} payload - 用户信息 { id, username, role }
 * @param {String} expiresIn - 过期时间，默认 '7d'
 * @returns {String} JWT Token
 */
function generateToken(payload, expiresIn = '7d') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * 验证 Token（不附加到 req）
 * @param {String} token - JWT Token
 * @returns {Object} 解码后的用户信息
 */
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = {
    authenticateToken,
    requireAdmin,
    optionalAuth,
    generateToken,
    verifyToken,
    JWT_SECRET
};
