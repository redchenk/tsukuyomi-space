// 绠＄悊鍚庡彴璺敱
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const config = require('./config');

// 寮曞叆缁熶竴璁よ瘉涓棿浠?
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

// 杩炴帴鏁版嵁搴?
const dbPath = config.dbPath;
const db = new Database(dbPath);

// 纭繚鎵€鏈夎〃瀛樺湪
try {
    // 绠＄悊鍛樿〃
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // 鐣欒█琛?
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

    // 鏁版嵁搴撹縼绉伙細涓?messages 琛ㄦ坊鍔犳柊鍒?
    const tableInfo = db.pragma("table_info('messages')");
    const columns = tableInfo.map(col => col.name);
    if (!columns.includes('author')) db.exec("ALTER TABLE messages ADD COLUMN author TEXT DEFAULT '鍖垮悕'");
    if (!columns.includes('status')) db.exec("ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'approved'");
    if (!columns.includes('parent_id')) db.exec("ALTER TABLE messages ADD COLUMN parent_id INTEGER");
    if (!columns.includes('like_count')) db.exec("ALTER TABLE messages ADD COLUMN like_count INTEGER DEFAULT 0");
    if (!columns.includes('article_id')) db.exec("ALTER TABLE messages ADD COLUMN article_id INTEGER");
    
    // 鍙嬮摼琛?
    db.exec(`
        CREATE TABLE IF NOT EXISTS friend_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // 閰嶇疆琛?
    db.exec(`
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // 濡傛灉绠＄悊鍛樿〃涓虹┖锛屽垱寤洪粯璁ょ鐞嗗憳
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
    if (adminCount === 0) {
        if (config.isProduction && !config.defaultAdmin.password) {
            throw new Error('ADMIN_PASSWORD must be set before creating the first admin account in production.');
        }
        const defaultPassword = bcrypt.hashSync(config.defaultAdmin.password || 'admin123', 10);
        db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)').run(config.defaultAdmin.username, defaultPassword, 'super_admin');
        console.log(`Default admin account created: ${config.defaultAdmin.username}`);
    }
    
    console.log('鉁?鏁版嵁搴撹〃宸插垵濮嬪寲');
} catch (error) {
    console.error('鏁版嵁搴撳垵濮嬪寲閿欒:', error);
}

