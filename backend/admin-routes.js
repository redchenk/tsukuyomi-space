// 管理后台路由
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const Database = require('better-sqlite3');

// 引入统一认证中间件
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

// 连接数据库
const dbPath = path.join(__dirname, 'tsukuyomi.db');
const db = new Database(dbPath);

// 确保所有表存在
try {
    // 管理员表
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // 留言表
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            user_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 数据库迁移：为 messages 表添加新列
    const tableInfo = db.pragma("table_info('messages')");
    const columns = tableInfo.map(col => col.name);
    if (!columns.includes('author')) db.exec("ALTER TABLE messages ADD COLUMN author TEXT DEFAULT '匿名'");
    if (!columns.includes('status')) db.exec("ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'approved'");
    if (!columns.includes('parent_id')) db.exec("ALTER TABLE messages ADD COLUMN parent_id INTEGER");
    if (!columns.includes('like_count')) db.exec("ALTER TABLE messages ADD COLUMN like_count INTEGER DEFAULT 0");
    if (!columns.includes('article_id')) db.exec("ALTER TABLE messages ADD COLUMN article_id INTEGER");
    
    // 友链表
    db.exec(`
        CREATE TABLE IF NOT EXISTS friend_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // 配置表
    db.exec(`
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // 如果管理员表为空，创建默认管理员
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
    if (adminCount === 0) {
        const defaultPassword = bcrypt.hashSync('admin123', 10);
        db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)').run('admin', defaultPassword, 'super_admin');
        console.log('✓ 默认管理员已创建 (admin/admin123)');
    }
    
    console.log('✓ 数据库表已初始化');
} catch (error) {
    console.error('数据库初始化错误:', error);
}

