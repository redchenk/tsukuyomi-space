<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import { uploadAttachment, ATTACHMENT_ACCEPT } from '../api/attachments';

const emit = defineEmits(['go']);
const route = useRoute();
const fileInput = ref(null);
const session = ref(getSession());

const state = reactive({
  loading: Boolean(session.value),
  uploading: false,
  pendingUploads: [],
  uploadProgress: 0,
  uploadPhase: '',
  message: '',
  messageType: 'success',
  loadError: '',
  assets: [],
  search: '',
  type: 'all',
  storage: 'auto',
  scope: 'mine',
  page: 1,
  totalPages: 1
});

const isAuthed = computed(() => Boolean(session.value));
const canManageAllAssets = computed(() => Boolean(session.value?.admin || ['admin', 'super_admin'].includes(session.value?.user?.role)));
const uploadAccept = ATTACHMENT_ACCEPT;
let uploadController = null;
let assetLoadController = null;
let assetLoadSequence = 0;

function assetPageSize() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 36;
  return window.matchMedia('(max-width: 760px)').matches ? 18 : 36;
}

function syncDefaultScope() {
  state.scope = canManageAllAssets.value && route.query.scope === 'all' ? 'all' : 'mine';
}

function assetAuthHeaders(extra = {}) {
  return authHeaders(extra);
}

function showMessage(message, type = 'success') {
  state.message = message;
  state.messageType = type;
}

function assetName(asset) {
  return asset.metadata?.title || asset.metadata?.fileName || asset.metadata?.alt || asset.storage_key?.split('/').pop() || asset.id;
}

function assetUrl(asset) {
  return asset.access_url || asset.display_url || asset.url;
}

function assetMarkdownUrl(asset) {
  return asset.markdown_url || asset.display_url || asset.url;
}

function markdownFor(asset) {
  const alt = String(asset.metadata?.alt || assetName(asset)).replace(/[\]\r\n]/g, ' ');
  const url = assetMarkdownUrl(asset);
  const mimeType = String(asset.mime_type || '');
  if (mimeType.startsWith('image/')) return `![${alt}](${url})`;
  if (mimeType.startsWith('video/')) return `\n::media[${alt}](${url} "video")\n`;
  if (mimeType.startsWith('audio/')) return `\n::media[${alt}](${url} "audio")\n`;
  return `[${alt}](${url})`;
}

async function loadAssets(page = 1) {
  if (!isAuthed.value) return;
  const loadSequence = ++assetLoadSequence;
  assetLoadController?.abort();
  const controller = new AbortController();
  assetLoadController = controller;
  state.loading = true;
  state.loadError = '';
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(assetPageSize()),
      type: state.type,
      search: state.search.trim()
    });
    if (canManageAllAssets.value && state.scope === 'all') params.set('scope', 'all');
    const response = await authFetch(noStoreUrl(`/api/assets?${params}`), {
      headers: assetAuthHeaders(),
      cache: 'no-store',
      signal: controller.signal
    });
    const result = await parseResponse(response);
    if (loadSequence !== assetLoadSequence) return;
    if (!result.success) throw new Error(result.message || '附件读取失败');
    state.assets = result.data?.assets || [];
    state.page = result.data?.pagination?.page || 1;
    state.totalPages = result.data?.pagination?.totalPages || 1;
  } catch (error) {
    if (error?.name === 'AbortError' || loadSequence !== assetLoadSequence) return;
    state.assets = [];
    state.loadError = error.message || '附件读取失败';
  } finally {
    if (loadSequence === assetLoadSequence) {
      state.loading = false;
      if (assetLoadController === controller) assetLoadController = null;
    }
  }
}

async function loadPendingUploads() {
  try {
    const result = await parseResponse(await authFetch('/api/assets/uploads', { cache: 'no-store' }));
    if (result.success) state.pendingUploads = result.data || [];
  } catch (_) { /* The normal library remains usable while offline. */ }
}

async function cancelPendingUpload(upload) {
  try {
    const result = await parseResponse(await authFetch(`/api/assets/uploads/${encodeURIComponent(upload.id)}`, { method: 'DELETE' }));
    if (!result.success) throw new Error(result.message);
    await loadPendingUploads();
  } catch (error) { showMessage(error.message, 'error'); }
}

