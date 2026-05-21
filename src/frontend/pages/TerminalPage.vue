<script setup>
import { computed, onMounted, onUnmounted, reactive } from 'vue';
import { noStoreUrl } from '../api/client';
import { formatDateTime } from '../utils/time';

const emit = defineEmits(['go', 'auth-changed']);

const panels = [
  { id: 'dashboard', label: '总览', code: '01' },
  { id: 'articles', label: '文章', code: '02' },
  { id: 'messages', label: '留言', code: '03' },
  { id: 'users', label: '用户', code: '04' },
  { id: 'account', label: '账号安全', code: '05' },
  { id: 'links', label: '友链', code: '06' },
  { id: 'analytics', label: '统计', code: '07' },
  { id: 'settings', label: '设置', code: '08' }
];

const terminal = reactive({
  admin: null,
  activePanel: 'dashboard',
  loading: false,
  loginMessage: '',
  message: '',
  messageType: 'success',
  clock: '',
  login: { username: '', password: '' },
  stats: { articles: 0, pendingMessages: 0, todayViews: 0, users: 0 },
  analytics: { todayViews: 0, weekViews: 0, monthViews: 0, totalViews: 0 },
  articles: [],
  messages: [],
  users: [],
  userSearch: '',
  usernameDrafts: {},
  roleDrafts: {},
  passwordDrafts: {},
  adminPassword: { currentPassword: '', newPassword: '', confirmPassword: '' },
  links: [],
  newLink: { name: '', url: '' },
  settings: {
    siteTitle: '',
    siteAnnouncement: '',
    sakuraEffect: true,
    scanlineEffect: true,
    visitPopupEnabled: false,
    visitPopupTitle: '欢迎来到月读空间',
    visitPopupContent: '',
    visitPopupButton: '我知道了',
    messageReviewKeywords: '',
    beianText: '',
    beianUrl: '',
    mpsBeianText: '',
    mpsBeianUrl: '',
    mpsBeianIcon: '',
    ossEnabled: false,
    ossProvider: 'aliyun',
    ossEndpoint: '',
    ossRegion: '',
    ossBucket: '',
    ossAccessKeyId: '',
    ossAccessKeySecret: '',
    ossPublicBaseUrl: '',
    ossPrefix: '',
    ossUploadPath: 'articles/${year}/${month}/${role}',
    ossDefaultStorage: 'auto',
    ossFileNameMode: 'uuid',
    ossForcePathStyle: false
  },
  ossTest: {
    loading: false,
    message: '',
    type: '',
    detail: ''
  },
  ossImport: {
    objectKey: '',
    title: '',
    assetType: 'auto',
    mimeType: '',
    size: '',
    visibility: 'public',
    description: '',
    loading: false,
    message: '',
    type: '',
    scanPrefix: '',
    scanLimit: 100,
    scanning: false,
    scanMessage: '',
    scanType: ''
  }
});

let clockTimer = 0;
const authed = computed(() => Boolean(terminal.admin));
const canManageAccounts = computed(() => terminal.admin?.role === 'super_admin');
const filteredUsers = computed(() => {
  const keyword = terminal.userSearch.trim().toLowerCase();
  if (!keyword) return terminal.users;
  return terminal.users.filter((item) => [item.username, item.email, item.role, item.id].some((value) => String(value || '').toLowerCase().includes(keyword)));
});
const pendingMessageCount = computed(() => terminal.messages.filter((item) => item.status !== 'approved').length);
const plazaMessageCount = computed(() => terminal.messages.filter((item) => !item.article_id).length);
const articleMessageCount = computed(() => terminal.messages.filter((item) => item.article_id).length);
const publishedArticleCount = computed(() => terminal.articles.filter((item) => item.status === 'published').length);
const pinnedArticleCount = computed(() => terminal.articles.filter((item) => item.pinned_at).length);

function formatDate(value) {
  if (!value) return '未记录';
  return formatDateTime(value, 'zh-CN');
}

function articlePath(article) {
  return `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}`;
}

function messageSourceLabel(item) {
  return item.article_id ? '文章评论' : '留言墙';
}

function messageArticlePath(item) {
  if (!item.article_id) return '';
  return `/articles/${encodeURIComponent(item.article_id)}${item.article_slug ? `/${encodeURIComponent(item.article_slug)}` : ''}`;
}

function showMessage(text, type = 'success') {
  terminal.message = text;
  terminal.messageType = type;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : { success: false, message: `HTTP ${response.status}` };
  } catch (_) {
    return { success: false, message: text.replace(/<[^>]*>/g, '').trim() || `HTTP ${response.status}` };
  }
}