// 管理员登录（不需要认证，公开接口）
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 验证输入
        if (!username || !password) {
            return res.status(400).json({ success: false, message: '请填写用户名和密码' });
        }

        // 从数据库查找管理员
        const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

        if (!admin) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }

        // 验证密码
        const validPassword = bcrypt.compareSync(password, admin.password_hash);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }

        // 生成 JWT (使用统一的 generateToken，管理员 token 有效期 24 小时)
        const token = generateToken(
            { id: "admin-001", username: admin.username, role: "admin" },
            '24h'
        );

        res.json({
            success: true,
            message: '登录成功',
            data: {
                token,
                admin: {
                    id: admin.id,
                    username: admin.username,
                    role: admin.role
                }
            }
        });
    } catch (error) {
        console.error('管理员登录错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 登录之后的所有管理接口都需要先解析 JWT，再检查管理员权限。
router.use(authenticateToken);

// 获取统计数据
router.get('/stats', requireAdmin, (req, res) => {
    try {
        // 查询文章总数
        const articlesCount = db.prepare('SELECT COUNT(*) as count FROM articles').get().count || 0;
        
        // 查询待审核留言数
        let pendingMessages = 0;
        try {
            pendingMessages = db.prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'pending'").get().count || 0;
        } catch (e) {
            console.log('messages 表不存在，使用默认值');
        }
        
        // 查询总访问量
        const totalViewsResult = db.prepare('SELECT SUM(view_count) as total FROM articles').get();
        const totalViews = totalViewsResult ? (totalViewsResult.total || 0) : 0;
        
        // 查询用户总数
        let userCount = 0;
        try {
            userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count || 0;
        } catch (e) {
            console.log('users 表查询错误');
        }

        res.json({
            success: true,
            data: {
                articles: articlesCount,
                pendingMessages: pendingMessages,
                todayViews: Math.floor(totalViews * 0.1) || 0,
                totalViews: totalViews || 0,
                users: userCount
            }
        });
    } catch (error) {
        console.error('获取统计数据错误:', error.message);
        res.status(500).json({ success: false, message: '服务器错误：' + error.message });
    }
});

// 获取访问统计数据
router.get('/analytics', requireAdmin, (req, res) => {
    try {
        let todayViews = 0;
        let weekViews = 0;
        let monthViews = 0;
        let totalEvents = 0;

        try {
            const row = db.prepare(`
                SELECT
                    SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) AS today,
                    SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week,
                    SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS month,
                    COUNT(*) AS total
                FROM stats
                WHERE event_type = 'view'
            `).get();
            todayViews = row?.today || 0;
            weekViews = row?.week || 0;
            monthViews = row?.month || 0;
            totalEvents = row?.total || 0;
        } catch (_) {}

        const articles = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(view_count), 0) as views FROM articles').get();
        const articleCount = articles?.count || 0;
        const articleViews = articles?.views || 0;
        const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages').get().count || 0;
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count || 0;

        const totalViews = Math.max(totalEvents, articleViews);
        if (!weekViews && totalViews) weekViews = totalViews;
        if (!monthViews && totalViews) monthViews = totalViews;

        res.json({
            success: true,
            data: {
                todayViews,
                weekViews,
                monthViews,
                totalViews,
                articleViews,
                articles: articleCount,
                messages: messageCount,
                users: userCount
            }
        });
    } catch (error) {
        console.error('获取访问统计错误:', error);
        res.status(500).json({ success: false, message: '服务器错误：' + error.message });
    }
});

// 获取文章列表
router.get('/articles', requireAdmin, (req, res) => {
    try {
        // 从数据库查询真实数据
        const articles = db.prepare('SELECT id, title, category, view_count, status, created_at FROM articles ORDER BY created_at DESC').all();
        
        res.json({ success: true, data: articles });
    } catch (error) {
        console.error('获取文章列表错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取单篇文章
router.get('/articles/:id', requireAdmin, (req, res) => {
    try {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
        
        if (!article) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }
        
        res.json({ success: true, data: article });
    } catch (error) {
        console.error('获取文章错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 更新文章
router.put('/articles/:id', requireAdmin, (req, res) => {
    try {
        const { title, excerpt, content, category, status, read_time, cover_image } = req.body;
        
        db.prepare(`
            UPDATE articles 
            SET title = ?,
                excerpt = ?,
                content = ?,
                category = ?,
                status = ?,
                read_time = COALESCE(?, read_time),
                cover_image = COALESCE(?, cover_image),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(title, excerpt || '', content || '', category || '随笔', status || 'published', read_time || null, cover_image || null, req.params.id);
        
        res.json({ success: true, message: '文章已更新' });
    } catch (error) {
        console.error('更新文章错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 切换文章状态
router.post('/articles/:id/toggle-status', requireAdmin, (req, res) => {
    try {
        const article = db.prepare('SELECT status FROM articles WHERE id = ?').get(req.params.id);
        
        if (!article) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }
        
        const newStatus = article.status === 'published' ? 'draft' : 'published';
        
        db.prepare('UPDATE articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStatus, req.params.id);
        
        res.json({ 
            success: true, 
            message: `文章已${newStatus === 'published' ? '上架' : '下架'}`,
            data: { status: newStatus }
        });
    } catch (error) {
        console.error('切换文章状态错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取留言列表
router.get('/messages', requireAdmin, (req, res) => {
    try {
        // 从数据库查询真实数据（适配现有表结构）
        const messages = db.prepare(`
            SELECT id, COALESCE(author, '匿名') as username, content, COALESCE(status, 'approved') as status, created_at
            FROM messages
            ORDER BY created_at DESC
        `).all() || [];
        
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('获取留言列表错误:', error.message);
        res.status(500).json({ success: false, message: '服务器错误：' + error.message });
    }
});

// 通过留言
router.post('/messages/:id/approve', requireAdmin, (req, res) => {
    try {
        db.prepare("UPDATE messages SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(req.params.id);
        
        res.json({ success: true, message: '留言已通过' });
    } catch (error) {
        console.error('通过留言错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 删除留言
router.delete('/messages/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
        
        res.json({ success: true, message: '留言已删除' });
    } catch (error) {
        console.error('删除留言错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 确保友链表存在
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS friend_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
} catch (error) {
    console.error('创建友链表错误:', error);
}

// 获取友链列表
router.get('/links', requireAdmin, (req, res) => {
    try {
        const links = db.prepare('SELECT * FROM friend_links ORDER BY created_at DESC').all();
        
        res.json({ success: true, data: links });
    } catch (error) {
        console.error('获取友链列表错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 添加友链
router.post('/links', requireAdmin, (req, res) => {
    try {
        const { name, url } = req.body;
        
        db.prepare('INSERT INTO friend_links (name, url) VALUES (?, ?)').run(name, url);
        
        res.json({ success: true, message: '友链已添加' });
    } catch (error) {
        console.error('添加友链错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 删除友链
router.delete('/links/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM friend_links WHERE id = ?').run(req.params.id);
        
        res.json({ success: true, message: '友链已删除' });
    } catch (error) {
        console.error('删除友链错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 确保配置表存在
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // 初始化默认配置
    const configCount = db.prepare('SELECT COUNT(*) as count FROM site_settings').get().count;
    if (configCount === 0) {
        db.exec(`
            INSERT INTO site_settings (key, value) VALUES
            ('siteTitle', '月读空间'),
            ('siteAnnouncement', '欢迎访问月读空间'),
            ('sakuraEffect', 'true'),
            ('scanlineEffect', 'true')
        `);
    }
} catch (error) {
    console.error('配置表初始化错误:', error);
}

// 获取系统配置
router.get('/settings', requireAdmin, (req, res) => {
    try {
        const settings = db.prepare('SELECT * FROM site_settings').all();
        const config = {};
        settings.forEach(s => {
            config[s.key] = s.value === 'true' ? true : (s.value === 'false' ? false : s.value);
        });
        
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('获取配置错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 保存系统配置
router.post('/settings', requireAdmin, (req, res) => {
    try {
        const { siteTitle, siteAnnouncement, sakuraEffect, scanlineEffect } = req.body;

        const updateStmt = db.prepare('UPDATE site_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');

        updateStmt.run(siteTitle, 'siteTitle');
        updateStmt.run(siteAnnouncement, 'siteAnnouncement');
        updateStmt.run(sakuraEffect ? 'true' : 'false', 'sakuraEffect');
        updateStmt.run(scanlineEffect ? 'true' : 'false', 'scanlineEffect');

        res.json({ success: true, message: '配置已保存' });
    } catch (error) {
        console.error('保存配置错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 删除文章
router.delete('/articles/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: '文章已删除' });
    } catch (error) {
        console.error('删除文章错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 删除用户
router.delete('/users/:id', requireAdmin, (req, res) => {
    try {
        const userId = req.params.id;
        // 禁止删除 admin 用户
        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        if (user.username === 'admin') {
            return res.status(403).json({ success: false, message: '不能删除管理员账号' });
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        res.json({ success: true, message: '用户已删除' });
    } catch (error) {
        console.error('删除用户错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取用户列表
router.get('/users', requireAdmin, (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, username, email, role, created_at
            FROM users
            ORDER BY created_at DESC
        `).all();

        res.json({ success: true, data: users });
    } catch (error) {
        console.error('获取用户列表错误:', error);
        res.status(500).json({ success: false, message: '服务器错误：' + error.message });
    }
});

// 获取友链列表
router.get('/links', requireAdmin, (req, res) => {
    try {
        // 从 system_settings 表查询友链
        const links = db.prepare(`
            SELECT setting_key, setting_value
            FROM system_settings
            WHERE setting_key LIKE 'link_%'
        `).all();

        const linksData = links.map(l => ({
            key: l.setting_key,
            name: l.setting_key.replace('link_', ''),
            url: l.setting_value
        }));

        res.json({ success: true, data: linksData });
    } catch (error) {
        // 如果表不存在，返回空数组
        console.log('友链表不存在，返回默认值');
        res.json({ success: true, data: [] });
    }
});

module.exports = router;
