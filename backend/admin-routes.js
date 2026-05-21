const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('./config');
const adminRepository = require('./repositories/admin-repository');
const articleRepository = require('./repositories/article-repository');
const statsRepository = require('./repositories/stats-repository');
const authState = require('./services/auth-state');
const articleMedia = require('./services/article-media');
const objectStorage = require('./services/object-storage');
const {
    authenticateToken,
    requireAdmin,
    generateToken,
    readAuthToken,
    setAuthCookie,
    clearAuthCookie,
    ADMIN_SESSION_COOKIE
} = require('./middleware/auth');

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

function normalizePublicBaseUrl(value) {
    const url = String(value || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) return '';
    try {
        return new URL(url).toString().replace(/\/+$/, '');
    } catch (_) {
        return '';
    }
}

function normalizeEndpointUrl(value) {
    const endpoint = String(value || '').trim().replace(/\/+$/, '');
    if (!endpoint) return '';
    const url = /^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`;
    try {
        return new URL(url).toString().replace(/\/+$/, '');
    } catch (_) {
        return '';
    }
}

async function testPublicResourceUrl(publicBaseUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const startedAt = Date.now();
    try {
        let response = await fetch(publicBaseUrl, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal
        });
        if (response.status === 405 || response.status === 403) {
            response = await fetch(publicBaseUrl, {
                method: 'GET',
                redirect: 'follow',
                signal: controller.signal
            });
        }
        return {
            ok: response.ok || response.status === 403,
            status: response.status,
            statusText: response.statusText,
            url: response.url || publicBaseUrl,
            elapsedMs: Date.now() - startedAt
        };
    } finally {
        clearTimeout(timeout);
    }
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

router.post('/login', async (req, res) => {
    try {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        if (!username || !password) return fail(res, 400, '请输入管理员账号和密码');
        const identity = `admin:${username.toLowerCase()}`;
        if (await authState.loginFailureState(identity) >= config.loginFailureMax) {
            return fail(res, 429, '登录失败次数过多，请稍后再试');
        }

        const admin = adminRepository.findAdminByUsername(username);
        if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
            await authState.recordLoginFailure(identity);
            return fail(res, 401, '管理员账号或密码错误');
        }

        await authState.clearLoginFailures(identity);
        const token = generateToken(adminTokenPayload(admin), config.adminJwtExpiresIn);
        setAuthCookie(res, ADMIN_SESSION_COOKIE, token, { maxAge: 24 * 60 * 60 * 1000, sameSite: 'strict' });
        ok(res, {
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

router.post('/logout', async (req, res) => {
    const token = readAuthToken(req, ADMIN_SESSION_COOKIE);
    if (token) await authState.blacklistToken(token);
    clearAuthCookie(res, ADMIN_SESSION_COOKIE, 'strict');
    ok(res, null, 'Logged out');
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
            totalViews: views.total || 0,
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
        const messages = statsRepository.allMessageCount();
        const users = statsRepository.userCount();
        const totalViews = views.total || 0;

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

router.put('/articles/:id', async (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');

        const { title, excerpt, content, content_format, category, status, read_time, cover_image, cover_image_asset_id } = req.body || {};
        if (!String(title || '').trim()) return fail(res, 400, '标题不能为空');

        const mediaPayload = await articleMedia.normalizeArticleMediaPayload({
            title: String(title).trim(),
            excerpt,
            content,
            contentFormat: content_format,
            category,
            status,
            readTime: read_time,
            coverImage: cover_image,
            coverImageAssetId: cover_image_asset_id
        }, { articleId: id, ownerId: req.user.id });
        const changes = adminRepository.updateAdminArticle(id, mediaPayload);
        articleMedia.attachAssetsToArticle(mediaPayload.mediaAssetIds, id);
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

router.post('/articles/:id/toggle-pin', (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return fail(res, 400, '文章 ID 无效');
        const result = adminRepository.toggleArticlePin(id);
        if (!result) return fail(res, 404, '文章不存在');
        ok(res, { pinned_at: result.pinnedAt }, result.pinnedAt ? '文章已置顶' : '文章已取消置顶');
    } catch (error) {
        console.error('Admin article pin toggle error:', error);
        fail(res, 500, '无法切换文章置顶状态');
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

router.patch('/users/:id/username', (req, res) => {
    try {
        if (!requireSuperAdminUser(req, res)) return;
        const userId = String(req.params.id || '').trim();
        const username = String(req.body?.username || '').trim();
        if (!userId) return fail(res, 400, '用户 ID 无效');
        if (!username) return fail(res, 400, '请输入昵称');
        if (username.length > 32) return fail(res, 400, '昵称不能超过 32 个字符');

        const user = adminRepository.findUserForAdmin(userId);
        if (!user) return fail(res, 404, '用户不存在');
        if (user.username === config.defaultAdmin.username) return fail(res, 403, '不能修改默认管理员昵称');

        const duplicate = adminRepository.findUserByUsername(username);
        if (duplicate && duplicate.id !== userId) {
            return fail(res, 409, '该昵称已被占用');
        }

        adminRepository.updateUserUsername(userId, username);
        ok(res, { username }, '用户昵称已更新');
    } catch (error) {
        console.error('Admin user username update error:', error);
        fail(res, 500, '无法更新用户昵称');
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
        const allowed = [
            'siteTitle',
            'siteAnnouncement',
            'sakuraEffect',
            'scanlineEffect',
            'visitPopupEnabled',
            'visitPopupTitle',
            'visitPopupContent',
            'visitPopupButton',
            'messageReviewKeywords',
            'beianText',
            'beianUrl',
            'mpsBeianText',
            'mpsBeianUrl',
            'mpsBeianIcon',
            'ossEnabled',
            'ossProvider',
            'ossEndpoint',
            'ossRegion',
            'ossBucket',
            'ossAccessKeyId',
            'ossAccessKeySecret',
            'ossPublicBaseUrl',
            'ossPrefix',
            'ossUploadPath',
            'ossDefaultStorage',
            'ossFileNameMode',
            'ossForcePathStyle'
        ];
        adminRepository.saveSettings(req.body, allowed);
        ok(res, null, '配置已保存');
    } catch (error) {
        console.error('Admin settings save error:', error);
        fail(res, 500, '无法保存系统配置');
    }
});

router.post('/settings/oss-test', async (req, res) => {
    try {
        const settings = req.body || {};
        const checks = [];
        let hasFailure = false;
        let hasPassedNetworkCheck = false;

        const addCheck = (name, status, message, detail = {}) => {
            if (status === 'failed') hasFailure = true;
            if (status === 'passed' && detail.network === true) hasPassedNetworkCheck = true;
            checks.push({ name, status, message, ...detail });
        };

        const rawPublicBaseUrl = String(settings.ossPublicBaseUrl || '').trim();
        if (!rawPublicBaseUrl) {
            addCheck('CDN / 公开访问域名', 'skipped', '未填写，已跳过；不影响保存，会继续使用本站本地静态资源');
        } else {
            const publicBaseUrl = normalizePublicBaseUrl(rawPublicBaseUrl);
            if (!publicBaseUrl) {
                addCheck('CDN / 公开访问域名', 'failed', '格式无效，请填写 http:// 或 https:// 开头的地址');
            } else {
                const result = await testPublicResourceUrl(publicBaseUrl);
                addCheck(
                    'CDN / 公开访问域名',
                    result.ok ? 'passed' : 'failed',
                    result.ok ? `可访问：HTTP ${result.status}` : `访问异常：HTTP ${result.status}`,
                    { ...result, publicBaseUrl, network: true }
                );
            }
        }

        const rawEndpoint = String(settings.ossEndpoint || '').trim();
        if (!rawEndpoint) {
            addCheck('Endpoint', 'skipped', '未填写，无法测试对象存储服务端点连通性');
        } else {
            const endpoint = normalizeEndpointUrl(rawEndpoint);
            if (!endpoint) {
                addCheck('Endpoint', 'failed', '格式无效，请填写域名、IP、IP:端口或完整 http(s) 地址');
            } else {
                const result = await testPublicResourceUrl(endpoint);
                addCheck(
                    'Endpoint',
                    result.ok || result.status < 500 ? 'passed' : 'failed',
                    result.ok || result.status < 500 ? `端点可达：HTTP ${result.status}` : `端点异常：HTTP ${result.status}`,
                    { ...result, endpoint, network: true }
                );
            }
        }

        const missingFields = [
            ['ossBucket', 'Bucket'],
            ['ossAccessKeyId', 'AccessKey ID'],
            ['ossAccessKeySecret', 'AccessKey Secret']
        ].filter(([key]) => !String(settings[key] || '').trim()).map(([, label]) => label);

        if (missingFields.length) {
            addCheck('基础配置', 'failed', `缺少 ${missingFields.join('、')}，后续上传资源前需要补齐`);
        } else {
            addCheck('基础配置', 'passed', 'Bucket 与 AccessKey 已填写');
        }

        try {
            const writeResult = await objectStorage.testWrite(settings);
            if (writeResult.ok) {
                addCheck('上传权限', 'passed', `测试文件上传成功，并已尝试清理：${writeResult.key}`, {
                    elapsedMs: writeResult.elapsedMs,
                    url: writeResult.url,
                    network: true
                });
            } else if (writeResult.skipped) {
                addCheck('上传权限', 'skipped', writeResult.message || '参数不完整，已跳过上传测试');
            }
        } catch (error) {
            addCheck('上传权限', 'failed', `测试文件上传失败：${error.message || '未知错误'}`);
        }

        const usable = !hasFailure && hasPassedNetworkCheck;
        ok(res, {
            usable,
            skipped: !hasPassedNetworkCheck,
            checks
        }, usable ? '对象存储测试通过' : '对象存储测试完成，请查看检查结果');
    } catch (error) {
        const aborted = error?.name === 'AbortError';
        ok(res, {
            publicBaseUrl: normalizePublicBaseUrl(req.body?.ossPublicBaseUrl),
            usable: false,
            error: aborted ? '请求超时' : (error.message || '连接失败')
        }, aborted ? '对象存储公开域名测试失败：请求超时' : '对象存储公开域名测试失败：无法连接');
    }
});

module.exports = router;
