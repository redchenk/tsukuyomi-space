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
  page: 1,
  totalPages: 1
});

const isAuthed = computed(() => Boolean(session.value));

function showMessage(message, type = 'success') {
  state.message = message;
  state.messageType = type;
}

function assetName(asset) {
  return asset.metadata?.fileName || asset.metadata?.alt || asset.storage_key?.split('/').pop() || asset.id;
}

function markdownFor(asset) {
  const alt = String(asset.metadata?.alt || assetName(asset)).replace(/[\]\r\n]/g, ' ');
  return `![${alt}](${asset.url})`;
}

async function loadAssets(page = 1) {
  if (!isAuthed.value) return;
  state.loading = true;
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: '72',
      type: 'image',
      search: state.search.trim()
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
        alt: file.name.replace(/\.[^.]+$/, '')
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
        <button class="ghost-btn" type="button" @click="loadAssets(1)">搜索</button>
        <button class="ghost-btn" type="button" @click="state.search = ''; loadAssets(1)">重置</button>
      </section>

      <div v-if="state.message" class="form-message" :class="state.messageType">{{ state.message }}</div>

      <section v-if="state.loading" class="attachments-status">加载附件中...</section>
      <section v-else-if="!state.assets.length" class="panel attachments-empty">
        <h2>还没有附件</h2>
        <p>上传图片后，它会出现在这里，并只对你自己的账号可见。</p>
      </section>
      <section v-else class="attachments-grid">
        <article v-for="asset in state.assets" :key="asset.id" class="attachments-card">
          <img :src="asset.url" :alt="assetName(asset)" loading="lazy">
          <div class="attachments-card-body">
            <strong>{{ assetName(asset) }}</strong>
            <span>{{ asset.mime_type || 'image' }}</span>
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
