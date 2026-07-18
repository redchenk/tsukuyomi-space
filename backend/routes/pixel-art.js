const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const notificationRepository = require('../repositories/notification-repository');
const pixelArtRepository = require('../repositories/pixel-art-repository');
const responseCache = require('../services/response-cache');
const { setPrivateNoStore, setPublicReadCache } = require('../services/public-cache');

const router = express.Router();
const DEFAULT_DIMENSIONS = { width: 96, height: 54 };
const ALLOWED_DIMENSIONS = new Set(['32x18', '48x27', '64x36', '96x54', '128x72', '160x90', '192x108']);
const MAX_PALETTE_COLORS = 32;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function actorName(user) {
    return user?.username || '访客';
}

function cleanText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizePalette(value) {
    if (!Array.isArray(value)) return null;
    const colors = value
        .map(color => String(color || '').trim())
        .filter(Boolean)
        .slice(0, MAX_PALETTE_COLORS);
    if (colors.length < 2 || colors.some(color => !HEX_COLOR.test(color))) return null;
    return colors.map(color => color.toLowerCase());
}

function normalizeColor(value, fallback = '#0b1020') {
    const color = String(value || '').trim();
    return HEX_COLOR.test(color) ? color.toLowerCase() : fallback;
}

function normalizeDimensions(body) {
    const width = Number.parseInt(body.width ?? body.size, 10);
    const height = Number.parseInt(body.height ?? body.size, 10);
    const key = `${width}x${height}`;
    return ALLOWED_DIMENSIONS.has(key) ? { width, height } : DEFAULT_DIMENSIONS;
}

function normalizePixels(value, width, height, paletteLength) {
    if (!Array.isArray(value)) return null;
    const expected = width * height;
    if (value.length !== expected) return null;

    const pixels = value.map((item) => {
        const colorIndex = Number.parseInt(item, 10);
        if (!Number.isInteger(colorIndex)) return null;
        if (colorIndex < -1 || colorIndex >= paletteLength) return null;
        return colorIndex;
    });

    if (pixels.some(item => item === null)) return null;
    return pixels;
}

function notifyArtworkOwner({ artwork, actor }) {
    if (!artwork?.author_id || artwork.author_id === actor.id) return;
    notificationRepository.createNotification({
        userId: artwork.author_id,
        actorId: actor.id,
        type: 'pixel_art_like',
        title: `${actorName(actor)} 点赞了你的像素画`,
        content: artwork.title,
        link: `/pixel?art=${artwork.id}#pixel-art-${artwork.id}`,
        metadata: {
            actorName: actorName(actor),
            artworkId: artwork.id
        }
    });
}

function isAdminUser(user) {
    return user?.role === 'admin' || user?.role === 'super_admin' || user?.scope === 'admin';
}

function canManageArtwork(user, artwork) {
    if (!user || !artwork) return false;
    return isAdminUser(user) || artwork.author_id === user.id;
}

function normalizeArtworkPayload(body) {
    const title = cleanText(body.title, 40);
    const description = cleanText(body.description, 120);
    const dimensions = normalizeDimensions(body);
    const backgroundColor = normalizeColor(body.background_color || body.backgroundColor);
    const palette = normalizePalette(body.palette);
    if (!title) return { error: '请给作品取一个名字' };
    if (!palette) return { error: '调色板格式不正确' };

    const pixels = normalizePixels(body.pixels, dimensions.width, dimensions.height, palette.length);
    if (!pixels) return { error: '像素数据格式不正确' };
    if (!pixels.some(colorIndex => colorIndex >= 0)) {
        return { error: '画布还是空的，先落下一点月光吧' };
    }

    return {
        title,
        description,
        size: dimensions.width,
        width: dimensions.width,
        height: dimensions.height,
        backgroundColor,
        palette,
        pixels
    };
}

function sendArtworkList(req, res, fixedLimit = null) {
    try {
        const sort = req.query.sort === 'hot' ? 'hot' : 'latest';
        const limit = fixedLimit || req.query.limit;
        const offset = req.query.offset;
        const payload = req.user
            ? pixelArtRepository.listArtworks({ viewerId: req.user.id, sort, limit, offset, preview: true })
            : responseCache.remember(`public:pixel-art:${sort}:${limit || ''}:${offset || ''}`, 10000, () => pixelArtRepository.listArtworks({ viewerId: '', sort, limit, offset, preview: true }));
        setPrivateNoStore(res);
        res.json({
            success: true,
            data: payload.items,
            pagination: {
                total: payload.total,
                limit: payload.limit,
                offset: payload.offset
            }
        });
    } catch (error) {
        console.error('List pixel art failed:', error);
        res.status(500).json({ success: false, message: '像素画读取失败' });
    }
}

router.get('/', optionalAuth, (req, res) => sendArtworkList(req, res));
router.get('/gallery', optionalAuth, (req, res) => sendArtworkList(req, res, 12));
router.get('/preview', optionalAuth, (req, res) => sendArtworkList(req, res, 1));

