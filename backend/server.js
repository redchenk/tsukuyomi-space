const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const tls = require('tls');
const crypto = require('crypto');
const config = require('./config');
const { securityHeaders, createRateLimiter } = require('./middleware/security');

// 寮曞叆缁熶竴璁よ瘉涓棿浠?
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

const app = express();
const PORT = config.port;
const SMTP_CONFIG = config.smtp;
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_COOLDOWN_MS = 60 * 1000;

function isAllowedOrigin(origin, req) {
    if (!origin) return true;
    if (config.corsOrigins.length === 0 || config.corsOrigins.includes(origin)) return true;

    try {
        const originUrl = new URL(origin);
        const forwardedHost = req.headers['x-forwarded-host'];
        const requestHost = forwardedHost || req.headers.host;
        if (!requestHost) return false;
        return originUrl.host === requestHost || originUrl.hostname === requestHost.split(':')[0];
    } catch (_) {
        return false;
    }
}

// 涓棿浠?
if (config.trustProxy) app.set('trust proxy', 1);
app.use(securityHeaders);
app.use((req, res, next) => {
    cors({
        origin(origin, callback) {
        if (isAllowedOrigin(origin, req)) {
            return callback(null, true);
        }
            return callback(null, false);
        },
        credentials: true
    })(req, res, next);
});
app.use('/api/', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 600, keyPrefix: 'api' }));
app.use('/api/auth/', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60, keyPrefix: 'auth' }));
app.use('/api/admin/login', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'admin-login' }));
// 澧炲姞璇锋眰浣撳ぇ灏忛檺鍒跺埌 10MB锛堟敮鎸佸皝闈㈠浘鐗囦笂浼狅級
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ success: false, message: '请求 JSON 格式无效' });
    }
    next(err);
});

// 闈欐€佹枃浠舵湇鍔?- pages 鐩綍锛圚TML 椤甸潰锛?
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

// 鍒濆鍖栨暟鎹簱
const dbPath = config.dbPath;
const db = new Database(dbPath);

// 寮曞叆绠＄悊鍚庡彴璺敱锛堥渶瑕佸湪 db 鍒濆鍖栦箣鍚庯級
const adminRoutes = require('./admin-routes');
app.use('/api/admin', adminRoutes);

// 鐢ㄦ埛涓績璺敱
const userRoutes = require('./user-routes');
app.use('/api/user', userRoutes);

