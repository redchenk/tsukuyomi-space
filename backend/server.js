const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'tsukuyomi_space_secret_key_2024_change_in_production';

// 中间件
app.use(cors());
app.use(express.json());

// 初始化数据库
const dbPath = path.join(__dirname, 'tsukuyomi.db');
const db = new Database(dbPath);

// 创建数据表
db.exec(`
    -- 用户表
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        avatar TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- 文章表
    CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        excerpt TEXT,
        content TEXT,
        category TEXT DEFAULT '公告',
        tags TEXT DEFAULT '[]',
        author_id TEXT,
        publish_date TEXT,
        read_time TEXT DEFAULT '5 min',
        view_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id)
    );
    
    -- 留言表
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        user_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    -- 访问统计
    CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- 初始化默认文章
    INSERT OR IGNORE INTO articles (title, excerpt, content, category, tags, publish_date, read_time) 
    VALUES 
        ('欢迎来到月读空间', '跨越八千年时光，与你相遇的虚拟场域', 
         '这里是月读空间的第一篇文章。月读空间是《超时空辉夜姬！》中的虚拟空间，是梦想与希望交汇的地方...', 
         '公告', '["公告","欢迎"]', '2024-01-01', '3 min'),
        ('辉夜姬的传说', '来自月之都的公主，跨越千年的故事', 
         '在遥远的古代，月亮上存在着一个神秘而古老的文明——月之都。那里居住着拥有永恒生命的月之民...', 
         '传说', '["辉夜姬","传说"]', '2024-01-02', '5 min'),
        ('月读空间技术揭秘', '探索虚拟空间背后的技术架构', 
         '月读空间作为一个沉浸式虚拟场域，采用了最前沿的 VR 技术和神经接口技术...', 
         '技术', '["技术","VR"]', '2024-01-03', '8 min');
    
    -- 创建默认管理员账户 (用户名：admin, 密码：admin123)
    INSERT OR IGNORE INTO users (id, username, email, password_hash, role) 
    VALUES ('admin-001', 'admin', 'admin@tsukuyomi.space', 
            '$2a$10$rQZ9vXJXL5K5Z5Z5Z5Z5ZeYhQGYhQGYhQGYhQGYhQGYhQGYhQGYhQ', 'admin');
`);

// 更新默认管理员密码（首次运行）
const adminPassword = 'admin123';
const adminHash = bcrypt.hashSync(adminPassword, 10);
db.exec(`UPDATE users SET password_hash = '${adminHash}' WHERE username = 'admin'`);

// JWT 认证中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: '未提供认证令牌' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: '令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
}

// 管理员权限中间件
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: '需要管理员权限' });
    }
    next();
}

// ===== 公开 API =====

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Tsukuyomi Space API is running',
        timestamp: new Date().toISOString()
    });
});

