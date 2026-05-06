const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('./config');
const adminRepository = require('./repositories/admin-repository');
const articleRepository = require('./repositories/article-repository');
const statsRepository = require('./repositories/stats-repository');
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

const router = express.Router();

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

function requireSuperAdminUser(req, res) {
    if (req.user.role !== 'super_admin') {
        fail(res, 403, '需要超级管理员权限');
        return false;
    }
    return true;
}

function sanitizeUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        avatar: user.avatar || '',
        bio: user.bio || '',
        created_at: user.created_at,
        updated_at: user.updated_at
    };
}

router.post('/login', (req, res) => {
    try {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        if (!username || !password) return fail(res, 400, '请输入管理员账号和密码');

        const admin = adminRepository.findAdminByUsername(username);
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
        id: req.user.adminId || req.user.id,
        username: req.user.username,
        role: req.user.role,
        scope: req.user.scope || 'admin'
    });
});

router.post('/password', (req, res) => {
    try {
        const adminId = req.user.adminId;
        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');
        if (!adminId) return fail(res, 400, '管理员身份无效');
        if (!currentPassword || !newPassword) return fail(res, 400, '请填写当前密码和新密码');
        if (newPassword.length < 8) return fail(res, 400, '新密码至少 8 位');

        const admin = adminRepository.findAdminById(adminId);
        if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
            return fail(res, 401, '当前密码错误');
        }

        adminRepository.updateAdminPassword(adminId, bcrypt.hashSync(newPassword, 10));
        ok(res, null, '管理员密码已更新');
    } catch (error) {
        console.error('Admin password update error:', error);
        fail(res, 500, '无法更新管理员密码');
    }
});

router.get('/stats', (req, res) => {
    try {
        const articles = statsRepository.articleCounters();
        const pendingMessages = statsRepository.pendingMessageCount();
        const users = statsRepository.userCount();
        const views = statsRepository.adminViewCounters();

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
        const views = statsRepository.analyticsViewCounters();
        const articles = statsRepository.articleCounters();
        const messages = statsRepository.messageCount();
        const users = statsRepository.userCount();
        const totalViews = Math.max(views.total || 0, articles.views || 0);

        ok(res, {
            todayViews: views.today || 0,
            weekViews: views.week || 0,
            monthViews: views.month || 0,
            totalViews,
            articleViews: articles.views || 0,
            articles: articles.count || 0,
            messages: messages || 0,
            users: users || 0
        });
    } catch (error) {
        console.error('Admin analytics error:', error);
        fail(res, 500, '无法读取访问统计');
    }
});

router.get('/articles', (req, res) => {
    try {
        ok(res, adminRepository.listAdminArticles());
    } catch (error) {
        console.error('Admin article list error:', error);
        fail(res, 500, '无法读取文章列表');
    }
});

router.get('/articles/:id', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const article = articleRepository.findArticleById(id);
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

        const changes = adminRepository.updateAdminArticle(id, {
            title: String(title).trim(),
            excerpt,
            content,
            category,
            status,
            readTime: read_time,
            coverImage: cover_image
        });
        if (!changes) return fail(res, 404, '文章不存在');
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
        const status = adminRepository.toggleArticleStatus(id);
        if (!status) return fail(res, 404, '文章不存在');
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
        if (!articleRepository.deleteArticle(id)) return fail(res, 404, '文章不存在');
        ok(res, null, '文章已删除');
    } catch (error) {
        console.error('Admin article delete error:', error);
        fail(res, 500, '无法删除文章');
    }
});

router.get('/messages', (req, res) => {
    try {
        ok(res, adminRepository.listAdminMessages());
    } catch (error) {
        console.error('Admin message list error:', error);
        fail(res, 500, '无法读取留言列表');
    }
});

