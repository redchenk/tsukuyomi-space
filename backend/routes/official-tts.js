const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { isAllowedOrigin } = require('../middleware/security');
const service = require('../services/official-tts');
const router = express.Router();
router.use((req, res, next) => {
    if (req.get('Origin') && !isAllowedOrigin(req.get('Origin'), req)) return res.status(403).json({ success: false, message: '不允许跨站请求官方语音' });
    next();
});
const handler = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
        const status = error.status || error.statusCode || (error.code === 'INSUFFICIENT_AVAILABLE' ? 402 : 500);
        res.status(status).json({ success: false, code: error.code || 'TTS_ERROR', message: status === 402 ? '余额不足，请前往支付中心充值，未扣费' : status === 500 ? '语音服务暂不可用，请稍后查看合成状态' : error.message });
    }
};
router.get('/status', handler(async (req, res) => res.json({ success: true, data: await service.status() })));
router.use(authenticateToken);
router.use((req, res, next) => {
    if (req.get('X-TTS-Account') !== req.user.id) return res.status(409).json({ success: false, message: '登录账号已变化，请重新保存语音设置' });
    next();
});
router.post('/jobs', handler(async (req, res) => res.status(202).json({ success: true, data: await service.create(req.user.id, req.body) })));
router.get('/jobs', handler((req, res) => res.json({ success: true, data: service.list(req.user.id) })));
router.get('/jobs/:id', handler((req, res) => res.json({ success: true, data: service.get(req.user.id, req.params.id) })));
router.get('/jobs/:id/audio', handler((req, res) => {
    const audio = service.audio(req.user.id, req.params.id);
    res.set({ 'Content-Type': audio.contentType, 'Content-Length': audio.buffer.length, 'X-Content-Type-Options': 'nosniff' }).send(audio.buffer);
}));
module.exports = router;