async function adminApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const method = String(options.method || 'GET').toUpperCase();
  const url = method === 'GET' ? noStoreUrl(`/api/admin${path}`) : `/api/admin${path}`;
  const response = await fetch(url, { ...options, headers, credentials: 'include', cache: method === 'GET' ? 'no-store' : options.cache });
  const result = await parseJsonResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data;
}

async function verifySession() {
  if (!localStorage.getItem('admin_user')) return;
  try {
    terminal.admin = await adminApi('/me');
    await loadPanel('dashboard');
  } catch (error) {
    terminal.admin = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    terminal.loginMessage = error.message;
  }
}

async function login() {
  terminal.loading = true;
  terminal.loginMessage = '';
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(terminal.login)
    });
    const result = await parseJsonResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || '登录失败');
    terminal.admin = result.data.admin;
    terminal.login.password = '';
    localStorage.removeItem('admin_token');
    localStorage.removeItem('tsukuyomi_token');
    localStorage.removeItem('tsukuyomi_user');
    localStorage.setItem('admin_user', JSON.stringify(terminal.admin));
    emit('auth-changed');
    await loadPanel('dashboard');
  } catch (error) {
    terminal.loginMessage = error.message;
  } finally {
    terminal.loading = false;
  }
}

async function logout() {
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
  } catch (_) {
    // Local cleanup still applies.
  }
  terminal.admin = null;
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  emit('auth-changed');
}

async function loadPanel(panel = terminal.activePanel) {
  terminal.activePanel = panel;
  terminal.loading = true;
  terminal.message = '';
  try {
    if (panel === 'dashboard') terminal.stats = { ...terminal.stats, ...(await adminApi('/stats') || {}) };
    if (panel === 'articles') terminal.articles = await adminApi('/articles') || [];
    if (panel === 'messages') terminal.messages = await adminApi('/messages') || [];
    if (panel === 'users') {
      terminal.users = await adminApi('/users') || [];
      terminal.usernameDrafts = Object.fromEntries(terminal.users.map((user) => [user.id, user.username || '']));
      terminal.roleDrafts = Object.fromEntries(terminal.users.map((user) => [user.id, user.role || 'user']));
      terminal.passwordDrafts = Object.fromEntries(terminal.users.map((user) => [user.id, '']));
    }
    if (panel === 'links') terminal.links = await adminApi('/links') || [];
    if (panel === 'analytics') terminal.analytics = { ...terminal.analytics, ...(await adminApi('/analytics') || {}) };
    if (panel === 'settings') terminal.settings = { ...terminal.settings, ...(await adminApi('/settings') || {}) };
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    terminal.loading = false;
  }
}

async function toggleArticle(id) {
  await adminApi(`/articles/${id}/toggle-status`, { method: 'POST' });
  showMessage('文章状态已更新');
  await loadPanel('articles');
}

async function toggleArticlePin(item) {
  await adminApi(`/articles/${item.id}/toggle-pin`, { method: 'POST' });
  showMessage(item.pinned_at ? '文章已取消置顶' : '文章已置顶');
  await loadPanel('articles');
}

async function deleteArticle(id) {
  if (!confirm('确定删除这篇文章吗？')) return;
  await adminApi(`/articles/${id}`, { method: 'DELETE' });
  showMessage('文章已删除');
  await loadPanel('articles');
}

async function approveMessage(id) {
  try {
    await adminApi(`/messages/${id}/approve`, { method: 'POST' });
    showMessage('留言已通过');
    await loadPanel('messages');
  } catch (error) {
    showMessage(error.message || '留言审核失败', 'error');
  }
}