router.get('/manage', authenticateToken, (req, res) => {
    try {
        const sort = req.query.sort === 'hot' ? 'hot' : 'latest';
        const payload = pixelArtRepository.listManageArtworks({
            viewerId: req.user.id,
            admin: isAdminUser(req.user),
            sort,
            limit: req.query.limit,
            offset: req.query.offset,
            preview: true
        });
        res.set({
            'Cache-Control': 'private, no-store',
            'Vary': 'Cookie, Accept-Encoding'
        });
        res.json({
            success: true,
            data: payload.items,
            pagination: {
                total: payload.total,
                limit: payload.limit,
                offset: payload.offset
            }
        });
    } catch (error) {
        console.error('Manage pixel art list failed:', error);
        res.status(500).json({ success: false, message: '像素画管理列表读取失败' });
    }
});

router.get('/manage/:id', authenticateToken, (req, res) => {
    try {
        const artwork = pixelArtRepository.findArtworkById(req.params.id, req.user.id);
        if (!artwork) return res.status(404).json({ success: false, message: '像素画不存在' });
        if (!canManageArtwork(req.user, artwork)) {
            return res.status(403).json({ success: false, message: '只能管理自己发布的像素画' });
        }
        res.set({
            'Cache-Control': 'private, no-store',
            'Vary': 'Cookie, Accept-Encoding'
        });
        res.json({ success: true, data: artwork });
    } catch (error) {
        console.error('Manage pixel art read failed:', error);
        res.status(500).json({ success: false, message: '像素画读取失败' });
    }
});

router.get('/:id', optionalAuth, (req, res) => {
    try {
        const artwork = pixelArtRepository.findArtworkById(req.params.id, req.user?.id || '');
        if (!artwork) return res.status(404).json({ success: false, message: '像素画不存在' });
        if (req.user) setPrivateNoStore(res, { vary: 'Cookie, Authorization, Accept-Encoding' });
        else setPublicReadCache(res, { maxAge: 10, stale: 30 });
        res.json({ success: true, data: artwork });
    } catch (error) {
        console.error('Read pixel art failed:', error);
        res.status(500).json({ success: false, message: '像素画读取失败' });
    }
});

router.post('/', authenticateToken, (req, res) => {
    try {
        const payload = normalizeArtworkPayload(req.body);
        if (payload.error) return res.status(400).json({ success: false, message: payload.error });
        const artwork = pixelArtRepository.createArtwork({
            authorId: req.user.id,
            ...payload
        });
        responseCache.delPrefix('public:pixel-art');
        responseCache.delPrefix('public:site-feed');
        res.status(201).json({ success: true, data: artwork, message: '像素画已分享' });
    } catch (error) {
        console.error('Create pixel art failed:', error);
        res.status(500).json({ success: false, message: '像素画发布失败' });
    }
});

router.put('/:id', authenticateToken, (req, res) => {
    try {
        const artwork = pixelArtRepository.findArtworkById(req.params.id, req.user.id);
        if (!artwork) return res.status(404).json({ success: false, message: '像素画不存在' });
        if (!canManageArtwork(req.user, artwork)) {
            return res.status(403).json({ success: false, message: '只能管理自己发布的像素画' });
        }

        const payload = normalizeArtworkPayload(req.body);
        if (payload.error) return res.status(400).json({ success: false, message: payload.error });
        const updated = pixelArtRepository.updateArtwork(artwork.id, payload, req.user.id);
        responseCache.delPrefix('public:pixel-art');
        responseCache.delPrefix('public:site-feed');
        res.json({ success: true, data: updated, message: '像素画已更新' });
    } catch (error) {
        console.error('Update pixel art failed:', error);
        res.status(500).json({ success: false, message: '像素画更新失败' });
    }
});

router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const artwork = pixelArtRepository.findArtworkById(req.params.id, req.user.id);
        if (!artwork) return res.status(404).json({ success: false, message: '像素画不存在' });
        if (!canManageArtwork(req.user, artwork)) {
            return res.status(403).json({ success: false, message: '只能删除自己发布的像素画' });
        }

        pixelArtRepository.deleteArtwork(artwork.id);
        responseCache.delPrefix('public:pixel-art');
        responseCache.delPrefix('public:site-feed');
        res.json({ success: true, message: '像素画已删除' });
    } catch (error) {
        console.error('Delete pixel art failed:', error);
        res.status(500).json({ success: false, message: '像素画删除失败' });
    }
});

router.post('/:id/like', authenticateToken, (req, res) => {
    try {
        const artwork = pixelArtRepository.findArtworkById(req.params.id, req.user.id);
        if (!artwork) return res.status(404).json({ success: false, message: '像素画不存在' });
        if (pixelArtRepository.findArtworkLike(artwork.id, req.user.id)) {
            return res.status(400).json({ success: false, message: '已经点过赞了' });
        }

        const updated = pixelArtRepository.likeArtwork(artwork.id, req.user.id);
        notifyArtworkOwner({ artwork: updated, actor: req.user });
        responseCache.delPrefix('public:pixel-art');
        res.json({ success: true, data: updated, message: '已点赞' });
    } catch (error) {
        console.error('Like pixel art failed:', error);
        res.status(500).json({ success: false, message: '点赞失败' });
    }
});

module.exports = router;
