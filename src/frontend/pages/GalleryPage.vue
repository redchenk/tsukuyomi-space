<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { compressImage } from '../utils/image';

const emit = defineEmits(['go']);
const fileInput = ref(null);
const session = ref(getSession());

const state = reactive({
  loading: false,
  uploading: false,
  uploadProgress: 0,
  uploadPhase: '',
  message: '',
  messageType: 'success',
  images: [],
  search: '',
  storage: 'auto',
  scope: 'mine',
  page: 1,
  totalPages: 1,
  total: 0,
  selected: null
});

const isAuthed = computed(() => Boolean(session.value));
const canManageAllImages = computed(() => Boolean(session.value?.admin || ['admin', 'super_admin'].includes(session.value?.user?.role)));
const shownImages = computed(() => state.images);
const latestImages = computed(() => state.images.slice(0, 4));
const heroImage = computed(() => latestImages.value[0] ? imageUrl(latestImages.value[0]) : '/assets/images/tsukuyomi-bg.png');

function imageName(asset) {
  return asset.metadata?.title || asset.metadata?.fileName || asset.metadata?.alt || asset.storage_key?.split('/').pop() || asset.id;
}

function imageUrl(asset) {
  return asset.access_url || asset.display_url || asset.url;
}

function imageDate(asset) {
  const value = asset.created_at || asset.updated_at;
  if (!value) return '';
  return String(value).slice(0, 10);
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
    xhr.onerror = () => reject(new Error('图片上传失败，请检查网络后重试'));
    xhr.send(JSON.stringify(payload));
  });
}

async function loadImages(page = 1) {
  if (!isAuthed.value) return;
  state.loading = true;
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: '48',
      type: 'image',
      search: state.search.trim()
    });
    if (canManageAllImages.value && state.scope === 'all') params.set('scope', 'all');
    const response = await authFetch(noStoreUrl(`/api/assets?${params}`), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '图库读取失败');
    state.images = result.data?.assets || [];
    state.page = result.data?.pagination?.page || 1;
    state.totalPages = result.data?.pagination?.totalPages || 1;
    state.total = result.data?.pagination?.total || state.images.length;
  } catch (error) {
    state.images = [];
    showMessage(error.message || '图库读取失败', 'error');
  } finally {
    state.loading = false;
  }
}

async function uploadImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showMessage('图库只支持上传图片文件', 'error');
    return;
  }
  state.uploading = true;
  state.uploadProgress = 4;
  state.uploadPhase = '正在压缩图片...';
  try {
    const dataUrl = await compressImage(file, { maxWidth: 2200, maxHeight: 1800, quality: 0.86 });
    state.uploadProgress = 8;
    state.uploadPhase = '正在上传...';
    const response = await postJsonWithProgress(
      '/api/assets',
      {
        dataUrl,
        fileName: file.name,
        mimeType: file.type || 'image/jpeg',
        alt: file.name.replace(/\.[^.]+$/, ''),
        storage: state.storage
      },
      authHeaders({ 'Content-Type': 'application/json' }),
      (progress) => {
        state.uploadProgress = Math.max(8, Math.min(96, progress));
      }
    );
    state.uploadPhase = '正在整理图库...';
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '图片上传失败');
    state.uploadProgress = 100;
    showMessage('图片已加入图库');
    await loadImages(1);
  } catch (error) {
    showMessage(error.message || '图片上传失败', 'error');
  } finally {
    state.uploading = false;
    state.uploadPhase = '';
    state.uploadProgress = 0;
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function copyMarkdown(asset) {
  const alt = String(asset.metadata?.alt || imageName(asset)).replace(/[\]\r\n]/g, ' ');
  const url = asset.markdown_url || asset.display_url || asset.url;
  const text = `![${alt}](${url})`;
  try {
    await navigator.clipboard.writeText(text);
    showMessage('图片 Markdown 已复制');
  } catch (_) {
    showMessage(text);
  }
}