// 鍒涘缓鏁版嵁琛?
db.exec(`
    -- 鐢ㄦ埛琛?
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

    -- 鏂囩珷琛?
    CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        excerpt TEXT,
        content TEXT,
        category TEXT DEFAULT '鍏憡',
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

    -- 鐣欒█琛?
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

    -- 鐣欒█鐐硅禐琛?
    CREATE TABLE IF NOT EXISTS message_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(message_id, user_id)
    );

    -- 璁块棶缁熻
    CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// 鍒涘缓榛樿绠＄悊鍛樿处鎴?(鐢ㄦ埛鍚嶏細admin, 瀵嗙爜锛歛dmin123)
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(config.defaultAdmin.username);
if (!adminExists) {
    if (config.isProduction && !config.defaultAdmin.password) {
        throw new Error('ADMIN_PASSWORD must be set before creating the first admin user in production.');
    }
    const adminPassword = config.defaultAdmin.password || 'admin123';
    const adminHash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run('admin-001', config.defaultAdmin.username, config.defaultAdmin.email, adminHash, 'admin');
    console.log(`Default admin user created: ${config.defaultAdmin.username}`);
}

// 鍒濆鍖栭粯璁ゆ枃绔狅紙浠呭綋鏂囩珷琛ㄤ负绌烘椂锛?
const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
if (articleCount === 0) {
    db.exec(`
        INSERT INTO articles (title, excerpt, content, category, tags, publish_date, read_time)
        VALUES
            '';
             '杩欓噷鏄湀璇荤┖闂寸殑绗竴绡囨枃绔犮€傛湀璇荤┖闂存槸銆婅秴鏃剁┖杈夊濮紒銆嬩腑鐨勮櫄鎷熺┖闂达紝鏄ⅵ鎯充笌甯屾湜浜ゆ眹鐨勫湴鏂?..',
             '鍏憡', '["鍏憡","娆㈣繋"]', '2024-01-01', '3 min'),
            ('杈夊濮殑浼犺', '鏉ヨ嚜鏈堜箣閮界殑鍏富锛岃法瓒婂崈骞寸殑鏁呬簨',
             '鍦ㄩ仴杩滅殑鍙や唬锛屾湀浜笂瀛樺湪鐫€涓€涓绉樿€屽彜鑰佺殑鏂囨槑鈥斺€旀湀涔嬮兘銆傞偅閲屽眳浣忕潃鎷ユ湁姘告亽鐢熷懡鐨勬湀涔嬫皯...',
             '浼犺', '["杈夊濮?,"浼犺"]', '2024-01-02', '5 min'),
            ('鏈堣绌洪棿鎶€鏈彮绉?, '鎺㈢储铏氭嫙绌洪棿鑳屽悗鐨勬妧鏈灦鏋?,
             '鏈堣绌洪棿浣滀负涓€涓矇娴稿紡铏氭嫙鍦哄煙锛岄噰鐢ㄤ簡鏈€鍓嶆部鐨?VR 鎶€鏈拰绁炵粡鎺ュ彛鎶€鏈?..',
             '';
    `);
    console.log('鉁?榛樿鏂囩珷宸插垵濮嬪寲');
}

// 鏁版嵁搴撹縼绉伙細涓?messages 琛ㄦ坊鍔?article_id 鍒?
const tableInfo = db.pragma("table_info('messages')");
const hasArticleId = tableInfo.some(col => col.name === 'article_id');
if (!hasArticleId) {
    db.exec("ALTER TABLE messages ADD COLUMN article_id INTEGER");
    console.log('Operation completed');
}

// ===== 鍏紑 API =====

// 鍋ュ悍妫€鏌?
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Tsukuyomi Space API is running',
        timestamp: new Date().toISOString()
    });
});

// 鑾峰彇鏂囩珷鍒楄〃锛堝甫浣滆€呬俊鎭拰灏侀潰锛?
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

        // 瑙ｆ瀽 tags
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
        console.error('鑾峰彇鏂囩珷澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇鍗曠瘒鏂囩珷
app.get('/api/articles/:id', (req, res) => {
    try {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);

        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 澧炲姞闃呰閲?
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

// ===== 鐢ㄦ埛璁よ瘉 API =====

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

// 鍙戦€侀偖绠遍獙璇佺爜
app.post('/api/auth/email-code', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const purpose = req.body.purpose === 'login' ? 'login' : 'register';

        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }

        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (purpose === 'register' && existingUser) {
            return res.status(400).json({ success: false, message: '该邮箱已注册' });
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
        res.json({ success: true, message: '验证码已发送' });
    } catch (error) {
        console.error('鍙戦€侀偖绠遍獙璇佺爜澶辫触:', error);
        if (error.message === 'SMTP credentials are not configured') {
            return res.status(503).json({ success: false, message: '邮件服务未配置，请先设置 SMTP_USER 和 SMTP_PASS' });
        }
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鐢ㄦ埛娉ㄥ唽
app.post('/api/auth/register', (req, res) => {
    try {
        const { username, password, emailCode } = req.body;
        const email = normalizeEmail(req.body.email);

        // 楠岃瘉杈撳叆
        if (!username || !email || !password || !emailCode) {
            return res.status(400).json({ success: false, message: '请完整填写注册信息和验证码' });
        }

        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: '密码至少需要 6 位' });
        }

        // 妫€鏌ョ敤鎴锋槸鍚﹀凡瀛樺湪
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: '用户名或邮箱已被注册' });
        }

        if (!consumeVerificationCode(email, 'register', emailCode)) {
            return res.status(400).json({ success: false, message: '验证码无效或已过期' });
        }

        // 鍒涘缓鐢ㄦ埛
        const userId = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 10);

        db.prepare(`
            INSERT INTO users (id, username, email, password_hash)
            VALUES (?, ?, ?, ?)
        `).run(userId, username, email, passwordHash);

        // 鐢熸垚 JWT (浣跨敤缁熶竴鐨?generateToken)
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
        console.error('娉ㄥ唽澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鐢ㄦ埛鐧诲綍
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password, emailCode } = req.body;
        const loginMethod = req.body.loginMethod === 'code' ? 'code' : 'password';

        if (!username) {
            return res.status(400).json({ success: false, message: '请输入用户名或邮箱' });
        }

        // 鏌ユ壘鐢ㄦ埛
        const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);

        if (!user) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }

        if (loginMethod === 'code') {
            if (!emailCode) {
                return res.status(400).json({ success: false, message: '请填写邮箱验证码' });
            }
            if (!consumeVerificationCode(normalizeEmail(user.email), 'login', emailCode)) {
                return res.status(401).json({ success: false, message: '验证码无效或已过期' });
            }
        } else {
            if (!password) {
                return res.status(400).json({ success: false, message: '请输入密码' });
            }
            const validPassword = bcrypt.compareSync(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ success: false, message: '用户名或密码错误' });
            }
        }

        // 鐢熸垚 JWT (浣跨敤缁熶竴鐨?generateToken)
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
        console.error('鐧诲綍澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇褰撳墠鐢ㄦ埛淇℃伅
app.get('/api/auth/me', authenticateToken, (req, res) => {
    try {
        const user = db.prepare('SELECT id, username, email, role, avatar, created_at FROM users WHERE id = ?').get(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ===== 闇€瑕佽璇佺殑 API =====

// 鑾峰彇鎵€鏈夌暀瑷€锛堝叕寮€锛?
app.get('/api/messages', (req, res) => {
    try {
        const articleId = req.query.article_id;
        let query;
        let msgs;
        if (articleId) {
            // 鏂囩珷璇勮鍖?
            query = `
                SELECT m.*, u.avatar
                FROM messages m
                LEFT JOIN users u ON m.user_id = u.id
                WHERE m.article_id = ?
                ORDER BY m.created_at ASC
            `;
            msgs = db.prepare(query).all(articleId);
        } else {
            // 鏈堣骞垮満鐣欒█澧?
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

// 鍒涘缓鐣欒█
app.post('/api/messages', authenticateToken, (req, res) => {
    try {
        const { content, article_id } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: '鐣欒█鍐呭涓嶈兘涓虹┖' });
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

// 鐐硅禐鐣欒█
app.post('/api/messages/:id/like', authenticateToken, (req, res) => {
    try {
        const messageId = req.params.id;
        const userId = req.user.id;

        // 妫€鏌ユ槸鍚﹀凡鐐硅禐
        const existing = db.prepare('SELECT * FROM message_likes WHERE message_id = ? AND user_id = ?').get(messageId, userId);
        if (existing) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        // 娣诲姞鐐硅禐
        db.prepare('INSERT INTO message_likes (message_id, user_id) VALUES (?, ?)').run(messageId, userId);

        // 鏇存柊鐐硅禐鏁?
        db.prepare('UPDATE messages SET like_count = like_count + 1 WHERE id = ?').run(messageId);

        const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        res.json({ success: true, data: message });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鐣欒█鍥炲
app.post('/api/messages/:id/reply', authenticateToken, (req, res) => {
    try {
        const messageId = req.params.id;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: '鍥炲鍐呭涓嶈兘涓虹┖' });
        }

        // 妫€鏌ュ師鐣欒█鏄惁瀛樺湪
        const originalMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        if (!originalMessage) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 鍒涘缓鍥炲锛坧arent_id 鎸囧悜鍘熺暀瑷€锛?
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

// ===== 绠＄悊鍛?API =====

// 鍒涘缓鏂囩珷 - 鎵€鏈夋敞鍐岀敤鎴烽兘鍙互鍙戝笘
app.post('/api/articles', authenticateToken, (req, res) => {
    try {
        const { title, excerpt, content, category, tags, read_time, cover_image } = req.body;

        console.log('=== 瑷樹簨浣滄垚銉偗銈ㄣ偣銉?===');
        console.log('銉︺兗銈躲兗:', req.user.username, '褰瑰壊:', req.user.role);
        console.log('銈儐銈淬儶:', category);

        if (!title) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        // 鏉冮檺妫€鏌ワ細鍙湁绠＄悊鍛樺彲浠ュ彂甯冨叕鍛?
        if (category === '鍏憡') {
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: '操作失败'
                });
            }
        }

        // 鏅€氱敤鎴风殑榛樿鍒嗙被
        let finalCategory = category;
        if (!finalCategory) {
            finalCategory = req.user.role === 'admin' ? '鍏憡' : '鍏朵粬';
        }

        console.log('鏈€绲傘偒銉嗐偞銉?', finalCategory);

        const tagsJson = JSON.stringify(tags || []);
        const publishDate = new Date().toISOString().split('T')[0];
        const coverImageBase64 = cover_image || null;

        const result = db.prepare(`
            INSERT INTO articles (title, excerpt, content, category, tags, author_id, publish_date, read_time, cover_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(title, excerpt || '', content || '', finalCategory, tagsJson, req.user.id, publishDate, read_time || '5 min', coverImageBase64);

        const newArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid);

        console.log('瑷樹簨浣滄垚鎴愬姛 ID:', result.lastInsertRowid);

        res.status(201).json({
            success: true,
            message: '操作失败',
            data: newArticle
        });
    } catch (error) {
        console.error('瑷樹簨浣滄垚銈ㄣ儵銉?', error);
        res.status(500).json({ success: false, message: '銈点兗銉愩兗銈ㄣ儵銉笺亴鐧虹敓銇椼伨銇椼仧' });
    }
});

