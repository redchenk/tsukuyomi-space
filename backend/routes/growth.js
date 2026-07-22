const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const userGrowth = require('../services/user-growth');

const router = express.Router();

function sendError(res, error, fallback) {
    return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : fallback
    });
}

router.get('/public', (req, res) => {
    try {
        const rawIds = Array.isArray(req.query.ids) ? req.query.ids.join(',') : String(req.query.ids || '');
        if (rawIds.length > 4096) {
            return res.status(400).json({ success: false, message: '用户列表过长' });
        }
        const ids = rawIds.split(',').map((value) => value.trim()).filter(Boolean);
        if (ids.length > 60 || ids.some((value) => !/^[A-Za-z0-9_-]{1,64}$/.test(value))) {
            return res.status(400).json({ success: false, message: '用户列表格式无效' });
        }
        return res.json({ success: true, data: userGrowth.getPublicLevels(ids) });
    } catch (error) {
        return sendError(res, error, '无法读取公开等级');
    }
});

router.get('/me', authenticateToken, (req, res) => {
    try {
        return res.json({ success: true, data: userGrowth.getState(req.user.id) });
    } catch (error) {
        return sendError(res, error, '无法读取成长记录');
    }
});

router.post('/check-in', authenticateToken, (req, res) => {
    try {
        return res.json({ success: true, data: userGrowth.checkIn(req.user.id) });
    } catch (error) {
        return sendError(res, error, '签到失败，请稍后重试');
    }
});

router.post('/actions/share', authenticateToken, (req, res) => {
    try {
        return res.json({
            success: true,
            data: userGrowth.recordShare(req.user.id, String(req.body?.platform || '').trim().toLowerCase())
        });
    } catch (error) {
        return sendError(res, error, '分享记录失败');
    }
});

router.post('/referrals/claim', authenticateToken, (req, res) => {
    try {
        return res.json({ success: true, data: userGrowth.claimReferral(req.user.id, req.body?.code) });
    } catch (error) {
        return sendError(res, error, '邀请码绑定失败');
    }
});

module.exports = router;