async function deleteImage(asset) {
  if (!confirm(`删除图片「${imageName(asset)}」？已经插入文章的图片链接可能会失效。`)) return;
  try {
    const response = await authFetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '图片删除失败');
    if (state.selected?.id === asset.id) state.selected = null;
    showMessage('图片已删除');
    await loadImages(state.page);
  } catch (error) {
    showMessage(error.message || '图片删除失败', 'error');
  }
}

function setScope(scope) {
  state.scope = scope;
  loadImages(1);
}

function resetSearch() {
  state.search = '';
  loadImages(1);
}

function go(path) {
  emit('go', path);
}

onMounted(() => {
  session.value = getSession();
  loadImages();
});
</script>

<template>
  <main class="page gallery-page">
    <section v-if="!isAuthed" class="panel gallery-empty">
      <span class="gallery-kicker">Gallery</span>
      <h1>图库</h1>
      <p>登录后可以上传、管理和调用自己的图片。</p>
      <button class="primary-btn" type="button" @click="go('/login')">去登录</button>
    </section>

    <template v-else>
      <section class="gallery-main">
        <header class="gallery-hero" :style="{ '--gallery-hero-image': `url(${heroImage})` }">
          <div class="gallery-breadcrumb">首页 / 图库</div>
          <h1>图库</h1>
          <strong>Gallery</strong>
          <p>收藏插画、截图、设定图与站点视觉记录。</p>

          <div class="gallery-toolbar">
            <label class="gallery-search">
              <TsIcon name="search" :size="18" />
              <input v-model="state.search" type="search" placeholder="搜索标题、文件名或路径..." @keydown.enter="loadImages(1)">
            </label>
            <button class="chip" type="button" :class="{ active: state.scope === 'mine' }" @click="setScope('mine')">我的图库</button>
            <button v-if="canManageAllImages" class="chip" type="button" :class="{ active: state.scope === 'all' }" @click="setScope('all')">全部图库</button>
            <select v-model="state.storage" aria-label="存储位置">
              <option value="auto">默认存储</option>
              <option value="local">本地存储</option>
              <option value="oss">对象存储</option>
            </select>
            <button class="ghost-btn" type="button" @click="resetSearch">重置</button>
            <button class="primary-btn gallery-upload-btn" type="button" :disabled="state.uploading" @click="fileInput?.click()">
              <TsIcon name="upload" :size="18" />
              <span>{{ state.uploading ? '上传中...' : '上传图片' }}</span>
            </button>
            <input ref="fileInput" type="file" accept="image/*" hidden @change="uploadImage">
          </div>
        </header>

        <div v-if="state.uploading" class="gallery-progress" role="status" aria-live="polite">
          <div>
            <span>{{ state.uploadPhase || '正在上传...' }}</span>
            <strong>{{ state.uploadProgress }}%</strong>
          </div>
          <i><span :style="{ width: `${state.uploadProgress}%` }"></span></i>
        </div>

        <div v-if="state.message" class="form-message" :class="state.messageType">{{ state.message }}</div>

        <section v-if="latestImages.length" class="gallery-feature">
          <button class="gallery-feature-image" type="button" @click="state.selected = latestImages[0]">
            <img :src="imageUrl(latestImages[0])" :alt="imageName(latestImages[0])">
          </button>
          <article>
            <span>最新上传</span>
            <h2>{{ imageName(latestImages[0]) }}</h2>
            <p>{{ latestImages[0].storage_key }}</p>
            <div class="gallery-feature-actions">
              <button class="ghost-btn" type="button" @click="copyMarkdown(latestImages[0])">
                <TsIcon name="copy" :size="16" /> 复制 Markdown
              </button>
              <a class="ghost-btn" :href="imageUrl(latestImages[0])" target="_blank" rel="noopener noreferrer">
                <TsIcon name="external" :size="16" /> 打开
              </a>
            </div>
          </article>
        </section>

        <section v-if="state.loading" class="gallery-status">正在读取图库...</section>
        <section v-else-if="!shownImages.length" class="panel gallery-empty">
          <h2>还没有图片</h2>
          <p>上传第一张图片后，它会出现在这里。普通用户只能看到自己的图片，管理员可以切换到全部图库。</p>
        </section>
        <section v-else class="gallery-grid">
          <article v-for="asset in shownImages" :key="asset.id" class="gallery-card">
            <button class="gallery-card-image" type="button" @click="state.selected = asset">
              <img :src="imageUrl(asset)" :alt="imageName(asset)" loading="lazy">
            </button>
            <div class="gallery-card-body">
              <strong>{{ imageName(asset) }}</strong>
              <span>{{ imageDate(asset) }}</span>
            </div>
            <div class="gallery-card-actions">
              <button type="button" title="复制 Markdown" @click="copyMarkdown(asset)">
                <TsIcon name="copy" :size="17" />
              </button>
              <a :href="imageUrl(asset)" target="_blank" rel="noopener noreferrer" title="打开图片">
                <TsIcon name="external" :size="17" />
              </a>
              <button type="button" title="删除图片" @click="deleteImage(asset)">
                <TsIcon name="trash" :size="17" />
              </button>
            </div>
          </article>
        </section>

        <div class="gallery-pager">
          <button class="ghost-btn" type="button" :disabled="state.page <= 1" @click="loadImages(state.page - 1)">上一页</button>
          <span>{{ state.page }} / {{ state.totalPages || 1 }}</span>
          <button class="ghost-btn" type="button" :disabled="state.page >= state.totalPages" @click="loadImages(state.page + 1)">下一页</button>
        </div>
      </section>

      <aside class="gallery-side">
        <section class="gallery-side-card">
          <div class="gallery-side-title">
            <h2>图库概览</h2>
            <TsIcon name="audioLines" :size="22" />
          </div>
          <div class="gallery-stats">
            <div><span>当前图片</span><strong>{{ state.total }}</strong><small>张</small></div>
            <div><span>本页展示</span><strong>{{ shownImages.length }}</strong><small>张</small></div>
            <div><span>存储模式</span><strong>{{ state.storage === 'oss' ? 'OSS' : state.storage === 'local' ? '本地' : '默认' }}</strong><small>上传</small></div>
            <div><span>管理范围</span><strong>{{ state.scope === 'all' ? '全部' : '我的' }}</strong><small>图库</small></div>
          </div>

          <div class="gallery-quick">
            <h3>快速筛选</h3>
            <button class="active" type="button" @click="state.search = ''; loadImages(1)">
              <TsIcon name="image" :size="16" /> 全部图片 <span>{{ state.total }}</span>
            </button>
            <button type="button" @click="state.search = 'wallpaper'; loadImages(1)">
              <TsIcon name="star" :size="16" /> 壁纸
            </button>
            <button type="button" @click="state.search = 'screenshot'; loadImages(1)">
              <TsIcon name="grid" :size="16" /> 截图
            </button>
          </div>

          <div class="gallery-tags">
            <h3>常用标签</h3>
            <button type="button" @click="state.search = '月读'; loadImages(1)">月读</button>
            <button type="button" @click="state.search = '星空'; loadImages(1)">星空</button>
            <button type="button" @click="state.search = '夜景'; loadImages(1)">夜景</button>
            <button type="button" @click="state.search = '角色'; loadImages(1)">角色</button>
          </div>
        </section>
      </aside>

      <div v-if="state.selected" class="gallery-lightbox" role="presentation" @click.self="state.selected = null">
        <section role="dialog" aria-modal="true" :aria-label="imageName(state.selected)">
          <button class="gallery-lightbox-close" type="button" @click="state.selected = null">
            <TsIcon name="x" :size="18" />
          </button>
          <img :src="imageUrl(state.selected)" :alt="imageName(state.selected)">
          <footer>
            <div>
              <strong>{{ imageName(state.selected) }}</strong>
              <span>{{ state.selected.storage_key }}</span>
            </div>
            <button class="ghost-btn" type="button" @click="copyMarkdown(state.selected)">复制 Markdown</button>
            <button class="danger-btn" type="button" @click="deleteImage(state.selected)">删除</button>
          </footer>
        </section>
      </div>
    </template>
  </main>
</template>
