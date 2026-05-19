<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { authHeaders, getSession, parseResponse } from '../api/client';
import { compressImage } from '../utils/image';

const emit = defineEmits(['go']);
const fileInput = ref(null);
const session = ref(getSession());

const state = reactive({
  loading: false,
  uploading: false,
  message: '',
  messageType: 'success',
  assets: [],
  search: '',
  type: 'all',
  storage: 'auto',
  uploadPath: '',
  ossImport: {
    objectKey: '',
    title: '',
    assetType: 'auto',
    mimeType: '',
    size: '',
    visibility: 'public',
    description: '',
    loading: false
  },
  page: 1,
  totalPages: 1
});

const isAuthed = computed(() => Boolean(session.value));
const canRegisterOss = computed(() => session.value?.admin || ['admin', 'super_admin'].includes(session.value?.user?.role));

function showMessage(message, type = 'success') {
  state.message = message;
  state.messageType = type;
}

function assetName(asset) {
  return asset.metadata?.title || asset.metadata?.fileName || asset.metadata?.alt || asset.storage_key?.split('/').pop() || asset.id;
}

function markdownFor(asset) {
  const alt = String(asset.metadata?.alt || assetName(asset)).replace(/[\]\r\n]/g, ' ');
  const mimeType = String(asset.mime_type || '');
  if (mimeType.startsWith('image/')) return `![${alt}](${asset.url})`;
  if (mimeType.startsWith('video/')) return `\n::media[${alt}](${asset.url} "video")\n`;
  if (mimeType.startsWith('audio/')) return `\n::media[${alt}](${asset.url} "audio")\n`;
  return `[${alt}](${asset.url})`;
}

async function loadAssets(page = 1) {
  if (!isAuthed.value) return;
  state.loading = true;
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: '72',
      type: state.type,
      search: state.search.trim(),
      includePublic: 'true'
    });
    const response = await fetch(`/api/assets?${params}`, {
      headers: authHeaders(),
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
  if (!file.type.startsWith('image/')) {
    showMessage('目前附件库优先支持图片上传', 'error');
    return;
  }
  state.uploading = true;
  try {
    const dataUrl = await compressImage(file, { maxWidth: 1800, maxHeight: 1600, quality: 0.82 });
    const response = await fetch('/api/assets', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        dataUrl,
        fileName: file.name,
        alt: file.name.replace(/\.[^.]+$/, ''),
        storage: state.storage,
        uploadPath: state.uploadPath.trim()
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '附件上传失败');
    showMessage('附件已上传');
    await loadAssets(1);
  } catch (error) {
    showMessage(error.message || '附件上传失败', 'error');
  } finally {
    state.uploading = false;
    if (fileInput.value) fileInput.value.value = '';
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
    const response = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '附件删除失败');
    showMessage('附件已删除');
    await loadAssets(state.page);
  } catch (error) {
    showMessage(error.message || '附件删除失败', 'error');
  }
}

function resetOssImport() {
  state.ossImport.objectKey = '';
  state.ossImport.title = '';
  state.ossImport.assetType = 'auto';
  state.ossImport.mimeType = '';
  state.ossImport.size = '';
  state.ossImport.visibility = 'public';
  state.ossImport.description = '';
}