// 绠＄悊鍛樼櫥褰曪紙涓嶉渶瑕佽璇侊紝鍏紑鎺ュ彛锛?
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 楠岃瘉杈撳叆
        if (!username || !password) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        // 浠庢暟鎹簱鏌ユ壘绠＄悊鍛?
        const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

        if (!admin) {
            return res.status(401).json({ success: false, message: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' });
        }

        // 楠岃瘉瀵嗙爜
        const validPassword = bcrypt.compareSync(password, admin.password_hash);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' });
        }

        // 鐢熸垚 JWT (浣跨敤缁熶竴鐨?generateToken锛岀鐞嗗憳 token 鏈夋晥鏈?24 灏忔椂)
        const token = generateToken(
            { id: `admin-${admin.id}`, username: admin.username, role: admin.role || 'admin' },
            config.adminJwtExpiresIn
        );

        res.json({
            success: true,
            message: '鐧诲綍鎴愬姛',
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
        console.error('绠＄悊鍛樼櫥褰曢敊璇?', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鐧诲綍涔嬪悗鐨勬墍鏈夌鐞嗘帴鍙ｉ兘闇€瑕佸厛瑙ｆ瀽 JWT锛屽啀妫€鏌ョ鐞嗗憳鏉冮檺銆?
router.use(authenticateToken);

// 鑾峰彇缁熻鏁版嵁
router.get('/stats', requireAdmin, (req, res) => {
    try {
        // 鏌ヨ鏂囩珷鎬绘暟
        const articlesCount = db.prepare('SELECT COUNT(*) as count FROM articles').get().count || 0;
        
        // 鏌ヨ寰呭鏍哥暀瑷€鏁?
        let pendingMessages = 0;
        try {
            pendingMessages = db.prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'pending'").get().count || 0;
        } catch (e) {
            console.log('Operation completed');
        }
        
        // 鏌ヨ鎬昏闂噺
        const totalViewsResult = db.prepare('SELECT SUM(view_count) as total FROM articles').get();
        const totalViews = totalViewsResult ? (totalViewsResult.total || 0) : 0;
        
        // 鏌ヨ鐢ㄦ埛鎬绘暟
        let userCount = 0;
        try {
            userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count || 0;
        } catch (e) {
            console.log('Operation completed');
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
        console.error('鑾峰彇缁熻鏁版嵁閿欒:', error.message);
        res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇細' + error.message });
    }
});

// 鑾峰彇璁块棶缁熻鏁版嵁
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
        console.error('鑾峰彇璁块棶缁熻閿欒:', error);
        res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇細' + error.message });
    }
});

// 鑾峰彇鏂囩珷鍒楄〃
router.get('/articles', requireAdmin, (req, res) => {
    try {
        // 浠庢暟鎹簱鏌ヨ鐪熷疄鏁版嵁
        const articles = db.prepare('SELECT id, title, category, view_count, status, created_at FROM articles ORDER BY created_at DESC').all();
        
        res.json({ success: true, data: articles });
    } catch (error) {
        console.error('鑾峰彇鏂囩珷鍒楄〃閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇鍗曠瘒鏂囩珷
router.get('/articles/:id', requireAdmin, (req, res) => {
    try {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
        
        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }
        
        res.json({ success: true, data: article });
    } catch (error) {
        console.error('鑾峰彇鏂囩珷閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鏇存柊鏂囩珷
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
        `).run(title, excerpt || '', content || '', category || '闅忕瑪', status || 'published', read_time || null, cover_image || null, req.params.id);
        
        es.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('鏇存柊鏂囩珷閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鍒囨崲鏂囩珷鐘舵€?
router.post('/articles/:id/toggle-status', requireAdmin, (req, res) => {
    try {
        const article = db.prepare('SELECT status FROM articles WHERE id = ?').get(req.params.id);
        
        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }
        
        const newStatus = article.status === 'published' ? 'draft' : 'published';
        
        db.prepare('UPDATE articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStatus, req.params.id);
        
        res.json({ 
            success: true, 
            message: `鏂囩珷宸?{newStatus === 'published' ? '涓婃灦' : '涓嬫灦'}`,
            data: { status: newStatus }
        });
    } catch (error) {
        console.error('鍒囨崲鏂囩珷鐘舵€侀敊璇?', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇鐣欒█鍒楄〃
router.get('/messages', requireAdmin, (req, res) => {
    try {
        // 浠庢暟鎹簱鏌ヨ鐪熷疄鏁版嵁锛堥€傞厤鐜版湁琛ㄧ粨鏋勶級
        const messages = db.prepare(`
            SELECT id, COALESCE(author, '鍖垮悕') as username, content, COALESCE(status, 'approved') as status, created_at
            FROM messages
            ORDER BY created_at DESC
        `).all() || [];
        
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('鑾峰彇鐣欒█鍒楄〃閿欒:', error.message);
        res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇細' + error.message });
    }
});

// 閫氳繃鐣欒█
router.post('/messages/:id/approve', requireAdmin, (req, res) => {
    try {
        db.prepare("UPDATE messages SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(req.params.id);
        
        res.json({ success: true, message: '鐣欒█宸查€氳繃' });
    } catch (error) {
        console.error('閫氳繃鐣欒█閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鍒犻櫎鐣欒█
router.delete('/messages/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
        
        es.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('鍒犻櫎鐣欒█閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 纭繚鍙嬮摼琛ㄥ瓨鍦?
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
    console.error('鍒涘缓鍙嬮摼琛ㄩ敊璇?', error);
}

// 鑾峰彇鍙嬮摼鍒楄〃
router.get('/links', requireAdmin, (req, res) => {
    try {
        const links = db.prepare('SELECT * FROM friend_links ORDER BY created_at DESC').all();
        
        res.json({ success: true, data: links });
    } catch (error) {
        console.error('鑾峰彇鍙嬮摼鍒楄〃閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 娣诲姞鍙嬮摼
router.post('/links', requireAdmin, (req, res) => {
    try {
        const { name, url } = req.body;
        
        db.prepare('INSERT INTO friend_links (name, url) VALUES (?, ?)').run(name, url);
        
        es.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('娣诲姞鍙嬮摼閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鍒犻櫎鍙嬮摼
router.delete('/links/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM friend_links WHERE id = ?').run(req.params.id);
        
        es.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('鍒犻櫎鍙嬮摼閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 纭繚閰嶇疆琛ㄥ瓨鍦?
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // 鍒濆鍖栭粯璁ら厤缃?
    const configCount = db.prepare('SELECT COUNT(*) as count FROM site_settings').get().count;
    if (configCount === 0) {
        db.exec(`
            INSERT INTO site_settings (key, value) VALUES
            ('siteTitle', '鏈堣绌洪棿'),
            ('siteAnnouncement', '娆㈣繋璁块棶鏈堣绌洪棿'),
            ('sakuraEffect', 'true'),
            ('scanlineEffect', 'true')
        `);
    }
} catch (error) {
    console.error('閰嶇疆琛ㄥ垵濮嬪寲閿欒:', error);
}

// 鑾峰彇绯荤粺閰嶇疆
router.get('/settings', requireAdmin, (req, res) => {
    try {
        const settings = db.prepare('SELECT * FROM site_settings').all();
        const config = {};
        settings.forEach(s => {
            config[s.key] = s.value === 'true' ? true : (s.value === 'false' ? false : s.value);
        });
        
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('鑾峰彇閰嶇疆閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 淇濆瓨绯荤粺閰嶇疆
router.post('/settings', requireAdmin, (req, res) => {
    try {
        const { siteTitle, siteAnnouncement, sakuraEffect, scanlineEffect } = req.body;

        const updateStmt = db.prepare('UPDATE site_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');

        updateStmt.run(siteTitle, 'siteTitle');
        updateStmt.run(siteAnnouncement, 'siteAnnouncement');
        updateStmt.run(sakuraEffect ? 'true' : 'false', 'sakuraEffect');
        updateStmt.run(scanlineEffect ? 'true' : 'false', 'scanlineEffect');

        es.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('淇濆瓨閰嶇疆閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鍒犻櫎鏂囩珷
router.delete('/articles/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
        es.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('鍒犻櫎鏂囩珷閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鍒犻櫎鐢ㄦ埛
router.delete('/users/:id', requireAdmin, (req, res) => {
    try {
        const userId = req.params.id;
        // 绂佹鍒犻櫎 admin 鐢ㄦ埛
        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }
        if (user.username === 'admin') {
            return res.status(403).json({ success: false, message: '请求处理失败' });
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        es.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('鍒犻櫎鐢ㄦ埛閿欒:', error);
        es.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇鐢ㄦ埛鍒楄〃
router.get('/users', requireAdmin, (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, username, email, role, created_at
            FROM users
            ORDER BY created_at DESC
        `).all();

        res.json({ success: true, data: users });
    } catch (error) {
        console.error('鑾峰彇鐢ㄦ埛鍒楄〃閿欒:', error);
        res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇細' + error.message });
    }
});

// 鑾峰彇鍙嬮摼鍒楄〃
router.get('/links', requireAdmin, (req, res) => {
    try {
        // 浠?system_settings 琛ㄦ煡璇㈠弸閾?
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
        // 濡傛灉琛ㄤ笉瀛樺湪锛岃繑鍥炵┖鏁扮粍
        console.log('Operation completed');
        res.json({ success: true, data: [] });
    }
});

module.exports = router;
