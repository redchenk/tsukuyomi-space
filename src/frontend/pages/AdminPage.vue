<script setup>
import { computed, onMounted, onUnmounted, reactive } from 'vue';
import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { formatDateTime } from '../utils/time';

const props = defineProps({
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);

const tabs = [
  { id: 'articles', label: '文章', icon: 'fileText' },
  { id: 'messages', label: '留言', icon: 'message' },
  { id: 'gallery', label: '图库', icon: 'image' },
  { id: 'attachments', label: '附件', icon: 'paperclip' }
];
const messageFilters = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待审核' },
  { id: 'approved', label: '已通过' }
];

const state = reactive({
  checking: true,
  loading: false,
  access: 'checking',
  admin: null,
  active: 'articles',
  search: '',
  messageFilter: 'all',
  message: '',
  messageType: 'success',
  error: '',
  busyKey: '',
  articles: [],
  messages: [],
  gallery: [],
  attachments: [],
  summary: {
    articles: 0,
    messages: { all: 0, pending: 0, approved: 0 },
    gallery: 0,
    attachments: 0
  },
  pagination: {
    articles: { page: 1, limit: 10, total: 0, totalPages: 1 },
    messages: { page: 1, limit: 10, total: 0, totalPages: 1 },
    gallery: { page: 1, limit: 12, total: 0, totalPages: 1 },
    attachments: { page: 1, limit: 12, total: 0, totalPages: 1 }
  }
});

let searchTimer = 0;
let listRequestId = 0;

