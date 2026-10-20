const express = require('express');
const fs = require('node:fs');
const crypto = require('node:crypto');
const db = require('../db');
const wallet = require('../services/site-wallet');
const { authenticateToken } = require('../middleware/auth');
const { rejectDuplicateJsonKeys } = require('../services/json-security');
const PATH = '/api/internal/official-wallet';
function bridgeKey() {
    const path = process.env.OFFICIAL_WALLET_KEY_PATH;
    if (!path || !path.startsWith('/')) throw new Error('Missing bridge configuration');
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size !== 32) throw new Error('Invalid bridge configuration');
    return fs.readFileSync(path);
}
function router() {
    const result = express.Router({ strict: true });
    result.post(PATH, (req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'Surrogate-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers.origin || req.headers.authorization || !req.is('application/json')) return res.sendStatus(403);
        next();
    }, express.json({ limit: '16kb', verify(req, res, buffer) { rejectDuplicateJsonKeys(req, res, buffer); req.walletRaw = buffer; } }), (req, res, next) => {
        try {
            for (const header of ['x-wallet-time', 'x-wallet-nonce', 'x-wallet-signature', 'cookie']) {
                if (req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === header).length > 1) return res.sendStatus(403);
            }
            const time = req.get('X-Wallet-Time'), nonce = req.get('X-Wallet-Nonce'), signature = req.get('X-Wallet-Signature');
            if (!/^\d{13}$/.test(time || '') || Math.abs(Date.now() - Number(time)) > 60000 || !/^[a-f0-9]{32}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return res.sendStatus(403);
            const hash = crypto.createHash('sha256').update(req.walletRaw).digest('hex');
            const expected = crypto.createHmac('sha256', bridgeKey()).update(`POST\n${PATH}\n${time}\n${nonce}\n${hash}`).digest();
            if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return res.sendStatus(403);
            db.transaction(() => {
                db.prepare('DELETE FROM wallet_bridge_nonces WHERE created_at<?').run(Date.now() - 120000);
                db.prepare('INSERT INTO wallet_bridge_nonces VALUES(?,?)').run(nonce, Date.now());
            }).immediate();
            const b = req.body, keys = ['action', 'user_id', 'month', 'request_id', 'request_fingerprint', 'hold_atoms', 'pricing_snapshot', 'usage', 'sponsored', 'reason', 'proof_ref'];
            if (!b || Array.isArray(b) || Object.keys(b).some(k => !keys.includes(k))) return res.sendStatus(400);
            if (b.action === 'reserve') {
                if (!/^tsukuyomi_session=[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]{1,4096}$/.test(req.get('Cookie') || '') || req.get('Cookie').includes(';')) return res.sendStatus(403);
                return authenticateToken(req, res, () => req.user.id === b.user_id ? next() : res.sendStatus(403));
            }
            next();
        } catch (_) { res.status(403).json({ success: false, code: 'BRIDGE_REJECTED', message: '主站余额验证失败' }); }
    }, (req, res) => {
        try {
            const b = req.body; let data;
            if (b.action === 'overview') {
                const payments = require('../services/payments');
                data = { wallet: wallet.wallet(b.user_id), statement: wallet.statement(b.user_id, b.month), catalog: payments.catalog(), orders: payments.listOrders(b.user_id) };
            } else if (b.action === 'reserve') data = wallet.admission(b);
            else if (b.action === 'settle') data = wallet.settle(b);
            else if (b.action === 'release') data = wallet.release(b);
            else if (b.action === 'request') data = { request: wallet.request(b.request_id) };
            else return res.sendStatus(404);
            res.json({ success: true, data });
        } catch (error) {
            const status = error.statusCode || ({ INSUFFICIENT_AVAILABLE: 402, REQUEST_NOT_FOUND: 404, IDEMPOTENCY_CONFLICT: 409, INVALID_REQUEST_STATE: 409, PRICING_SNAPSHOT_CONFLICT: 409 })[error.code] || 400;
            res.status(status).json({ success: false, code: error.code || 'WALLET_REJECTED', message: status === 402 ? '网站可用余额不足，未发起模型请求' : error.statusCode ? error.message : '主站余额操作未完成，请核对记录' });
        }
    });
    return result;
}
module.exports = { router, bridgeKey };
