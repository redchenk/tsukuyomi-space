const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { parsePositiveInt, safeJsonParse } = require('../validators');

const router = express.Router();

function withParsedTags(article) {
    return {
        ...article,
        tags: safeJsonParse(article.tags, [])
    };
}

// 公开文章列表：支持分类和分页，返回作者用户名用于前端展示。
router.get('/', (req, res) => {
    try {
        const { category } = req.query;
        const page = parsePositiveInt(req.query.page, 1);
        const limit = parsePositiveInt(req.query.limit, 100);
        const offset = (page - 1) * limit;

        let query = `
            SELECT a.*, u.username AS author_username
            FROM articles a
            LEFT JOIN users u ON a.author_id = u.id
        `;
        let countQuery = 'SELECT COUNT(*) AS total FROM articles';
        const params = [];

        if (category) {
            query += ' WHERE a.category = ?';
            countQuery += ' WHERE category = ?';
            params.push(category);
        }

        query += ' ORDER BY a.publish_date DESC LIMIT ? OFFSET ?';

        const total = db.prepare(countQuery).get(...params).total;
        const articles = db.prepare(query).all(...params, limit, offset).map(withParsedTags);

        res.json({
            success: true,
            data: articles,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
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

        if (category === '公告' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '操作失败' });
        }

        const finalCategory = category || (req.user.role === 'admin' ? '公告' : '其他');
        const publishDate = new Date().toISOString().split('T')[0];
        const result = db.prepare(`
            INSERT INTO articles (title, excerpt, content, category, tags, author_id, publish_date, read_time, cover_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            title,
            excerpt || '',
            content || '',
            finalCategory,
            JSON.stringify(tags || []),
            req.user.id,
            publishDate,
            read_time || '5 min',
            cover_image || null
        );

        const newArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, message: '操作成功', data: newArticle });
    } catch (error) {
        console.error('Create article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 单篇文章读取会顺便累计阅读数。
router.get('/:id', (req, res) => {
    try {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(req.params.id);
        res.json({ success: true, data: withParsedTags(article) });
    } catch (error) {
        console.error('Get article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { title, excerpt, content, category, tags, read_time, cover_image } = req.body;
        db.prepare(`
            UPDATE articles
            SET title = ?, excerpt = ?, content = ?, category = ?, tags = ?, read_time = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            title || req.body.title,
            excerpt || '',
            content || '',
            category || '公告',
            JSON.stringify(tags || []),
            read_time || '5 min',
            cover_image !== undefined ? cover_image : null,
            req.params.id
        );

        const updatedArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
        res.json({ success: true, message: '文章更新成功', data: updatedArticle });
    } catch (error) {
        console.error('Update article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('Delete article failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