router.post('/messages/:id/approve', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '留言 ID 无效');
        if (!adminRepository.approveMessage(id)) return fail(res, 404, '留言不存在');
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
        if (!adminRepository.deleteMessage(id)) return fail(res, 404, '留言不存在');
        ok(res, null, '留言已删除');
    } catch (error) {
        console.error('Admin message delete error:', error);
        fail(res, 500, '无法删除留言');
    }
});

router.get('/users', (req, res) => {
    try {
        ok(res, adminRepository.listUsers().map(sanitizeUser));
    } catch (error) {
        console.error('Admin user list error:', error);
        fail(res, 500, '无法读取用户列表');
    }
});

router.patch('/users/:id/role', (req, res) => {
    try {
        if (!requireSuperAdminUser(req, res)) return;
        const userId = String(req.params.id || '').trim();
        const role = String(req.body?.role || '').trim();
        if (!userId) return fail(res, 400, '用户 ID 无效');
        if (!['user', 'admin'].includes(role)) return fail(res, 400, '用户角色无效');

        const user = adminRepository.findUserForAdmin(userId);
        if (!user) return fail(res, 404, '用户不存在');
        if (user.username === config.defaultAdmin.username) return fail(res, 403, '不能修改默认管理员角色');

        adminRepository.updateUserRole(userId, role);
        ok(res, { role }, '用户角色已更新');
    } catch (error) {
        console.error('Admin user role update error:', error);
        fail(res, 500, '无法更新用户角色');
    }
});

router.post('/users/:id/password', (req, res) => {
    try {
        if (!requireSuperAdminUser(req, res)) return;
        const userId = String(req.params.id || '').trim();
        const password = String(req.body?.password || '');
        if (!userId) return fail(res, 400, '用户 ID 无效');
        if (password.length < 6) return fail(res, 400, '新密码至少 6 位');

        const changed = adminRepository.resetUserPassword(userId, bcrypt.hashSync(password, 10));
        if (!changed) return fail(res, 404, '用户不存在');
        ok(res, null, '用户密码已重置');
    } catch (error) {
        console.error('Admin user password reset error:', error);
        fail(res, 500, '无法重置用户密码');
    }
});

router.delete('/users/:id', (req, res) => {
    try {
        if (!requireSuperAdminUser(req, res)) return;
        const userId = String(req.params.id || '').trim();
        if (!userId) return fail(res, 400, '用户 ID 无效');
        const user = adminRepository.findUserForAdmin(userId);
        if (!user) return fail(res, 404, '用户不存在');
        if (user.role === 'admin' || user.username === config.defaultAdmin.username) {
            return fail(res, 403, '不能删除管理员账号');
        }

        adminRepository.deleteUser(userId);
        ok(res, null, '用户已删除');
    } catch (error) {
        console.error('Admin user delete error:', error);
        fail(res, 500, '无法删除用户');
    }
});

router.get('/links', (req, res) => {
    try {
        ok(res, adminRepository.listLinks());
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
        adminRepository.createLink({ name, url });
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
        if (!adminRepository.deleteLink(id)) return fail(res, 404, '友链不存在');
        ok(res, null, '友链已删除');
    } catch (error) {
        console.error('Admin link delete error:', error);
        fail(res, 500, '无法删除友链');
    }
});

router.get('/settings', (req, res) => {
    try {
        const rows = adminRepository.listSettings();
        ok(res, Object.fromEntries(rows.map(row => [row.key, parseSettingValue(row.value)])));
    } catch (error) {
        console.error('Admin settings get error:', error);
        fail(res, 500, '无法读取系统配置');
    }
});

router.post('/settings', (req, res) => {
    try {
        const allowed = ['siteTitle', 'siteAnnouncement', 'sakuraEffect', 'scanlineEffect'];
        adminRepository.saveSettings(req.body, allowed);
        ok(res, null, '配置已保存');
    } catch (error) {
        console.error('Admin settings save error:', error);
        fail(res, 500, '无法保存系统配置');
    }
});

module.exports = router;
