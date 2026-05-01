const express = require('express');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const config = require('./config');
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

const router = express.Router();
const db = new Database(config.dbPath);

function initAdminTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS friend_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const messageColumns = db.pragma("table_info('messages')").map(col => col.name);
    if (messageColumns.length) {
        if (!messageColumns.includes('author')) db.exec("ALTER TABLE messages ADD COLUMN author TEXT DEFAULT '匿名'");
        if (!messageColumns.includes('status')) db.exec("ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'approved'");
        if (!messageColumns.includes('updated_at')) db.exec("ALTER TABLE messages ADD COLUMN updated_at DATETIME");
    }

    const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;
    if (adminCount === 0) {
        if (config.isProduction && !config.defaultAdmin.password) {
            throw new Error('ADMIN_PASSWORD must be set before creating the first admin account in production.');
        }
        db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)')
            .run(config.defaultAdmin.username, bcrypt.hashSync(config.defaultAdmin.password || 'admin123', 10), 'super_admin');
        console.log(`Default admin account created: ${config.defaultAdmin.username}`);
    } else if (config.isProduction && config.defaultAdmin.password) {
        const defaultAdmin = db.prepare('SELECT id, password_hash FROM admins WHERE username = ?').get(config.defaultAdmin.username);
        if (defaultAdmin && bcrypt.compareSync('admin123', defaultAdmin.password_hash)) {
            db.prepare('UPDATE admins SET password_hash = ?, role = ? WHERE id = ?')
                .run(bcrypt.hashSync(config.defaultAdmin.password, 10), 'super_admin', defaultAdmin.id);
            console.log(`Default admin password rotated from development fallback: ${config.defaultAdmin.username}`);
        }
    }

    const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM site_settings').get().count;
    if (settingsCount === 0) {
        const insert = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)');
        insert.run('siteTitle', '月读空间');
        insert.run('siteAnnouncement', '欢迎访问月读空间');
        insert.run('sakuraEffect', 'true');
        insert.run('scanlineEffect', 'true');
    }
}

function ok(res, data = null, message = '操作成功') {
    res.json({ success: true, message, data });
}

function fail(res, status, message) {
    res.status(status).json({ success: false, message });
}

function asInt(value) {
    const id = Number.parseInt(value, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function parseSettingValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}

function adminTokenPayload(admin) {
    return {
        id: `admin-${admin.id}`,
        adminId: admin.id,
        username: admin.username,
        role: admin.role || 'admin',
        scope: 'admin'
    };
}

initAdminTables();

router.post('/login', (req, res) => {
    try {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        if (!username || !password) return fail(res, 400, '请输入管理员账号和密码');

        const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
        if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
            return fail(res, 401, '管理员账号或密码错误');
        }

        const token = generateToken(adminTokenPayload(admin), config.adminJwtExpiresIn);
        ok(res, {
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                role: admin.role
            }
        }, '登录成功');
    } catch (error) {
        console.error('Admin login error:', error);
        fail(res, 500, '服务器错误');
    }
});

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/me', (req, res) => {
    ok(res, {
        username: req.user.username,
        role: req.user.role,
        scope: req.user.scope || 'admin'
    });
});

router.get('/stats', (req, res) => {
    try {
        const articles = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(view_count), 0) AS views FROM articles').get();
        const pendingMessages = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE COALESCE(status, 'approved') = 'pending'").get().count;
        const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
        const views = db.prepare(`
            SELECT
                SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) AS today,
                COUNT(*) AS total
            FROM stats
            WHERE event_type = 'view'
        `).get();

        ok(res, {
            articles: articles.count || 0,
            pendingMessages: pendingMessages || 0,
            todayViews: views.today || 0,
            totalViews: Math.max(views.total || 0, articles.views || 0),
            users: users || 0
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        fail(res, 500, '无法读取统计数据');
    }
});

router.get('/analytics', (req, res) => {
    try {
        const views = db.prepare(`
            SELECT
                SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) AS today,
                SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week,
                SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS month,
                COUNT(*) AS total
            FROM stats
            WHERE event_type = 'view'
        `).get();
        const articles = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(view_count), 0) AS views FROM articles').get();
        const messages = db.prepare('SELECT COUNT(*) AS count FROM messages').get();
        const users = db.prepare('SELECT COUNT(*) AS count FROM users').get();
        const totalViews = Math.max(views.total || 0, articles.views || 0);

        ok(res, {
            todayViews: views.today || 0,
            weekViews: views.week || 0,
            monthViews: views.month || 0,
            totalViews,
            articleViews: articles.views || 0,
            articles: articles.count || 0,
            messages: messages.count || 0,
            users: users.count || 0
        });
    } catch (error) {
        console.error('Admin analytics error:', error);
        fail(res, 500, '无法读取访问统计');
    }
});

router.get('/articles', (req, res) => {
    try {
        const articles = db.prepare(`
            SELECT id, title, category, view_count, status, created_at, updated_at
            FROM articles
            ORDER BY COALESCE(updated_at, created_at) DESC
        `).all();
        ok(res, articles);
    } catch (error) {
        console.error('Admin article list error:', error);
        fail(res, 500, '无法读取文章列表');
    }
});

router.get('/articles/:id', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
        if (!article) return fail(res, 404, '文章不存在');
        ok(res, article);
    } catch (error) {
        console.error('Admin article get error:', error);
        fail(res, 500, '无法读取文章');
    }
});

