const express = require('express');
const config = require('../config');
const { authenticateToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');
const friendLinkRepository = require('../repositories/friend-link-repository');
const { validateFriendLinkApplication } = require('../services/friend-links');
const friendLinkAvatarService = require('../services/friend-link-avatar');
const objectStorage = require('../services/object-storage');
const responseCache = require('../services/response-cache');
const { setPublicReadCache } = require('../services/public-cache');

const router = express.Router();
const applicationLimiter = createRateLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    keyPrefix: 'friend-link-account',
    keyGenerator: req => req.user?.id || 'anonymous'
});
const avatarDiscoveryLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 15,
    keyPrefix: 'friend-link-avatar-account',
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

router.get('/source', (req, res) => {
    try {
        setPublicReadCache(res, { maxAge: 300, stale: 600 });
        res.json(responseCache.remember('public:friend-links-source', 300000, () => {
            const links = friendLinkRepository.listMonitorSource();
            return {
                success: true,
                data: {
                    author_url: config.publicSiteUrl,
                    author_hosts: config.friendLinkAuthorHosts,
                    length: links.length,
                    link_list: links.map(link => ({
                        id: link.id,
                        name: link.name,
                        link: link.url,
                        avatar: link.avatar_url,
                        descr: link.description,
                        linkpage: link.backlink_url,
                        monitor_status: link.monitor_status,
                        response_time_ms: link.response_time_ms,
                        http_status: link.http_status,
                        fail_count: link.fail_count,
                        has_backlink: Boolean(link.has_backlink),
                        last_checked_at: link.last_checked_at
                    }))
                }
            };
        }));
    } catch (error) {
        console.error('Friend link monitor source failed:', error);
        res.status(500).json({ success: false, message: '友链监测源读取失败' });
    }
});

router.get('/:id/preview', async (req, res) => {
    try {
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(id) || id <= 0) return res.status(404).end();
        const link = friendLinkRepository.findById(id);
        if (!link || link.status !== 'active' || !link.screenshot_storage_key) return res.status(404).end();

        const object = await objectStorage.getObject(link.screenshot_storage_key);
        if (!object?.buffer?.length) return res.status(404).end();
        res.set({
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Type': 'image/jpeg',
            'Content-Length': String(object.buffer.length),
            'X-Content-Type-Options': 'nosniff',
            ...(object.etag ? { ETag: object.etag } : {}),
            ...(object.lastModified ? { 'Last-Modified': object.lastModified } : {})
        });
        res.end(object.buffer);
    } catch (error) {
        console.warn('Friend link preview failed:', error.message);
        res.status(404).end();
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

router.post('/discover-avatar', authenticateToken, avatarDiscoveryLimiter, async (req, res) => {
    try {
        const avatarUrl = await friendLinkAvatarService.discoverFriendLinkAvatar(req.body?.url);
        res.json({ success: true, data: { avatar_url: avatarUrl } });
    } catch (error) {
        console.warn('Friend link avatar discovery failed:', error.message);
        res.status(422).json({
            success: false,
            message: error.message || '未能自动获取站点头像',
            code: 'AVATAR_DISCOVERY_FAILED'
        });
    }
});

router.post('/', authenticateToken, applicationLimiter, async (req, res) => {
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

        try {
            review.data.avatarUrl = await friendLinkAvatarService.prepareFriendLinkAvatar({
                avatarUrl: review.data.avatarUrl,
                siteUrl: review.data.url
            });
            if (!review.data.avatarUrl) {
                return res.status(422).json({
                    success: false,
                    message: '未能自动获取站点头像，请填写有效的 HTTPS 头像链接',
                    code: 'AVATAR_REQUIRED'
                });
            }
        } catch (_) {
            return res.status(422).json({
                success: false,
                message: '头像链接不可用或指向非公开地址',
                code: 'INVALID_AVATAR_URL'
            });
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