async function deleteMessage(id) {
  if (!confirm('确定删除这条留言吗？')) return;
  try {
    await adminApi(`/messages/${id}`, { method: 'DELETE' });
    terminal.messages = terminal.messages.filter((item) => item.id !== id && item.parent_id !== id);
    showMessage('留言已删除');
    await loadPanel('messages');
  } catch (error) {
    showMessage(error.message || '留言删除失败', 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('确定删除这个用户吗？')) return;
  await adminApi(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  showMessage('用户已删除');
  await loadPanel('users');
}

async function changeUserRole(user) {
  const role = terminal.roleDrafts[user.id] || 'user';
  await adminApi(`/users/${encodeURIComponent(user.id)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role })
  });
  showMessage(`用户 ${user.username} 的角色已更新为 ${role}`);
  await loadPanel('users');
}

async function changeUserUsername(user) {
  const username = String(terminal.usernameDrafts[user.id] || '').trim();
  if (!username) {
    showMessage('请输入昵称', 'error');
    return;
  }
  await adminApi(`/users/${encodeURIComponent(user.id)}/username`, {
    method: 'PATCH',
    body: JSON.stringify({ username })
  });
  showMessage(`用户 ${user.username} 的昵称已更新为 ${username}`);
  await loadPanel('users');
}

async function resetUserPassword(user) {
  const password = terminal.passwordDrafts[user.id] || '';
  if (password.length < 6) {
    showMessage('用户新密码至少 6 位', 'error');
    return;
  }
  if (!confirm(`确定重置 ${user.username} 的登录密码吗？`)) return;
  await adminApi(`/users/${encodeURIComponent(user.id)}/password`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
  terminal.passwordDrafts[user.id] = '';
  showMessage(`用户 ${user.username} 的密码已重置`);
}

async function saveAdminPassword() {
  if (terminal.adminPassword.newPassword !== terminal.adminPassword.confirmPassword) {
    showMessage('两次输入的新密码不一致', 'error');
    return;
  }
  await adminApi('/password', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: terminal.adminPassword.currentPassword,
      newPassword: terminal.adminPassword.newPassword
    })
  });
  terminal.adminPassword.currentPassword = '';
  terminal.adminPassword.newPassword = '';
  terminal.adminPassword.confirmPassword = '';
  showMessage('管理员密码已更新，请妥善保存新密码');
}

async function createLink() {
  await adminApi('/links', { method: 'POST', body: JSON.stringify(terminal.newLink) });
  terminal.newLink.name = '';
  terminal.newLink.url = '';
  showMessage('友链已添加');
  await loadPanel('links');
}

async function deleteLink(id) {
  if (!confirm('确定删除这条友链吗？')) return;
  await adminApi(`/links/${id}`, { method: 'DELETE' });
  showMessage('友链已删除');
  await loadPanel('links');
}

async function saveSettings() {
  await adminApi('/settings', { method: 'POST', body: JSON.stringify(terminal.settings) });
  showMessage('配置已保存');
}

async function testOssSettings() {
  terminal.ossTest.loading = true;
  terminal.ossTest.message = '';
  terminal.ossTest.type = '';
  terminal.ossTest.detail = '';
  try {
    const result = await adminApi('/settings/oss-test', {
      method: 'POST',
      body: JSON.stringify(terminal.settings)
    });
    terminal.ossTest.type = result?.usable ? 'success' : 'error';
    terminal.ossTest.message = result?.usable ? '测试通过：对象存储配置可用' : '测试完成：请查看对象存储检查结果';
    terminal.ossTest.detail = Array.isArray(result?.checks) && result.checks.length
      ? result.checks.map((item) => {
        const marker = item.status === 'passed' ? '通过' : (item.status === 'skipped' ? '跳过' : '异常');
        const extra = [
          item.status ? `状态：${marker}` : '',
          item.status ? item.message : '',
          item.status && item.status !== 'skipped' && item.elapsedMs ? `耗时：${item.elapsedMs}ms` : ''
        ].filter(Boolean).join('，');
        return `${item.name}：${extra}`;
      }).join('；')
      : [
        result?.publicBaseUrl ? `地址：${result.publicBaseUrl}` : '',
        result?.status ? `HTTP：${result.status} ${result.statusText || ''}` : '',
        result?.elapsedMs ? `耗时：${result.elapsedMs}ms` : '',
        result?.error ? `错误：${result.error}` : ''
      ].filter(Boolean).join(' / ');
    showMessage(terminal.ossTest.message, result?.usable ? 'success' : 'error');
  } catch (error) {
    terminal.ossTest.type = 'error';
    terminal.ossTest.message = '测试失败：无法完成对象存储检测';
    terminal.ossTest.detail = error.message || '';
    showMessage(terminal.ossTest.message, 'error');
  } finally {
    terminal.ossTest.loading = false;
  }
}

function resetOssImport() {
  terminal.ossImport.objectKey = '';
  terminal.ossImport.title = '';
  terminal.ossImport.assetType = 'auto';
  terminal.ossImport.mimeType = '';
  terminal.ossImport.size = '';
  terminal.ossImport.visibility = 'public';
  terminal.ossImport.description = '';
}

async function registerOssAsset() {
  terminal.ossImport.message = '';
  terminal.ossImport.type = '';
  const objectKey = terminal.ossImport.objectKey.trim();
  if (!objectKey) {
    terminal.ossImport.message = '请填写 OSS Object Key';
    terminal.ossImport.type = 'error';
    return;
  }
  terminal.ossImport.loading = true;
  try {
    const response = await fetch('/api/assets/oss-register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        objectKey,
        title: terminal.ossImport.title.trim(),
        assetType: terminal.ossImport.assetType,
        mimeType: terminal.ossImport.mimeType.trim(),
        size: terminal.ossImport.size,
        visibility: terminal.ossImport.visibility,
        description: terminal.ossImport.description.trim()
      })
    });
    const result = await parseJsonResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || 'OSS 资源登记失败');
    terminal.ossImport.message = 'OSS 资源已登记，只保存索引，不同步到本地';
    terminal.ossImport.type = 'success';
    resetOssImport();
  } catch (error) {
    terminal.ossImport.message = error.message || 'OSS 资源登记失败';
    terminal.ossImport.type = 'error';
  } finally {
    terminal.ossImport.loading = false;
  }
}

async function scanOssAssets() {
  terminal.ossImport.scanMessage = '';
  terminal.ossImport.scanType = '';
  terminal.ossImport.scanning = true;
  try {
    const response = await fetch('/api/assets/oss-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        prefix: terminal.ossImport.scanPrefix.trim(),
        maxKeys: terminal.ossImport.scanLimit || 100,
        visibility: terminal.ossImport.visibility,
        assetType: terminal.ossImport.assetType
      })
    });
    const result = await parseJsonResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || 'OSS 扫描失败');
    terminal.ossImport.scanType = 'success';
    terminal.ossImport.scanMessage = `扫描 ${result.data.scannedCount || 0} 个，登记 ${result.data.importedCount || 0} 个，跳过 ${result.data.skippedCount || 0} 个`;
  } catch (error) {
    terminal.ossImport.scanType = 'error';
    terminal.ossImport.scanMessage = error.message || 'OSS 扫描失败';
  } finally {
    terminal.ossImport.scanning = false;
  }
}

function updateClock() {
  terminal.clock = formatDateTime(new Date(), 'zh-CN');
}

onMounted(() => {
  updateClock();
  clockTimer = window.setInterval(updateClock, 1000);
  verifySession();
});

onUnmounted(() => {
  window.clearInterval(clockTimer);
});
</script>

<template>
  <main class="page terminal-page">
    <section v-if="!authed" class="terminal-auth">
      <form class="terminal-card terminal-login-card" @submit.prevent="login">
        <h1>数据终端</h1>
        <p>仅管理员可访问。所有操作都会通过服务端权限校验。</p>
        <div v-if="terminal.loginMessage" class="form-message error">{{ terminal.loginMessage }}</div>
        <label>管理员账号<input v-model="terminal.login.username" autocomplete="username" required></label>
        <label>密码<input v-model="terminal.login.password" type="password" autocomplete="current-password" required></label>
        <button class="primary-btn" type="submit" :disabled="terminal.loading">{{ terminal.loading ? '连接中...' : '连接终端' }}</button>
      </form>
    </section>

    <section v-else class="terminal-shell">
      <header class="terminal-topbar">
        <div>
          <strong>Tsukuyomi Terminal</strong>
          <span>后台管理工作台 · {{ terminal.clock }}</span>
        </div>
        <div class="terminal-session">
          <span>{{ terminal.admin?.username }} / {{ terminal.admin?.role }}</span>
          <button class="ghost-btn" type="button" @click="$emit('go', '/gallery')">图库</button>
          <button class="ghost-btn" type="button" @click="$emit('go', '/attachments')">附件库</button>
          <button class="ghost-btn" type="button" @click="$emit('go', '/hub')">大厅</button>
          <button class="danger-btn" type="button" @click="logout">断开</button>
        </div>
      </header>

      <div class="terminal-layout">
        <aside class="terminal-sidebar">
          <button v-for="panel in panels" :key="panel.id" class="terminal-nav-btn" :class="{ active: terminal.activePanel === panel.id }" type="button" @click="loadPanel(panel.id)">
            {{ panel.label }} <span>{{ panel.code }}</span>
          </button>
        </aside>

        <section class="terminal-panel">
          <div v-if="terminal.message" class="form-message" :class="terminal.messageType">{{ terminal.message }}</div>
          <div v-if="terminal.loading" class="terminal-empty">正在同步数据...</div>

          <div v-show="terminal.activePanel === 'dashboard'">
            <div class="terminal-panel-head"><h2>系统总览</h2><button class="ghost-btn" type="button" @click="loadPanel('dashboard')">刷新</button></div>
            <div class="terminal-hero">
              <div>
                <span class="terminal-kicker">CONTROL CENTER</span>
                <h3>内容、账号和站点状态集中管理</h3>
                <p>当前会话拥有 {{ terminal.admin?.role }} 权限。敏感操作会在服务端再次校验，不依赖前端显示。</p>
              </div>
              <div class="terminal-hero-actions">
                <button class="primary-btn" type="button" @click="loadPanel('articles')">进入内容管理</button>
                <button class="ghost-btn" type="button" @click="$emit('go', '/gallery')">管理图库</button>
                <button class="ghost-btn" type="button" @click="$emit('go', '/attachments')">管理附件库</button>
              </div>
            </div>
            <div class="terminal-cards">
              <div class="terminal-card"><strong>文章总数</strong><span>{{ terminal.stats.articles || 0 }}</span></div>
              <div class="terminal-card"><strong>待审留言</strong><span>{{ terminal.stats.pendingMessages || 0 }}</span></div>
              <div class="terminal-card"><strong>今日访问</strong><span>{{ terminal.stats.todayViews || 0 }}</span></div>
              <div class="terminal-card"><strong>用户总数</strong><span>{{ terminal.stats.users || 0 }}</span></div>
            </div>
          </div>

          <div v-show="terminal.activePanel === 'articles'">
            <div class="terminal-panel-head"><h2>文章管理</h2><button class="primary-btn" type="button" @click="$emit('go', '/editor')">新建文章</button></div>
            <div class="terminal-summary-row">
              <span>已发布 {{ publishedArticleCount }}</span>
              <span>草稿 {{ terminal.articles.length - publishedArticleCount }}</span>
              <span>置顶 {{ pinnedArticleCount }}</span>
              <span>总阅读 {{ terminal.articles.reduce((sum, item) => sum + Number(item.view_count || 0), 0) }}</span>
            </div>
            <div class="terminal-table-wrap"><table><thead><tr><th>ID</th><th>标题</th><th>分类</th><th>阅读</th><th>状态</th><th>置顶</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in terminal.articles" :key="item.id">
                <td>{{ item.id }}</td><td><a href="#" @click.prevent="$emit('go', articlePath(item))">{{ item.title }}</a></td><td>{{ item.category || '未分类' }}</td><td>{{ item.view_count || 0 }}</td>
                <td><span class="terminal-badge" :class="item.status === 'published' ? 'ok' : 'warn'">{{ item.status === 'published' ? '已发布' : '草稿' }}</span></td>
                <td><span class="terminal-badge" :class="item.pinned_at ? 'hot' : ''">{{ item.pinned_at ? '已置顶' : '普通' }}</span></td>
                <td>{{ formatDate(item.updated_at || item.created_at) }}</td>
                <td><div class="terminal-actions"><button class="ghost-btn" type="button" @click="$emit('go', `/editor?id=${item.id}`)">编辑</button><button class="ghost-btn" type="button" @click="toggleArticle(item.id)">切换</button><button class="ghost-btn" type="button" @click="toggleArticlePin(item)">{{ item.pinned_at ? '取消置顶' : '置顶' }}</button><button class="danger-btn" type="button" @click="deleteArticle(item.id)">删除</button></div></td>
              </tr>
            </tbody></table></div>
          </div>

          <div v-show="terminal.activePanel === 'messages'">
            <div class="terminal-panel-head"><h2>留言审核</h2><button class="ghost-btn" type="button" @click="loadPanel('messages')">刷新</button></div>
            <div class="terminal-summary-row">
              <span>待审核 {{ pendingMessageCount }}</span>
              <span>已通过 {{ terminal.messages.length - pendingMessageCount }}</span>
              <span>留言墙 {{ plazaMessageCount }}</span>
              <span>文章评论 {{ articleMessageCount }}</span>
              <span>总留言 {{ terminal.messages.length }}</span>
            </div>
            <div class="terminal-table-wrap"><table><thead><tr><th>作者</th><th>来源</th><th>内容</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in terminal.messages" :key="item.id">
                <td>{{ item.username || item.author }}</td>
                <td>
                  <span class="terminal-badge" :class="item.article_id ? 'hot' : 'ok'">{{ messageSourceLabel(item) }}</span>
                  <a v-if="item.article_id" class="terminal-source-link" href="#" @click.prevent="$emit('go', messageArticlePath(item))">{{ item.article_title || `文章 #${item.article_id}` }}</a>
                  <small v-else>月读广场留言墙</small>
                </td>
                <td>{{ item.content }}</td>
                <td><span class="terminal-badge" :class="item.status === 'approved' ? 'ok' : 'warn'">{{ item.status === 'approved' ? '已通过' : '待审核' }}</span></td>
                <td>{{ formatDate(item.created_at) }}</td>
                <td><div class="terminal-actions"><button v-if="item.status !== 'approved'" class="primary-btn" type="button" @click="approveMessage(item.id)">通过</button><button class="danger-btn" type="button" @click="deleteMessage(item.id)">删除</button></div></td>
              </tr>
            </tbody></table></div>
          </div>

          <div v-show="terminal.activePanel === 'users'">
            <div class="terminal-panel-head"><h2>用户管理</h2><button class="ghost-btn" type="button" @click="loadPanel('users')">刷新</button></div>
            <div class="terminal-toolbar">
              <input v-model="terminal.userSearch" placeholder="搜索用户名、邮箱、角色或 ID">
              <span class="terminal-toolbar-note">仅 super_admin 可修改角色或重置密码</span>
            </div>
            <div class="terminal-table-wrap"><table><thead><tr><th>ID</th><th>用户</th><th>邮箱</th><th>角色</th><th>注册时间</th><th>权限</th><th>密码</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in filteredUsers" :key="item.id">
                <td>{{ String(item.id).slice(0, 8) }}</td>
                <td>
                  <strong>{{ item.username }}</strong>
                  <small>{{ item.bio || '未填写简介' }}</small>
                  <div v-if="canManageAccounts && item.username !== 'admin'" class="terminal-inline-edit">
                    <input v-model="terminal.usernameDrafts[item.id]" type="text" maxlength="32" placeholder="编辑昵称">
                    <button class="ghost-btn compact" type="button" :disabled="!terminal.usernameDrafts[item.id] || terminal.usernameDrafts[item.id] === item.username || item.username === 'admin'" @click="changeUserUsername(item)">保存昵称</button>
                  </div>
                </td>
                <td>{{ item.email }}</td>
                <td><span class="terminal-badge hot">{{ item.role || 'user' }}</span></td>
                <td>{{ formatDate(item.created_at) }}</td>
                <td>
                  <select v-model="terminal.roleDrafts[item.id]" :disabled="!canManageAccounts || item.username === 'admin'">
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                  <button class="ghost-btn compact" type="button" :disabled="!canManageAccounts || terminal.roleDrafts[item.id] === item.role || item.username === 'admin'" @click="changeUserRole(item)">保存</button>
                </td>
                <td>
                  <input v-model="terminal.passwordDrafts[item.id]" type="password" placeholder="新密码">
                  <button class="ghost-btn compact" type="button" :disabled="!canManageAccounts || !terminal.passwordDrafts[item.id]" @click="resetUserPassword(item)">重置</button>
                </td>
                <td><button class="danger-btn" type="button" :disabled="!canManageAccounts || item.role === 'admin' || item.username === 'admin'" @click="deleteUser(item.id)">删除</button></td>
              </tr>
            </tbody></table></div>
          </div>

          <div v-show="terminal.activePanel === 'account'">
            <div class="terminal-panel-head"><h2>账号密码管理</h2><button class="ghost-btn" type="button" @click="loadPanel('account')">刷新</button></div>
            <div class="terminal-account-grid">
              <article class="terminal-card terminal-account-card">
                <strong>当前管理员</strong>
                <span>{{ terminal.admin?.username }}</span>
                <p>角色：{{ terminal.admin?.role }}。角色变更、用户密码重置等敏感操作仅 super_admin 开放。</p>
              </article>
              <form class="terminal-card terminal-password-card" @submit.prevent="saveAdminPassword">
                <strong>修改管理员密码</strong>
                <label>当前密码<input v-model="terminal.adminPassword.currentPassword" type="password" autocomplete="current-password" required></label>
                <label>新密码<input v-model="terminal.adminPassword.newPassword" type="password" autocomplete="new-password" required></label>
                <label>确认新密码<input v-model="terminal.adminPassword.confirmPassword" type="password" autocomplete="new-password" required></label>
                <button class="primary-btn" type="submit">更新密码</button>
              </form>
            </div>
          </div>

          <div v-show="terminal.activePanel === 'links'">
            <div class="terminal-panel-head"><h2>友链管理</h2><button class="ghost-btn" type="button" @click="loadPanel('links')">刷新</button></div>
            <form class="terminal-toolbar" @submit.prevent="createLink"><input v-model="terminal.newLink.name" placeholder="站点名称" required><input v-model="terminal.newLink.url" placeholder="https://example.com" required><button class="primary-btn" type="submit">添加友链</button></form>
            <div class="terminal-table-wrap"><table><thead><tr><th>名称</th><th>URL</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in terminal.links" :key="item.id"><td>{{ item.name }}</td><td><a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.url }}</a></td><td><span class="terminal-badge ok">{{ item.status || 'active' }}</span></td><td>{{ formatDate(item.created_at) }}</td><td><button class="danger-btn" type="button" @click="deleteLink(item.id)">删除</button></td></tr>
            </tbody></table></div>
          </div>

          <div v-show="terminal.activePanel === 'analytics'">
            <div class="terminal-panel-head"><h2>访问统计</h2><button class="ghost-btn" type="button" @click="loadPanel('analytics')">刷新</button></div>
            <div class="terminal-cards">
              <div class="terminal-card"><strong>今日访问</strong><span>{{ terminal.analytics.todayViews || 0 }}</span></div>
              <div class="terminal-card"><strong>7 日访问</strong><span>{{ terminal.analytics.weekViews || 0 }}</span></div>
              <div class="terminal-card"><strong>30 日访问</strong><span>{{ terminal.analytics.monthViews || 0 }}</span></div>
              <div class="terminal-card"><strong>总访问</strong><span>{{ terminal.analytics.totalViews || 0 }}</span></div>
            </div>
          </div>

          <form v-show="terminal.activePanel === 'settings'" class="terminal-settings" @submit.prevent="saveSettings">
            <div class="terminal-panel-head"><h2>系统配置</h2><button class="primary-btn" type="submit">保存配置</button></div>
            <label>站点标题<input v-model="terminal.settings.siteTitle"></label>
            <label>公告内容<textarea v-model="terminal.settings.siteAnnouncement"></textarea></label>
            <div class="terminal-settings-block">
              <label class="terminal-check"><input v-model="terminal.settings.visitPopupEnabled" type="checkbox"> 启用访问弹窗</label>
              <label>弹窗标题<input v-model="terminal.settings.visitPopupTitle" placeholder="欢迎来到月读空间"></label>
              <label>弹窗内容<textarea v-model="terminal.settings.visitPopupContent" placeholder="输入访客进入网站时看到的内容"></textarea></label>
              <label>按钮文字<input v-model="terminal.settings.visitPopupButton" placeholder="我知道了"></label>
            </div>
            <div class="terminal-settings-block">
              <label>留言审核关键词<textarea v-model="terminal.settings.messageReviewKeywords" rows="5" placeholder="每行一个或用逗号分隔。命中关键词的留言会进入待审，未命中则自动通过。留空时使用系统默认备案安全词库。"></textarea></label>
              <p class="terminal-setting-note">用于阅读广场、文章评论和回复。普通友好留言会自动公开；涉及安全、违法、广告等关键词的内容进入人工审核。</p>
            </div>
            <div class="terminal-settings-block">
              <label>ICP备案号<input v-model="terminal.settings.beianText" placeholder="苏ICP备2026030780号-1"></label>
              <label>ICP备案链接<input v-model="terminal.settings.beianUrl" placeholder="https://beian.miit.gov.cn/"></label>
              <label>公安联网备案号<input v-model="terminal.settings.mpsBeianText" placeholder="苏公网安备32058502011868号"></label>
              <label>公安联网备案链接<input v-model="terminal.settings.mpsBeianUrl" placeholder="https://beian.mps.gov.cn/#/query/webSearch?code=32058502011868"></label>
              <label>公安备案图标路径<input v-model="terminal.settings.mpsBeianIcon" placeholder="/assets/images/beian-mps.png"></label>
              <p class="terminal-setting-note">公安备案会显示在 ICP 备案号下方。图标文件建议放在服务器本地 /assets/images/beian-mps.png，并用 .gitignore 排除。</p>
            </div>
            <div class="terminal-settings-block terminal-oss-settings">
              <label class="terminal-check"><input v-model="terminal.settings.ossEnabled" type="checkbox"> 自动优先使用对象存储上传</label>
              <label>服务商
                <select v-model="terminal.settings.ossProvider">
                  <option value="aliyun">阿里云 OSS</option>
                  <option value="tencent">腾讯云 COS</option>
                  <option value="qiniu">七牛云 Kodo</option>
                  <option value="aws-s3">AWS S3 / 兼容 S3</option>
                  <option value="cloudflare-r2">Cloudflare R2</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label>公开访问域名 / CDN 域名<input v-model="terminal.settings.ossPublicBaseUrl" placeholder="https://static.example.com"></label>
              <label>Endpoint<input v-model="terminal.settings.ossEndpoint" placeholder="https://oss-cn-hangzhou.aliyuncs.com 或 127.0.0.1:9000"></label>
              <label>Region<input v-model="terminal.settings.ossRegion" placeholder="oss-cn-hangzhou"></label>
              <label>Bucket<input v-model="terminal.settings.ossBucket" placeholder="tsukuyomi-assets"></label>
              <label>资源前缀<input v-model="terminal.settings.ossPrefix" placeholder="public/"></label>
              <label>上传目录<input v-model="terminal.settings.ossUploadPath" placeholder="articles/${year}/${month}/${role}"></label>
              <label>默认存储位置
                <select v-model="terminal.settings.ossDefaultStorage">
                  <option value="auto">自动：对象存储可用时优先，否则本地</option>
                  <option value="local">本地存储</option>
                  <option value="oss">对象存储</option>
                </select>
              </label>
              <label>文件名策略
                <select v-model="terminal.settings.ossFileNameMode">
                  <option value="uuid">UUID</option>
                  <option value="timestamp">时间戳 + UUID</option>
                </select>
              </label>
              <label>AccessKey ID<input v-model="terminal.settings.ossAccessKeyId" autocomplete="off"></label>
              <label>AccessKey Secret<input v-model="terminal.settings.ossAccessKeySecret" type="password" autocomplete="new-password"></label>
              <label class="terminal-check"><input v-model="terminal.settings.ossForcePathStyle" type="checkbox"> 使用路径风格访问</label>
              <div class="terminal-oss-actions">
                <button class="primary-btn" type="submit">保存对象存储设置</button>
                <button class="ghost-btn" type="button" :disabled="terminal.ossTest.loading" @click="testOssSettings">
                  {{ terminal.ossTest.loading ? '测试中...' : '测试对象存储' }}
                </button>
                <span v-if="terminal.ossTest.message" class="terminal-oss-result" :class="terminal.ossTest.type">
                  {{ terminal.ossTest.message }}
                </span>
              </div>
              <p v-if="terminal.ossTest.detail" class="terminal-setting-note terminal-oss-detail">{{ terminal.ossTest.detail }}</p>
              <p class="terminal-setting-note">公开访问域名会下发给前端用于 /assets、/models、/lib 等静态资源；AccessKey 仅保存在后台配置接口中。</p>
              <div class="terminal-oss-import">
                <div class="terminal-oss-import-head">
                  <strong>登记 OSS 大文件</strong>
                  <span>适合电影、长视频、音频包等已手动上传到 OSS 的资源；只登记 Object Key，不同步到本地。</span>
                </div>
                <label>Object Key<input v-model="terminal.ossImport.objectKey" placeholder="movies/example.mp4"></label>
                <label>扫描前缀<input v-model="terminal.ossImport.scanPrefix" placeholder="movies/ 或留空扫描根目录"></label>
                <label>扫描数量<input v-model.number="terminal.ossImport.scanLimit" type="number" min="1" max="1000" placeholder="100"></label>
                <label>显示名称<input v-model="terminal.ossImport.title" placeholder="留空则使用文件名"></label>
                <label>资源类型
                  <select v-model="terminal.ossImport.assetType">
                    <option value="auto">自动识别</option>
                    <option value="video">视频</option>
                    <option value="audio">音频</option>
                    <option value="image">图片</option>
                    <option value="document">文档</option>
                    <option value="file">文件</option>
                    <option value="live2d">Live2D</option>
                  </select>
                </label>
                <label>MIME 类型<input v-model="terminal.ossImport.mimeType" placeholder="可选，例如 video/mp4"></label>
                <label>大小（字节）<input v-model="terminal.ossImport.size" type="number" min="0" placeholder="可选"></label>
                <label>可见性
                  <select v-model="terminal.ossImport.visibility">
                    <option value="public">公共资源</option>
                    <option value="private">仅管理员账号可见</option>
                  </select>
                </label>
                <label class="terminal-oss-import-note">备注<textarea v-model="terminal.ossImport.description" rows="2" placeholder="可选"></textarea></label>
                <div class="terminal-oss-actions">
                  <button class="ghost-btn" type="button" :disabled="terminal.ossImport.loading" @click="registerOssAsset">
                    {{ terminal.ossImport.loading ? '登记中...' : '登记 OSS 资源' }}
                  </button>
                  <button class="ghost-btn" type="button" :disabled="terminal.ossImport.scanning" @click="scanOssAssets">
                    {{ terminal.ossImport.scanning ? '扫描中...' : '扫描并登记' }}
                  </button>
                  <span v-if="terminal.ossImport.message" class="terminal-oss-result" :class="terminal.ossImport.type">
                    {{ terminal.ossImport.message }}
                  </span>
                  <span v-if="terminal.ossImport.scanMessage" class="terminal-oss-result" :class="terminal.ossImport.scanType">
                    {{ terminal.ossImport.scanMessage }}
                  </span>
                </div>
              </div>
            </div>
            <label class="terminal-check"><input v-model="terminal.settings.sakuraEffect" type="checkbox"> 启用环境动效</label>
            <label class="terminal-check"><input v-model="terminal.settings.scanlineEffect" type="checkbox"> 启用扫描线效果</label>
          </form>
        </section>
      </div>
    </section>
  </main>
</template>
