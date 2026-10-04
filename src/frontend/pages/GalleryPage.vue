<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { apiFetch, apiUrl, authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import UserLevelBadge from '../components/UserLevelBadge.vue';
import { useUserLevels } from '../composables/useUserLevels';
import { compressImage } from '../utils/image';
import { applyGrowthResult } from '../services/userGrowth';
import { isEnglishSite } from '../utils/siteVariant';
import { lockPageScroll } from '../utils/pageScrollLock';

const emit = defineEmits(['go']);
const props = defineProps({
  routeName: { type: String, default: '' },
  lang: { type: String, default: 'zh' }
});
const englishSite = isEnglishSite();
const siteLanguage = computed(() => englishSite ? 'en' : props.lang);
const { hydrateUserLevels, userLevel } = useUserLevels();
const fileInput = ref(null);
const viewer = ref(null);
const session = ref(getSession());
const t = (zh, en) => siteLanguage.value === 'en' ? en : zh;
let listRequestId = 0;
let randomRequestId = 0;
let linkedRequestId = 0;
let releaseViewerScroll;
let previousFocus;

const state = reactive({
  loading: true,
  uploading: false,
  uploadProgress: 0,
  uploadPhase: '',
  message: '',
  messageType: 'success',
  loadError: '',
  images: [],
  search: '',
  dragActive: false,
  page: 1,
  totalPages: 1,
  total: 0,
  category: '',
  sort: 'latest',
  columns: 4,
  randomLoading: false,
  dimensions: {},
  selected: null,
  liking: {},
  likedResults: {},
  likeError: '',
  avatarFailures: {}
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
const filters = computed(() => [
  { value: '', label: t('全部图片', 'All images') },
  { value: 'wallpaper', label: t('壁纸', 'Wallpapers') },
  { value: 'screenshot', label: t('截图', 'Screenshots') },
  { value: 'character', label: t('角色', 'Characters') }
]);
const extraTags = computed(() => siteLanguage.value === 'en' ? ['Yachiyo', 'Moon', 'Night', 'Stars'] : ['八千代', '月读', '星空', '夜景']);
const selectedIndex = computed(() => shownImages.value.findIndex(asset => asset.id === state.selected?.id));
const canBrowseSelection = computed(() => selectedIndex.value >= 0 && shownImages.value.length > 1);

function imageName(asset) {
  return asset.metadata?.title || asset.metadata?.fileName || asset.metadata?.alt || asset.storage_key?.split('/').pop() || asset.id;
}

function imageUrl(asset) {
  return asset?.preview_url || asset?.access_url || asset?.display_url || asset?.url;
}

function reliableImageUrl(asset) {
  return asset?.access_url || asset?.display_url || asset?.markdown_url || asset?.url || asset?.preview_url;
}

function handleImageError(event, asset) {
  const image = event?.currentTarget;
  const fallback = reliableImageUrl(asset);
  if (!image || image.dataset.fallbackAttempted === 'true' || !fallback) return;
  image.dataset.fallbackAttempted = 'true';
  image.src = fallback;
}

function imageTitle(asset) {
  return String(imageName(asset) || t('图库影像', 'Gallery image')).replace(/\.(?:png|jpe?g|webp|gif|avif|heic)$/i, '');
}

function imageTags(asset) {
  const tags = asset?.metadata?.tags;
  return Array.isArray(tags) ? tags.filter(tag => typeof tag === 'string').slice(0, 12) : [];
}

function rememberDimensions(event, asset) {
  const image = event.currentTarget;
  if (image.naturalWidth && image.naturalHeight) state.dimensions[asset.id] = `${image.naturalWidth} × ${image.naturalHeight}`;
}

function imageDate(asset) {
  const value = asset.created_at || asset.updated_at;
  if (!value) return '';
  return String(value).slice(0, 10);
}

function uploaderName(asset) {
  return String(asset?.owner_nickname || asset?.owner_username || '').trim() || t('站点归档', 'Site archive');
}

function uploaderPath(asset) {
  const username = String(asset?.owner_username || '').trim();
  return username ? `/users/${encodeURIComponent(username)}` : '';
}

function uploaderInitial(asset) {
  return Array.from(uploaderName(asset))[0]?.toUpperCase() || '月';
}

function uploaderAvatarKey(asset) {
  return [asset?.owner_username, asset?.owner_avatar_updated_at, asset?.owner_avatar_url].join(':');
}

function uploaderAvatarUrl(asset) {
  const directUrl = String(asset?.owner_avatar_url || '').trim();
  if (/^https:\/\//i.test(directUrl)) return directUrl;
  const username = String(asset?.owner_username || '').trim();
  if (!asset?.owner_has_avatar || !username) return '';
  const version = String(asset?.owner_avatar_updated_at || '').trim();
  const query = version ? `?v=${encodeURIComponent(version)}` : '';
  return apiUrl(`/api/user/public/${encodeURIComponent(username)}/avatar${query}`);
}

function showUploaderAvatar(asset) {
  return Boolean(uploaderAvatarUrl(asset) && !state.avatarFailures[uploaderAvatarKey(asset)]);
}

function markUploaderAvatarFailed(asset) {
  state.avatarFailures[uploaderAvatarKey(asset)] = true;
}

function canDeleteImage(asset) {
  return canManageAllImages.value || (asset.owner_id && asset.owner_id === currentUserId.value);
}

function showMessage(message, type = 'success') {
  state.message = message;
  state.messageType = type;
}

function applyImageLikes(asset) {
  const liked = state.likedResults[asset.id];
  return liked ? { ...asset, viewer_liked: true, like_count: Math.max(Number(asset.like_count || 0), liked.like_count) } : asset;
}

async function likeImage(asset) {
  if (!isAuthed.value) {
    go(`/login?redirect=${encodeURIComponent(`/gallery?image=${asset.id}`)}`);
    return;
  }
  if (asset.viewer_liked || state.liking[asset.id]) return;
  state.liking[asset.id] = true;
  state.likeError = '';
  try {
    const response = await authFetch(`/api/assets/gallery/${encodeURIComponent(asset.id)}/like`, { method: 'POST' });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || t('点赞失败，请稍后重试', 'Unable to like this image. Please try again.'));
    state.likedResults[asset.id] = result.data;
    state.images = state.images.map(applyImageLikes);
    if (state.selected?.id === asset.id) state.selected = applyImageLikes(state.selected);
  } catch (error) {
    state.likeError = error.message;
    showMessage(error.message, 'error');
  } finally {
    delete state.liking[asset.id];
  }
}

async function openLinkedImage() {
  const id = new URLSearchParams(window.location.search).get('image');
  if (!id || id.length > 200) return;
  const requestId = ++linkedRequestId;
  try {
    let asset = state.images.find(item => item.id === id);
    if (!asset) {
      const result = await parseResponse(await readGalleryImage(id));
      if (!result.success) throw new Error(result.message || t('图片已删除或未公开', 'This image is unavailable.'));
      asset = result.data;
    }
    if (requestId !== linkedRequestId) return;
    state.selected = applyImageLikes(asset);
    hydrateUserLevels([asset.owner_id]).catch(() => {});
  } catch (error) {
    if (requestId === linkedRequestId) showMessage(error.message, 'error');
  }
}

function readGalleryImage(id) {
  // Keep account state on the authenticated API, outside the overseas public
  // translation service, which intentionally never forwards browser sessions.
  return fetch(apiUrl(noStoreUrl(`/api/assets/gallery/${encodeURIComponent(id)}`)), { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
}

async function personalizeImages(assets) {
  if (!englishSite || !isAuthed.value || !assets.length) return assets;
  const ids = assets.map(asset => asset.id).join(',');
  const result = await parseResponse(await authFetch(noStoreUrl(`/api/assets/gallery-likes?ids=${encodeURIComponent(ids)}`), { cache: 'no-store' }));
  if (!result.success) throw new Error(result.message || 'Unable to read likes');
  const states = new Map(result.data.map(item => [item.id, item]));
  return assets.map(asset => ({ ...asset, ...states.get(asset.id) }));
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

// Random browsing is requested by the user; there is no background image polling.
async function browseRandom() {
  if (state.randomLoading) return;
  const requestId = ++randomRequestId;
  state.randomLoading = true;
  try {
    const response = await apiFetch('/api/assets/gallery/public?limit=1&random=1', { headers: { Accept: 'application/json' } });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || t('无法读取随机图片', 'Unable to load a random image'));
    const asset = (await personalizeImages(result.data?.assets || []))[0];
    if (requestId !== randomRequestId) return;
    if (!asset) { showMessage(t('图库暂时还没有图片', 'No images in the gallery yet')); return; }
    state.selected = applyImageLikes(asset);
    hydrateUserLevels([asset.owner_id]).catch(() => {});
  } catch (error) {
    if (requestId === randomRequestId) showMessage(error.message, 'error');
  } finally {
    if (requestId === randomRequestId) state.randomLoading = false;
  }
}

function selectFilter(category) {
  state.category = category;
  loadImages(1);
}
function selectTag(tag, event) {
  event?.currentTarget?.closest('details')?.removeAttribute('open');
  state.search = tag;
  state.category = '';
  loadImages(1);
}
function browseSelection(direction) {
  if (!canBrowseSelection.value) return;
  const index = (selectedIndex.value + direction + shownImages.value.length) % shownImages.value.length;
  state.selected = shownImages.value[index];
}
function viewerKeydown(event) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    browseSelection(event.key === 'ArrowRight' ? 1 : -1);
  }
}
function closeViewer() { state.selected = null; }
watch(() => Boolean(state.selected), async (open) => {
  if (open) {
    previousFocus = document.activeElement;
    const path = location.pathname;
    releaseViewerScroll = lockPageScroll(() => location.pathname === path);
    await nextTick();
    if (!viewer.value || !state.selected) return;
    viewer.value.showModal();
    viewer.value.querySelector('.gallery-viewer-close')?.focus({ preventScroll: true });
  } else {
    viewer.value?.close();
    releaseViewerScroll?.();
    releaseViewerScroll = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
});
watch(() => state.selected?.id, () => { state.likeError = ''; });

async function loadImages(page = 1) {
  const requestId = ++listRequestId;
  if (isManageMode.value && !isAuthed.value) {
    state.images = [];
    state.page = 1;
    state.totalPages = 1;
    state.total = 0;
    state.loading = false;
    return;
  }
  state.loading = true;
  state.loadError = '';
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: '12',
      search: state.search.trim(),
      category: state.category,
      sort: state.sort
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
    const images = await personalizeImages(result.data?.assets || []);
    if (requestId !== listRequestId) return;
    state.images = images.map(applyImageLikes);
    hydrateUserLevels(state.images.map((asset) => asset.owner_id)).catch(() => {});
    state.page = result.data?.pagination?.page || 1;
    state.totalPages = result.data?.pagination?.totalPages || 1;
    state.total = result.data?.pagination?.total || state.images.length;
  } catch (error) {
    if (requestId !== listRequestId) return;
    state.images = [];
    state.loadError = error.message || '图库读取失败';
  } finally {
    if (requestId === listRequestId) state.loading = false;
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
    if (result.growth) applyGrowthResult(result.growth);
    state.uploadProgress = 100;
    showMessage('图片已加入图库');
    state.search = '';
    state.category = '';
    state.sort = 'latest';
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
  state.category = '';
  loadImages(1);
}

function go(path) {
  emit('go', path);
}

onMounted(async () => {
  session.value = getSession();
  const requestId = linkedRequestId;
  await loadImages();
  if (requestId === linkedRequestId) openLinkedImage();
});

onUnmounted(() => {
  ++listRequestId;
  ++randomRequestId;
  ++linkedRequestId;
  viewer.value?.close();
  releaseViewerScroll?.();
});
</script>

<template>
  <main class="page gallery-page gallery-workspace" :class="{ 'gallery-page-manage': isManageMode }" :aria-busy="state.loading || state.uploading">
    <section v-if="isManageMode && !isAuthed" class="panel gallery-empty">
      <span class="gallery-kicker">GALLERY</span>
      <h1>{{ t('我的图库', 'My gallery') }}</h1>
      <p>{{ t('登录后上传图片、管理自己的图库，或复制图片 Markdown。公开图库无需登录即可浏览。', 'Sign in to upload images, manage your gallery and copy image Markdown. The public gallery is open to everyone.') }}</p>
      <div class="gallery-empty-actions">
        <button class="primary-btn" type="button" @click="go('/login')">{{ t('去登录', 'Sign in') }}</button>
        <button class="ghost-btn" type="button" @click="go('/gallery')">{{ t('查看公开图库', 'Browse gallery') }}</button>
      </div>
    </section>
    <div v-else class="gallery-main">
      <header class="gallery-heading">
        <nav class="gallery-breadcrumb" :aria-label="t('当前位置', 'Breadcrumb')">
          <a href="/hub" @click.prevent="go('/hub')">{{ t('首页', 'Home') }}</a>
          <TsIcon name="chevronRight" :size="13" />
          <span>{{ t('图库', 'Gallery') }}</span>
          <template v-if="isManageMode">
            <TsIcon name="chevronRight" :size="13" />
            <span>{{ manageScopeLabel }}</span>
          </template>
        </nav>
        <div class="gallery-heading-row">
          <div>
            <div class="gallery-title-line">
              <h1>{{ isManageMode ? manageScopeLabel : t('图库', 'Gallery') }}</h1>
              <span class="gallery-kicker">{{ isManageMode ? 'GALLERY MANAGER' : 'GALLERY' }}</span>
            </div>
            <p>{{ isManageMode ? t('上传喜欢的画面，管理图库里的每一张图片。', 'Upload favourite moments and manage your images.') : t('收藏插画、截图与壁纸，把喜欢的画面留在这里。', 'A home for illustrations, screenshots and wallpapers you love.') }}</p>
          </div>
          <div class="gallery-heading-actions">
            <button class="ghost-btn" type="button" @click="go(isManageMode ? '/gallery' : '/gallery/manage')">
              <TsIcon :name="isManageMode ? 'image' : 'grid'" :size="17" />
              {{ isManageMode ? t('公开图库', 'Public gallery') : t('我的图库', 'My gallery') }}
            </button>
            <button class="primary-btn" type="button" :disabled="state.uploading" @click="isAuthed ? fileInput?.click() : go('/login')">
              <TsIcon name="upload" :size="17" />
              {{ state.uploading ? t('正在上传', 'Uploading') : t('上传图片', 'Upload image') }}
            </button>
          </div>
        </div>
        <input ref="fileInput" class="gallery-file-input" type="file" accept="image/*" :disabled="state.uploading" :aria-label="t('选择图库图片', 'Choose gallery image')" @change="uploadImage">
      </header>
      <div v-if="state.uploading" class="gallery-upload-progress" role="status" aria-live="polite">
        <StatusLoader :label="state.uploadPhase" :detail="`${state.uploadProgress}%`" compact />
        <progress :value="state.uploadProgress" max="100" :aria-label="t('上传进度', 'Upload progress')" />
      </div>
      <div v-if="state.message" class="gallery-notice" :class="{ error: state.messageType === 'error' }" role="status">
        <span>{{ state.message }}</span>
        <button class="gallery-icon-button" type="button" :aria-label="t('关闭提示', 'Dismiss message')" @click="state.message = ''">
          <TsIcon name="x" :size="16" />
        </button>
      </div>
      <div v-if="isManageMode" class="gallery-dropzone" :class="{ 'is-drag-active': state.dragActive }" @dragover.prevent="handleDragOver" @dragleave="handleDragLeave" @drop.prevent="handleDrop">
        <TsIcon name="upload" :size="20" />
        <p>{{ t('把图片拖到这里，或点击「上传图片」。图库图片将公开展示。', 'Drop an image here, or choose Upload image. Gallery uploads are public.') }}</p>
      </div>
      <section class="gallery-discovery panel" :aria-label="t('图库筛选', 'Gallery filters')">
        <div class="gallery-discovery-top">
          <div class="gallery-result-title">
            <h2>{{ isManageMode ? t('管理图片', 'Manage images') : t('发现图片', 'Discover images') }}</h2>
            <span role="status">{{ state.loading ? t('读取中…', 'Loading…') : t(`共 ${state.total} 张图片`, `${state.total} images`) }}</span>
          </div>
          <div class="gallery-discovery-actions">
            <form autocomplete="off" class="gallery-search-field" role="search" @submit.prevent="loadImages(1)">
              <TsIcon name="search" :size="17" />
              <input autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true" name="gallery-page-state-search-query" v-model="state.search" type="search" maxlength="80" :aria-label="t('搜索图库', 'Search gallery')" :placeholder="t('搜索名称、标签或描述…', 'Search names, tags or descriptions…')">
              <button v-if="state.search" class="gallery-icon-button" type="button" :aria-label="t('清空搜索', 'Clear search')" @click="state.search = ''; loadImages(1)">
                <TsIcon name="x" :size="15" />
              </button>
              <button class="gallery-icon-button" type="submit" :aria-label="t('搜索', 'Search')">
                <TsIcon name="arrowRight" :size="17" />
              </button>
            </form>
            <button v-if="!isManageMode" class="ghost-btn gallery-random-button" type="button" :disabled="state.randomLoading" @click="browseRandom">
              <TsIcon name="compass" :size="17" />
              {{ state.randomLoading ? t('寻找中…', 'Finding…') : t('随机看看', 'Surprise me') }}
            </button>
          </div>
        </div>
        <div class="gallery-discovery-bottom">
          <div class="gallery-filter-group" :aria-label="t('按名称与描述筛选', 'Filter by name and description')">
            <button v-for="filter in filters" :key="filter.value" class="gallery-filter-button" type="button" :aria-pressed="state.category === filter.value" @click="selectFilter(filter.value)">
              <TsIcon v-if="!filter.value" name="image" :size="15" />
              {{ filter.label }}
            </button>
            <details class="gallery-more-tags">
              <summary>
                {{ t('更多标签', 'More tags') }}
                <TsIcon name="chevronDown" :size="13" />
              </summary>
              <div class="gallery-tag-options">
                <p>{{ t('按图片名称、标签与描述查找', 'Search image names, tags and descriptions') }}</p>
                <button v-for="tag in extraTags" :key="tag" type="button" @click="selectTag(tag, $event)">{{ tag }}</button>
              </div>
            </details>
          </div>
          <div class="gallery-view-options">
            <div class="gallery-sort-control">
              <select v-model="state.sort" :aria-label="t('图片排序', 'Sort images')" @change="loadImages(1)">
                <option value="latest">{{ t('最新上传', 'Newest first') }}</option>
                <option value="oldest">{{ t('最早上传', 'Oldest first') }}</option>
              </select>
              <TsIcon class="gallery-sort-chevron" name="chevronDown" :size="14" />
            </div>
            <div class="gallery-column-toggle" role="group" :aria-label="t('图库视图', 'Gallery view')">
              <button type="button" :aria-label="t('紧凑四列视图', 'Compact four column view')" :aria-pressed="state.columns === 4" @click="state.columns = 4">
                <TsIcon name="grid" :size="16" />
              </button>
              <button type="button" :aria-label="t('宽松三列视图', 'Spacious three column view')" :aria-pressed="state.columns === 3" @click="state.columns = 3">
                <TsIcon name="image" :size="16" />
              </button>
            </div>
          </div>
        </div>
      </section>
      <LoadingSkeleton v-if="state.loading" variant="gallery" :count="12" :label="t('正在读取图库…', 'Loading gallery…')" />
      <div v-else-if="state.loadError" class="panel gallery-empty" role="alert">
        <TsIcon name="image" :size="30" />
        <h2>{{ t('图片暂时没能加载', 'Unable to load images') }}</h2>
        <p>{{ state.loadError }}</p>
        <button class="ghost-btn" type="button" @click="loadImages(state.page)">{{ t('重新加载', 'Try again') }}</button>
      </div>
      <div v-else-if="!shownImages.length" class="panel gallery-empty">
        <TsIcon name="image" :size="30" />
        <h2>{{ state.search || state.category ? t('没有找到匹配的图片', 'No matching images') : t('还没有图片', 'No images yet') }}</h2>
        <p>{{ state.search || state.category ? t('筛选会匹配图片的名称、标签和描述。试试其他关键词，或查看全部图片。', 'Filters match image names, tags and descriptions. Try another keyword, or browse all images.') : t('从「上传图片」开始，分享喜欢的画面。', 'Upload an image to share a favourite moment.') }}</p>
        <button v-if="state.search || state.category" class="ghost-btn" type="button" @click="resetSearch">{{ t('查看全部图片', 'Show all images') }}</button>
      </div>
      <div v-else class="gallery-grid" :class="{ 'gallery-grid-spacious': state.columns === 3 }">
        <article v-for="asset in shownImages" :key="asset.id" class="gallery-card">
          <button class="gallery-thumb" type="button" :aria-label="t(`查看大图：${imageTitle(asset)}`, `View image: ${imageTitle(asset)}`)" @click="state.selected = asset">
            <img :src="imageUrl(asset)" :alt="imageName(asset)" loading="lazy" decoding="async" data-image-bloom @error="handleImageError($event, asset)" @load="rememberDimensions($event, asset)">
            <span v-if="imageTags(asset).length" class="gallery-image-tag">{{ imageTags(asset)[0] }}</span>
          </button>
          <div class="gallery-card-body">
            <h3 class="gallery-card-title" :title="imageTitle(asset)">{{ imageTitle(asset) }}</h3>
            <div class="gallery-card-meta">
              <a v-if="uploaderPath(asset)" class="gallery-uploader" :href="uploaderPath(asset)" :title="uploaderName(asset)" @click.prevent="go(uploaderPath(asset))">
                <span class="gallery-uploader-avatar" aria-hidden="true">
                  <span>{{ uploaderInitial(asset) }}</span>
                  <img v-if="showUploaderAvatar(asset)" :src="uploaderAvatarUrl(asset)" alt="" loading="lazy" decoding="async" @error="markUploaderAvatarFailed(asset)">
                </span>
                <span class="gallery-uploader-name">{{ uploaderName(asset) }}</span>
                <UserLevelBadge v-if="asset.owner_id" :level="userLevel(asset.owner_id)" :lang="siteLanguage" compact :show-title="false" />
              </a>
              <span v-else class="gallery-uploader">
                <span class="gallery-uploader-avatar" aria-hidden="true">{{ uploaderInitial(asset) }}</span>
                <span class="gallery-uploader-name">{{ uploaderName(asset) }}</span>
              </span>
              <time :datetime="imageDate(asset)">{{ imageDate(asset).slice(5).replace('-', ' / ') }}</time>
            </div>
            <div class="gallery-card-actions">
              <button class="ghost-btn gallery-like-button" :class="{ 'is-liked': asset.viewer_liked }" type="button" :aria-label="t(`${asset.viewer_liked ? '已点赞' : '点赞'}：${imageTitle(asset)}，${asset.like_count || 0} 个赞`, `${asset.viewer_liked ? 'Liked' : 'Like'}: ${imageTitle(asset)}, ${asset.like_count || 0} likes`)" :aria-pressed="Boolean(asset.viewer_liked)" :aria-busy="Boolean(state.liking[asset.id])" :disabled="asset.viewer_liked || state.liking[asset.id]" @click="likeImage(asset)">
                <TsIcon name="heart" :size="15" />
                <span>{{ asset.viewer_liked ? t('已赞', 'Liked') : t('点赞', 'Like') }}</span>
                <span class="gallery-like-count">{{ asset.like_count || 0 }}</span>
              </button>
              <button v-if="isManageMode" class="ghost-btn" type="button" @click="copyMarkdown(asset)">
                <TsIcon name="copy" :size="15" />
                Markdown
              </button>
              <button v-if="isManageMode && canDeleteImage(asset)" class="danger-btn" type="button" @click="deleteImage(asset)">
                <TsIcon name="trash" :size="15" />
                {{ t('删除', 'Delete') }}
              </button>
            </div>
          </div>
        </article>
      </div>
      <footer class="gallery-results-footer">
        <p>
          <TsIcon name="maximize" :size="15" />
          {{ t('点击图片查看大图，下载与图片信息都在预览中。', 'Open an image for a full preview, details and downloads.') }}
        </p>
        <nav class="gallery-pagination" :aria-label="t('图库分页', 'Gallery pages')">
          <button class="gallery-icon-button" type="button" :disabled="state.loading || state.page <= 1" :aria-label="t('上一页', 'Previous page')" @click="loadImages(state.page - 1)">
            <TsIcon name="arrowLeft" :size="17" />
          </button>
          <span>{{ state.page }} / {{ Math.max(1, state.totalPages) }}</span>
          <button class="gallery-icon-button" type="button" :disabled="state.loading || state.page >= state.totalPages" :aria-label="t('下一页', 'Next page')" @click="loadImages(state.page + 1)">
            <TsIcon name="arrowRight" :size="17" />
          </button>
        </nav>
      </footer>
    </div>
    <Teleport to="body">
      <dialog v-if="state.selected" ref="viewer" class="gallery-viewer" :aria-label="imageTitle(state.selected)" @cancel.prevent="closeViewer" @click="($event.target === viewer) && closeViewer()" @keydown="viewerKeydown">
        <header class="gallery-viewer-head">
          <span>{{ t('图片预览', 'Image preview') }}</span>
          <div class="gallery-viewer-controls">
            <template v-if="canBrowseSelection">
              <button class="gallery-icon-button" type="button" :aria-label="t('上一张图片', 'Previous image')" @click="browseSelection(-1)">
                <TsIcon name="arrowLeft" :size="18" />
              </button>
              <span>{{ selectedIndex + 1 }} / {{ shownImages.length }}</span>
              <button class="gallery-icon-button" type="button" :aria-label="t('下一张图片', 'Next image')" @click="browseSelection(1)">
                <TsIcon name="arrowRight" :size="18" />
              </button>
            </template>
            <button class="gallery-icon-button gallery-viewer-close" type="button" :aria-label="t('关闭图片预览', 'Close image preview')" @click="closeViewer">
              <TsIcon name="x" :size="20" />
            </button>
          </div>
        </header>
        <div class="gallery-viewer-image">
          <img :key="state.selected.id" :src="reliableImageUrl(state.selected)" :alt="imageName(state.selected)" decoding="async" data-image-bloom @error="handleImageError($event, state.selected)" @load="rememberDimensions($event, state.selected)">
        </div>
        <footer class="gallery-viewer-footer">
          <p v-if="state.likeError" class="gallery-like-error" role="alert">{{ state.likeError }}</p>
          <div class="gallery-viewer-info">
            <h2>{{ imageTitle(state.selected) }}</h2>
            <div class="gallery-viewer-meta">
              <a v-if="uploaderPath(state.selected)" class="gallery-uploader gallery-lightbox-uploader" :href="uploaderPath(state.selected)" @click.prevent="go(uploaderPath(state.selected)); closeViewer()">
                <span class="gallery-uploader-avatar" aria-hidden="true">
                  <span>{{ uploaderInitial(state.selected) }}</span>
                  <img v-if="showUploaderAvatar(state.selected)" :src="uploaderAvatarUrl(state.selected)" alt="" decoding="async" @error="markUploaderAvatarFailed(state.selected)">
                </span>
                <span class="gallery-uploader-name">{{ uploaderName(state.selected) }}</span>
                <UserLevelBadge v-if="state.selected.owner_id" :level="userLevel(state.selected.owner_id)" :lang="siteLanguage" compact :show-title="false" />
              </a>
              <span v-else>{{ uploaderName(state.selected) }}</span>
              <time :datetime="imageDate(state.selected)">{{ imageDate(state.selected) }}</time>
              <span v-if="state.dimensions[state.selected.id]">{{ state.dimensions[state.selected.id] }}</span>
            </div>
            <div v-if="imageTags(state.selected).length" class="gallery-viewer-tags">
              <span v-for="tag in imageTags(state.selected)" :key="tag">{{ tag }}</span>
            </div>
          </div>
          <div class="gallery-viewer-actions">
            <button class="ghost-btn gallery-like-button" :class="{ 'is-liked': state.selected.viewer_liked }" type="button" :aria-label="t(`${state.selected.viewer_liked ? '已点赞' : '点赞'}：${imageTitle(state.selected)}，${state.selected.like_count || 0} 个赞`, `${state.selected.viewer_liked ? 'Liked' : 'Like'}: ${imageTitle(state.selected)}, ${state.selected.like_count || 0} likes`)" :aria-pressed="Boolean(state.selected.viewer_liked)" :aria-busy="Boolean(state.liking[state.selected.id])" :disabled="state.selected.viewer_liked || state.liking[state.selected.id]" @click="likeImage(state.selected)">
              <TsIcon name="heart" :size="16" />
              <span>{{ state.selected.viewer_liked ? t('已赞', 'Liked') : t('点赞', 'Like') }}</span>
              <span class="gallery-like-count">{{ state.selected.like_count || 0 }}</span>
            </button>
            <button v-if="isManageMode" class="ghost-btn" type="button" @click="copyMarkdown(state.selected)">
              <TsIcon name="copy" :size="16" />
              Markdown
            </button>
            <a class="ghost-btn" :href="reliableImageUrl(state.selected)" target="_blank" rel="noopener noreferrer">
              <TsIcon name="external" :size="16" />
              {{ t('打开原图', 'Open original') }}
            </a>
            <a class="primary-btn" :href="reliableImageUrl(state.selected)" :download="imageName(state.selected)" rel="noopener noreferrer">
              <TsIcon name="download" :size="16" />
              {{ t('下载', 'Download') }}
            </a>
            <button v-if="isManageMode && canDeleteImage(state.selected)" class="danger-btn" type="button" @click="deleteImage(state.selected)">
              <TsIcon name="trash" :size="16" />
              {{ t('删除', 'Delete') }}
            </button>
          </div>
        </footer>
      </dialog>
    </Teleport>
  </main>
</template>
