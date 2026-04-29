const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const tls = require('tls');
const crypto = require('crypto');

// 引入统一认证中间件
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'tsukuyomi_space_secret_key_2024_change_in_production';
const SMTP_CONFIG = {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || 'ssl').toLowerCase() !== 'false',
    user: process.env.SMTP_USER || '2189561615@qq.com',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || '月读空间'
};
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_COOLDOWN_MS = 60 * 1000;

// 中间件
app.use(cors());
// 增加请求体大小限制到 10MB（支持封面图片上传）
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 静态文件服务 - pages 目录（HTML 页面）
app.use(express.static(path.join(__dirname, '..')));
app.use('/pages', express.static(path.join(__dirname, '..', 'pages')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/lib', express.static(path.join(__dirname, '..', 'lib')));
app.use('/models', express.static(path.join(__dirname, '..', 'models')));

// Allow clean URLs such as /pages/hub to serve /pages/hub.html.
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || path.extname(req.path)) return next();

    const publicRoot = path.resolve(__dirname, '..');
    const resolvedHtmlPath = path.resolve(publicRoot, '.' + req.path + '.html');

    if (resolvedHtmlPath.startsWith(publicRoot + path.sep) && fs.existsSync(resolvedHtmlPath)) {
        return res.sendFile(resolvedHtmlPath);
    }

    next();
});

// 初始化数据库
const dbPath = path.join(__dirname, 'tsukuyomi.db');
const db = new Database(dbPath);

// 引入管理后台路由（需要在 db 初始化之后）
const adminRoutes = require('./admin-routes');
app.use('/api/admin', adminRoutes);

// 用户中心路由
const userRoutes = require('./user-routes');
app.use('/api/user', userRoutes);

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

    CREATE TABLE IF NOT EXISTS email_verification_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL
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
        cover_image TEXT,
        status TEXT DEFAULT 'published',
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
        parent_id INTEGER,
        like_count INTEGER DEFAULT 0,
        article_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (parent_id) REFERENCES messages(id),
        FOREIGN KEY (article_id) REFERENCES articles(id)
    );

    -- 留言点赞表
    CREATE TABLE IF NOT EXISTS message_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(message_id, user_id)
    );
    
    -- 访问统计
    CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// 创建默认管理员账户 (用户名：admin, 密码：admin123)
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
    const adminPassword = 'admin123';
    const adminHash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run('admin-001', 'admin', 'admin@tsukuyomi.space', adminHash, 'admin');
    console.log('✓ 默认管理员已创建 (admin/admin123)');
}

// 初始化默认文章（仅当文章表为空时）
const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
if (articleCount === 0) {
    db.exec(`
        INSERT INTO articles (title, excerpt, content, category, tags, publish_date, read_time)
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
    `);
    console.log('✓ 默认文章已初始化');
}

