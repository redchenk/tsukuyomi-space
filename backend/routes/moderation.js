const crypto = require('crypto');
const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const adminRepository = require('../repositories/admin-repository');
const articleRepository = require('../repositories/article-repository');
const articleMedia = require('../services/article-media');
const responseCache = require('../services/response-cache');
const { readModerationSettings, reviewMessageContent } = require('../services/message-moderation');

const router = express.Router();

router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    next();
});

function ok(res, data = null, message = '操作成功') {
    res.json({ success: true, message, data });
}

function fail(res, status, message, code = '') {
    res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
}

function asInt(value) {
    const id = Number.parseInt(value, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function clearArticleCache() {
    responseCache.delPrefix('public:articles:');
    responseCache.delPrefix('public:article-messages:');
    responseCache.delPrefix('public:stats');
    responseCache.delPrefix('public:site-feed');
}

function clearMessageCache() {
    responseCache.delPrefix('public:plaza-messages');
    responseCache.delPrefix('public:article-messages:');
    responseCache.delPrefix('public:message-topics');
    responseCache.delPrefix('public:stats');
    responseCache.delPrefix('public:site-feed');
}

function messageReviewDigest(message) {
    return crypto.createHash('sha256')
        .update(`${message?.id || ''}\0${message?.content || ''}\0${message?.updated_at || message?.created_at || ''}`)
        .digest('base64url');
}

function digestMatches(expected, actual) {
    const left = Buffer.from(String(expected || ''));
    const right = Buffer.from(String(actual || ''));
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function messageModerationView(message, settings) {
    const review = reviewMessageContent(message.content, settings);
    return {
        ...message,
        moderation: {
            reviewDigest: messageReviewDigest(message),
            blocked: !review.accepted,
            code: review.accepted ? '' : (review.code || 'UNSAFE_MESSAGE'),
            reasons: review.reviewReasons || [],
            matchedKeywords: review.matchedKeywords || [],
            externalHosts: review.externalHosts || []
        }
    };
}

router.use(authenticateToken, requireAdmin);

router.get('/me', (req, res) => {
    ok(res, {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
    });
});

router.get('/articles', (req, res) => {
    try {
        ok(res, adminRepository.listAdminArticles());
    } catch (error) {
        console.error('Moderation article list error:', error);
        fail(res, 500, '无法读取文章列表');
    }
});

router.get('/articles/:id', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const article = articleRepository.findArticleById(id);
        if (!article) return fail(res, 404, '文章不存在');
        ok(res, article);
    } catch (error) {
        console.error('Moderation article read error:', error);
        fail(res, 500, '无法读取文章');
    }
});

router.post('/articles/:id/save', async (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const { title, excerpt, content, content_format, category, status, read_time, cover_image, cover_image_asset_id } = req.body || {};
        if (!String(title || '').trim()) return fail(res, 400, '标题不能为空');

        const mediaPayload = await articleMedia.normalizeArticleMediaPayload({
            title: String(title).trim(),
            excerpt,
            content,
            contentFormat: content_format,
            category,
            status,
            readTime: read_time,
            coverImage: cover_image,
            coverImageAssetId: cover_image_asset_id
        }, { articleId: id, ownerId: req.user.id });
        const changes = adminRepository.updateAdminArticle(id, mediaPayload);
        if (!changes) return fail(res, 404, '文章不存在');
        articleMedia.attachAssetsToArticle(mediaPayload.mediaAssetIds, id);
        clearArticleCache();
        ok(res, null, '文章已保存');
    } catch (error) {
        console.error('Moderation article save error:', error);
        fail(res, 500, '无法保存文章');
    }
});

router.post('/articles/:id/toggle-status', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const status = adminRepository.toggleArticleStatus(id);
        if (!status) return fail(res, 404, '文章不存在');
        clearArticleCache();
        ok(res, { status }, status === 'published' ? '文章已发布' : '文章已下架');
    } catch (error) {
        console.error('Moderation article status error:', error);
        fail(res, 500, '无法切换文章状态');
    }
});

router.post('/articles/:id/toggle-pin', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const result = adminRepository.toggleArticlePin(id);
        if (!result) return fail(res, 404, '文章不存在');
        clearArticleCache();
        ok(res, { pinned_at: result.pinnedAt }, result.pinnedAt ? '文章已置顶' : '文章已取消置顶');
    } catch (error) {
        console.error('Moderation article pin error:', error);
        fail(res, 500, '无法切换置顶状态');
    }
});

router.post('/articles/:id/delete', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        if (!articleRepository.deleteArticle(id)) return fail(res, 404, '文章不存在');
        clearArticleCache();
        ok(res, null, '文章已删除');
    } catch (error) {
        console.error('Moderation article delete error:', error);
        fail(res, 500, '无法删除文章');
    }
});

router.get('/messages', (req, res) => {
    try {
        const settings = readModerationSettings();
        ok(res, adminRepository.listAdminMessages().map(message => messageModerationView(message, settings)));
    } catch (error) {
        console.error('Moderation message list error:', error);
        fail(res, 500, '无法读取留言列表');
    }
});

router.post('/messages/:id/approve', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '留言 ID 无效');
        const message = adminRepository.findAdminMessageById(id);
        if (!message) return fail(res, 404, '留言不存在');
        const review = reviewMessageContent(message.content, readModerationSettings());
        if (!review.accepted) return fail(res, 422, '留言包含禁止发布的危险内容', review.code || 'UNSAFE_MESSAGE');
        if (!digestMatches(messageReviewDigest(message), req.body?.reviewDigest)) {
            return fail(res, 409, '留言内容已变化，请重新审核', 'MESSAGE_REVIEW_STALE');
        }
        if (review.externalHosts?.length && req.body?.confirmExternalLink !== true) {
            return fail(res, 409, '留言包含外部链接，需要明确确认后才能通过', 'EXTERNAL_LINK_CONFIRMATION_REQUIRED');
        }
        if (!adminRepository.approveMessage(id)) return fail(res, 404, '留言不存在');
        clearMessageCache();
        ok(res, null, '留言已通过');
    } catch (error) {
        console.error('Moderation message approve error:', error);
        fail(res, 500, '无法审核留言');
    }
});

router.post('/messages/:id/delete', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '留言 ID 无效');
        if (!adminRepository.deleteMessage(id)) return fail(res, 404, '留言不存在');
        clearMessageCache();
        ok(res, null, '留言已删除');
    } catch (error) {
        console.error('Moderation message delete error:', error);
        fail(res, 500, '无法删除留言');
    }
});

module.exports = router;
