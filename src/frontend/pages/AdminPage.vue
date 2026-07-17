<script setup>
import { computed, onMounted, reactive } from 'vue';
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

const state = reactive({
  checking: true,
  loading: false,
  access: 'checking',
  admin: null,
  active: 'articles',
  search: '',
  pendingOnly: true,
  message: '',
  messageType: 'success',
  error: '',
  busyKey: '',
  articles: [],
  messages: [],
  gallery: [],
  attachments: [],
  totals: { gallery: 0, attachments: 0 }
});

const sessionUser = computed(() => props.user || getSession()?.user || null);
const isAllowedRole = computed(() => ['admin', 'super_admin'].includes(state.admin?.role || sessionUser.value?.role));
const pendingCount = computed(() => state.messages.filter(item => item.status !== 'approved').length);
const tabCounts = computed(() => ({
  articles: state.articles.length,
  messages: pendingCount.value,
  gallery: state.totals.gallery || state.gallery.length,
  attachments: state.totals.attachments || state.attachments.length
}));

const visibleArticles = computed(() => filterItems(state.articles, item => [item.title, item.category, item.status]));
const visibleMessages = computed(() => filterItems(
  state.pendingOnly ? state.messages.filter(item => item.status !== 'approved') : state.messages,
  item => [item.username, item.content, item.article_title, item.status]
));
const visibleGallery = computed(() => filterItems(state.gallery, item => [assetName(item), item.owner_username, item.mime_type]));
const visibleAttachments = computed(() => filterItems(state.attachments, item => [assetName(item), item.owner_username, item.mime_type, item.asset_type]));

function filterItems(items, fields) {
  const keyword = state.search.trim().toLowerCase();
  if (!keyword) return items;
  return items.filter(item => fields(item).some(value => String(value || '').toLowerCase().includes(keyword)));
}

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

async function loadWorkspace() {
  state.loading = true;
  state.error = '';
  try {
    const [articles, messages, galleryPayload, assetPayload] = await Promise.all([
      adminApi(noStoreUrl('/api/moderation/articles')),
      adminApi(noStoreUrl('/api/moderation/messages')),
      adminApi(noStoreUrl('/api/assets/gallery?scope=all&limit=120')),
      adminApi(noStoreUrl('/api/assets?scope=all&limit=120'))
    ]);
    state.articles = Array.isArray(articles) ? articles : [];
    state.messages = Array.isArray(messages) ? messages : [];
    state.gallery = normalizedAssets(galleryPayload);
    state.attachments = normalizedAssets(assetPayload).filter(asset => asset.metadata?.gallery !== true && asset.metadata?.collection !== 'gallery');
    state.totals.gallery = Number(galleryPayload?.pagination?.total || state.gallery.length);
    state.totals.attachments = Number(assetPayload?.pagination?.total || state.attachments.length);
  } catch (error) {
    state.error = error.message || '管理数据读取失败';
  } finally {
    state.loading = false;
  }
}

async function verifyAccess() {
  state.checking = true;
  state.access = 'checking';
  try {
    state.admin = await adminApi(noStoreUrl('/api/moderation/me'));
    state.access = isAllowedRole.value ? 'allowed' : 'forbidden';
    if (state.access === 'allowed') await loadWorkspace();
  } catch (error) {
    state.access = error.status === 401 ? 'login' : 'forbidden';
  } finally {
    state.checking = false;
  }
}

function selectTab(tab) {
  state.active = tab;
  state.search = '';
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

function editArticle(item) {
  emit('go', `/editor?id=${encodeURIComponent(item.id)}`);
}

function toggleArticleStatus(item) {
  return runAction(`article-status-${item.id}`, async () => {
    const data = await adminApi(`/api/moderation/articles/${encodeURIComponent(item.id)}/toggle-status`, { method: 'POST', body: '{}' });
    item.status = data?.status || item.status;
    showMessage(item.status === 'published' ? '文章已发布' : '文章已下架');
  });
}

function toggleArticlePin(item) {
  return runAction(`article-pin-${item.id}`, async () => {
    const data = await adminApi(`/api/moderation/articles/${encodeURIComponent(item.id)}/toggle-pin`, { method: 'POST', body: '{}' });
    item.pinned_at = data?.pinned_at || null;
    showMessage(item.pinned_at ? '文章已置顶' : '文章已取消置顶');
  });
}

function deleteArticle(item) {
  if (!confirm(`删除文章“${item.title}”？`)) return;
  return runAction(`article-delete-${item.id}`, async () => {
    await adminApi(`/api/moderation/articles/${encodeURIComponent(item.id)}/delete`, { method: 'POST', body: '{}' });
    state.articles = state.articles.filter(article => article.id !== item.id);
    showMessage('文章已删除');
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
    item.status = 'approved';
    showMessage('留言已通过');
  });
}

function deleteMessage(item) {
  if (!confirm('删除这条留言及其回复？')) return;
  return runAction(`message-delete-${item.id}`, async () => {
    await adminApi(`/api/moderation/messages/${encodeURIComponent(item.id)}/delete`, { method: 'POST', body: '{}' });
    state.messages = state.messages.filter(message => message.id !== item.id && message.parent_id !== item.id);
    showMessage('留言已删除');
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
    if (collection === 'gallery') {
      state.gallery = state.gallery.filter(item => item.id !== asset.id);
      state.totals.gallery = Math.max(0, state.totals.gallery - 1);
    } else {
      state.attachments = state.attachments.filter(item => item.id !== asset.id);
      state.totals.attachments = Math.max(0, state.totals.attachments - 1);
    }
    showMessage('文件已删除');
  });
}

function formatDate(value) {
  return formatDateTime(value, 'zh-CN');
}

onMounted(verifyAccess);
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
          <button class="ghost-btn compact" type="button" :disabled="state.loading" @click="loadWorkspace">
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
          <input v-model="state.search" type="search" autocomplete="off" placeholder="搜索">
        </label>
        <div class="admin-toolbar-actions">
          <template v-if="state.active === 'articles'">
            <button class="primary-btn compact" type="button" @click="$emit('go', '/editor')"><TsIcon name="plus" :size="16" />新建</button>
          </template>
          <template v-else-if="state.active === 'messages'">
            <button class="admin-filter-btn" type="button" :class="{ active: state.pendingOnly }" @click="state.pendingOnly = !state.pendingOnly">
              {{ state.pendingOnly ? '仅待审核' : '全部留言' }}
            </button>
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
        <article v-for="item in visibleArticles" :key="item.id" class="admin-row">
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
        <div v-if="!visibleArticles.length" class="admin-empty">暂无文章</div>
      </section>

      <section v-else-if="state.active === 'messages'" class="admin-list" aria-label="留言审核">
        <article v-for="item in visibleMessages" :key="item.id" class="admin-row admin-message-row">
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
        <div v-if="!visibleMessages.length" class="admin-empty">暂无待处理留言</div>
      </section>

      <section v-else-if="state.active === 'gallery'" class="admin-media-grid" aria-label="图库管理">
        <article v-for="asset in visibleGallery" :key="asset.id" class="admin-media-card">
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
        <div v-if="!visibleGallery.length" class="admin-empty">暂无图片</div>
      </section>

      <section v-else class="admin-list" aria-label="附件管理">
        <article v-for="asset in visibleAttachments" :key="asset.id" class="admin-row admin-asset-row">
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
        <div v-if="!visibleAttachments.length" class="admin-empty">暂无附件</div>
      </section>
    </template>
  </main>
</template>
