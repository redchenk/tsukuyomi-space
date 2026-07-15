<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { apiFetch, apiUrl, authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { compressImage } from '../utils/image';

const emit = defineEmits(['go']);
const props = defineProps({
  routeName: { type: String, default: '' }
});
const fileInput = ref(null);
const session = ref(getSession());
let randomFeatureTimer = 0;
let randomFeatureTransitionTimer = 0;
let randomFeatureRequestId = 0;

const state = reactive({
  loading: false,
  uploading: false,
  uploadProgress: 0,
  uploadPhase: '',
  message: '',
  messageType: 'success',
  images: [],
  search: '',
  dragActive: false,
  page: 1,
  totalPages: 1,
  total: 0,
  latest: null,
  randomFeatured: null,
  randomFeatureFading: false,
  selected: null
});

const isAuthed = computed(() => Boolean(session.value));
const isManageMode = computed(() => props.routeName === 'galleryManage');
const canManageAllImages = computed(() => Boolean(session.value?.admin || ['admin', 'super_admin'].includes(session.value?.user?.role)));
const currentUserId = computed(() => session.value?.user?.id || '');
const manageScopeLabel = computed(() => {
  if (!isAuthed.value) return '登录后管理';
  return canManageAllImages.value ? '全部图库' : '我的图库';
});
const shownImages = computed(() => state.images);
const latestImage = computed(() => state.latest || null);
const randomFeatureImage = computed(() => state.randomFeatured || null);
const heroImage = computed(() => latestImage.value ? imageUrl(latestImage.value) : '/assets/images/tsukuyomi-bg.png');

function imageName(asset) {
  return asset.metadata?.title || asset.metadata?.fileName || asset.metadata?.alt || asset.storage_key?.split('/').pop() || asset.id;
}

function imageUrl(asset) {
  return asset.access_url || asset.display_url || asset.url;
}

function imageTitle(asset) {
  const date = imageDate(asset);
  return date ? `图库影像 · ${date}` : '图库影像';
}

function imageDate(asset) {
  const value = asset.created_at || asset.updated_at;
  if (!value) return '';
  return String(value).slice(0, 10);
}

function canDeleteImage(asset) {
  return canManageAllImages.value || (asset.owner_id && asset.owner_id === currentUserId.value);
}

function showMessage(message, type = 'success') {
  state.message = message;
  state.messageType = type;
}

function postJsonWithProgress(url, payload, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(url));
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
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

async function loadLatestImage() {
  try {
    const response = await apiFetch('/api/assets/gallery/public?limit=1', {
      headers: { Accept: 'application/json' }
    });
    const result = await parseResponse(response);
    const assets = result.success && Array.isArray(result.data?.assets) ? result.data.assets : [];
    state.latest = assets[0] || null;
  } catch (_) {
    state.latest = null;
  }
}

async function loadRandomFeatureImage() {
  const requestId = ++randomFeatureRequestId;
  try {
    const response = await apiFetch('/api/assets/gallery/public?limit=1&random=1', {
      headers: { Accept: 'application/json' }
    });
    const result = await parseResponse(response);
    const assets = result.success && Array.isArray(result.data?.assets) ? result.data.assets : [];
    const nextAsset = assets[0] || null;
    if (requestId !== randomFeatureRequestId) return;
    if (!state.randomFeatured || !nextAsset || state.randomFeatured.id === nextAsset.id) {
      state.randomFeatured = nextAsset;
      return;
    }
    state.randomFeatureFading = true;
    window.clearTimeout(randomFeatureTransitionTimer);
    randomFeatureTransitionTimer = window.setTimeout(() => {
      if (requestId !== randomFeatureRequestId) return;
      state.randomFeatured = nextAsset;
      requestAnimationFrame(() => {
        state.randomFeatureFading = false;
      });
    }, 420);
  } catch (_) {
    state.randomFeatured = null;
    state.randomFeatureFading = false;
  }
}

async function loadImages(page = 1) {
  if (isManageMode.value && !isAuthed.value) {
    state.images = [];
    state.page = 1;
    state.totalPages = 1;
    state.total = 0;
    return;
  }
  state.loading = true;
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: '48',
      search: state.search.trim()
    });
    if (isManageMode.value) params.set('scope', canManageAllImages.value ? 'all' : 'mine');
    const response = isManageMode.value
      ? await authFetch(noStoreUrl(`/api/assets/gallery?${params}`), {
        headers: authHeaders(),
        cache: 'no-store'
      })
      : await apiFetch(`/api/assets/gallery?${params}`, {
        headers: { Accept: 'application/json' }
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

async function uploadFile(file) {
  if (!file) return;
  if (!isAuthed.value) {
    showMessage('请先登录，然后从「图库管理」入口上传图片。', 'error');
    return;
  }
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
        alt: '图库图片',
        collection: 'gallery'
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
    await Promise.all([loadLatestImage(), loadRandomFeatureImage()]);
    await loadImages(1);
  } catch (error) {
    showMessage(error.message || '图片上传失败', 'error');
  } finally {
    state.uploading = false;
    state.dragActive = false;
    state.uploadPhase = '';
    state.uploadProgress = 0;
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function uploadImage(event) {
  await uploadFile(event.target.files?.[0]);
}

function handleDragOver() {
  if (!isManageMode.value || state.uploading) return;
  state.dragActive = true;
}

function handleDragLeave(event) {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  state.dragActive = false;
}

async function handleDrop(event) {
  state.dragActive = false;
  if (!isManageMode.value || state.uploading) return;
  await uploadFile(event.dataTransfer?.files?.[0]);
}

async function copyMarkdown(asset) {
  const alt = imageTitle(asset).replace(/[\]\r\n]/g, ' ');
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
  if (!confirm(`删除这张图库图片？已经插入文章的图片链接可能会失效。`)) return;
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

function resetSearch() {
  state.search = '';
  loadImages(1);
}

function go(path) {
  emit('go', path);
}

onMounted(() => {
  session.value = getSession();
  loadLatestImage();
  loadRandomFeatureImage();
  randomFeatureTimer = window.setInterval(loadRandomFeatureImage, 7000);
  loadImages();
});

onUnmounted(() => {
  if (randomFeatureTimer) window.clearInterval(randomFeatureTimer);
  if (randomFeatureTransitionTimer) window.clearTimeout(randomFeatureTransitionTimer);
});
</script>

<template>
  <main class="page gallery-page" :class="{ 'gallery-page-manage': isManageMode }">
    <section v-if="isManageMode && !isAuthed" class="panel gallery-empty">
      <span class="gallery-kicker">Gallery</span>
      <h1>图库管理</h1>
      <p>公开图库无需登录即可查看。上传图片入口在图库管理页，登录后可以上传、管理并复制图片 Markdown。</p>
      <div class="gallery-empty-actions">
        <button class="primary-btn" type="button" @click="go('/login')">去登录</button>
        <button class="ghost-btn" type="button" @click="go('/gallery')">查看公开图库</button>
      </div>
    </section>

    <template v-else>
      <section class="gallery-main">
        <header class="gallery-hero" :class="{ 'gallery-hero-manage': isManageMode }" :style="{ '--gallery-hero-image': `url(${heroImage})` }">
          <div class="gallery-breadcrumb">首页 / 图库</div>
          <h1>图库</h1>
          <strong>{{ isManageMode ? 'Gallery Manager' : 'Gallery' }}</strong>
          <div v-if="isManageMode" class="gallery-manage-badge">
            <TsIcon name="settings" :size="16" />
            <span>管理模式</span>
            <b>{{ manageScopeLabel }}</b>
          </div>
          <p v-if="isManageMode">管理你上传到图库的图片。管理员可管理全站图库图片。</p>
          <p>收藏插画、截图、设定图与站点视觉记录。</p>

          <div class="gallery-toolbar">
            <label class="gallery-search">
              <TsIcon name="search" :size="18" />
              <input v-model="state.search" type="search" placeholder="搜索标签、描述或路径..." @keydown.enter="loadImages(1)">
            </label>
            <button class="chip active" type="button" @click="loadImages(1)">{{ isManageMode ? manageScopeLabel : '全站图库' }}</button>
            <button class="ghost-btn" type="button" @click="resetSearch">重置</button>
            <button v-if="isManageMode" class="ghost-btn" type="button" @click="go('/gallery')">查看图库</button>
            <button v-else-if="isAuthed" class="primary-btn gallery-upload-btn" type="button" @click="go('/gallery/manage')">
              <TsIcon name="upload" :size="18" />
              <span>上传图片</span>
            </button>
            <button v-else class="ghost-btn" type="button" @click="go('/login')">登录后上传</button>
            <button v-if="isManageMode" class="primary-btn gallery-upload-btn" type="button" :disabled="state.uploading" @click="fileInput?.click()">
              <TsIcon name="upload" :size="18" />
              <span>{{ state.uploading ? '上传中...' : '上传图片' }}</span>
            </button>
            <input ref="fileInput" type="file" accept="image/*" hidden @change="uploadImage">
          </div>
        </header>

        <div v-if="isManageMode && state.uploading" class="gallery-progress" role="status" aria-live="polite">
          <div>
            <span>{{ state.uploadPhase || '正在上传...' }}</span>
            <strong>{{ state.uploadProgress }}%</strong>
          </div>
          <i><span :style="{ width: `${state.uploadProgress}%` }"></span></i>
        </div>

        <div v-if="state.message" class="form-message" :class="state.messageType">{{ state.message }}</div>

        <section v-if="isManageMode" class="gallery-manage-strip">
          <div>
            <span>管理范围</span>
            <strong>{{ manageScopeLabel }}</strong>
          </div>
          <div>
            <span>当前图片</span>
            <strong>{{ state.total }}</strong>
          </div>
          <div>
            <span>本页展示</span>
            <strong>{{ shownImages.length }}</strong>
          </div>
          <button class="primary-btn" type="button" :disabled="state.uploading" @click="fileInput?.click()">
            <TsIcon name="upload" :size="18" />
            上传图片
          </button>
        </section>

        <button
          v-if="isManageMode"
          class="gallery-dropzone"
          :class="{ active: state.dragActive, busy: state.uploading }"
          type="button"
          :disabled="state.uploading"
          @click="fileInput?.click()"
          @dragover.prevent="handleDragOver"
          @dragenter.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <TsIcon name="upload" :size="26" />
          <strong>{{ state.uploading ? '正在上传图片' : '拖拽图片到这里上传' }}</strong>
          <span>支持常见图片格式，存储位置跟随管理员设置</span>
        </button>

        <section v-if="randomFeatureImage && !isManageMode" class="gallery-feature" :class="{ 'is-fading': state.randomFeatureFading }">
          <button class="gallery-feature-image" type="button" @click="state.selected = randomFeatureImage">
            <img :src="imageUrl(randomFeatureImage)" :alt="imageName(randomFeatureImage)">
          </button>
          <article>
            <span>随机影像</span>
            <h2>{{ imageTitle(randomFeatureImage) }}</h2>
            <p>由注册用户上传并加入图库的公开图片，不包含普通附件库图片。</p>
            <div class="gallery-feature-actions">
              <button v-if="isManageMode" class="ghost-btn" type="button" @click="copyMarkdown(randomFeatureImage)">
                <TsIcon name="copy" :size="16" /> 复制 Markdown
              </button>
              <a class="ghost-btn" :href="imageUrl(randomFeatureImage)" target="_blank" rel="noopener noreferrer">
                <TsIcon name="external" :size="16" /> 打开
              </a>
              <a class="ghost-btn" :href="imageUrl(randomFeatureImage)" download="gallery-image" rel="noopener noreferrer">
                <TsIcon name="download" :size="16" /> 下载
              </a>
            </div>
          </article>
        </section>

        <section v-if="state.loading" class="gallery-status">正在读取图库...</section>
        <section v-else-if="!shownImages.length" class="panel gallery-empty">
          <h2>还没有图片</h2>
          <p>只有选择“上传到图库”的图片会出现在这里，普通附件库图片不会自动展示。</p>
        </section>
        <section v-else class="gallery-grid">
          <article v-for="asset in shownImages" :key="asset.id" class="gallery-card">
            <button class="gallery-card-image" type="button" @click="state.selected = asset">
              <img :src="imageUrl(asset)" :alt="imageName(asset)" loading="lazy">
            </button>
            <div class="gallery-card-body">
              <span>{{ imageDate(asset) }}</span>
            </div>
            <div class="gallery-card-actions">
              <button v-if="isManageMode" type="button" title="复制 Markdown" @click="copyMarkdown(asset)">
                <TsIcon name="copy" :size="17" />
              </button>
              <a :href="imageUrl(asset)" target="_blank" rel="noopener noreferrer" title="打开图片">
                <TsIcon name="external" :size="17" />
              </a>
              <a :href="imageUrl(asset)" download="gallery-image" rel="noopener noreferrer" title="下载图片">
                <TsIcon name="download" :size="17" />
              </a>
              <button v-if="isManageMode && canDeleteImage(asset)" type="button" title="删除图片" @click="deleteImage(asset)">
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

      <aside v-if="!isManageMode" class="gallery-side">
        <section class="gallery-side-card">
          <div class="gallery-side-title">
            <h2>图库概览</h2>
            <TsIcon name="audioLines" :size="22" />
          </div>
          <div class="gallery-stats">
            <div><span>当前图片</span><strong>{{ state.total }}</strong><small>张</small></div>
            <div><span>本页展示</span><strong>{{ shownImages.length }}</strong><small>张</small></div>
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

          <div class="gallery-upload-entry">
            <h3>图库上传入口</h3>
            <p>登录后进入「图库管理」页面上传图片；上传到图库的公开图片会显示在当前页面。</p>
            <button class="primary-btn" type="button" @click="go(isAuthed ? '/gallery/manage' : '/login')">
              <TsIcon name="upload" :size="16" />
              <span>{{ isAuthed ? '进入图库管理' : '登录后上传' }}</span>
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

      <Teleport to="body">
        <div v-if="state.selected" class="gallery-lightbox" role="presentation" @click.self="state.selected = null">
        <section data-material="popover" role="dialog" aria-modal="true" :aria-label="imageName(state.selected)">
          <button class="gallery-lightbox-close" type="button" @click="state.selected = null">
            <TsIcon name="x" :size="18" />
          </button>
          <img :src="imageUrl(state.selected)" :alt="imageName(state.selected)">
          <footer>
            <div>
              <strong>{{ imageTitle(state.selected) }}</strong>
              <span>公开图库图片</span>
            </div>
            <button v-if="isManageMode" class="ghost-btn" type="button" @click="copyMarkdown(state.selected)">复制 Markdown</button>
            <a class="ghost-btn" :href="imageUrl(state.selected)" download="gallery-image" rel="noopener noreferrer">下载</a>
            <button v-if="isManageMode && canDeleteImage(state.selected)" class="danger-btn" type="button" @click="deleteImage(state.selected)">删除</button>
          </footer>
        </section>
        </div>
      </Teleport>
    </template>
  </main>
</template>