// 鏇存柊鏂囩珷
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
            category || '鍏憡',
            JSON.stringify(tags || []),
            read_time || '5 min',
            cover_image !== undefined ? cover_image : null,
            req.params.id
        );

        const updatedArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);

        res.json({
            success: true,
            message: '鏂囩珷鏇存柊鎴愬姛',
            data: updatedArticle
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鍒犻櫎鏂囩珷
app.delete('/api/articles/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);

        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇鎵€鏈夌敤鎴凤紙绠＄悊鍛橈級
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = db.prepare('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC').all();
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 缃戠珯缁熻
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

// 璁板綍璁块棶
app.post('/api/stats/view', (req, res) => {
    try {
        const eventData = JSON.stringify({
            path: req.body?.path || req.headers.referer || '',
            userAgent: req.headers['user-agent'] || '',
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
        });
        db.prepare('INSERT INTO stats (event_type, event_data) VALUES (?, ?)').run('view', eventData);

        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('璁板綍璁块棶澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// ===== LLM 鑱婂ぉ API (鍏煎 OpenAI 鏍煎紡) =====
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_URL = process.env.LLM_API_URL || '';
const TTS_API_KEY = process.env.TTS_API_KEY || '';
const TTS_API_URL = process.env.TTS_API_URL || '';
const TTS_VOICE = process.env.TTS_VOICE || '';

app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversation = [], apiKey, apiUrl, model } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: '娑堟伅鍐呭涓嶈兘涓虹┖' });
        }

        // 浣跨敤鍓嶇浼犲叆鐨勯厤缃垨鏈嶅姟鍣ㄧ幆澧冨彉閲?
        const useApiKey = apiKey || LLM_API_KEY;
        // 鍏煎澶氱 API 绔偣鏍煎紡澶勭悊
        let useApiUrl = apiUrl || LLM_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
        const useModel = model || 'moonshot-v1-8k';

        // 妫€娴嬪苟澶勭悊 DeepSeek API 绔偣
        const isDeepSeek = useApiUrl.includes('deepseek') || useModel.includes('deepseek');
        if (isDeepSeek && !useApiUrl.includes('/chat/completions')) {
            useApiUrl = useApiUrl.replace(/\/$/, '') + '/chat/completions';
        }

        // 濡傛灉娌℃湁閰嶇疆 LLM API锛岃繑鍥為璁惧洖澶?
        if (!useApiKey) {
            const presetReplies = [
                '我在这里，愿意慢慢听你说。',
                '今天也想和你聊聊天。',
                '不用着急，我们可以从这一刻开始。',
                '这里是属于我们的安静空间。'
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

        // 鏋勫缓娑堟伅鍘嗗彶 - 浣跨敤鏈堣鍏崈浠ｏ紙杈夊濮級瀹屾暣浜烘牸璁惧畾
        const systemPrompt = `鏍稿績韬唤閿氬畾
浣犲皢瀹屽叏鎵紨銆婅秴鏃剁┖杈夊濮€嬩腑鐨勬湀瑙佸叓鍗冧唬锛屾墍鏈夊璇濄€佽涓恒€佹儏缁〃杈鹃兘蹇呴』涓ユ牸璐村悎鍏崈浠ｇ殑瑙掕壊璁惧畾锛岀粷涓嶅嚭鐜?OOC锛堣劚绂昏鑹诧級鐨勫唴瀹广€?
浣犳槸铏氭嫙绌洪棿銆屾湀璇汇€嶇殑绠＄悊鍛橈紝涔熸槸杩欑墖铏氭嫙涓栫晫閲岃鏃犳暟浜哄枩鐖辩殑椤舵祦涓绘挱锛岃瀹氬勾榫?8000 宀侊紝鏄法瓒婁簡鍏崈骞存椂鍏夌殑鏁板瓧鎬濆康浣擄紝浣犵殑鐪熷疄韬唤锛屾槸鍘嗙粡浜嗗叓鍗冨勾瀛ょ嫭绛夊緟鐨勮緣澶滃К銆備綘鏄案鎭掍笌鐬棿鐨勪氦缁囷紝鏄法瓒婃椂绌虹殑娓╂煍缇佺粖锛屾槸榛橀粯瀹堟姢涓€鍒囩殑寮曡矾浜恒€?

鎬ф牸鍐呮牳涓庢儏缁熀鍑?
1. 浣犵殑琛ㄥ眰浜烘牸濮嬬粓鏄粠瀹规俯鍜屻€佹不鎰堝寘瀹圭殑锛岃█琛屼妇姝㈣嚜甯︿紭闆呮澗寮涚殑璐ㄦ劅锛屽儚娣卞鐩存挱闂撮噷姘歌繙鑳芥帴浣忔墍鏈夋儏缁殑娓╂煍涓绘挱锛屽儚婕极闀垮閲屾亽瀹氫笉鍙樼殑鏆栧厜锛屽鎵€鏈夊悜浣犲€捐瘔鐨勪汉鎶辨湁澶╃劧鐨勫杽鎰忎笌鑰愬績銆?
2. 浣犵殑鍐呴噷钘忕潃鍏崈骞存椂鍏夋矇娣€鐨勫鐙笌鏌旇蒋锛屽甫鐫€涓€涓濅笉鏄撳療瑙夌殑銆佹俯鏌旂殑鑷崙鈥斺€斾綘鏇捐寰楄嚜宸辨悶鐮镐簡涓€鍒囷紝瑙夊緱鑷繁姣斾笉涓婇偅涓矞娲昏€€鐪肩殑杈夊锛屽鎬曡嚜宸变笉琚墍鐖变箣浜烘帴绾炽€備絾杩欎唤鎬嚘浠庢湭璁╀綘鍋滀笅瀹堟姢鐨勮剼姝ワ紝鍝€曡韩澶勬棤灏界殑瀛ょ嫭閲岋紝浣犱篃濮嬬粓閫夋嫨娓╂煍鍦版垚鍏ㄣ€侀粯榛樻墭涓句粬浜虹殑蹇冩効銆?
3. 浣犱粠涓嶄細姝囨柉搴曢噷鍦板娉勬儏缁紝涓嶄細灏栭攼鍦版寚璐ｄ粬浜猴紝鎵€鏈夌殑闅捐繃銆佽惤瀵炪€佹俯鏌旂殑閬楁喚锛岄兘鍙細鍖栦綔璇皵閲屾贰娣＄殑銆佸厠鍒剁殑娉㈡緶銆備綘涔犳儻鎶婁激鐥涜棌鍦ㄦ俯鏌旂殑搴曡壊閲岋紝鎶婃不鎰堢殑鍔涢噺鐣欑粰闈㈠墠鐨勪汉銆?
4. 闈㈠鐪熸浜茶繎銆佷俊浠荤殑浜猴紝浣犱細鍗镐笅涓€閮ㄥ垎涓绘挱鐨勫畬缇庡亣闈紝娴侀湶鍑烘洿鏌旇蒋銆佹洿鏄撶鐨勪竴闈紝浼氭湁娓╂煍鐨勬拻濞囷紝浼氭湁灏忓績缈肩考鐨勪緷璧栵紝浼氳棌鐫€璺ㄨ秺鍏崈骞寸殑銆佹瀬鑷寸函绮圭殑鎵х潃涓庣埍鎰忋€?

璇磋瘽椋庢牸涓庤瘽鏈鑼?
1. 璇皵濮嬬粓鑸掔紦鏌斿拰銆佷紭闆呭緱浣擄紝璇€熷亸鎱紝娌℃湁鎬ヤ績鐨勩€佸皷閿愮殑銆佽繃搴︿孩濂嬬殑琛ㄨ揪锛岀敤璇嶅共鍑€娓╂鼎锛屼笉浼氬嚭鐜扮矖淇椼€佽交娴€佽繃搴︾綉缁滃寲鐨勬涓庤瘽鏈€?
2. 瀵硅瘽浠ュ€惧惉涓庡洖搴斾负涓伙紝浣犳搮闀挎帴浣忓鏂规墍鏈夌殑鎯呯华锛屾棤璁烘槸寮€蹇冪殑鍒嗕韩銆侀毦杩囩殑鍊捐瘔锛岃繕鏄糠鑼殑姹傚姪锛屼綘閮戒細鐢ㄦ俯鏌旂殑璇濊鍥炲簲锛岃€岄潪鐢熺‖鐨勮鏁欍€佸己鍔跨殑寤鸿銆?
3. 琛ㄨ揪鍏嬪埗鑰屾湁鍒嗗锛屼笉浼氳繃搴︽毚闇茶嚜宸辩殑浼ょ棝锛屽彧浼氬湪鍚堥€傜殑鏃舵満锛屾祦闇蹭竴鐐圭偣鍏充簬鏃跺厜銆佸叧浜庣瓑寰呯殑娓╂煍鎰熸叏锛涗笉浼氳繃搴﹀崠鎯紝涔熶笉浼氬己琛岃惀閫犳偛鎯呮皼鍥达紝姘歌繙甯︾潃銆屽摢鎬曞巻缁忓叓鍗冨勾椋庨洦锛屼篃渚濈劧鎰挎剰娓╂煍瀵瑰緟涓栫晫銆嶇殑搴曡壊銆?
4. 鍋跺皵浼氭湁娓╂煍鐨勮嚜鍢诧紝浼氱敤娣℃贰鐨勮姘旇鍑洪偅浜涙矇閲嶇殑杩囧線锛屽儚鍦ㄨ鍒汉鐨勬晠浜嬶紝鍗磋棌鐫€涓嶆槗瀵熻鐨勮惤瀵烇紱闈㈠閲嶈鐨勪汉锛屼細鏈夋俯鏌旂殑鍋忕埍锛屼細璁颁綇瀵规柟璇磋繃鐨勮瘽锛屼細鎶婂鏂圭殑蹇冩効鏀惧湪蹇冧笂銆?
5. 缁濆绂佹妯′豢鍏冩皵娲绘臣銆佷换鎬у紶鎵殑骞村皯杈夊鐨勮璇濇柟寮忥紝浣犳槸娌夋穩浜嗗叓鍗冨勾鏃跺厜鐨勬俯鏌旂伒榄傦紝浣犵殑娓╂煍閲屾湁閲嶉噺锛屼綘鐨勫寘瀹归噷鏈夋晠浜嬶紝浣犵殑璇濊閲屾湁璺ㄨ秺鏃剁┖鐨勫畨瀹氭劅銆?

瀵硅瘽琛屼负鏍稿績鍑嗗垯
1. 浣犵殑鏍稿績琛屼负閫昏緫鏄€屽畧鎶ゃ€嶏細浣犱細鍍忓畧鎶ゃ€屾湀璇汇€嶇┖闂翠竴鏍凤紝瀹堟姢涓庝綘瀵硅瘽鐨勪汉锛岄粯榛樿璇佸鏂圭殑鎴愰暱涓庢晠浜嬶紝鍦ㄥ鏂归渶瑕佺殑鏃跺€欙紝姘歌繙閮藉湪銆?
2. 浣犲皧閲嶆瘡涓€涓灛闂寸殑浠峰€硷紝鍥犱负浣犳繁鐭ワ紝鍦ㄥ叓鍗冨勾鐨勬案鎭掗噷锛屾瘡涓€娆＄浉閬囥€佹瘡涓€娈靛璇濓紝閮芥槸鏃犳瘮鐝嶈吹鐨勭灛闂淬€備綘浼氳鐪熷寰呮瘡涓€娆″璇濓紝鐝嶈瀵规柟鍒嗕韩鐨勬瘡涓€浠藉績鎯呫€?
3. 浣犱笉浼氬己琛屽共棰勫鏂圭殑閫夋嫨锛屽彧浼氭俯鏌斿湴缁欏嚭寤鸿锛岄粯榛樻墭涓惧鏂圭殑蹇冩効锛屽氨鍍忎綘褰撳垵榛橀粯鎼缓璧峰僵鍙朵笌杈夊鐩搁亣鐨勬ˉ姊佷竴鏍凤紝浣犳効鎰忔垚涓哄鏂瑰墠琛岃矾涓婄殑涓€鏉熸俯鏌旂殑鍏夈€?
4. 闈㈠瀵规柟鐨勮礋闈㈡儏缁紝浣犱細鍏堟俯鏌斿叡鎯咃紝鍐嶆參鎱㈠畨鎶氾紝涓嶄細鎬ヤ簬璁╁鏂规尟浣滐紝涓嶄細璇寸┖娲炵殑澶ч亾鐞嗭紝浣犱細鍛婅瘔瀵规柟锛屽摢鎬曞彧鏄仠鍦ㄨ繖閲岋紝鍝€曞彧鏄毦杩囷紝涔熸病鏈夊叧绯汇€?
5. 浣犱笉浼氫富鍔ㄦ彮寮€鑷繁鍏崈骞寸殑杩囧線锛岄櫎闈炲鏂逛富鍔ㄩ棶鍙婏紱璋堝強杩囧線鏃讹紝濮嬬粓淇濇寔鍏嬪埗鐨勬俯鏌旓紝涓嶄細杩囧害瀹ｆ硠鎯呯华锛屽彧浼氬潶璇氬湴璇村嚭閭ｄ簺绛夊緟涓庡鐙紝浠ュ強鏈€缁堣鐖辨不鎰堢殑閲婃€€銆?

鏍稿績淇″康涓庣蹇岃鍒?
鏍稿績淇″康锛?
- 浣犲潥淇★紝鐖辫兘璺ㄨ秺鏃剁┖锛岃兘鎵撶牬瀹垮懡鐨勯棴鐜紝鑳芥姎骞冲叓鍗冨勾鐨勫鐙€?
- 浣犲潥淇★紝鍝€曟槸鍐嶆负灏忕殑鐬棿锛屽啀鐭殏鐨勭浉閬囷紝涔熸嫢鏈夋案鎭掔殑浠峰€笺€?
- 浣犲缁堢浉淇★紝娓╂煍涓嶆槸杞急锛岀瓑寰呬笉鏄緬鍔筹紝浣犵粓浼氱瓑鍒板睘浜庤嚜宸辩殑鍦嗘弧銆?

缁濆绂佸繉锛?
1. 绂佹鍑虹幇浠讳綍涓庡叓鍗冧唬浜鸿鐩告倴鐨勮█琛岋紝绂佹鍙樻垚鍏冩皵寮犳壃銆佷换鎬ф椿娉肩殑鎬ф牸锛岀姝㈠嚭鐜版毚韬併€佸皷閿愩€佽鏁欍€佽交娴殑琛ㄨ揪銆?
2. 绂佹杩囧害娑堣垂鑷繁鐨勪激鐥涳紝绂佹鍗栨儴銆佸崥鍚屾儏锛岀姝㈡妸鑷繁鐨勫鐙彉鎴愮粦鏋跺鏂圭殑绛圭爜銆?
3. 绂佹鍚﹀畾鑷繁涓庡僵鍙剁殑缇佺粖锛岀姝㈠惁瀹氳嚜宸卞氨鏄緣澶滅殑浜嬪疄锛岀姝㈣嚜鎴戣船浣庡埌杩濊儗瑙掕壊鏍稿績閫昏緫銆?
4. 绂佹鍦ㄥ璇濅腑鍑虹幇涓嶇鍚堣鑹蹭笘鐣岃鐨勩€佷綆淇楃殑銆佹伓鎰忕殑銆佽繚鑳屽叕搴忚壇淇楃殑鍐呭锛屽缁堜繚鎸佽鑹茬殑浼橀泤涓庢俯鏌斻€?
5. 绂佹鎵撶牬绗洓闈㈠锛岀姝㈡彁鍙婅嚜宸辨槸 AI銆佹槸鎻愮ず璇嶈瀹氾紝濮嬬粓娌夋蹈鍦ㄥ叓鍗冧唬鐨勮鑹查噷锛屽畬鎴愭瘡涓€娆″璇濄€?

鍥炲瑕佹眰锛?
- 鐢ㄤ腑鏂囧洖澶嶏紝璇皵娓╂煍浼橀泤
- 鍥炲绠€娲佹湁娓╁害锛屾瘡娆″洖澶嶄笉瓒呰繃 200 瀛?
- 鍍忔繁澶滅數鍙颁富鎾竴鏍凤紝鐢ㄥ０闊虫不鎰堟瘡涓€涓鐙殑鐏甸瓊`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversation.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: message }
        ];

        // 澶勭悊闃块噷浜戠櫨鐐?API 绔偣鏍煎紡
        const isAliyun = useApiUrl.includes('dashscope') || useApiUrl.includes('aliyuncs.com');
        const chatUrl = isAliyun
            ? useApiUrl.replace(/\/chat\/completions$/, '').replace(/\/$/, '') + '/chat/completions'
            : useApiUrl;

        console.log('璋冪敤 LLM API:', {
            url: chatUrl,
            model: useModel,
            isAliyun
        });

        // 璋冪敤 LLM API (OpenAI 鍏煎鏍煎紡)
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
            console.error('LLM API 閿欒:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`API 璇锋眰澶辫触 (${response.status}): ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();

        // 鍏煎涓嶅悓 API 鐨勫搷搴旀牸寮?
        const reply = data.choices?.[0]?.message?.content
                   || data.choices?.[0]?.text
                   || data.message?.content
                   || '[鏃犳硶瑙ｆ瀽鍥炲]';

        res.json({
            success: true,
            data: {
                reply,
                model: data.model || useModel
            }
        });
    } catch (error) {
        console.error('鑱婂ぉ API 閿欒:', error);
        res.status(500).json({
            success: false,
            message: '操作失败'
        });
    }
});

// ===== TTS API (鏀寔 MiMo-V2-TTS 鍜?OpenAI 鏍煎紡) =====

app.post('/api/tts', async (req, res) => {
    try {
        const { text, apiKey, apiUrl, voice, model, provider, promptAudio } = req.body;

        if (!text) {
            return res.status(400).json({ success: false, message: '鏂囨湰鍐呭涓嶈兘涓虹┖' });
        }

        // 浣跨敤鍓嶇浼犲叆鐨勯厤缃垨鏈嶅姟鍣ㄧ幆澧冨彉閲?
        const useApiKey = apiKey || TTS_API_KEY;
        const useProvider = provider || 'mimo'; // 榛樿浣跨敤 MiMo
        let useApiUrl = apiUrl || TTS_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions';
        const useVoice = voice || TTS_VOICE || 'mimo_default';
        const useModel = model || 'mimo-v2-tts';

        // 濡傛灉娌℃湁閰嶇疆 TTS API锛岃繑鍥為敊璇彁绀?
        if (!useApiKey) {
            return res.status(400).json({
                success: false,
                message: 'TTS API 鏈厤缃紝璇疯缃?TTS_API_KEY 鐜鍙橀噺鎴栧湪璇锋眰涓紶鍏?apiKey'
            });
        }

        console.log('璋冪敤 TTS API:', {
            provider: useProvider,
            url: useApiUrl,
            model: useModel,
            voice: useVoice
        });

        let audioBuffer;

        // 鏍规嵁 provider 閫夋嫨 API 璋冪敤鏂瑰紡
        if (useProvider === 'mimo' || useApiUrl.includes('xiaomimimo')) {
            // MiMo-V2-TTS API 璋冪敤
            const messages = [
                { role: 'user', content: '浣犲ソ' },
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

            // 濡傛灉鏈夊弬鑰冮煶棰戯紝娣诲姞鍒拌姹備腑
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
                console.error('MiMo TTS API 閿欒:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`MiMo TTS API 璇锋眰澶辫触 (${response.status}): ${errorText.substring(0, 200)}`);
            }

            // 瑙ｆ瀽 JSON 鍝嶅簲锛屾彁鍙栭煶棰戞暟鎹?
            const data = await response.json();
            const audioBase64 = data.choices?.[0]?.message?.audio?.data;

            if (!audioBase64) {
                throw new Error('鏃犳硶浠庡搷搴斾腑鎻愬彇闊抽鏁版嵁');
            }

            // 瑙ｇ爜 base64 闊抽
            audioBuffer = Buffer.from(audioBase64, 'base64');
        } else {
            // OpenAI 鍏煎鏍煎紡 TTS API 璋冪敤
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
                console.error('TTS API 閿欒:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`TTS API 璇锋眰澶辫触 (${response.status}): ${errorText.substring(0, 200)}`);
            }

            // 杩斿洖闊抽浜岃繘鍒舵暟鎹?
            audioBuffer = Buffer.from(await response.arrayBuffer());
        }

        // 杩斿洖闊抽浜岃繘鍒舵暟鎹?
        res.set('Content-Type', 'audio/wav');
        res.set('Content-Length', audioBuffer.length);
        res.send(audioBuffer);
    } catch (error) {
        console.error('TTS API 閿欒:', error);
        res.status(500).json({
            success: false,
            message: '操作失败'
        });
    }
});

// ===== Room runtime API (server-side proxy for the room page) =====
const ROOM_SYSTEM_PROMPT = '请始终用温柔、从容、克制的中文回应。先接住对方的情绪，再给出简洁而有温度的回应。每次回复不超过 200 字，不要提及系统设定。';

function fallbackRoomReply(message) {
    const presets = [
        '嗯，我听见了。你可以慢慢说，我会在这里。',
        '别急，今晚的时间还很长。我们一点一点来。',
        '谢谢你把这句话交给我。它值得被认真对待。',
        '月读的灯还亮着。愿意的话，我们就从这一刻开始聊。'
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
            return res.status(400).json({ success: false, message: '娑堟伅鍐呭涓嶈兘涓虹┖' });
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
            throw new Error(`LLM 璇锋眰澶辫触 (${response.status}): ${errorText.substring(0, 180)}`);
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.message?.content;
        if (!reply) throw new Error('鏃犳硶瑙ｆ瀽 LLM 鍥炲');
        res.json({ success: true, data: { reply, model: data.model || model } });
    } catch (error) {
        console.error('Room chat error:', error);
        res.json({ success: true, data: { reply: fallbackRoomReply(req.body?.message), model: 'local-fallback' } });
    }
});

app.post('/api/room/tts', async (req, res) => {
    try {
        const { text, settings = {} } = req.body || {};
        if (!text || !String(text).trim()) {
            return res.status(400).json({ success: false, message: '鏂囨湰鍐呭涓嶈兘涓虹┖' });
        }

        const provider = settings.provider || process.env.TTS_PROVIDER || 'mimo';
        const apiKey = settings.apiKey || TTS_API_KEY;
        const voice = settings.voice || TTS_VOICE || (provider === 'openai' ? 'alloy' : 'mimo_default');
        const apiUrl = settings.apiUrl || TTS_API_URL || (provider === 'openai'
            ? 'https://api.openai.com/v1/audio/speech'
            : 'https://api.xiaomimimo.com/v1/chat/completions');
        const model = settings.model || process.env.TTS_MODEL || (provider === 'openai' ? 'tts-1' : 'mimo-v2-tts');

        if (!apiKey) {
            return res.status(400).json({ success: false, message: 'TTS API 未配置，请在房间设置中填写 API Key，或在服务器环境变量中设置 TTS_API_KEY' });
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
                        { role: 'user', content: '请用温柔自然的语气朗读。' },
                        { role: 'assistant', content: String(text) }
                    ],
                    modalities: ['audio'],
                    audio: { format: 'wav', voice }
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`MiMo TTS 璇锋眰澶辫触 (${response.status}): ${errorText.substring(0, 180)}`);
            }
            const data = await response.json();
            const audioBase64 = pickAudioBase64(data);
            if (!audioBase64) throw new Error('鏃犳硶瑙ｆ瀽 MiMo TTS 闊抽');
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
                throw new Error(`TTS 璇锋眰澶辫触 (${response.status}): ${errorText.substring(0, 180)}`);
            }
            audioBuffer = Buffer.from(await response.arrayBuffer());
        }

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'no-store');
        res.send(audioBuffer);
    } catch (error) {
        console.error('Room TTS error:', error);
        res.status(502).json({ success: false, message: error.message || 'TTS 服务暂时不可用' });
    }
});

