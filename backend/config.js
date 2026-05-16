const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';

function boolEnv(name, defaultValue = false) {
    const value = process.env[name];
    if (value === undefined || value === '') return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function csvEnv(name) {
    return String(process.env[name] || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : 'dev-only-change-me-' + crypto.randomBytes(16).toString('hex'));

if (isProduction && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
}

const dataDir = path.resolve(process.env.DATA_DIR || path.join(projectRoot, 'data'));
fs.mkdirSync(dataDir, { recursive: true });

module.exports = {
    projectRoot,
    isProduction,
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '0.0.0.0',
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '24h',
    redis: {
        url: process.env.REDIS_URL || '',
        timeoutMs: Number(process.env.REDIS_TIMEOUT_MS || 1200)
    },
    emailCodeTtlMs: Number(process.env.EMAIL_CODE_TTL_MS || 10 * 60 * 1000),
    emailCodeCooldownMs: Number(process.env.EMAIL_CODE_COOLDOWN_MS || 60 * 1000),
    weatherCacheSeconds: Number(process.env.WEATHER_CACHE_SECONDS || 10 * 60),
    loginFailureWindowSeconds: Number(process.env.LOGIN_FAILURE_WINDOW_SECONDS || 15 * 60),
    loginFailureMax: Number(process.env.LOGIN_FAILURE_MAX || 8),
    dbPath: path.resolve(process.env.DB_PATH || path.join(dataDir, 'tsukuyomi.db')),
    corsOrigins: csvEnv('CORS_ORIGINS'),
    publicSiteUrl: (process.env.PUBLIC_SITE_URL || 'https://yachiyo.redchenk.com').replace(/\/$/, ''),
    trustProxy: boolEnv('TRUST_PROXY', isProduction),
    enableFrontendDist: boolEnv('ENABLE_FRONTEND_DIST', true),
    defaultAdmin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        email: process.env.ADMIN_EMAIL || 'admin@tsukuyomi.space',
        password: process.env.ADMIN_PASSWORD || ''
    },
    smtp: {
        host: process.env.SMTP_HOST || 'smtp.qq.com',
        port: Number(process.env.SMTP_PORT || 465),
        secure: (process.env.SMTP_SECURE || 'ssl').toLowerCase() !== 'false',
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        fromName: process.env.SMTP_FROM_NAME || '月读空间'
    }
};
