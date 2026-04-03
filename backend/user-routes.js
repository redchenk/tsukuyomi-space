// 用户中心路由
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const { authenticateToken } = require('./middleware/auth');

// 初始化数据库
const dbPath = path.join(__dirname, 'tsukuyomi.db');
const db = new Database(dbPath);

// bio 字段迁移
try {
    db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
} catch (e) {
    console.log('bio 字段已存在');
}

// 获取当前用户资料
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT id, username, email, avatar, bio, role, created_at
            FROM users WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }

        res.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatar: user.avatar || '',
                bio: user.bio || '',
                role: user.role,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error('获取用户资料失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 更新用户资料
router.put('/profile', authenticateToken, (req, res) => {
    try {
        const { bio } = req.body;

        db.prepare(`
            UPDATE users SET bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(bio || '', req.user.id);

        res.json({ success: true, message: '资料已更新' });
    } catch (error) {
        console.error('更新用户资料失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 上传头像
router.post('/avatar', authenticateToken, (req, res) => {
    try {
        const { avatar } = req.body;

        if (!avatar) {
            return res.status(400).json({ success: false, message: '请提供头像图片' });
        }

        db.prepare(`
            UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(avatar, req.user.id);

        res.json({
            success: true,
            message: '头像已更新',
            data: { avatar }
        });
    } catch (error) {
        console.error('上传头像失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 修改密码
router.put('/password', authenticateToken, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: '请填写所有字段' });
        }

        // 获取当前用户
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }

        // 验证当前密码
        const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ success: false, message: '当前密码错误' });
        }

        // 加密新密码
        const passwordHash = bcrypt.hashSync(newPassword, 10);
        db.prepare(`
            UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(passwordHash, req.user.id);

        res.json({ success: true, message: '密码已修改' });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取用户的文章列表
router.get('/articles', authenticateToken, (req, res) => {
    try {
        const articles = db.prepare(`
            SELECT id, title, category, view_count, status, created_at, updated_at
            FROM articles WHERE author_id = ?
            ORDER BY created_at DESC
        `).all(req.user.id);

        res.json({ success: true, data: articles });
    } catch (error) {
        console.error('获取用户文章失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取用户的单篇文章（用于编辑）
router.get('/articles/:id', authenticateToken, (req, res) => {
    try {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);

        if (!article) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        // 检查是否是文章作者或管理员
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '无权限查看此文章' });
        }

        res.json({ success: true, data: article });
    } catch (error) {
        console.error('获取文章失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 删除用户的文章
router.delete('/articles/:id', authenticateToken, (req, res) => {
    try {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);

        if (!article) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        // 检查是否是文章作者或管理员
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '无权限删除此文章' });
        }

        db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);

        res.json({ success: true, message: '文章已删除' });
    } catch (error) {
        console.error('删除文章失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 更新用户的文章
router.put('/articles/:id', authenticateToken, (req, res) => {
    try {
        const { title, excerpt, content, category, read_time, cover_image } = req.body;
        const articleId = req.params.id;

        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);

        if (!article) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        // 检查是否是文章作者或管理员
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '无权限编辑此文章' });
        }

        db.prepare(`
            UPDATE articles SET
                title = ?, excerpt = ?, content = ?, category = ?,
                read_time = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(title, excerpt || '', content || '', category, read_time || '5 min', cover_image || null, articleId);

        const updatedArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);

        res.json({
            success: true,
            message: '文章已更新',
            data: updatedArticle
        });
    } catch (error) {
        console.error('更新文章失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
