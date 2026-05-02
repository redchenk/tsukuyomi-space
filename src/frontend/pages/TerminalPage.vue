<script setup>
import { computed, onMounted, reactive } from 'vue';

const emit = defineEmits(['go', 'auth-changed']);

const panels = [
  { id: 'dashboard', label: '总览', code: '01' },
  { id: 'articles', label: '文章', code: '02' },
  { id: 'messages', label: '留言', code: '03' },
  { id: 'users', label: '用户', code: '04' },
  { id: 'links', label: '友链', code: '05' },
  { id: 'analytics', label: '统计', code: '06' },
  { id: 'settings', label: '设置', code: '07' }
];

const terminal = reactive({
  token: localStorage.getItem('admin_token') || '',
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
  links: [],
  newLink: { name: '', url: '' },
  settings: { siteTitle: '', siteAnnouncement: '', sakuraEffect: true, scanlineEffect: true }
});

const authed = computed(() => Boolean(terminal.token && terminal.admin));

function formatDate(value) {
  if (!value) return '未记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
}

function showMessage(text, type = 'success') {
  terminal.message = text;
  terminal.messageType = type;
}

async function adminApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (terminal.token) headers.set('Authorization', `Bearer ${terminal.token}`);
  const response = await fetch(`/api/admin${path}`, { ...options, headers });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data;
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : { success: false, message: `HTTP ${response.status}` };
  } catch (_) {
    return { success: false, message: text.replace(/<[^>]*>/g, '').trim() || `HTTP ${response.status}` };
  }
}

async function verifySession() {
  if (!terminal.token) return;
  try {
    terminal.admin = await adminApi('/me');
    await loadPanel('dashboard');
  } catch (error) {
    terminal.token = '';
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
      body: JSON.stringify(terminal.login)
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || '登录失败');
    terminal.token = result.data.token;
    terminal.admin = result.data.admin;
    terminal.login.password = '';
    localStorage.setItem('admin_token', terminal.token);
    localStorage.setItem('admin_user', JSON.stringify(terminal.admin));
    emit('auth-changed');
    await loadPanel('dashboard');
  } catch (error) {
    terminal.loginMessage = error.message;
  } finally {
    terminal.loading = false;
  }
}

function logout() {
  terminal.token = '';
  terminal.admin = null;
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  emit('auth-changed');
}