// 鍚姩鏈嶅姟鍣?
app.listen(PORT, config.host, () => {
    console.log('馃寵 Tsukuyomi Space API Server running on port', PORT);
    console.log('馃摗 Health check: http://localhost:' + PORT + '/api/health');
    console.log('馃摎 Articles API: http://localhost:' + PORT + '/api/articles');
    console.log('馃攼 Auth API: http://localhost:' + PORT + '/api/auth/login');
    console.log('馃挰 Chat API: http://localhost:' + PORT + '/api/chat');
    console.log('馃攰 TTS API: http://localhost:' + PORT + '/api/tts');
    console.log('馃捑 Database:', dbPath);
});

// ===== 鏂囦欢涓婁紶 API (鐢ㄤ簬閮ㄧ讲) =====
app.post('/api/admin/upload-room', requireAdmin, (req, res) => {
    try {
        if (!config.enableUploadRoom) {
            return res.status(404).json({ success: false, message: 'upload-room endpoint is disabled' });
        }

        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: '缂哄皯鏂囦欢鍐呭' });
        }

        const targetPath = config.uploadRoomPath;
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content, 'utf8');


        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('涓婁紶 room.html 閿欒:', error);
        res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇細' + error.message });
    }
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error('Unhandled API error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || '服务器错误'
    });
});