async function uploadAsset(event) {
  const file = event.target.files?.[0];
  if (!file || state.uploading) return;
  state.uploading = true;
  state.uploadProgress = 0;
  uploadController = new AbortController();
  try {
    await uploadAttachment(file, {
      ownerId: session.value?.user?.id, storageMode: state.storage, signal: uploadController.signal,
      onProgress: (progress, phase) => {
        if (progress !== null) state.uploadProgress = progress;
        state.uploadPhase = phase;
      }
    });
    showMessage('附件已上传');
    await loadAssets(1);
  } catch (error) { showMessage(error.message || '附件上传失败', 'error'); }
  finally {
    uploadController = null;
    state.uploading = false;
    state.uploadPhase = '';
    state.uploadProgress = 0;
    if (fileInput.value) fileInput.value.value = '';
    await loadPendingUploads();
  }
}

async function copyMarkdown(asset) {
  const text = markdownFor(asset);
  try {
    await navigator.clipboard.writeText(text);
    showMessage('Markdown 已复制，可以直接粘贴到文章正文');
  } catch (_) {
    showMessage(text, 'success');
  }
}

async function deleteAsset(asset) {
  if (!confirm(`删除附件「${assetName(asset)}」？已经插入文章的图片链接可能会失效。`)) return;
  try {
    const response = await authFetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
      method: 'DELETE',
      headers: assetAuthHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '附件删除失败');
    showMessage('附件已删除');
    await loadAssets(state.page);
  } catch (error) {
    showMessage(error.message || '附件删除失败', 'error');
  }
}

