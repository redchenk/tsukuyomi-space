const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const articleRepository = require('../repositories/article-repository');
const { parsePositiveInt, safeJsonParse } = require('../validators');

const router = express.Router();

function withParsedTags(article) {
    return {
        ...article,
        tags: safeJsonParse(article.tags, [])
    };
}

function canPublishAnnouncement(user) {
    return user?.role === 'admin' || user?.role === 'super_admin';
}

// 公开文章列表：支持分类和分页，返回作者用户名用于前端展示。
router.get('/', (req, res) => {
    try {
        const { category } = req.query;
        const page = parsePositiveInt(req.query.page, 1);
        const limit = parsePositiveInt(req.query.limit, 100);
        const offset = (page - 1) * limit;

        const result = articleRepository.listArticles({ category, limit, offset });
        const articles = result.articles.map(withParsedTags);

        res.json({
            success: true,
            data: articles,
            pagination: {
                page,
                limit,
                total: result.total,
                totalPages: Math.ceil(result.total / limit)
            }
        });
    } catch (error) {
        console.error('List articles failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 创建文章：普通用户可发普通分类，公告类仅管理员可发。
router.post('/', authenticateToken, (req, res) => {
    try {
        const { title, excerpt, content, category, tags, read_time, cover_image } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        if (category === '公告' && !canPublishAnnouncement(req.user)) {
            return res.status(403).json({ success: false, message: '操作失败' });
        }

        const finalCategory = category || (canPublishAnnouncement(req.user) ? '公告' : '其他');
        const publishDate = new Date().toISOString().split('T')[0];
        const newArticle = articleRepository.createArticle({
            title,
            excerpt,
            content,
            category: finalCategory,
            tags,
            authorId: req.user.id,
            publishDate,
            readTime: read_time,
            coverImage: cover_image
        });
        res.status(201).json({ success: true, message: '操作成功', data: newArticle });
    } catch (error) {
        console.error('Create article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 单篇文章读取会顺便累计阅读数。
router.get('/:id', (req, res) => {
    try {
        const article = articleRepository.findArticleById(req.params.id);
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

router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { title, excerpt, content, category, tags, read_time, cover_image } = req.body;
        const updatedArticle = articleRepository.updateArticle(req.params.id, {
            title: title || req.body.title,
            excerpt,
            content,
            category,
            tags,
            readTime: read_time,
            coverImage: cover_image
        });
        res.json({ success: true, message: '文章更新成功', data: updatedArticle });
    } catch (error) {
        console.error('Update article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        articleRepository.deleteArticle(req.params.id);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('Delete article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