// 获取文章列表
app.get('/api/articles', (req, res) => {
    try {
        const { category, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = 'SELECT * FROM articles';
        let countQuery = 'SELECT COUNT(*) as total FROM articles';
        
        if (category) {
            query += ` WHERE category = ?`;
            countQuery += ` WHERE category = ?`;
        }
        
        query += ` ORDER BY publish_date DESC LIMIT ? OFFSET ?`;
        
        const countStmt = db.prepare(countQuery);
        const stmt = db.prepare(query);
        
        let total;
        let articles;
        
        if (category) {
            total = countStmt.get(category);
            articles = stmt.all(category, parseInt(limit), parseInt(offset));
        } else {
            total = countStmt.get();
            articles = stmt.all(parseInt(limit), parseInt(offset));
        }
        
        // 解析 tags
        articles = articles.map(article => ({
            ...article,
            tags: typeof article.tags === 'string' ? JSON.parse(article.tags) : article.tags
        }));
        
        res.json({ 
            success: true, 
            data: articles,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.total,
                totalPages: Math.ceil(total.total / limit)
            }
        });
    } catch (error) {
        console.error('获取文章失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取单篇文章
app.get('/api/articles/:id', (req, res) => {
    try {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
        
        if (!article) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }
        
        // 增加阅读量
        db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(req.params.id);
        
        res.json({ 
            success: true, 
            data: {
                ...article,
                tags: typeof article.tags === 'string' ? JSON.parse(article.tags) : article.tags
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取留言列表
app.get('/api/messages', (req, res) => {
    try {
        const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 50').all();
        res.json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ===== 用户认证 API =====

// 用户注册
app.post('/api/auth/register', (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // 验证输入
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: '请填写所有必填字段' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: '密码长度至少为 6 位' });
        }
        
        // 检查用户是否已存在
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: '用户名或邮箱已被注册' });
        }
        
        // 创建用户
        const userId = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 10);
        
        db.prepare(`
            INSERT INTO users (id, username, email, password_hash)
            VALUES (?, ?, ?, ?)
        `).run(userId, username, email, passwordHash);
        
        // 生成 JWT
        const token = jwt.sign(
            { id: userId, username, role: 'user' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: '注册成功',
            data: {
                user: { id: userId, username, email, role: 'user' },
                token
            }
        });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 用户登录
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ success: false, message: '请填写用户名和密码' });
        }
        
        // 查找用户
        const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
        
        if (!user) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }
        
        // 验证密码
        const validPassword = bcrypt.compareSync(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }
        
        // 生成 JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            message: '登录成功',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar
                },
                token
            }
        });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取当前用户信息
app.get('/api/auth/me', authenticateToken, (req, res) => {
    try {
        const user = db.prepare('SELECT id, username, email, role, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ===== 需要认证的 API =====

// 创建留言
app.post('/api/messages', authenticateToken, (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, message: '留言内容不能为空' });
        }
        
        const result = db.prepare(`
            INSERT INTO messages (author, content, user_id)
            VALUES (?, ?, ?)
        `).run(req.user.username, content, req.user.id);
        
        const newMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
        
        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ===== 管理员 API =====

// 创建文章
app.post('/api/articles', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { title, excerpt, content, category, tags, read_time } = req.body;
        
        if (!title) {
            return res.status(400).json({ success: false, message: '文章标题不能为空' });
        }
        
        const tagsJson = JSON.stringify(tags || []);
        const publishDate = new Date().toISOString().split('T')[0];
        
        const result = db.prepare(`
            INSERT INTO articles (title, excerpt, content, category, tags, author_id, publish_date, read_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(title, excerpt || '', content || '', category || '公告', tagsJson, req.user.id, publishDate, read_time || '5 min');
        
        const newArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid);
        
        res.status(201).json({ 
            success: true, 
            message: '文章创建成功',
            data: newArticle 
        });
    } catch (error) {
        console.error('创建文章失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 更新文章
app.put('/api/articles/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { title, excerpt, content, category, tags, read_time } = req.body;
        
        const stmt = db.prepare(`
            UPDATE articles 
            SET title = ?, excerpt = ?, content = ?, category = ?, tags = ?, read_time = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        
        stmt.run(
            title || req.body.title,
            excerpt || '',
            content || '',
            category || '公告',
            JSON.stringify(tags || []),
            read_time || '5 min',
            req.params.id
        );
        
        const updatedArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
        
        res.json({ 
            success: true, 
            message: '文章更新成功',
            data: updatedArticle 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 删除文章
app.delete('/api/articles/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: '文章已删除' });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 获取所有用户（管理员）
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = db.prepare('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC').all();
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 网站统计
app.get('/api/stats', (req, res) => {
    try {
        const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
        
        res.json({
            success: true,
            data: {
                articles: articleCount,
                users: userCount,
                messages: messageCount,
                uptime: process.uptime()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log('🌙 Tsukuyomi Space API Server running on port', PORT);
    console.log('📡 Health check: http://localhost:' + PORT + '/api/health');
    console.log('📚 Articles API: http://localhost:' + PORT + '/api/articles');
    console.log('🔐 Auth API: http://localhost:' + PORT + '/api/auth/login');
    console.log('💾 Database:', dbPath);
});