router.put('/articles/:id', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');

        const { title, excerpt, content, category, status, read_time, cover_image } = req.body || {};
        if (!String(title || '').trim()) return fail(res, 400, '标题不能为空');

        const result = db.prepare(`
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
        `).run(
            String(title).trim(),
            excerpt || '',
            content || '',
            category || '随笔',
            ['published', 'draft'].includes(status) ? status : 'published',
            read_time || null,
            cover_image || null,
            id
        );
        if (!result.changes) return fail(res, 404, '文章不存在');
        ok(res);
    } catch (error) {
        console.error('Admin article update error:', error);
        fail(res, 500, '无法更新文章');
    }
});

router.post('/articles/:id/toggle-status', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const article = db.prepare('SELECT status FROM articles WHERE id = ?').get(id);
        if (!article) return fail(res, 404, '文章不存在');

        const status = article.status === 'published' ? 'draft' : 'published';
        db.prepare('UPDATE articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
        ok(res, { status }, status === 'published' ? '文章已发布' : '文章已下架');
    } catch (error) {
        console.error('Admin article toggle error:', error);
        fail(res, 500, '无法切换文章状态');
    }
});

router.delete('/articles/:id', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const result = db.prepare('DELETE FROM articles WHERE id = ?').run(id);
        if (!result.changes) return fail(res, 404, '文章不存在');
        ok(res, null, '文章已删除');
    } catch (error) {
        console.error('Admin article delete error:', error);
        fail(res, 500, '无法删除文章');
    }
});

router.get('/messages', (req, res) => {
    try {
        const messages = db.prepare(`
            SELECT id,
                   COALESCE(author, '匿名') AS username,
                   content,
                   COALESCE(status, 'approved') AS status,
                   created_at
            FROM messages
            ORDER BY created_at DESC
        `).all();
        ok(res, messages);
    } catch (error) {
        console.error('Admin message list error:', error);
        fail(res, 500, '无法读取留言列表');
    }
});

router.post('/messages/:id/approve', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '留言 ID 无效');
        const result = db.prepare("UPDATE messages SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
        if (!result.changes) return fail(res, 404, '留言不存在');
        ok(res, null, '留言已通过');
    } catch (error) {
        console.error('Admin message approve error:', error);
        fail(res, 500, '无法审核留言');
    }
});

router.delete('/messages/:id', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '留言 ID 无效');
        const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
        if (!result.changes) return fail(res, 404, '留言不存在');
        ok(res, null, '留言已删除');
    } catch (error) {
        console.error('Admin message delete error:', error);
        fail(res, 500, '无法删除留言');
    }
});

router.get('/users', (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, username, email, role, created_at, updated_at
            FROM users
            ORDER BY created_at DESC
        `).all();
        ok(res, users);
    } catch (error) {
        console.error('Admin user list error:', error);
        fail(res, 500, '无法读取用户列表');
    }
});

router.delete('/users/:id', (req, res) => {
    try {
        const userId = String(req.params.id || '').trim();
        if (!userId) return fail(res, 400, '用户 ID 无效');
        const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(userId);
        if (!user) return fail(res, 404, '用户不存在');
        if (user.role === 'admin' || user.username === config.defaultAdmin.username) {
            return fail(res, 403, '不能删除管理员账号');
        }

        db.prepare('DELETE FROM message_likes WHERE user_id = ?').run(userId);
        db.prepare('UPDATE messages SET user_id = NULL WHERE user_id = ?').run(userId);
        db.prepare('UPDATE articles SET author_id = NULL WHERE author_id = ?').run(userId);
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        ok(res, null, '用户已删除');
    } catch (error) {
        console.error('Admin user delete error:', error);
        fail(res, 500, '无法删除用户');
    }
});

router.get('/links', (req, res) => {
    try {
        const links = db.prepare('SELECT * FROM friend_links ORDER BY created_at DESC').all();
        ok(res, links);
    } catch (error) {
        console.error('Admin link list error:', error);
        fail(res, 500, '无法读取友链');
    }
});

router.post('/links', (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const url = String(req.body?.url || '').trim();
        if (!name || !/^https?:\/\//i.test(url)) return fail(res, 400, '请填写名称和有效 URL');
        db.prepare('INSERT INTO friend_links (name, url, status) VALUES (?, ?, ?)').run(name, url, 'active');
        ok(res, null, '友链已添加');
    } catch (error) {
        console.error('Admin link create error:', error);
        fail(res, 500, '无法添加友链');
    }
});

router.delete('/links/:id', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '友链 ID 无效');
        const result = db.prepare('DELETE FROM friend_links WHERE id = ?').run(id);
        if (!result.changes) return fail(res, 404, '友链不存在');
        ok(res, null, '友链已删除');
    } catch (error) {
        console.error('Admin link delete error:', error);
        fail(res, 500, '无法删除友链');
    }
});

router.get('/settings', (req, res) => {
    try {
        const rows = db.prepare('SELECT key, value FROM site_settings').all();
        ok(res, Object.fromEntries(rows.map(row => [row.key, parseSettingValue(row.value)])));
    } catch (error) {
        console.error('Admin settings get error:', error);
        fail(res, 500, '无法读取系统配置');
    }
});

router.post('/settings', (req, res) => {
    try {
        const allowed = ['siteTitle', 'siteAnnouncement', 'sakuraEffect', 'scanlineEffect'];
        const upsert = db.prepare(`
            INSERT INTO site_settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `);
        const tx = db.transaction(() => {
            for (const key of allowed) {
                if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
                    upsert.run(key, String(req.body[key]));
                }
            }
        });
        tx();
        ok(res, null, '配置已保存');
    } catch (error) {
        console.error('Admin settings save error:', error);
        fail(res, 500, '无法保存系统配置');
    }
});

module.exports = router;
