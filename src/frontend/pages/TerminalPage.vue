<script setup>
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue';
import { apiFetch, noStoreUrl, saveUserSession } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { formatDateTime } from '../utils/time';

const emit = defineEmits(['go', 'auth-changed']);

const panels = [
  { id: 'dashboard', label: '总览', code: '01', group: '巡检', desc: '关键指标和常用入口' },
  { id: 'analytics', label: '统计', code: '02', group: '巡检', desc: '访问趋势和站点热度' },
  { id: 'articles', label: '文章', code: '03', group: '内容', desc: '发布、置顶和状态管理' },
  { id: 'messages', label: '留言', code: '04', group: '内容', desc: '留言墙与文章评论审核' },
  { id: 'links', label: '友链审核', code: '05', group: '内容', desc: '处理友链申请与收录状态' },
  { id: 'users', label: '用户', code: '06', group: '系统', desc: '用户检索、角色和密码' },
  { id: 'account', label: '账号安全', code: '07', group: '系统', desc: '当前管理员安全设置' },
  { id: 'settings', label: '设置', code: '08', group: '系统', desc: '站点、备案和对象存储' }
];

const terminal = reactive({
  admin: null,
  sessionChecking: true,
  activePanel: 'dashboard',
  loading: false,
  loginMessage: '',
  message: '',
  messageType: 'success',
  loadError: '',
  clock: '',
  login: { username: '', password: '' },
  stats: { articles: 0, pendingMessages: 0, todayViews: 0, users: 0 },
  analytics: { todayViews: 0, weekViews: 0, monthViews: 0, totalViews: 0 },
  articles: [],
  messages: [],
  users: [],
  userSearch: '',
  userPage: 1,
  userPageSize: 8,
  usernameDrafts: {},
  roleDrafts: {},
  passwordDrafts: {},
  adminPassword: { currentPassword: '', newPassword: '', confirmPassword: '' },
  links: [],
  newLink: { name: '', url: '', description: '' },
  linkCreating: false,
  linkReviewFilter: 'pending',
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
const TERMINAL_USER_PAGE_SIZES = [8, 12, 20];
const SITE_SETTING_KEYS = [
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
  'mpsBeianIcon'
];
const authed = computed(() => Boolean(terminal.admin));
const canManageAccounts = computed(() => terminal.admin?.role === 'super_admin');
const groupedPanels = computed(() => ['巡检', '内容', '系统']
  .map((group) => ({ group, items: panels.filter((panel) => panel.group === group) }))
  .filter((entry) => entry.items.length));
const activePanelMeta = computed(() => panels.find((panel) => panel.id === terminal.activePanel) || panels[0]);
const filteredUsers = computed(() => {
  const keyword = terminal.userSearch.trim().toLowerCase();
  if (!keyword) return terminal.users;
  return terminal.users.filter((item) => [item.username, item.email, item.role, item.id].some((value) => String(value || '').toLowerCase().includes(keyword)));
});
const userTotalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / Number(terminal.userPageSize || 8))));
const userCurrentPage = computed(() => Math.min(Math.max(Number(terminal.userPage) || 1, 1), userTotalPages.value));
const userPageStart = computed(() => filteredUsers.value.length ? (userCurrentPage.value - 1) * Number(terminal.userPageSize || 8) + 1 : 0);
const userPageEnd = computed(() => Math.min(userCurrentPage.value * Number(terminal.userPageSize || 8), filteredUsers.value.length));
const pagedUsers = computed(() => {
  const size = Number(terminal.userPageSize || 8);
  const start = (userCurrentPage.value - 1) * size;
  return filteredUsers.value.slice(start, start + size);
});
const userPageItems = computed(() => {
  const total = userTotalPages.value;
  const current = userCurrentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('gap-left');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push('gap-right');
  pages.push(total);
  return pages;
});
const pendingMessageCount = computed(() => terminal.messages.filter((item) => item.status !== 'approved').length);
const plazaMessageCount = computed(() => terminal.messages.filter((item) => !item.article_id).length);
const articleMessageCount = computed(() => terminal.messages.filter((item) => item.article_id).length);
const publishedArticleCount = computed(() => terminal.articles.filter((item) => item.status === 'published').length);
const pinnedArticleCount = computed(() => terminal.articles.filter((item) => item.pinned_at).length);
const linkReviewCounts = computed(() => ({
  all: terminal.links.length,
  pending: terminal.links.filter((item) => item.status === 'pending').length,
  active: terminal.links.filter((item) => item.status === 'active').length,
  rejected: terminal.links.filter((item) => item.status === 'rejected').length
}));
const filteredReviewLinks = computed(() => terminal.linkReviewFilter === 'all'
  ? terminal.links
  : terminal.links.filter((item) => item.status === terminal.linkReviewFilter));

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