async function loadPanel(panel = terminal.activePanel) {
  terminal.activePanel = panel;
  terminal.loading = true;
  try {
    if (panel === 'dashboard') terminal.stats = { ...terminal.stats, ...(await adminApi('/stats') || {}) };
    if (panel === 'articles') terminal.articles = await adminApi('/articles') || [];
    if (panel === 'messages') terminal.messages = await adminApi('/messages') || [];
    if (panel === 'users') terminal.users = await adminApi('/users') || [];
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

async function deleteArticle(id) {
  if (!confirm('确定删除这篇文章吗？')) return;
  await adminApi(`/articles/${id}`, { method: 'DELETE' });
  showMessage('文章已删除');
  await loadPanel('articles');
}

async function approveMessage(id) {
  await adminApi(`/messages/${id}/approve`, { method: 'POST' });
  showMessage('留言已通过');
  await loadPanel('messages');
}

async function deleteMessage(id) {
  if (!confirm('确定删除这条留言吗？')) return;
  await adminApi(`/messages/${id}`, { method: 'DELETE' });
  showMessage('留言已删除');
  await loadPanel('messages');
}

async function deleteUser(id) {
  if (!confirm('确定删除这个用户吗？')) return;
  await adminApi(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  showMessage('用户已删除');
  await loadPanel('users');
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

function updateClock() {
  terminal.clock = new Date().toLocaleString('zh-CN');
}

onMounted(() => {
  updateClock();
  setInterval(updateClock, 1000);
  verifySession();
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
          <span>{{ terminal.clock }}</span>
        </div>
        <div class="terminal-session">
          <span>{{ terminal.admin?.username }} · {{ terminal.admin?.role }}</span>
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
            <div class="terminal-cards">
              <div class="terminal-card"><strong>文章总数</strong><span>{{ terminal.stats.articles || 0 }}</span></div>
              <div class="terminal-card"><strong>待审留言</strong><span>{{ terminal.stats.pendingMessages || 0 }}</span></div>
              <div class="terminal-card"><strong>今日访问</strong><span>{{ terminal.stats.todayViews || 0 }}</span></div>
              <div class="terminal-card"><strong>用户总数</strong><span>{{ terminal.stats.users || 0 }}</span></div>
            </div>
          </div>

          <div v-show="terminal.activePanel === 'articles'">
            <div class="terminal-panel-head"><h2>文章管理</h2><button class="primary-btn" type="button" @click="$emit('go', '/editor')">新建文章</button></div>
            <div class="terminal-table-wrap"><table><thead><tr><th>ID</th><th>标题</th><th>分类</th><th>阅读</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in terminal.articles" :key="item.id">
                <td>{{ item.id }}</td><td><a href="#" @click.prevent="$emit('go', `/article?id=${item.id}`)">{{ item.title }}</a></td><td>{{ item.category || '未分类' }}</td><td>{{ item.view_count || 0 }}</td>
                <td><span class="terminal-badge" :class="item.status === 'published' ? 'ok' : 'warn'">{{ item.status === 'published' ? '已发布' : '草稿' }}</span></td><td>{{ formatDate(item.updated_at || item.created_at) }}</td>
                <td><div class="terminal-actions"><button class="ghost-btn" type="button" @click="$emit('go', `/editor?id=${item.id}`)">编辑</button><button class="ghost-btn" type="button" @click="toggleArticle(item.id)">切换</button><button class="danger-btn" type="button" @click="deleteArticle(item.id)">删除</button></div></td>
              </tr>
            </tbody></table></div>
          </div>

          <div v-show="terminal.activePanel === 'messages'">
            <div class="terminal-panel-head"><h2>留言审核</h2><button class="ghost-btn" type="button" @click="loadPanel('messages')">刷新</button></div>
            <div class="terminal-table-wrap"><table><thead><tr><th>作者</th><th>内容</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in terminal.messages" :key="item.id"><td>{{ item.username }}</td><td>{{ item.content }}</td><td><span class="terminal-badge" :class="item.status === 'approved' ? 'ok' : 'warn'">{{ item.status === 'approved' ? '已通过' : '待审核' }}</span></td><td>{{ formatDate(item.created_at) }}</td><td><div class="terminal-actions"><button v-if="item.status !== 'approved'" class="primary-btn" type="button" @click="approveMessage(item.id)">通过</button><button class="danger-btn" type="button" @click="deleteMessage(item.id)">删除</button></div></td></tr>
            </tbody></table></div>
          </div>

          <div v-show="terminal.activePanel === 'users'">
            <div class="terminal-panel-head"><h2>用户管理</h2><button class="ghost-btn" type="button" @click="loadPanel('users')">刷新</button></div>
            <div class="terminal-table-wrap"><table><thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>注册时间</th><th>操作</th></tr></thead><tbody>
              <tr v-for="item in terminal.users" :key="item.id"><td>{{ String(item.id).slice(0, 8) }}</td><td>{{ item.username }}</td><td>{{ item.email }}</td><td><span class="terminal-badge hot">{{ item.role || 'user' }}</span></td><td>{{ formatDate(item.created_at) }}</td><td><button class="danger-btn" type="button" :disabled="item.role === 'admin'" @click="deleteUser(item.id)">删除</button></td></tr>
            </tbody></table></div>
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
            <label class="terminal-check"><input v-model="terminal.settings.sakuraEffect" type="checkbox"> 启用游鱼效果</label>
            <label class="terminal-check"><input v-model="terminal.settings.scanlineEffect" type="checkbox"> 启用扫描线效果</label>
          </form>
        </section>
      </div>
    </section>
  </main>
</template>