const sessionUser = computed(() => props.user || getSession()?.user || null);
const isAllowedRole = computed(() => ['admin', 'super_admin'].includes(state.admin?.role || sessionUser.value?.role));
const tabCounts = computed(() => ({
  articles: state.summary.articles,
  messages: state.summary.messages.all,
  gallery: state.summary.gallery,
  attachments: state.summary.attachments
}));
const currentPagination = computed(() => state.pagination[state.active]);
const pageNumbers = computed(() => {
  const total = currentPagination.value.totalPages;
  if (total <= 1) return [1];
  const start = Math.max(1, Math.min(currentPagination.value.page - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
});

function showMessage(message, type = 'success') {
  state.message = message;
  state.messageType = type;
}

async function adminApi(path, options = {}) {
  const response = await authFetch(path, {
    ...options,
    headers: authHeaders({
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }),
    cache: String(options.method || 'GET').toUpperCase() === 'GET' ? 'no-store' : options.cache
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) {
    const error = new Error(result.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result.data;
}

function normalizedAssets(payload) {
  return Array.isArray(payload?.assets) ? payload.assets : [];
}

function applyPagination(tab, pagination = {}) {
  const current = state.pagination[tab];
  current.page = Number(pagination.page || current.page);
  current.limit = Number(pagination.limit || current.limit);
  current.total = Number(pagination.total || 0);
  current.totalPages = Math.max(1, Number(pagination.totalPages || 1));
}

function activeEndpoint(tab, page) {
  const pagination = state.pagination[tab];
  const query = new URLSearchParams({
    page: String(page),
    limit: String(pagination.limit)
  });
  if (state.search.trim()) query.set('search', state.search.trim());

  if (tab === 'articles') return `/api/moderation/articles?${query}`;
  if (tab === 'messages') {
    query.set('status', state.messageFilter);
    return `/api/moderation/messages?${query}`;
  }
  query.set('scope', 'all');
  if (tab === 'gallery') return `/api/assets/gallery?${query}`;
  query.set('collection', 'attachments');
  return `/api/assets?${query}`;
}

function assignPage(tab, payload) {
  if (tab === 'articles') state.articles = Array.isArray(payload?.items) ? payload.items : [];
  if (tab === 'messages') state.messages = Array.isArray(payload?.items) ? payload.items : [];
  if (tab === 'gallery') state.gallery = normalizedAssets(payload);
  if (tab === 'attachments') state.attachments = normalizedAssets(payload);
  applyPagination(tab, payload?.pagination);
}

async function loadSummary() {
  try {
    const summary = await adminApi(noStoreUrl('/api/moderation/summary'));
    state.summary.articles = Number(summary?.articles || 0);
    state.summary.messages.all = Number(summary?.messages?.all || 0);
    state.summary.messages.pending = Number(summary?.messages?.pending || 0);
    state.summary.messages.approved = Number(summary?.messages?.approved || 0);
    state.summary.gallery = Number(summary?.gallery || 0);
    state.summary.attachments = Number(summary?.attachments || 0);
  } catch (error) {
    state.error = error.message || '管理统计读取失败';
  }
}

async function loadActivePage() {
  const requestId = ++listRequestId;
  const tab = state.active;
  state.loading = true;
  state.error = '';
  try {
    let requestedPage = state.pagination[tab].page;
    let payload = await adminApi(noStoreUrl(activeEndpoint(tab, requestedPage)));
    if (requestId !== listRequestId || tab !== state.active) return;

    const totalPages = Math.max(1, Number(payload?.pagination?.totalPages || 1));
    if (requestedPage > totalPages) {
      requestedPage = totalPages;
      state.pagination[tab].page = requestedPage;
      payload = await adminApi(noStoreUrl(activeEndpoint(tab, requestedPage)));
      if (requestId !== listRequestId || tab !== state.active) return;
    }
    assignPage(tab, payload);
  } catch (error) {
    if (requestId === listRequestId && tab === state.active) {
      state.error = error.message || '管理数据读取失败';
    }
  } finally {
    if (requestId === listRequestId) state.loading = false;
  }
}

async function refreshWorkspace() {
  state.message = '';
  await Promise.all([loadSummary(), loadActivePage()]);
}

async function verifyAccess() {
  state.checking = true;
  state.access = 'checking';
  try {
    state.admin = await adminApi(noStoreUrl('/api/moderation/me'));
    state.access = isAllowedRole.value ? 'allowed' : 'forbidden';
    if (state.access === 'allowed') await refreshWorkspace();
  } catch (error) {
    state.access = error.status === 401 ? 'login' : 'forbidden';
  } finally {
    state.checking = false;
  }
}

function selectTab(tab) {
  if (tab === state.active) return;
  window.clearTimeout(searchTimer);
  state.active = tab;
  state.search = '';
  state.message = '';
  state.error = '';
  state.pagination[tab].page = 1;
  loadActivePage();
}

function scheduleSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.pagination[state.active].page = 1;
    loadActivePage();
  }, 320);
}

function setMessageFilter(filter) {
  if (filter === state.messageFilter) return;
  state.messageFilter = filter;
  state.pagination.messages.page = 1;
  loadActivePage();
}

function goToPage(page) {
  const pagination = currentPagination.value;
  const nextPage = Math.max(1, Math.min(Number(page) || 1, pagination.totalPages));
  if (nextPage === pagination.page || state.loading) return;
  pagination.page = nextPage;
  loadActivePage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function runAction(key, action) {
  if (state.busyKey) return;
  state.busyKey = key;
  state.message = '';
  try {
    await action();
  } catch (error) {
    showMessage(error.message || '操作失败', 'error');
  } finally {
    state.busyKey = '';
  }
}

function isBusy(key) {
  return state.busyKey === key;
}

async function reloadAfterAction(message) {
  await Promise.all([loadSummary(), loadActivePage()]);
  showMessage(message);
}

function editArticle(item) {
  emit('go', `/editor?id=${encodeURIComponent(item.id)}`);
}

function toggleArticleStatus(item) {
  return runAction(`article-status-${item.id}`, async () => {
    const data = await adminApi(`/api/moderation/articles/${encodeURIComponent(item.id)}/toggle-status`, { method: 'POST', body: '{}' });
    await reloadAfterAction(data?.status === 'published' ? '文章已发布' : '文章已下架');
  });
}

function toggleArticlePin(item) {
  return runAction(`article-pin-${item.id}`, async () => {
    const data = await adminApi(`/api/moderation/articles/${encodeURIComponent(item.id)}/toggle-pin`, { method: 'POST', body: '{}' });
    await reloadAfterAction(data?.pinned_at ? '文章已置顶' : '文章已取消置顶');
  });
}

function deleteArticle(item) {
  if (!confirm(`删除文章“${item.title}”？`)) return;
  return runAction(`article-delete-${item.id}`, async () => {
    await adminApi(`/api/moderation/articles/${encodeURIComponent(item.id)}/delete`, { method: 'POST', body: '{}' });
    await reloadAfterAction('文章已删除');
  });
}

function messageRiskHosts(item) {
  return Array.isArray(item?.moderation?.externalHosts) ? item.moderation.externalHosts : [];
}

function approveMessage(item) {
  const externalHosts = messageRiskHosts(item);
  if (externalHosts.length && !confirm(`留言包含外部链接：${externalHosts.join('、')}。确认通过？`)) return;
  return runAction(`message-approve-${item.id}`, async () => {
    await adminApi(`/api/moderation/messages/${encodeURIComponent(item.id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        reviewDigest: item.moderation?.reviewDigest || '',
        confirmExternalLink: externalHosts.length > 0
      })
    });
    await reloadAfterAction('留言已通过');
  });
}

function deleteMessage(item) {
  if (!confirm('删除这条留言及其回复？')) return;
  return runAction(`message-delete-${item.id}`, async () => {
    await adminApi(`/api/moderation/messages/${encodeURIComponent(item.id)}/delete`, { method: 'POST', body: '{}' });
    await reloadAfterAction('留言已删除');
  });
}

function assetName(asset) {
  return asset.metadata?.title || asset.metadata?.fileName || asset.metadata?.alt || asset.storage_key?.split('/').pop() || asset.id;
}

function assetUrl(asset) {
  return asset.access_url || asset.display_url || asset.url || '';
}

function isImage(asset) {
  return String(asset.mime_type || '').startsWith('image/');
}

function deleteAsset(asset, collection) {
  if (!confirm(`删除“${assetName(asset)}”？`)) return;
  return runAction(`asset-delete-${asset.id}`, async () => {
    await adminApi(`/api/assets/${encodeURIComponent(asset.id)}/delete`, { method: 'POST', body: '{}' });
    await reloadAfterAction(collection === 'gallery' ? '图片已删除' : '附件已删除');
  });
}

function formatDate(value) {
  return formatDateTime(value, 'zh-CN');
}

onMounted(verifyAccess);
onUnmounted(() => {
  window.clearTimeout(searchTimer);
  listRequestId += 1;
});
</script>

<template>
  <main class="page admin-page" :aria-busy="state.checking || state.loading">
    <section v-if="state.checking" class="admin-access-state" aria-busy="true">
      <StatusLoader label="正在验证管理权限" compact />
    </section>

    <section v-else-if="state.access !== 'allowed'" class="admin-access-state" role="alert">
      <TsIcon :name="state.access === 'login' ? 'lock' : 'shield'" :size="28" />
      <h1>{{ state.access === 'login' ? '请先登录' : '无管理权限' }}</h1>
      <button class="primary-btn" type="button" @click="$emit('go', state.access === 'login' ? '/login?redirect=/admin' : '/hub')">
        {{ state.access === 'login' ? '登录' : '返回大厅' }}
      </button>
    </section>

    <template v-else>
      <header class="admin-header">
        <div>
          <h1>内容管理</h1>
        </div>
        <div class="admin-header-actions">
          <span class="admin-role"><TsIcon name="shield" :size="15" />{{ state.admin?.role }}</span>
          <button class="ghost-btn compact" type="button" :disabled="state.loading" @click="refreshWorkspace">
            <TsIcon name="refresh" :size="16" />刷新
          </button>
        </div>
      </header>

      <nav class="admin-tabs" aria-label="管理区域">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :class="{ active: state.active === tab.id }"
          :aria-current="state.active === tab.id ? 'page' : undefined"
          @click="selectTab(tab.id)"
        >
          <TsIcon :name="tab.icon" :size="17" />
          <span>{{ tab.label }}</span>
          <b>{{ tabCounts[tab.id] }}</b>
        </button>
      </nav>

      <div class="admin-toolbar">
        <label class="admin-search">
          <TsIcon name="search" :size="17" />
          <input v-model="state.search" type="search" autocomplete="off" placeholder="搜索" aria-label="搜索当前内容" @input="scheduleSearch">
        </label>
        <div class="admin-toolbar-actions">
          <template v-if="state.active === 'articles'">
            <button class="primary-btn compact" type="button" @click="$emit('go', '/editor')"><TsIcon name="plus" :size="16" />新建</button>
          </template>
          <template v-else-if="state.active === 'messages'">
            <div class="admin-filter-group" role="group" aria-label="留言状态">
              <button v-for="filter in messageFilters" :key="filter.id" class="admin-filter-btn" type="button" :class="{ active: state.messageFilter === filter.id }" :aria-pressed="state.messageFilter === filter.id" @click="setMessageFilter(filter.id)">
                {{ filter.label }} <b>{{ state.summary.messages[filter.id] }}</b>
              </button>
            </div>
          </template>
          <template v-else-if="state.active === 'gallery'">
            <button class="primary-btn compact" type="button" @click="$emit('go', '/gallery/manage?scope=all')"><TsIcon name="image" :size="16" />图库管理</button>
          </template>
          <template v-else>
            <button class="primary-btn compact" type="button" @click="$emit('go', '/attachments?scope=all')"><TsIcon name="paperclip" :size="16" />附件库</button>
          </template>
        </div>
      </div>

      <div v-if="state.message" class="form-message admin-message" :class="state.messageType" role="status">{{ state.message }}</div>
      <div v-if="state.error" class="form-message error admin-message" role="alert">{{ state.error }}</div>

      <LoadingSkeleton v-if="state.loading" :variant="state.active === 'gallery' ? 'gallery' : 'list'" :count="8" label="正在读取管理数据" />

      <section v-else-if="state.active === 'articles'" class="admin-list" aria-label="文章管理">
        <article v-for="item in state.articles" :key="item.id" class="admin-row">
          <div class="admin-row-main">
            <strong>{{ item.title }}</strong>
            <span>{{ item.category }} · {{ formatDate(item.published_at || item.created_at) }}</span>
          </div>
          <div class="admin-row-state">
            <span class="admin-badge" :class="item.status === 'published' ? 'ok' : 'warn'">{{ item.status === 'published' ? '已发布' : '草稿' }}</span>
            <span v-if="item.pinned_at" class="admin-badge hot">置顶</span>
          </div>
          <div class="admin-row-actions">
            <button class="icon-btn" type="button" title="编辑" @click="editArticle(item)"><TsIcon name="penLine" :size="17" /></button>
            <button class="ghost-btn compact" type="button" :disabled="isBusy(`article-status-${item.id}`)" @click="toggleArticleStatus(item)">{{ item.status === 'published' ? '下架' : '发布' }}</button>
            <button class="ghost-btn compact" type="button" :disabled="isBusy(`article-pin-${item.id}`)" @click="toggleArticlePin(item)">{{ item.pinned_at ? '取消置顶' : '置顶' }}</button>
            <button class="danger-btn compact" type="button" title="删除文章" :aria-label="`删除文章 ${item.title}`" :disabled="isBusy(`article-delete-${item.id}`)" @click="deleteArticle(item)"><TsIcon name="trash" :size="16" /></button>
          </div>
        </article>
        <div v-if="!state.articles.length" class="admin-empty">暂无文章</div>
      </section>

      <section v-else-if="state.active === 'messages'" class="admin-list" aria-label="留言审核">
        <article v-for="item in state.messages" :key="item.id" class="admin-row admin-message-row">
          <div class="admin-row-main">
            <strong>{{ item.username }}</strong>
            <p>{{ item.content }}</p>
            <span>{{ item.article_title || '留言板' }} · {{ formatDate(item.created_at) }}</span>
            <div v-if="messageRiskHosts(item).length" class="admin-risk" role="alert">外链：{{ messageRiskHosts(item).join('、') }}</div>
            <div v-if="item.moderation?.blocked" class="admin-risk" role="alert">{{ item.moderation?.reasons?.join('、') || '内容未通过安全检查' }}</div>
          </div>
          <div class="admin-row-state">
            <span class="admin-badge" :class="item.status === 'approved' ? 'ok' : 'warn'">{{ item.status === 'approved' ? '已通过' : '待审核' }}</span>
          </div>
          <div class="admin-row-actions">
            <button v-if="item.status !== 'approved' && !item.moderation?.blocked" class="primary-btn compact" type="button" :disabled="isBusy(`message-approve-${item.id}`)" @click="approveMessage(item)"><TsIcon name="userCheck" :size="16" />通过</button>
            <button class="danger-btn compact" type="button" title="删除留言" :aria-label="`删除 ${item.username} 的留言`" :disabled="isBusy(`message-delete-${item.id}`)" @click="deleteMessage(item)"><TsIcon name="trash" :size="16" /></button>
          </div>
        </article>
        <div v-if="!state.messages.length" class="admin-empty">{{ state.messageFilter === 'all' ? '暂无留言' : '当前状态暂无留言' }}</div>
      </section>

      <section v-else-if="state.active === 'gallery'" class="admin-media-grid" aria-label="图库管理">
        <article v-for="asset in state.gallery" :key="asset.id" class="admin-media-card">
          <img :src="assetUrl(asset)" :alt="assetName(asset)" loading="lazy">
          <div>
            <strong>{{ assetName(asset) }}</strong>
            <span>{{ asset.owner_username || '站点资源' }} · {{ formatDate(asset.created_at) }}</span>
          </div>
          <div class="admin-media-actions">
            <a class="icon-btn" :href="assetUrl(asset)" target="_blank" rel="noopener noreferrer" title="预览"><TsIcon name="eye" :size="17" /></a>
            <button class="danger-btn compact" type="button" title="删除图片" :aria-label="`删除图片 ${assetName(asset)}`" :disabled="isBusy(`asset-delete-${asset.id}`)" @click="deleteAsset(asset, 'gallery')"><TsIcon name="trash" :size="16" /></button>
          </div>
        </article>
        <div v-if="!state.gallery.length" class="admin-empty">暂无图片</div>
      </section>

      <section v-else class="admin-list" aria-label="附件管理">
        <article v-for="asset in state.attachments" :key="asset.id" class="admin-row admin-asset-row">
          <div class="admin-asset-icon">
            <img v-if="isImage(asset)" :src="assetUrl(asset)" alt="" loading="lazy">
            <TsIcon v-else name="paperclip" :size="20" />
          </div>
          <div class="admin-row-main">
            <strong>{{ assetName(asset) }}</strong>
            <span>{{ asset.owner_username || '站点资源' }} · {{ asset.mime_type || asset.asset_type }} · {{ formatDate(asset.created_at) }}</span>
          </div>
          <div class="admin-row-actions">
            <a class="icon-btn" :href="assetUrl(asset)" target="_blank" rel="noopener noreferrer" title="打开"><TsIcon name="external" :size="17" /></a>
            <button class="danger-btn compact" type="button" title="删除附件" :aria-label="`删除附件 ${assetName(asset)}`" :disabled="isBusy(`asset-delete-${asset.id}`)" @click="deleteAsset(asset, 'attachments')"><TsIcon name="trash" :size="16" /></button>
          </div>
        </article>
        <div v-if="!state.attachments.length" class="admin-empty">暂无附件</div>
      </section>

      <nav v-if="!state.loading && currentPagination.totalPages > 1" class="admin-pagination" aria-label="内容分页">
        <button class="ghost-btn compact" type="button" :disabled="currentPagination.page <= 1" @click="goToPage(currentPagination.page - 1)">
          <TsIcon name="arrowLeft" :size="16" />上一页
        </button>
        <div class="admin-page-numbers">
          <button v-for="page in pageNumbers" :key="page" type="button" :class="{ active: page === currentPagination.page }" :aria-current="page === currentPagination.page ? 'page' : undefined" @click="goToPage(page)">{{ page }}</button>
        </div>
        <span>{{ currentPagination.total }} 条</span>
        <button class="ghost-btn compact" type="button" :disabled="currentPagination.page >= currentPagination.totalPages" @click="goToPage(currentPagination.page + 1)">
          下一页<TsIcon name="arrowRight" :size="16" />
        </button>
      </nav>
    </template>
  </main>
</template>