function assetPreviewType(asset) {
  const mimeType = String(asset.mime_type || '');
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

function go(path) {
  emit('go', path);
}

onMounted(() => {
  session.value = getSession();
  syncDefaultScope();
  loadAssets();
  loadPendingUploads();
});

onBeforeUnmount(() => {
  uploadController?.abort();
  assetLoadSequence += 1;
  assetLoadController?.abort();
  assetLoadController = null;
});
</script>

<template>
  <main class="page attachments-page" :aria-busy="state.loading || state.uploading">
    <section v-if="!isAuthed" class="panel attachments-empty">
      <h1>附件库</h1>
      <p>登录后可以管理自己上传的图片附件。</p>
      <button class="primary-btn" type="button" @click="go('/login')">去登录</button>
    </section>

    <template v-else>
      <header class="attachments-hero">
        <div>
          <span class="attachments-kicker">Asset Library</span>
          <h1>附件库</h1>
          <p>管理图片、音视频与文档，支持复制 Markdown 或从编辑器插入。单文件最大 100 MB，支持自动重试和断点续传。</p>
        </div>
        <div class="attachments-actions">
          <button class="ghost-btn" type="button" @click="go('/editor')">写文章</button>
          <button class="primary-btn" type="button" :disabled="state.uploading" :aria-busy="state.uploading" @click="fileInput?.click()">
            {{ state.uploading ? '上传中...' : '上传文件' }}
          </button>
          <input ref="fileInput" type="file" :accept="uploadAccept" hidden @change="uploadAsset">
        </div>
      </header>

      <div v-if="state.uploading" class="ts-loader-region" aria-busy="true">
        <StatusLoader :label="state.uploadPhase || '正在上传...'" :progress="state.uploadProgress" />
        <button class="ghost-btn" type="button" @click="uploadController?.abort()">暂停上传</button>
      </div>

      <section v-if="state.pendingUploads.length && !state.uploading" class="panel attachments-pending" aria-label="未完成的上传">
        <p>未完成的上传会保留 24 小时。点击“上传文件”重新选择同一文件，即可校验后继续。</p>
        <div v-for="upload in state.pendingUploads" :key="upload.id" class="attachments-pending-row">
          <span>{{ upload.fileName }} · {{ Math.round(upload.received / upload.size * 100) }}%{{ upload.processing ? ' · 正在保存' : '' }}</span>
          <button class="ghost-btn" type="button" :disabled="upload.processing" @click="cancelPendingUpload(upload)">取消上传</button>
        </div>
      </section>

      <section class="panel attachments-toolbar">
        <input autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true" name="attachments-page-state-search-query" v-model="state.search" type="search" placeholder="搜索文件名、路径或备注" @keydown.enter="loadAssets(1)">
        <select v-model="state.type" @change="loadAssets(1)">
          <option value="all">全部</option>
          <option value="image">图片</option>
          <option value="video">视频</option>
          <option value="audio">音频</option>
          <option value="document">文档</option>
          <option value="file">文件</option>
        </select>
        <button class="ghost-btn" type="button" @click="loadAssets(1)">搜索</button>
        <button class="ghost-btn" type="button" @click="state.search = ''; loadAssets(1)">重置</button>
        <template v-if="canManageAllAssets">
          <button class="chip" type="button" :class="{ active: state.scope === 'mine' }" @click="state.scope = 'mine'; loadAssets(1)">我的附件</button>
          <button class="chip" type="button" :class="{ active: state.scope === 'all' }" @click="state.scope = 'all'; loadAssets(1)">全部附件</button>
        </template>
      </section>

      <section class="panel attachments-upload-options">
        <label>存储位置
          <select v-model="state.storage">
            <option value="auto">跟随站点默认</option>
            <option value="local">本地存储</option>
            <option value="oss">对象存储</option>
          </select>
        </label>
        <p>上传目录由系统自动按用户与文件类型分类：users/{用户ID}/image、video、audio、document、file。普通用户只能查看和管理自己的附件；管理员请从终端入口进入全站附件管理。</p>
      </section>

      <div v-if="state.message" class="form-message" :class="state.messageType">{{ state.message }}</div>

      <LoadingSkeleton v-if="state.loading" variant="gallery" :count="8" label="正在加载附件" />
      <section v-else-if="state.loadError" class="attachments-status error" role="alert">{{ state.loadError }}</section>
      <section v-else-if="!state.assets.length" class="panel attachments-empty">
        <h2>还没有附件</h2>
        <p>上传图片后，它会出现在这里，并只对你自己的账号可见。</p>
      </section>
      <section v-else class="attachments-grid">
        <article v-for="asset in state.assets" :key="asset.id" class="attachments-card">
          <img v-if="assetPreviewType(asset) === 'image'" :src="assetUrl(asset)" :alt="assetName(asset)" loading="lazy" decoding="async" data-image-bloom>
          <video
            v-else-if="assetPreviewType(asset) === 'video'"
            :src="assetUrl(asset)"
            preload="none"
            controls
            playsinline
            webkit-playsinline
            disablepictureinpicture
            disableremoteplayback
            controlslist="nodownload noplaybackrate noremoteplayback"
          ></video>
          <audio v-else-if="assetPreviewType(asset) === 'audio'" :src="assetUrl(asset)" preload="metadata" controls></audio>
          <div v-else class="attachments-file-preview">{{ asset.asset_type || 'file' }}</div>
          <div class="attachments-card-body">
            <strong>{{ assetName(asset) }}</strong>
            <span>{{ asset.mime_type || asset.asset_type || 'file' }}</span>
            <small v-if="assetPreviewType(asset) === 'video' || assetPreviewType(asset) === 'audio'">可直接在文章中以播放器方式调用</small>
            <code>{{ asset.storage_key }}</code>
          </div>
          <div class="attachments-card-actions">
            <button class="ghost-btn" type="button" @click="copyMarkdown(asset)">复制 Markdown</button>
            <a class="ghost-btn" :href="assetUrl(asset)" target="_blank" rel="noopener noreferrer">打开</a>
            <button class="danger-btn" type="button" @click="deleteAsset(asset)">删除</button>
          </div>
        </article>
      </section>

      <div v-if="state.totalPages > 1" class="attachments-pager">
        <button class="ghost-btn" type="button" :disabled="state.page <= 1" @click="loadAssets(state.page - 1)">上一页</button>
        <span>{{ state.page }} / {{ state.totalPages || 1 }}</span>
        <button class="ghost-btn" type="button" :disabled="state.page >= state.totalPages" @click="loadAssets(state.page + 1)">下一页</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.attachments-pending { display: grid; gap: 12px; padding: 20px; }
.attachments-pending-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.attachments-pending-row span { min-width: 0; overflow-wrap: anywhere; }
.attachments-pending-row button { flex-shrink: 0; white-space: nowrap; }
</style>