async function registerOssAsset() {
  const objectKey = state.ossImport.objectKey.trim();
  if (!objectKey) {
    showMessage('请填写 OSS Object Key', 'error');
    return;
  }
  state.ossImport.loading = true;
  try {
    const response = await fetch('/api/assets/oss-register', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        objectKey,
        title: state.ossImport.title.trim(),
        assetType: state.ossImport.assetType,
        mimeType: state.ossImport.mimeType.trim(),
        size: state.ossImport.size,
        visibility: state.ossImport.visibility,
        description: state.ossImport.description.trim()
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || 'OSS 资源登记失败');
    showMessage('OSS 资源已登记，只保存索引，不同步到本地');
    resetOssImport();
    state.type = 'all';
    await loadAssets(1);
  } catch (error) {
    showMessage(error.message || 'OSS 资源登记失败', 'error');
  } finally {
    state.ossImport.loading = false;
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
            {{ state.uploading ? '上传中...' : '上传图片' }}
          </button>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="uploadAsset">
        </div>
      </header>

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
      </section>

      <section class="panel attachments-upload-options">
        <label>存储位置
          <select v-model="state.storage">
            <option value="auto">跟随站点默认</option>
            <option value="local">本地存储</option>
            <option value="oss">对象存储</option>
          </select>
        </label>
        <label>上传路径
          <input v-model="state.uploadPath" type="text" placeholder="attachments/${year}/${month} 或 user-images">
        </label>
        <p>上传路径是相对目录，留空时使用后台默认目录；不要填写 URL、盘符或包含 .. 的路径。</p>
      </section>

      <section v-if="canRegisterOss" class="panel attachments-oss-import">
        <div>
          <h2>登记 OSS 大文件</h2>
          <p>适合电影、长视频、音频包等已经手动上传到 OSS 的资源；这里只登记 Object Key，不同步到本地服务器。</p>
        </div>
        <label>Object Key
          <input v-model="state.ossImport.objectKey" type="text" placeholder="movies/example.mp4">
        </label>
        <label>显示名称
          <input v-model="state.ossImport.title" type="text" placeholder="留空则使用文件名">
        </label>
        <label>资源类型
          <select v-model="state.ossImport.assetType">
            <option value="auto">自动识别</option>
            <option value="video">视频</option>
            <option value="audio">音频</option>
            <option value="image">图片</option>
            <option value="document">文档</option>
            <option value="file">文件</option>
            <option value="live2d">Live2D</option>
          </select>
        </label>
        <label>MIME 类型
          <input v-model="state.ossImport.mimeType" type="text" placeholder="可选，例如 video/mp4">
        </label>
        <label>大小（字节）
          <input v-model="state.ossImport.size" type="number" min="0" placeholder="可选">
        </label>
        <label>可见性
          <select v-model="state.ossImport.visibility">
            <option value="public">公共资源</option>
            <option value="private">仅自己可见</option>
          </select>
        </label>
        <label class="attachments-oss-description">备注
          <textarea v-model="state.ossImport.description" rows="2" placeholder="可选"></textarea>
        </label>
        <button class="primary-btn" type="button" :disabled="state.ossImport.loading" @click="registerOssAsset">
          {{ state.ossImport.loading ? '登记中...' : '登记 OSS 资源' }}
        </button>
      </section>

      <div v-if="state.message" class="form-message" :class="state.messageType">{{ state.message }}</div>

      <section v-if="state.loading" class="attachments-status">加载附件中...</section>
      <section v-else-if="!state.assets.length" class="panel attachments-empty">
        <h2>还没有附件</h2>
        <p>上传图片后，它会出现在这里，并只对你自己的账号可见。</p>
      </section>
      <section v-else class="attachments-grid">
        <article v-for="asset in state.assets" :key="asset.id" class="attachments-card">
          <img v-if="assetPreviewType(asset) === 'image'" :src="asset.url" :alt="assetName(asset)" loading="lazy">
          <video v-else-if="assetPreviewType(asset) === 'video'" :src="asset.url" preload="metadata" controls></video>
          <audio v-else-if="assetPreviewType(asset) === 'audio'" :src="asset.url" preload="metadata" controls></audio>
          <div v-else class="attachments-file-preview">{{ asset.asset_type || 'file' }}</div>
          <div class="attachments-card-body">
            <strong>{{ assetName(asset) }}</strong>
            <span>{{ asset.mime_type || asset.asset_type || 'file' }}</span>
            <code>{{ asset.storage_key }}</code>
          </div>
          <div class="attachments-card-actions">
            <button class="ghost-btn" type="button" @click="copyMarkdown(asset)">复制 Markdown</button>
            <a class="ghost-btn" :href="asset.url" target="_blank" rel="noopener noreferrer">打开</a>
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