function setUserPage(page) {
  const numericPage = Number(page);
  if (!Number.isFinite(numericPage)) return;
  terminal.userPage = Math.min(Math.max(Math.trunc(numericPage), 1), userTotalPages.value);
}

function isUserPageGap(item) {
  return typeof item === 'string';
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : { success: false, message: `HTTP ${response.status}` };
  } catch (_) {
    return { success: false, message: `请求失败 (HTTP ${response.status})` };
  }
}

async function adminApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const method = String(options.method || 'GET').toUpperCase();
  const url = method === 'GET' ? noStoreUrl(`/api/admin${path}`) : `/api/admin${path}`;
  const response = await apiFetch(url, { ...options, headers, credentials: 'include', cache: method === 'GET' ? 'no-store' : options.cache });
  const result = await parseJsonResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data;
}

async function verifySession() {
  if (!localStorage.getItem('admin_user')) {
    terminal.sessionChecking = false;
    return;
  }
  try {
    terminal.admin = await adminApi('/me');
    await loadPanel('dashboard');
  } catch (error) {
    terminal.admin = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    terminal.loginMessage = error.message;
  } finally {
    terminal.sessionChecking = false;
  }
}

async function login() {
  terminal.loading = true;
  terminal.loginMessage = '';
  try {
    const response = await apiFetch('/api/admin/login', {
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
    localStorage.setItem('admin_user', JSON.stringify(terminal.admin));
    saveUserSession('', result.data.user, { preserveAdmin: true });
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
    await apiFetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
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
  terminal.loadError = '';
  try {
    if (panel === 'dashboard') terminal.stats = { ...terminal.stats, ...(await adminApi('/stats') || {}) };
    if (panel === 'articles') terminal.articles = await adminApi('/articles') || [];
    if (panel === 'messages') terminal.messages = await adminApi('/messages') || [];
    if (panel === 'users') {
      terminal.users = await adminApi('/users') || [];
      terminal.userPage = 1;
      terminal.usernameDrafts = Object.fromEntries(terminal.users.map((user) => [user.id, user.username || '']));
      terminal.roleDrafts = Object.fromEntries(terminal.users.map((user) => [user.id, user.role || 'user']));
      terminal.passwordDrafts = Object.fromEntries(terminal.users.map((user) => [user.id, '']));
    }
    if (panel === 'links') terminal.links = await adminApi('/links') || [];
    if (panel === 'analytics') terminal.analytics = { ...terminal.analytics, ...(await adminApi('/analytics') || {}) };
    if (panel === 'settings') terminal.settings = { ...terminal.settings, ...(await adminApi('/settings') || {}) };
  } catch (error) {
    terminal.loadError = error.message || '后台数据读取失败';
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
  if (password.length < 8) {
    showMessage('用户新密码至少 8 位', 'error');
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
  terminal.linkCreating = true;
  try {
    await adminApi('/links', {
      method: 'POST',
      body: JSON.stringify(terminal.newLink)
    });
    terminal.newLink = { name: '', url: '', description: '' };
    terminal.linkReviewFilter = 'active';
    showMessage('友链已添加并公开');
    await loadPanel('links');
  } catch (error) {
    showMessage(error.message || '友链添加失败', 'error');
  } finally {
    terminal.linkCreating = false;
  }
}

async function updateLinkStatus(id, status) {
  await adminApi(`/links/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  showMessage(status === 'active' ? '友链申请已通过' : '友链已移出公开目录');
  await loadPanel('links');
}

async function deleteLink(id) {
  if (!confirm('确定删除这条友链申请记录吗？')) return;
  await adminApi(`/links/${id}`, { method: 'DELETE' });
  showMessage('友链已删除');
  await loadPanel('links');
}

async function saveSettings() {
  const settings = canManageAccounts.value
    ? terminal.settings
    : Object.fromEntries(SITE_SETTING_KEYS.map((key) => [key, terminal.settings[key]]));
  await adminApi('/settings', { method: 'POST', body: JSON.stringify(settings) });
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
    const response = await apiFetch('/api/assets/oss-register', {
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
    const response = await apiFetch('/api/assets/oss-scan', {
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

watch(() => terminal.userSearch, () => {
  terminal.userPage = 1;
});

watch(() => terminal.userPageSize, () => {
  terminal.userPage = 1;
});

watch(userTotalPages, (total) => {
  if (terminal.userPage > total) terminal.userPage = total;
  if (terminal.userPage < 1) terminal.userPage = 1;
});

onUnmounted(() => {
  window.clearInterval(clockTimer);
});
</script>

<template>
  <main class="page terminal-page" :aria-busy="terminal.sessionChecking || terminal.loading">
    <section v-if="terminal.sessionChecking" class="terminal-auth" aria-busy="true">
      <div class="ts-loader-region">
        <StatusLoader label="正在验证管理会话" />
      </div>
    </section>

    <section v-else-if="!authed" class="terminal-auth">
      <form class="terminal-card terminal-login-card" :aria-busy="terminal.loading" @submit.prevent="login">
        <h1>数据终端</h1>
        <p>仅管理员可访问。所有操作都会通过服务端权限校验。</p>
        <div v-if="terminal.loginMessage" class="form-message error">{{ terminal.loginMessage }}</div>
        <label>管理员账号<input v-model="terminal.login.username" autocomplete="username" required></label>
        <label>密码<input v-model="terminal.login.password" type="password" autocomplete="current-password" required></label>
        <button class="primary-btn" type="submit" :disabled="terminal.loading" :aria-busy="terminal.loading">{{ terminal.loading ? '连接中...' : '连接终端' }}</button>
        <StatusLoader v-if="terminal.loading" label="正在连接终端" compact />
      </form>
    </section>

    <section v-else class="terminal-shell">
      <header class="terminal-topbar">
        <div class="terminal-brand">
          <strong>Tsukuyomi Terminal</strong>
          <span>后台管理工作台 · {{ terminal.clock }}</span>
        </div>
        <div class="terminal-session">
          <span class="terminal-user-pill">
            <span class="terminal-status-dot" :class="{ busy: terminal.loading }"></span>
            {{ terminal.admin?.username }} / {{ terminal.admin?.role }}
          </span>
          <button class="ghost-btn" type="button" @click="$emit('go', '/gallery/manage')">图库管理</button>
          <button class="ghost-btn" type="button" @click="$emit('go', '/attachments')">附件库</button>
          <button class="ghost-btn" type="button" @click="$emit('go', '/hub')">大厅</button>
          <button class="danger-btn" type="button" @click="logout">断开</button>
        </div>
      </header>

      <div class="terminal-layout">
        <aside class="terminal-sidebar">
          <div class="terminal-sidebar-head">
            <strong>模块</strong>
            <span>{{ panels.length }} sections</span>
          </div>
          <div v-for="group in groupedPanels" :key="group.group" class="terminal-nav-group">
            <span class="terminal-nav-group-label">{{ group.group }}</span>
            <button v-for="panel in group.items" :key="panel.id" class="terminal-nav-btn" :class="{ active: terminal.activePanel === panel.id }" type="button" @click="loadPanel(panel.id)">
              <span class="terminal-nav-copy">
                <strong>{{ panel.label }}</strong>
                <small>{{ panel.desc }}</small>
              </span>
              <span class="terminal-nav-code">{{ panel.code }}</span>
            </button>
          </div>
          <div class="terminal-sidebar-foot">
            <span>当前会话</span>
            <strong>{{ terminal.loading ? '同步中' : '已连接' }}</strong>
          </div>
        </aside>

        <section class="terminal-panel" :aria-busy="terminal.loading">
          <div class="terminal-context-bar">
            <div>
              <span class="terminal-kicker">{{ activePanelMeta.group }} / {{ activePanelMeta.code }}</span>
              <strong>{{ activePanelMeta.label }}</strong>
              <p>{{ activePanelMeta.desc }}</p>
            </div>
            <div class="terminal-context-actions">
              <button class="ghost-btn" type="button" :disabled="terminal.loading" :aria-busy="terminal.loading" @click="loadPanel(terminal.activePanel)">
                {{ terminal.loading ? '同步中...' : '刷新当前' }}
              </button>
              <button v-if="terminal.activePanel === 'articles'" class="primary-btn" type="button" @click="$emit('go', '/editor')">新建文章</button>
              <button v-if="terminal.activePanel === 'settings'" class="primary-btn" type="button" @click="saveSettings">保存配置</button>
            </div>
          </div>
          <div v-if="terminal.message" class="form-message" :class="terminal.messageType">{{ terminal.message }}</div>
          <LoadingSkeleton v-if="terminal.loading" variant="list" :count="6" label="正在同步后台数据" />
          <div v-else-if="terminal.loadError" class="terminal-empty error" role="alert">{{ terminal.loadError }}</div>

          <div v-show="!terminal.loading && !terminal.loadError && terminal.activePanel === 'dashboard'">
            <div class="terminal-panel-head"><h2>系统总览</h2></div>
            <div class="terminal-hero">
              <div>
                <span class="terminal-kicker">CONTROL CENTER</span>
                <h3>内容、账号和站点状态集中管理</h3>
                <p>当前会话拥有 {{ terminal.admin?.role }} 权限。敏感操作会在服务端再次校验，不依赖前端显示。</p>
              </div>
              <div class="terminal-hero-actions">
                <button class="primary-btn" type="button" @click="loadPanel('articles')">进入内容管理</button>
                <button class="ghost-btn" type="button" @click="$emit('go', '/gallery/manage')">管理图库</button>
                <button class="ghost-btn" type="button" @click="$emit('go', '/attachments')">管理附件库</button>
              </div>
            </div>
            <div class="terminal-cards">
              <button class="terminal-card terminal-stat-card" type="button" @click="loadPanel('articles')">
                <strong>文章总数</strong>
                <span>{{ terminal.stats.articles || 0 }}</span>
                <small>查看内容状态</small>
              </button>
              <button class="terminal-card terminal-stat-card" type="button" @click="loadPanel('messages')">
                <strong>待审留言</strong>
                <span>{{ terminal.stats.pendingMessages || 0 }}</span>
                <small>进入审核队列</small>
              </button>
              <button class="terminal-card terminal-stat-card" type="button" @click="loadPanel('analytics')">
                <strong>今日访问</strong>
                <span>{{ terminal.stats.todayViews || 0 }}</span>
                <small>查看统计面板</small>
              </button>
              <button class="terminal-card terminal-stat-card" type="button" @click="loadPanel('users')">
                <strong>用户总数</strong>
                <span>{{ terminal.stats.users || 0 }}</span>
                <small>管理用户权限</small>
              </button>
            </div>
          </div>

          <div v-show="!terminal.loading && !terminal.loadError && terminal.activePanel === 'articles'">
            <div class="terminal-panel-head"><h2>文章管理</h2></div>
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

          <div v-show="!terminal.loading && !terminal.loadError && terminal.activePanel === 'messages'">
            <div class="terminal-panel-head"><h2>留言审核</h2></div>
            <div class="terminal-summary-row">
              <span>待审核 {{ pendingMessageCount }}</span>
              <span>已通过 {{ terminal.messages.length - pendingMessageCount }}</span>
              <span>留言墙 {{ plazaMessageCount }}</span>
              <span>文章评论 {{ articleMessageCount }}</span>
              <span>总留言 {{ terminal.messages.length }}</span>
            </div>
            <div class="terminal-table-wrap terminal-message-table"><table><thead><tr><th>作者</th><th>来源</th><th>内容</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>
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
                <td>
                  <div class="terminal-actions terminal-message-actions">
                    <button v-if="item.status !== 'approved'" class="primary-btn compact" type="button" title="通过留言" :aria-label="`通过留言 ${item.id}`" @click="approveMessage(item.id)">
                      <TsIcon name="userCheck" :size="16" />
                      <span>通过</span>
                    </button>
                    <button class="danger-btn compact" type="button" title="删除留言" :aria-label="`删除留言 ${item.id}`" @click="deleteMessage(item.id)">
                      <TsIcon name="trash" :size="16" />
                      <span>删除</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody></table></div>
          </div>

          <div v-show="!terminal.loading && !terminal.loadError && terminal.activePanel === 'users'">
            <div class="terminal-panel-head"><h2>用户管理</h2></div>
            <div class="terminal-toolbar terminal-users-toolbar">
              <input
                v-model="terminal.userSearch"
                type="search"
                name="terminal-filter-q"
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                placeholder="搜索用户名、邮箱、角色或 ID"
              >
              <label class="terminal-page-size">
                <span>每页</span>
                <select v-model.number="terminal.userPageSize">
                  <option v-for="size in TERMINAL_USER_PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
                </select>
              </label>
              <span class="terminal-toolbar-note">仅 super_admin 可修改角色或重置密码</span>
              <span class="terminal-toolbar-count">{{ userPageStart }}-{{ userPageEnd }} / {{ filteredUsers.length }}</span>
            </div>
            <div v-if="!filteredUsers.length" class="terminal-empty">没有匹配的用户，试试更换搜索条件。</div>
            <div v-else class="terminal-table-wrap"><table><thead><tr><th>ID</th><th>用户</th><th>邮箱</th><th>角色</th><th>注册时间</th><th>权限</th><th>密码</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in pagedUsers" :key="item.id">
                <td>{{ String(item.id).slice(0, 8) }}</td>
                <td>
                  <strong>{{ item.username }}</strong>
                  <small>{{ item.bio || '未填写简介' }}</small>
                  <div v-if="canManageAccounts && item.username !== 'admin'" class="terminal-inline-edit">
                    <input
                      v-model="terminal.usernameDrafts[item.id]"
                      type="text"
                      name="terminal-display-name"
                      autocomplete="off"
                      data-form-type="other"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      maxlength="32"
                      placeholder="编辑昵称"
                    >
                    <button class="ghost-btn compact" type="button" :disabled="!terminal.usernameDrafts[item.id] || terminal.usernameDrafts[item.id] === item.username || item.username === 'admin'" @click="changeUserUsername(item)">保存昵称</button>
                  </div>
                </td>
                <td>{{ item.email || '未绑定邮箱' }}</td>
                <td><span class="terminal-badge hot">{{ item.role || 'user' }}</span></td>
                <td>{{ formatDate(item.created_at) }}</td>
                <td>
                  <select v-model="terminal.roleDrafts[item.id]" :disabled="!canManageAccounts || item.username === 'admin'">
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                    <option value="banned">banned</option>
                  </select>
                  <button class="ghost-btn compact" type="button" :disabled="!canManageAccounts || terminal.roleDrafts[item.id] === item.role || item.username === 'admin'" @click="changeUserRole(item)">保存</button>
                </td>
                <td>
                  <input
                    v-model="terminal.passwordDrafts[item.id]"
                    type="password"
                    name="terminal-reset-password"
                    autocomplete="new-password"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    placeholder="新密码"
                  >
                  <button class="ghost-btn compact" type="button" :disabled="!canManageAccounts || !terminal.passwordDrafts[item.id]" @click="resetUserPassword(item)">重置</button>
                </td>
                <td><button class="danger-btn" type="button" :disabled="!canManageAccounts || item.role === 'admin' || item.username === 'admin'" @click="deleteUser(item.id)">删除</button></td>
              </tr>
            </tbody></table></div>
            <nav v-if="filteredUsers.length" class="terminal-pagination" aria-label="Users pagination">
              <div class="terminal-pagination-info">第 {{ userCurrentPage }} 页 / 共 {{ userTotalPages }} 页</div>
              <div class="terminal-pagination-controls">
                <button class="terminal-page-btn terminal-page-nav" type="button" :disabled="userCurrentPage <= 1" @click="setUserPage(userCurrentPage - 1)">上一页</button>
                <template v-for="item in userPageItems" :key="item">
                  <span v-if="isUserPageGap(item)" class="terminal-page-gap">...</span>
                  <button
                    v-else
                    class="terminal-page-btn"
                    :class="{ active: item === userCurrentPage }"
                    type="button"
                    :aria-current="item === userCurrentPage ? 'page' : undefined"
                    @click="setUserPage(item)"
                  >
                    {{ item }}
                  </button>
                </template>
                <button class="terminal-page-btn terminal-page-nav" type="button" :disabled="userCurrentPage >= userTotalPages" @click="setUserPage(userCurrentPage + 1)">下一页</button>
              </div>
            </nav>
          </div>

          <div v-show="!terminal.loading && !terminal.loadError && terminal.activePanel === 'account'">
            <div class="terminal-panel-head"><h2>账号密码管理</h2></div>
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

          <div v-show="!terminal.loading && !terminal.loadError && terminal.activePanel === 'links'">
            <div class="terminal-panel-head terminal-review-head">
              <div><h2>友链审核</h2><p>核对站点信息后决定是否收录。</p></div>
              <button class="ghost-btn" type="button" @click="$emit('go', '/friend-links')"><TsIcon name="external" :size="16" />查看公开页</button>
            </div>
            <form class="terminal-link-create" :aria-busy="terminal.linkCreating" @submit.prevent="createLink">
              <div class="terminal-link-create-title">
                <span><TsIcon name="plus" :size="16" />手动添加</span>
                <small>提交后直接公开</small>
              </div>
              <div class="terminal-link-create-fields">
                <label>站点名称<input v-model.trim="terminal.newLink.name" type="text" minlength="2" maxlength="40" autocomplete="off" required></label>
                <label>站点地址<input v-model.trim="terminal.newLink.url" type="url" maxlength="2048" inputmode="url" placeholder="https://" autocomplete="url" required></label>
                <label>简介<input v-model.trim="terminal.newLink.description" type="text" minlength="6" maxlength="160" placeholder="可留空" autocomplete="off"></label>
                <button class="primary-btn" type="submit" :disabled="terminal.linkCreating">
                  <TsIcon :name="terminal.linkCreating ? 'loader' : 'plus'" :size="16" />
                  {{ terminal.linkCreating ? '添加中' : '添加友链' }}
                </button>
              </div>
            </form>
            <div class="terminal-review-filters" aria-label="友链审核状态">
              <button type="button" :class="{ active: terminal.linkReviewFilter === 'pending' }" @click="terminal.linkReviewFilter = 'pending'">待审核 <span>{{ linkReviewCounts.pending }}</span></button>
              <button type="button" :class="{ active: terminal.linkReviewFilter === 'active' }" @click="terminal.linkReviewFilter = 'active'">已通过 <span>{{ linkReviewCounts.active }}</span></button>
              <button type="button" :class="{ active: terminal.linkReviewFilter === 'rejected' }" @click="terminal.linkReviewFilter = 'rejected'">未通过 <span>{{ linkReviewCounts.rejected }}</span></button>
              <button type="button" :class="{ active: terminal.linkReviewFilter === 'all' }" @click="terminal.linkReviewFilter = 'all'">全部 <span>{{ linkReviewCounts.all }}</span></button>
            </div>
            <div class="terminal-table-wrap terminal-review-table"><table><thead><tr><th>站点</th><th>申请人</th><th>简介</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in filteredReviewLinks" :key="item.id">
                <td><strong>{{ item.name }}</strong><br><a :href="item.url" :title="item.url" target="_blank" rel="noopener noreferrer">{{ item.url }}</a></td>
                <td>{{ item.applicant_username || '管理员' }}<br><small v-if="item.applicant_email">{{ item.applicant_email }}</small></td>
                <td>{{ item.description || '—' }}<br><a v-if="item.backlink_url" :href="item.backlink_url" target="_blank" rel="noopener noreferrer">检查回链</a><small v-if="item.note" class="terminal-review-note">{{ item.note }}</small></td>
                <td><span class="terminal-badge" :class="{ ok: item.status === 'active', warn: item.status === 'pending', hot: item.status === 'rejected' }">{{ item.status === 'pending' ? '待审核' : (item.status === 'active' ? '已通过' : '未通过') }}</span></td>
                <td>{{ formatDate(item.updated_at || item.created_at) }}</td>
                <td><div class="terminal-row-actions"><button v-if="item.status !== 'active'" class="primary-btn" type="button" @click="updateLinkStatus(item.id, 'active')">通过</button><button v-if="item.status !== 'rejected'" class="ghost-btn" type="button" @click="updateLinkStatus(item.id, 'rejected')">{{ item.status === 'active' ? '撤下' : '拒绝' }}</button><button class="danger-btn" type="button" @click="deleteLink(item.id)">删除</button></div></td>
              </tr>
              <tr v-if="!filteredReviewLinks.length"><td colspan="6"><div class="terminal-empty">当前筛选下没有友链申请</div></td></tr>
            </tbody></table></div>
          </div>

          <div v-show="!terminal.loading && !terminal.loadError && terminal.activePanel === 'analytics'">
            <div class="terminal-panel-head"><h2>访问统计</h2></div>
            <div class="terminal-cards">
              <div class="terminal-card"><strong>今日访问</strong><span>{{ terminal.analytics.todayViews || 0 }}</span></div>
              <div class="terminal-card"><strong>7 日访问</strong><span>{{ terminal.analytics.weekViews || 0 }}</span></div>
              <div class="terminal-card"><strong>30 日访问</strong><span>{{ terminal.analytics.monthViews || 0 }}</span></div>
              <div class="terminal-card"><strong>总访问</strong><span>{{ terminal.analytics.totalViews || 0 }}</span></div>
            </div>
          </div>

          <form v-show="!terminal.loading && !terminal.loadError && terminal.activePanel === 'settings'" class="terminal-settings" :aria-busy="terminal.ossTest.loading || terminal.ossImport.loading || terminal.ossImport.scanning" @submit.prevent="saveSettings">
            <div class="terminal-panel-head"><h2>系统配置</h2></div>
            <div class="terminal-settings-block terminal-settings-grid">
              <div class="terminal-settings-title">
                <strong>基础信息</strong>
                <span>站点标题、公告和轻量展示设置</span>
              </div>
              <label>站点标题<input v-model="terminal.settings.siteTitle"></label>
              <label class="terminal-wide-field">公告内容<textarea v-model="terminal.settings.siteAnnouncement"></textarea></label>
            </div>
            <div class="terminal-settings-block terminal-settings-grid">
              <div class="terminal-settings-title">
                <strong>首次访问弹窗</strong>
                <span>用于提示访客进入站点时需要第一时间看到的信息</span>
              </div>
              <label class="terminal-check"><input v-model="terminal.settings.visitPopupEnabled" type="checkbox"> 启用访问弹窗</label>
              <label>弹窗标题<input v-model="terminal.settings.visitPopupTitle" placeholder="欢迎来到月读空间"></label>
              <label class="terminal-wide-field">弹窗内容<textarea v-model="terminal.settings.visitPopupContent" placeholder="输入访客进入网站时看到的内容"></textarea></label>
              <label>按钮文字<input v-model="terminal.settings.visitPopupButton" placeholder="我知道了"></label>
            </div>
            <div class="terminal-settings-block">
              <div class="terminal-settings-title">
                <strong>留言审核</strong>
                <span>关键词命中后进入人工审核，未命中自动通过</span>
              </div>
              <label>留言审核关键词<textarea v-model="terminal.settings.messageReviewKeywords" rows="5" placeholder="每行一个或用逗号分隔。命中关键词的留言会进入待审，未命中则自动通过。留空时使用系统默认备案安全词库。"></textarea></label>
              <p class="terminal-setting-note">用于阅读广场、文章评论和回复。普通友好留言会自动公开；涉及安全、违法、广告等关键词的内容进入人工审核。</p>
            </div>
            <div class="terminal-settings-block terminal-settings-grid">
              <div class="terminal-settings-title">
                <strong>备案信息</strong>
                <span>ICP 与公安联网备案会同步展示在站点底部</span>
              </div>
              <label>ICP备案号<input v-model="terminal.settings.beianText" placeholder="苏ICP备2026030780号-1"></label>
              <label>ICP备案链接<input v-model="terminal.settings.beianUrl" placeholder="https://beian.miit.gov.cn/"></label>
              <label>公安联网备案号<input v-model="terminal.settings.mpsBeianText" placeholder="苏公网安备32058502011868号"></label>
              <label>公安联网备案链接<input v-model="terminal.settings.mpsBeianUrl" placeholder="https://beian.mps.gov.cn/#/query/webSearch?code=32058502011868"></label>
              <label>公安备案图标路径<input v-model="terminal.settings.mpsBeianIcon" placeholder="/assets/images/beian-mps.png"></label>
              <p class="terminal-setting-note">公安备案会显示在 ICP 备案号下方。图标文件建议放在服务器本地 /assets/images/beian-mps.png，并用 .gitignore 排除。</p>
            </div>
            <div v-if="canManageAccounts" class="terminal-settings-block terminal-oss-settings">
              <div class="terminal-settings-title">
                <strong>对象存储</strong>
                <span>上传策略、CDN 域名、连接测试和 OSS 大文件登记</span>
              </div>
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
                <button class="ghost-btn" type="button" :disabled="terminal.ossTest.loading" :aria-busy="terminal.ossTest.loading" @click="testOssSettings">
                  {{ terminal.ossTest.loading ? '测试中...' : '测试对象存储' }}
                </button>
                <StatusLoader v-if="terminal.ossTest.loading" label="正在测试对象存储" compact />
                <span v-else-if="terminal.ossTest.message" class="terminal-oss-result" :class="terminal.ossTest.type" :role="terminal.ossTest.type === 'error' ? 'alert' : 'status'">
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
                  <button class="ghost-btn" type="button" :disabled="terminal.ossImport.loading" :aria-busy="terminal.ossImport.loading" @click="registerOssAsset">
                    {{ terminal.ossImport.loading ? '登记中...' : '登记 OSS 资源' }}
                  </button>
                  <button class="ghost-btn" type="button" :disabled="terminal.ossImport.scanning" :aria-busy="terminal.ossImport.scanning" @click="scanOssAssets">
                    {{ terminal.ossImport.scanning ? '扫描中...' : '扫描并登记' }}
                  </button>
                  <StatusLoader v-if="terminal.ossImport.loading" label="正在登记 OSS 资源" compact />
                  <StatusLoader v-else-if="terminal.ossImport.scanning" label="正在扫描 OSS 资源" compact />
                  <span v-else-if="terminal.ossImport.message" class="terminal-oss-result" :class="terminal.ossImport.type" :role="terminal.ossImport.type === 'error' ? 'alert' : 'status'">
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
