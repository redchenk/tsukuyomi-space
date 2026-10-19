const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GATEWAYS = Object.freeze({
    production: 'https://openapi.alipay.com/gateway.do',
    sandbox: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
});

function keyValue(name) {
    const file = String(process.env[`${name}_PATH`] || '').trim();
    if (file) {
        if (!path.isAbsolute(file) || fs.statSync(file).size > 32768) throw new Error('Invalid key file');
        return fs.readFileSync(file, 'utf8').trim();
    }
    return String(process.env[name] || '').trim().replace(/\\n/g, '\n');
}

function keyPem(value, privateKey = false) {
    if (value.includes('-----BEGIN ')) return value;
    if (!/^[A-Za-z0-9+/=\s]+$/.test(value)) throw new Error('Invalid key');
    const label = privateKey ? 'PRIVATE KEY' : 'PUBLIC KEY';
    const lines = value.replace(/\s/g, '').match(/.{1,64}/g) || [];
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

function readConfig() {
    const missing = [];
    const appId = String(process.env.ALIPAY_APP_ID || '').trim();
    const sellerId = String(process.env.ALIPAY_SELLER_ID || '').trim();
    if (!/^\d{16}$/.test(appId)) missing.push('ALIPAY_APP_ID');
    if (!/^\d{16}$/.test(sellerId)) missing.push('ALIPAY_SELLER_ID');
    const environment = process.env.ALIPAY_ENV || 'production';
    if (!Object.hasOwn(GATEWAYS, environment)) missing.push('ALIPAY_ENV');
    let baseUrl = '';
    try {
        const url = new URL(process.env.PAYMENT_PUBLIC_BASE_URL || '');
        const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
        baseUrl = url.origin;
    } catch (_) { missing.push('PAYMENT_PUBLIC_BASE_URL'); }
    let privateKey = '', alipayPublicKey = '';
    for (const [name, isPrivate] of [['ALIPAY_PRIVATE_KEY', true], ['ALIPAY_PUBLIC_KEY', false]]) {
        try {
            const value = keyValue(name);
            if (!value) throw new Error();
            let key;
            if (isPrivate) {
                // The official tool can export either PKCS#1 or PKCS#8.
                try { key = crypto.createPrivateKey(keyPem(value, true)); }
                catch (_) { key = crypto.createPrivateKey(keyPem(value, true).replaceAll('PRIVATE KEY', 'RSA PRIVATE KEY')); }
            } else key = crypto.createPublicKey(keyPem(value));
            if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) throw new Error();
            if (isPrivate) privateKey = key.export({ type: 'pkcs8', format: 'pem' });
            else alipayPublicKey = key.export({ type: 'spki', format: 'pem' });
        } catch (_) { missing.push(`${name} / ${name}_PATH`); }
    }
    const maxAmountCents = Math.round(Number(process.env.PAYMENT_MAX_ORDER_YUAN || '50') * 100);
    if (!Number.isSafeInteger(maxAmountCents) || maxAmountCents < 1 || maxAmountCents > 100000000) missing.push('PAYMENT_MAX_ORDER_YUAN');
    return { appId, sellerId, environment, gateway: GATEWAYS[environment], baseUrl, privateKey, alipayPublicKey,
        maxAmountCents, missing, configured: missing.length === 0 };
}

function readiness() {
    const config = readConfig();
    return { configured: config.configured, environment: config.environment, missing: config.missing,
        maxAmountCents: Number.isSafeInteger(config.maxAmountCents) ? config.maxAmountCents : 0,
        notifyUrl: config.baseUrl ? `${config.baseUrl}/api/payments/alipay/notify` : '' };
}

module.exports = { readConfig, readiness };