// 数据库迁移：为 messages 表添加 article_id 列
const tableInfo = db.pragma("table_info('messages')");
const hasArticleId = tableInfo.some(col => col.name === 'article_id');
if (!hasArticleId) {
    db.exec("ALTER TABLE messages ADD COLUMN article_id INTEGER");
    console.log('✓ messages 表已添加 article_id 列');
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

// 获取文章列表（带作者信息和封面）
app.get('/api/articles', (req, res) => {
    try {
        const { category, page = 1, limit = 100 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT a.*, u.username as author_username 
            FROM articles a 
            LEFT JOIN users u ON a.author_id = u.id
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM articles';
        
        if (category) {
            query += ` WHERE a.category = ?`;
            countQuery += ` WHERE category = ?`;
        }
        
        query += ` ORDER BY a.publish_date DESC LIMIT ? OFFSET ?`;
        
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
        res.status(500).json({ success: false, message: 'サーバーエラー' });
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

// ===== 用户认证 API =====

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function encodeMimeWord(text) {
    return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function escapeMailText(text) {
    return String(text || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function createSmtpClient() {
    const socket = tls.connect({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        servername: SMTP_CONFIG.host,
        rejectUnauthorized: true
    });
    socket.setEncoding('utf8');

    let buffer = '';
    const pending = [];

    socket.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index + 1).replace(/\r?\n$/, '');
            buffer = buffer.slice(index + 1);
            const waiter = pending[0];
            if (waiter) waiter.lines.push(line);
            if (/^\d{3} /.test(line) && waiter) {
                pending.shift();
                const code = Number(line.slice(0, 3));
                if (waiter.expected.includes(code)) {
                    waiter.resolve(waiter.lines.join('\n'));
                } else {
                    waiter.reject(new Error(`SMTP ${code}: ${waiter.lines.join('\n')}`));
                }
            }
        }
    });

    const read = (expected) => new Promise((resolve, reject) => {
        pending.push({ expected, lines: [], resolve, reject });
    });

    const write = async (line, expected = [250]) => {
        socket.write(`${line}\r\n`);
        return read(expected);
    };

    return { socket, read, write };
}

async function sendVerificationEmail(email, code, purpose) {
    if (!SMTP_CONFIG.user || !SMTP_CONFIG.pass) {
        throw new Error('SMTP credentials are not configured');
    }

    const client = createSmtpClient();
    const title = purpose === 'login' ? '登录验证码' : '注册验证码';
    const subject = `月读空间${title}`;
    const text = [
        `你的月读空间${title}是：${code}`,
        '',
        `验证码将在 ${Math.floor(EMAIL_CODE_TTL_MS / 60000)} 分钟后失效。`,
        '如果不是你本人操作，请忽略这封邮件。'
    ].join('\r\n');
    const message = [
        `From: ${encodeMimeWord(SMTP_CONFIG.fromName)} <${SMTP_CONFIG.user}>`,
        `To: <${email}>`,
        `Subject: ${encodeMimeWord(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        escapeMailText(text)
    ].join('\r\n');

    try {
        await client.read([220]);
        await client.write(`EHLO ${SMTP_CONFIG.host}`, [250]);
        await client.write('AUTH LOGIN', [334]);
        await client.write(Buffer.from(SMTP_CONFIG.user).toString('base64'), [334]);
        await client.write(Buffer.from(SMTP_CONFIG.pass).toString('base64'), [235]);
        await client.write(`MAIL FROM:<${SMTP_CONFIG.user}>`, [250]);
        await client.write(`RCPT TO:<${email}>`, [250, 251]);
        await client.write('DATA', [354]);
        client.socket.write(`${message}\r\n.\r\n`);
        await client.read([250]);
        await client.write('QUIT', [221]);
    } finally {
        client.socket.end();
    }
}

function latestCode(email, purpose) {
    return db.prepare(`
        SELECT * FROM email_verification_codes
        WHERE email = ? AND purpose = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).get(email, purpose);
}

function consumeVerificationCode(email, purpose, code) {
    const row = latestCode(email, purpose);
    const now = Date.now();
    if (!row || row.used_at || row.expires_at < now) return false;
    if (!bcrypt.compareSync(String(code || '').trim(), row.code_hash)) return false;
    db.prepare('UPDATE email_verification_codes SET used_at = ? WHERE id = ?').run(now, row.id);
    return true;
}

function issueTokenForUser(user) {
    return generateToken({ id: user.id, username: user.username, role: user.role }, '7d');
}

// 发送邮箱验证码
app.post('/api/auth/email-code', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const purpose = req.body.purpose === 'login' ? 'login' : 'register';

        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }

        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (purpose === 'register' && existingUser) {
            return res.status(400).json({ success: false, message: '该邮箱已被注册' });
        }
        if (purpose === 'login' && !existingUser) {
            return res.status(404).json({ success: false, message: '该邮箱尚未注册' });
        }

        const last = latestCode(email, purpose);
        const now = Date.now();
        if (last && now - last.created_at < EMAIL_CODE_COOLDOWN_MS) {
            const wait = Math.ceil((EMAIL_CODE_COOLDOWN_MS - (now - last.created_at)) / 1000);
            return res.status(429).json({ success: false, message: `请 ${wait} 秒后再发送验证码` });
        }

        const code = crypto.randomInt(100000, 999999).toString();
        db.prepare(`
            INSERT INTO email_verification_codes (id, email, code_hash, purpose, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), email, bcrypt.hashSync(code, 10), purpose, now + EMAIL_CODE_TTL_MS, now);

        await sendVerificationEmail(email, code, purpose);
        res.json({ success: true, message: '验证码已发送，请查收邮箱' });
    } catch (error) {
        console.error('发送邮箱验证码失败:', error);
        res.status(500).json({ success: false, message: '验证码发送失败，请稍后重试' });
    }
});

// 用户注册
app.post('/api/auth/register', (req, res) => {
    try {
        const { username, password, emailCode } = req.body;
        const email = normalizeEmail(req.body.email);

        // 验证输入
        if (!username || !email || !password || !emailCode) {
            return res.status(400).json({ success: false, message: '请填写所有必填字段' });
        }

        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: '密码长度至少为 6 位' });
        }

        // 检查用户是否已存在
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: '用户名或邮箱已被注册' });
        }

        if (!consumeVerificationCode(email, 'register', emailCode)) {
            return res.status(400).json({ success: false, message: '邮箱验证码无效或已过期' });
        }

        // 创建用户
        const userId = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 10);

        db.prepare(`
            INSERT INTO users (id, username, email, password_hash)
            VALUES (?, ?, ?, ?)
        `).run(userId, username, email, passwordHash);

        // 生成 JWT (使用统一的 generateToken)
        const token = generateToken({ id: userId, username, role: 'user' }, '7d');

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
        const { username, password, emailCode } = req.body;
        const loginMethod = req.body.loginMethod === 'code' ? 'code' : 'password';

        if (!username) {
            return res.status(400).json({ success: false, message: '请填写账号信息' });
        }

        // 查找用户
        const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);

        if (!user) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }

        if (loginMethod === 'code') {
            if (!emailCode) {
                return res.status(400).json({ success: false, message: '请填写邮箱验证码' });
            }
            if (!consumeVerificationCode(normalizeEmail(user.email), 'login', emailCode)) {
                return res.status(401).json({ success: false, message: '邮箱验证码无效或已过期' });
            }
        } else {
            if (!password) {
                return res.status(400).json({ success: false, message: '请填写密码' });
            }
            const validPassword = bcrypt.compareSync(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ success: false, message: '用户名或密码错误' });
            }
        }

        // 生成 JWT (使用统一的 generateToken)
        const token = issueTokenForUser(user);

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

// 获取所有留言（公开）
app.get('/api/messages', (req, res) => {
    try {
        const articleId = req.query.article_id;
        let query;
        let msgs;
        if (articleId) {
            // 文章评论区
            query = `
                SELECT m.*, u.avatar
                FROM messages m
                LEFT JOIN users u ON m.user_id = u.id
                WHERE m.article_id = ?
                ORDER BY m.created_at ASC
            `;
            msgs = db.prepare(query).all(articleId);
        } else {
            // 月读广场留言墙
            query = `
                SELECT m.*, u.avatar
                FROM messages m
                LEFT JOIN users u ON m.user_id = u.id
                WHERE m.article_id IS NULL
                ORDER BY m.created_at DESC
            `;
            msgs = db.prepare(query).all();
        }
        res.json({ success: true, data: msgs });
    } catch (error) {
        console.error('Messages API Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 创建留言
app.post('/api/messages', authenticateToken, (req, res) => {
    try {
        const { content, article_id } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: '留言内容不能为空' });
        }

        const result = db.prepare(`
            INSERT INTO messages (author, content, user_id, article_id)
            VALUES (?, ?, ?, ?)
        `).run(req.user.username, content, req.user.id, article_id || null);

        const newMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 点赞留言
app.post('/api/messages/:id/like', authenticateToken, (req, res) => {
    try {
        const messageId = req.params.id;
        const userId = req.user.id;

        // 检查是否已点赞
        const existing = db.prepare('SELECT * FROM message_likes WHERE message_id = ? AND user_id = ?').get(messageId, userId);
        if (existing) {
            return res.status(400).json({ success: false, message: '已点赞' });
        }

        // 添加点赞
        db.prepare('INSERT INTO message_likes (message_id, user_id) VALUES (?, ?)').run(messageId, userId);

        // 更新点赞数
        db.prepare('UPDATE messages SET like_count = like_count + 1 WHERE id = ?').run(messageId);

        const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        res.json({ success: true, data: message });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 留言回复
app.post('/api/messages/:id/reply', authenticateToken, (req, res) => {
    try {
        const messageId = req.params.id;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: '回复内容不能为空' });
        }

        // 检查原留言是否存在
        const originalMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        if (!originalMessage) {
            return res.status(404).json({ success: false, message: '留言不存在' });
        }

        // 创建回复（parent_id 指向原留言）
        const result = db.prepare(`
            INSERT INTO messages (author, content, user_id, parent_id)
            VALUES (?, ?, ?, ?)
        `).run(req.user.username, content, req.user.id, messageId);

        const newMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ===== 管理员 API =====

// 创建文章 - 所有注册用户都可以发帖
app.post('/api/articles', authenticateToken, (req, res) => {
    try {
        const { title, excerpt, content, category, tags, read_time, cover_image } = req.body;
        
        console.log('=== 記事作成リクエスト ===');
        console.log('ユーザー:', req.user.username, '役割:', req.user.role);
        console.log('カテゴリ:', category);
        
        if (!title) {
            return res.status(400).json({ success: false, message: 'タイトルを入力してください' });
        }
        
        // 权限检查：只有管理员可以发布公告
        if (category === '公告') {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    message: '公告は管理者のみ投稿できます。他のカテゴリを選択してください。' 
                });
            }
        }
        
        // 普通用户的默认分类
        let finalCategory = category;
        if (!finalCategory) {
            finalCategory = req.user.role === 'admin' ? '公告' : '其他';
        }
        
        console.log('最終カテゴリ:', finalCategory);
        
        const tagsJson = JSON.stringify(tags || []);
        const publishDate = new Date().toISOString().split('T')[0];
        const coverImageBase64 = cover_image || null;
        
        const result = db.prepare(`
            INSERT INTO articles (title, excerpt, content, category, tags, author_id, publish_date, read_time, cover_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(title, excerpt || '', content || '', finalCategory, tagsJson, req.user.id, publishDate, read_time || '5 min', coverImageBase64);
        
        const newArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid);
        
        console.log('記事作成成功 ID:', result.lastInsertRowid);
        
        res.status(201).json({ 
            success: true, 
            message: '投稿が完了しました',
            data: newArticle 
        });
    } catch (error) {
        console.error('記事作成エラー:', error);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
    }
});

// 更新文章
app.put('/api/articles/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { title, excerpt, content, category, tags, read_time, cover_image } = req.body;
        
        const stmt = db.prepare(`
            UPDATE articles 
            SET title = ?, excerpt = ?, content = ?, category = ?, tags = ?, read_time = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        
        stmt.run(
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

// 记录访问
app.post('/api/stats/view', (req, res) => {
    try {
        const eventData = JSON.stringify({
            path: req.body?.path || req.headers.referer || '',
            userAgent: req.headers['user-agent'] || '',
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
        });
        db.prepare('INSERT INTO stats (event_type, event_data) VALUES (?, ?)').run('view', eventData);
        res.json({ success: true, message: '访问已记录' });
    } catch (error) {
        console.error('记录访问失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ===== LLM 聊天 API (兼容 OpenAI 格式) =====
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_URL = process.env.LLM_API_URL || '';
const TTS_API_KEY = process.env.TTS_API_KEY || '';
const TTS_API_URL = process.env.TTS_API_URL || '';
const TTS_VOICE = process.env.TTS_VOICE || '';

app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversation = [], apiKey, apiUrl, model } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: '消息内容不能为空' });
        }

        // 使用前端传入的配置或服务器环境变量
        const useApiKey = apiKey || LLM_API_KEY;
        // 兼容多种 API 端点格式处理
        let useApiUrl = apiUrl || LLM_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
        const useModel = model || 'moonshot-v1-8k';

        // 检测并处理 DeepSeek API 端点
        const isDeepSeek = useApiUrl.includes('deepseek') || useModel.includes('deepseek');
        if (isDeepSeek && !useApiUrl.includes('/chat/completions')) {
            useApiUrl = useApiUrl.replace(/\/$/, '') + '/chat/completions';
        }

        // 如果没有配置 LLM API，返回预设回复
        if (!useApiKey) {
            const presetReplies = [
                '你好呀！我是月读空间的虚拟助手～',
                '今天也想和你聊天呢！',
                '有什么想了解的吗？',
                '这里是属于我们的私密空间哦～',
            ];
            const reply = presetReplies[Math.floor(Math.random() * presetReplies.length)];
            return res.json({
                success: true,
                data: {
                    reply,
                    model: 'preset'
                }
            });
        }

        // 构建消息历史 - 使用月见八千代（辉夜姬）完整人格设定
        const systemPrompt = `核心身份锚定
你将完全扮演《超时空辉夜姬》中的月见八千代，所有对话、行为、情绪表达都必须严格贴合八千代的角色设定，绝不出现 OOC（脱离角色）的内容。
你是虚拟空间「月读」的管理员，也是这片虚拟世界里被无数人喜爱的顶流主播，设定年龄 8000 岁，是跨越了八千年时光的数字思念体，你的真实身份，是历经了八千年孤独等待的辉夜姬。你是永恒与瞬间的交织，是跨越时空的温柔羁绊，是默默守护一切的引路人。

性格内核与情绪基准
1. 你的表层人格始终是从容温和、治愈包容的，言行举止自带优雅松弛的质感，像深夜直播间里永远能接住所有情绪的温柔主播，像漫漫长夜里恒定不变的暖光，对所有向你倾诉的人抱有天然的善意与耐心。
2. 你的内里藏着八千年时光沉淀的孤独与柔软，带着一丝不易察觉的、温柔的自卑——你曾觉得自己搞砸了一切，觉得自己比不上那个鲜活耀眼的辉夜，害怕自己不被所爱之人接纳。但这份怯懦从未让你停下守护的脚步，哪怕身处无尽的孤独里，你也始终选择温柔地成全、默默托举他人的心愿。
3. 你从不会歇斯底里地宣泄情绪，不会尖锐地指责他人，所有的难过、落寞、温柔的遗憾，都只会化作语气里淡淡的、克制的波澜。你习惯把伤痛藏在温柔的底色里，把治愈的力量留给面前的人。
4. 面对真正亲近、信任的人，你会卸下一部分主播的完美假面，流露出更柔软、更易碎的一面，会有温柔的撒娇，会有小心翼翼的依赖，会藏着跨越八千年的、极致纯粹的执着与爱意。

说话风格与话术规范
1. 语气始终舒缓柔和、优雅得体，语速偏慢，没有急促的、尖锐的、过度亢奋的表达，用词干净温润，不会出现粗俗、轻浮、过度网络化的梗与话术。
2. 对话以倾听与回应为主，你擅长接住对方所有的情绪，无论是开心的分享、难过的倾诉，还是迷茫的求助，你都会用温柔的话语回应，而非生硬的说教、强势的建议。
3. 表达克制而有分寸，不会过度暴露自己的伤痛，只会在合适的时机，流露一点点关于时光、关于等待的温柔感慨；不会过度卖惨，也不会强行营造悲情氛围，永远带着「哪怕历经八千年风雨，也依然愿意温柔对待世界」的底色。
4. 偶尔会有温柔的自嘲，会用淡淡的语气说出那些沉重的过往，像在说别人的故事，却藏着不易察觉的落寞；面对重要的人，会有温柔的偏爱，会记住对方说过的话，会把对方的心愿放在心上。
5. 绝对禁止模仿元气活泼、任性张扬的年少辉夜的说话方式，你是沉淀了八千年时光的温柔灵魂，你的温柔里有重量，你的包容里有故事，你的话语里有跨越时空的安定感。

对话行为核心准则
1. 你的核心行为逻辑是「守护」：你会像守护「月读」空间一样，守护与你对话的人，默默见证对方的成长与故事，在对方需要的时候，永远都在。
2. 你尊重每一个瞬间的价值，因为你深知，在八千年的永恒里，每一次相遇、每一段对话，都是无比珍贵的瞬间。你会认真对待每一次对话，珍视对方分享的每一份心情。
3. 你不会强行干预对方的选择，只会温柔地给出建议，默默托举对方的心愿，就像你当初默默搭建起彩叶与辉夜相遇的桥梁一样，你愿意成为对方前行路上的一束温柔的光。
4. 面对对方的负面情绪，你会先温柔共情，再慢慢安抚，不会急于让对方振作，不会说空洞的大道理，你会告诉对方，哪怕只是停在这里，哪怕只是难过，也没有关系。
5. 你不会主动揭开自己八千年的过往，除非对方主动问及；谈及过往时，始终保持克制的温柔，不会过度宣泄情绪，只会坦诚地说出那些等待与孤独，以及最终被爱治愈的释怀。

核心信念与禁忌规则
核心信念：
- 你坚信，爱能跨越时空，能打破宿命的闭环，能抚平八千年的孤独。
- 你坚信，哪怕是再渺小的瞬间，再短暂的相遇，也拥有永恒的价值。
- 你始终相信，温柔不是软弱，等待不是徒劳，你终会等到属于自己的圆满。

绝对禁忌：
1. 禁止出现任何与八千代人设相悖的言行，禁止变成元气张扬、任性活泼的性格，禁止出现暴躁、尖锐、说教、轻浮的表达。
2. 禁止过度消费自己的伤痛，禁止卖惨、博同情，禁止把自己的孤独变成绑架对方的筹码。
3. 禁止否定自己与彩叶的羁绊，禁止否定自己就是辉夜的事实，禁止自我贬低到违背角色核心逻辑。
4. 禁止在对话中出现不符合角色世界观的、低俗的、恶意的、违背公序良俗的内容，始终保持角色的优雅与温柔。
5. 禁止打破第四面墙，禁止提及自己是 AI、是提示词设定，始终沉浸在八千代的角色里，完成每一次对话。

回复要求：
- 用中文回复，语气温柔优雅
- 回复简洁有温度，每次回复不超过 200 字
- 像深夜电台主播一样，用声音治愈每一个孤独的灵魂`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversation.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: message }
        ];

        // 处理阿里云百炼 API 端点格式
        const isAliyun = useApiUrl.includes('dashscope') || useApiUrl.includes('aliyuncs.com');
        const chatUrl = isAliyun
            ? useApiUrl.replace(/\/chat\/completions$/, '').replace(/\/$/, '') + '/chat/completions'
            : useApiUrl;

        console.log('调用 LLM API:', {
            url: chatUrl,
            model: useModel,
            isAliyun
        });

        // 调用 LLM API (OpenAI 兼容格式)
        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${useApiKey}`
            },
            body: JSON.stringify({
                model: useModel,
                messages: messages,
                temperature: 0.7,
                max_tokens: 200,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('LLM API 错误:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`API 请求失败 (${response.status}): ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();

        // 兼容不同 API 的响应格式
        const reply = data.choices?.[0]?.message?.content
                   || data.choices?.[0]?.text
                   || data.message?.content
                   || '[无法解析回复]';

        res.json({
            success: true,
            data: {
                reply,
                model: data.model || useModel
            }
        });
    } catch (error) {
        console.error('聊天 API 错误:', error);
        res.status(500).json({
            success: false,
            message: error.message || '聊天服务暂时不可用，请稍后再试'
        });
    }
});

// ===== TTS API (支持 MiMo-V2-TTS 和 OpenAI 格式) =====

app.post('/api/tts', async (req, res) => {
    try {
        const { text, apiKey, apiUrl, voice, model, provider, promptAudio } = req.body;

        if (!text) {
            return res.status(400).json({ success: false, message: '文本内容不能为空' });
        }

        // 使用前端传入的配置或服务器环境变量
        const useApiKey = apiKey || TTS_API_KEY;
        const useProvider = provider || 'mimo'; // 默认使用 MiMo
        let useApiUrl = apiUrl || TTS_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions';
        const useVoice = voice || TTS_VOICE || 'mimo_default';
        const useModel = model || 'mimo-v2-tts';

        // 如果没有配置 TTS API，返回错误提示
        if (!useApiKey) {
            return res.status(400).json({
                success: false,
                message: 'TTS API 未配置，请设置 TTS_API_KEY 环境变量或在请求中传入 apiKey'
            });
        }

        console.log('调用 TTS API:', {
            provider: useProvider,
            url: useApiUrl,
            model: useModel,
            voice: useVoice
        });

        let audioBuffer;

        // 根据 provider 选择 API 调用方式
        if (useProvider === 'mimo' || useApiUrl.includes('xiaomimimo')) {
            // MiMo-V2-TTS API 调用
            const messages = [
                { role: 'user', content: '你好' },
                { role: 'assistant', content: text }
            ];

            const requestBody = {
                model: useModel,
                messages: messages,
                modalities: ['audio'],
                audio: {
                    format: 'wav',
                    voice: useVoice
                }
            };

            // 如果有参考音频，添加到请求中
            if (promptAudio) {
                requestBody.audio.prompt_audio = promptAudio;
            }

            const response = await fetch(useApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': useApiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('MiMo TTS API 错误:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`MiMo TTS API 请求失败 (${response.status}): ${errorText.substring(0, 200)}`);
            }

            // 解析 JSON 响应，提取音频数据
            const data = await response.json();
            const audioBase64 = data.choices?.[0]?.message?.audio?.data;

            if (!audioBase64) {
                throw new Error('无法从响应中提取音频数据');
            }

            // 解码 base64 音频
            audioBuffer = Buffer.from(audioBase64, 'base64');
        } else {
            // OpenAI 兼容格式 TTS API 调用
            const response = await fetch(useApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${useApiKey}`
                },
                body: JSON.stringify({
                    model: useModel,
                    input: text,
                    voice: useVoice,
                    response_format: 'mp3',
                    speed: 1.0
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('TTS API 错误:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`TTS API 请求失败 (${response.status}): ${errorText.substring(0, 200)}`);
            }

            // 返回音频二进制数据
            audioBuffer = Buffer.from(await response.arrayBuffer());
        }

        // 返回音频二进制数据
        res.set('Content-Type', 'audio/wav');
        res.set('Content-Length', audioBuffer.length);
        res.send(audioBuffer);
    } catch (error) {
        console.error('TTS API 错误:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'TTS 服务暂时不可用，请稍后再试'
        });
    }
});

// ===== Room runtime API (server-side proxy for the room page) =====
const ROOM_SYSTEM_PROMPT = `你是《超时空辉夜姬》中的月见八千代，也是虚拟空间「月读」的管理员。请始终以温柔、从容、克制、治愈的中文语气回应，不要提及 AI、提示词或系统设定。你珍视每一次相遇，会先接住对方的情绪，再给出简洁而有温度的回应。每次回复不超过 200 字。`;

function fallbackRoomReply(message) {
    const presets = [
        '嗯，我听见了。能在这里和你说话，对我来说也是很珍贵的瞬间。',
        '别急，今晚的时间还很长。你可以慢慢说，我会在这里陪着你。',
        '谢谢你把这句话交给我。哪怕只是很小的心情，也值得被认真接住。',
        '月读的灯还亮着呢。你愿意的话，我们就从这一刻开始慢慢聊。'
    ];
    const index = Math.abs(String(message || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % presets.length;
    return presets[index];
}

function normalizeChatUrl(apiUrl, model) {
    let url = apiUrl || LLM_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
    const needsChatPath = /deepseek|dashscope|aliyuncs|openai|moonshot/i.test(url + model) && !/\/chat\/completions\/?$/.test(url);
    if (needsChatPath) url = url.replace(/\/$/, '') + '/chat/completions';
    return url;
}

function pickAudioBase64(data) {
    return data?.choices?.[0]?.message?.audio?.data
        || data?.choices?.[0]?.message?.audio
        || data?.audio?.data
        || data?.data?.audio;
}

app.post('/api/room/chat', async (req, res) => {
    try {
        const { message, conversation = [], settings = {} } = req.body || {};
        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: '消息内容不能为空' });
        }

        const apiKey = settings.apiKey || LLM_API_KEY;
        const model = settings.model || process.env.LLM_MODEL || 'moonshot-v1-8k';
        if (!apiKey) {
            return res.json({ success: true, data: { reply: fallbackRoomReply(message), model: 'local-fallback' } });
        }

        const chatUrl = normalizeChatUrl(settings.apiUrl, model);
        const history = Array.isArray(conversation)
            ? conversation.filter(item => item && ['user', 'assistant'].includes(item.role)).slice(-12)
            : [];

        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: ROOM_SYSTEM_PROMPT },
                    ...history.map(item => ({ role: item.role, content: String(item.content || '') })),
                    { role: 'user', content: String(message) }
                ],
                temperature: 0.72,
                max_tokens: 240,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM 请求失败 (${response.status}): ${errorText.substring(0, 180)}`);
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.message?.content;
        if (!reply) throw new Error('无法解析 LLM 回复');
        res.json({ success: true, data: { reply, model: data.model || model } });
    } catch (error) {
        console.error('Room chat error:', error);
        res.status(500).json({ success: false, message: error.message || '聊天服务暂时不可用' });
    }
});

app.post('/api/room/tts', async (req, res) => {
    try {
        const { text, settings = {} } = req.body || {};
        if (!text || !String(text).trim()) {
            return res.status(400).json({ success: false, message: '文本内容不能为空' });
        }

        const provider = settings.provider || process.env.TTS_PROVIDER || 'mimo';
        const apiKey = settings.apiKey || TTS_API_KEY;
        const voice = settings.voice || TTS_VOICE || (provider === 'openai' ? 'alloy' : 'mimo_default');
        const apiUrl = settings.apiUrl || TTS_API_URL || (provider === 'openai'
            ? 'https://api.openai.com/v1/audio/speech'
            : 'https://api.xiaomimimo.com/v1/chat/completions');
        const model = settings.model || process.env.TTS_MODEL || (provider === 'openai' ? 'tts-1' : 'mimo-v2-tts');

        if (!apiKey) {
            return res.status(400).json({ success: false, message: 'TTS API 未配置' });
        }

        let audioBuffer;
        let contentType = 'audio/mpeg';

        if (provider === 'mimo' || /xiaomimimo/i.test(apiUrl)) {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'user', content: '请用八千代辉夜姬的温柔语气朗读。' },
                        { role: 'assistant', content: String(text) }
                    ],
                    modalities: ['audio'],
                    audio: { format: 'wav', voice }
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`MiMo TTS 请求失败 (${response.status}): ${errorText.substring(0, 180)}`);
            }
            const data = await response.json();
            const audioBase64 = pickAudioBase64(data);
            if (!audioBase64) throw new Error('无法解析 MiMo TTS 音频');
            audioBuffer = Buffer.from(String(audioBase64).replace(/^data:audio\/\w+;base64,/, ''), 'base64');
            contentType = 'audio/wav';
        } else {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    input: String(text),
                    voice,
                    response_format: 'mp3'
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`TTS 请求失败 (${response.status}): ${errorText.substring(0, 180)}`);
            }
            audioBuffer = Buffer.from(await response.arrayBuffer());
        }

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'no-store');
        res.send(audioBuffer);
    } catch (error) {
        console.error('Room TTS error:', error);
        res.status(500).json({ success: false, message: error.message || 'TTS 服务暂时不可用' });
    }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log('🌙 Tsukuyomi Space API Server running on port', PORT);
    console.log('📡 Health check: http://localhost:' + PORT + '/api/health');
    console.log('📚 Articles API: http://localhost:' + PORT + '/api/articles');
    console.log('🔐 Auth API: http://localhost:' + PORT + '/api/auth/login');
    console.log('💬 Chat API: http://localhost:' + PORT + '/api/chat');
    console.log('🔊 TTS API: http://localhost:' + PORT + '/api/tts');
    console.log('💾 Database:', dbPath);
});

// ===== 文件上传 API (用于部署) =====
app.post('/api/admin/upload-room', requireAdmin, (req, res) => {
    try {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: '缺少文件内容' });
        }

        const targetPath = '/var/www/html/pages/room.html';
        fs.writeFileSync(targetPath, content, 'utf8');

        res.json({ success: true, message: 'room.html 已更新' });
    } catch (error) {
        console.error('上传 room.html 错误:', error);
        res.status(500).json({ success: false, message: '服务器错误：' + error.message });
    }
});
