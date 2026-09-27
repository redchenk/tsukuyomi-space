const crypto = require('crypto');
const config = require('../config');

const COOKIE_NAME = config.isProduction ? '__Host-tsukuyomi_qq_oauth' : 'tsukuyomi_qq_oauth';
const options = { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/' };

function bindingForToken(token) {
    return /^[a-f0-9]{64}$/.test(token || '')
        ? crypto.createHash('sha256').update(token).digest('hex') : '';
}

function readBinding(req) {
    const cookies = String(req.headers.cookie || '').split(';').map(part => part.trim());
    const matches = cookies.filter(part => part.startsWith(`${COOKIE_NAME}=`));
    // Ambiguous cookies must never choose which browser owns an OAuth flow.
    return matches.length === 1 ? bindingForToken(matches[0].slice(COOKIE_NAME.length + 1)) : '';
}

function begin(res) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE_NAME, token, { ...options, maxAge: Math.max(config.oauth.stateTtlMs, config.oauth.pendingTtlMs) });
    return bindingForToken(token);
}

function clear(res) {
    res.clearCookie(COOKIE_NAME, options);
}

module.exports = { begin, readBinding, clear, bindingForToken, COOKIE_NAME };
