const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');
const friendLinkRepository = require('../repositories/friend-link-repository');
const { validateFriendLinkApplication } = require('../services/friend-links');
const responseCache = require('../services/response-cache');
const { setPublicReadCache } = require('../services/public-cache');

const router = express.Router();
const applicationLimiter = createRateLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    keyPrefix: 'friend-link-account',
    keyGenerator: req => req.user?.id || 'anonymous'
});

router.get('/', (req, res) => {
    try {
        setPublicReadCache(res, { maxAge: 60, stale: 180 });
        res.json(responseCache.remember('public:friend-links', 60000, () => ({
            success: true,
            data: friendLinkRepository.listActiveLinks()
        })));
    } catch (error) {
        console.error('Friend link list failed:', error);
        res.status(500).json({ success: false, message: '友链读取失败' });
    }
});

router.get('/mine', authenticateToken, (req, res) => {
    try {
        res.set('Cache-Control', 'private, no-store');
        res.json({
            success: true,
            data: friendLinkRepository.listUserApplications(req.user.id)
        });
    } catch (error) {
        console.error('Friend link application list failed:', error);
        res.status(500).json({ success: false, message: '申请记录读取失败' });
    }
});

router.post('/', authenticateToken, applicationLimiter, (req, res) => {
    try {
        const review = validateFriendLinkApplication(req.body || {});
        if (review.error) {
            return res.status(422).json({ success: false, message: review.error, code: 'INVALID_LINK_APPLICATION' });
        }

        const existing = friendLinkRepository.findByUrl(review.data.url);
        if (existing?.status === 'active') {
            return res.status(409).json({ success: false, message: '该站点已在友链列表中', code: 'LINK_ACTIVE' });
        }
        if (existing?.status === 'pending') {
            return res.status(409).json({ success: false, message: '该站点正在审核中', code: 'LINK_PENDING' });
        }
        if (existing && existing.user_id && existing.user_id !== req.user.id) {
            return res.status(409).json({ success: false, message: '该站点已有申请记录', code: 'LINK_EXISTS' });
        }

        const application = existing?.status === 'rejected'
            ? friendLinkRepository.resubmitApplication(existing.id, { ...review.data, userId: req.user.id })
            : friendLinkRepository.createApplication({ ...review.data, userId: req.user.id });

        if (!application) {
            return res.status(409).json({ success: false, message: '申请状态已变化，请刷新后重试', code: 'LINK_CONFLICT' });
        }

        res.status(201).json({
            success: true,
            data: application,
            message: '申请已提交，审核结果可在本页查看'
        });
    } catch (error) {
        console.error('Friend link application failed:', error);
        res.status(500).json({ success: false, message: '友链申请提交失败' });
    }
});

module.exports = router;
