<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import { compressImage } from '../utils/image';

const emit = defineEmits(['go']);
const route = useRoute();
const fileInput = ref(null);
const session = ref(getSession());

const state = reactive({
  loading: false,
  uploading: false,
  uploadProgress: 0,
  uploadPhase: '',
  message: '',
  messageType: 'success',
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
const uploadAccept = 'image/*,video/mp4,video/webm,video/quicktime,audio/*,application/pdf,text/plain,text/markdown,application/zip,application/json';

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

function postJsonWithProgress(url, payload, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    Object.entries(headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) xhr.setRequestHeader(key, value);
    });
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        text: () => Promise.resolve(xhr.responseText || '')
      });
    };
    xhr.onerror = () => reject(new Error('附件上传失败，请检查网络后重试'));
    xhr.send(JSON.stringify(payload));
  });
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
  state.loading = true;
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: '72',
      type: state.type,
      search: state.search.trim()
    });
    if (canManageAllAssets.value && state.scope === 'all') params.set('scope', 'all');
    const response = await authFetch(noStoreUrl(`/api/assets?${params}`), {
      headers: assetAuthHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '附件读取失败');
    state.assets = result.data?.assets || [];
    state.page = result.data?.pagination?.page || 1;
    state.totalPages = result.data?.pagination?.totalPages || 1;
  } catch (error) {
    state.assets = [];
    showMessage(error.message || '附件读取失败', 'error');
  } finally {
    state.loading = false;
  }
}

async function uploadAsset(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!isSupportedFile(file)) {
    showMessage('暂不支持这种文件类型', 'error');
    return;
  }
  state.uploading = true;
  state.uploadProgress = 4;
  state.uploadPhase = file.type.startsWith('image/') ? '正在压缩图片...' : '正在读取文件...';
  try {
    const dataUrl = file.type.startsWith('image/')
      ? await compressImage(file, { maxWidth: 1800, maxHeight: 1600, quality: 0.82 })
      : await fileToDataUrl(file);
    state.uploadProgress = 8;
    state.uploadPhase = '正在上传...';
    const response = await postJsonWithProgress(
      '/api/assets',
      {
        dataUrl,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        alt: file.name.replace(/\.[^.]+$/, ''),
        storage: state.storage
      },
      assetAuthHeaders({ 'Content-Type': 'application/json' }),
      (progress) => {
        state.uploadProgress = Math.max(8, Math.min(96, progress));
      }
    );
    state.uploadPhase = '正在处理...';
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '附件上传失败');
    state.uploadProgress = 100;
    showMessage('附件已上传');
    await loadAssets(1);
  } catch (error) {
    showMessage(error.message || '附件上传失败', 'error');
  } finally {
    state.uploading = false;
    state.uploadPhase = '';
    state.uploadProgress = 0;
    if (fileInput.value) fileInput.value.value = '';
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function isSupportedFile(file) {
  const type = file.type || '';
  const name = file.name || '';
  return type.startsWith('image/')
    || type.startsWith('video/')
    || type.startsWith('audio/')
    || ['application/pdf', 'text/plain', 'text/markdown', 'application/zip', 'application/json'].includes(type)
    || /\.(md|txt|pdf|zip|json|mp4|webm|mov|m4v|mkv|mp3|flac|wav|ogg|m4a)$/i.test(name);
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
});
</script>

<template>
  <main class="page attachments-page">
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
          <p>管理你上传的图片，写文章时可以快速复制 Markdown 或从编辑器直接插入。</p>
        </div>
        <div class="attachments-actions">
          <button class="ghost-btn" type="button" @click="go('/editor')">写文章</button>
          <button class="primary-btn" type="button" :disabled="state.uploading" @click="fileInput?.click()">
            {{ state.uploading ? '上传中...' : '上传文件' }}
          </button>
          <input ref="fileInput" type="file" :accept="uploadAccept" hidden @change="uploadAsset">
        </div>
      </header>

      <div v-if="state.uploading" class="attachments-upload-progress" role="status" aria-live="polite">
        <div class="attachments-upload-progress-head">
          <span>{{ state.uploadPhase || '正在上传...' }}</span>
          <strong>{{ state.uploadProgress }}%</strong>
        </div>
        <div class="attachments-upload-progress-track" aria-hidden="true">
          <span :style="{ width: `${state.uploadProgress}%` }"></span>
        </div>
      </div>

      <section class="panel attachments-toolbar">
        <input v-model="state.search" type="search" placeholder="搜索文件名、路径或备注" @keydown.enter="loadAssets(1)">
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

      <section v-if="state.loading" class="attachments-status">加载附件中...</section>
      <section v-else-if="!state.assets.length" class="panel attachments-empty">
        <h2>还没有附件</h2>
        <p>上传图片后，它会出现在这里，并只对你自己的账号可见。</p>
      </section>
      <section v-else class="attachments-grid">
        <article v-for="asset in state.assets" :key="asset.id" class="attachments-card">
          <img v-if="assetPreviewType(asset) === 'image'" :src="assetUrl(asset)" :alt="assetName(asset)" loading="lazy">
          <video v-else-if="assetPreviewType(asset) === 'video'" :src="assetUrl(asset)" preload="metadata" controls></video>
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

      <div class="attachments-pager">
        <button class="ghost-btn" type="button" :disabled="state.page <= 1" @click="loadAssets(state.page - 1)">上一页</button>
        <span>{{ state.page }} / {{ state.totalPages || 1 }}</span>
        <button class="ghost-btn" type="button" :disabled="state.page >= state.totalPages" @click="loadAssets(state.page + 1)">下一页</button>
      </div>
    </template>
  </main>
</template>
