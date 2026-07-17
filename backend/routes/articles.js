const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const articleRepository = require('../repositories/article-repository');
const messageRepository = require('../repositories/message-repository');
const articleMedia = require('../services/article-media');
const responseCache = require('../services/response-cache');
const { setPublicReadCache } = require('../services/public-cache');
const { parsePositiveInt, safeJsonParse } = require('../validators');

const router = express.Router();

function withParsedTags(article) {
    return {
        ...article,
        tags: safeJsonParse(article.tags, [])
    };
}

function listArticlesPayload(req) {
    const { category } = req.query;
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 100), 100);
    const offset = (page - 1) * limit;

    const result = articleRepository.listArticles({ category, limit, offset });
    const articles = result.articles.map(withParsedTags);

    return {
        success: true,
        data: articles,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit)
        }
    };
}

function articleListCacheKey(req) {
    const limit = Math.min(parsePositiveInt(req.query.limit, 100), 100);
    return `public:articles:${String(req.query.category || '')}:${parsePositiveInt(req.query.page, 1)}:${limit}`;
}

function sendArticleList(req, res) {
    try {
        setPublicReadCache(res, { maxAge: 15, stale: 30 });
        res.json(responseCache.remember(articleListCacheKey(req), 15000, () => listArticlesPayload(req)));
    } catch (error) {
        console.error('List articles failed:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

function canPublishAnnouncement(user) {
    return user?.role === 'admin' || user?.role === 'super_admin';
}

function findPublicArticle(id) {
    return articleRepository.findPublishedArticleById(id);
}

function sendArticleMessages(req, res) {
    try {
        const article = findPublicArticle(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }

        setPublicReadCache(res, { maxAge: 5, stale: 20 });
        res.json(responseCache.remember(`public:article-messages:${req.params.id}`, 5000, () => ({
            success: true,
            data: messageRepository.listMessages({ articleId: req.params.id })
        })));
    } catch (error) {
        console.error('List article messages failed:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

router.get('/', sendArticleList);

// 创建文章：普通用户可发普通分类，公告类仅管理员可发。
router.get('/live/:nonce', sendArticleList);

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { title, excerpt, content, content_format, category, tags, read_time, cover_image, cover_image_asset_id } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        if (category === '公告' && !canPublishAnnouncement(req.user)) {
            return res.status(403).json({ success: false, message: '操作失败' });
        }

        const finalCategory = category || (canPublishAnnouncement(req.user) ? '公告' : '其他');
        const publishedAt = new Date().toISOString();
        const publishDate = publishedAt.slice(0, 10);
        const mediaPayload = await articleMedia.normalizeArticleMediaPayload({
            title,
            excerpt,
            content,
            contentFormat: content_format,
            category: finalCategory,
            tags,
            authorId: req.user.scope === 'admin' ? null : req.user.id,
            publishDate,
            publishedAt,
            readTime: read_time,
            coverImage: cover_image,
            coverImageAssetId: cover_image_asset_id
        }, { ownerId: req.user.scope === 'admin' ? null : req.user.id });
        const newArticle = articleRepository.createArticle(mediaPayload);
        articleMedia.attachAssetsToArticle(mediaPayload.mediaAssetIds, newArticle.id);
        responseCache.delPrefix('public:articles:');
        responseCache.delPrefix('public:stats');
        responseCache.delPrefix('public:site-feed');
        res.status(201).json({ success: true, message: '操作成功', data: newArticle });
    } catch (error) {
        console.error('Create article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 单篇文章读取会顺便累计阅读数。
router.get('/:id/messages', sendArticleMessages);

router.get('/:id/messages/live/:nonce', sendArticleMessages);

router.get('/:id/live/:nonce', (req, res) => {
    try {
        const article = findPublicArticle(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }

        articleRepository.incrementArticleViews(req.params.id);
        res.json({ success: true, data: withParsedTags(article) });
    } catch (error) {
        console.error('Get article failed:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/:id', (req, res) => {
    try {
        const article = findPublicArticle(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        articleRepository.incrementArticleViews(req.params.id);
        res.json({ success: true, data: withParsedTags(article) });
    } catch (error) {
        console.error('Get article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, excerpt, content, content_format, category, tags, read_time, cover_image, cover_image_asset_id } = req.body;
        const mediaPayload = await articleMedia.normalizeArticleMediaPayload({
            title: title || req.body.title,
            excerpt,
            content,
            contentFormat: content_format,
            category,
            tags,
            readTime: read_time,
            coverImage: cover_image,
            coverImageAssetId: cover_image_asset_id
        }, { articleId: req.params.id, ownerId: req.user.scope === 'admin' ? null : req.user.id });
        const updatedArticle = articleRepository.updateArticle(req.params.id, mediaPayload);
        articleMedia.attachAssetsToArticle(mediaPayload.mediaAssetIds, updatedArticle.id);
        responseCache.delPrefix('public:articles:');
        responseCache.delPrefix('public:site-feed');
        res.json({ success: true, message: '文章更新成功', data: updatedArticle });
    } catch (error) {
        console.error('Update article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        articleRepository.deleteArticle(req.params.id);
        responseCache.delPrefix('public:articles:');
        responseCache.delPrefix('public:article-messages:');
        responseCache.delPrefix('public:stats');
        responseCache.delPrefix('public:site-feed');
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('Delete article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
