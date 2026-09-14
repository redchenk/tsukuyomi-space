<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { apiFetch, authFetch, authHeaders, getSession, loadPublicSettings, loadPublicStats, parseResponse, setPublicStatsCache } from '../api/client';
import BeianLink from '../components/BeianLink.vue';
import CountUpValue from '../components/CountUpValue.vue';
import PixelCanvasCells from '../components/PixelCanvasCells.vue';
import TsIcon from '../components/TsIcon.vue';
import { warmRoutePath } from '../router';
import { compareAppDate } from '../utils/time';
import { applyGrowthResult } from '../services/userGrowth';

const props = defineProps({
  lang: { type: String, default: 'zh' },
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const hubCopy = computed(() => ({
  zh: { hero: '给日常留一点月光。与八千代聊天，读故事、看创作，遇见同频的人。', welcome: '与你相遇，在月光之下', room: '进入私人居所', browse: '发现创作', latest: '月下新鲜事', desc: '读一篇文章，发现一份创作，留下今天的问候。', notice: '站内公告', expand: '展开阅读', stats: '一起留下的足迹' },
  ja: { hero: '日々に、少しの月明かりを。八千代と話し、物語や作品を楽しもう。', welcome: '月明かりの下で、あなたと', room: 'プライベートルームへ', browse: '作品を探す', latest: '月の下の新着', desc: '記事を読み、作品に出会い、今日の挨拶を。', notice: 'お知らせ', expand: '続きを読む', stats: 'みんなの足跡' },
  en: { hero: 'Make room for a little moonlight. Talk with Yachiyo, discover stories and share what inspires you.', welcome: 'A little closer, under the moon', room: 'Enter the Room', browse: 'Explore creations', latest: 'Under the moon', desc: 'A new story, a little inspiration, a hello from the community.', notice: 'Community notice', expand: 'Read more', stats: 'The moments we share' }
}[props.lang] || {}));
const isEnglish = computed(() => props.lang === 'en');

const HUB_PREVIEW_CACHE_KEY = 'tsukuyomi_hub_preview_cache_v2';
const HUB_PREVIEW_TTL_MS = 30000;
const HUB_PREVIEW_TIMEOUT_MS = 8000;
const STATS_UPDATED_EVENT = 'tsukuyomi:stats-updated';
const fallbackPixelPalette = ['#0b1020', '#ffffff', '#aef2ff', '#7b8cf6', '#ff9aba', '#f1d98e'];
const decodedPixelPreviews = new WeakMap();
let hubPreviewCache = readHubPreviewCache();

function readHubPreviewCache() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(HUB_PREVIEW_CACHE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      latestArticle: parsed.latestArticle || null,
      latestGalleryImage: parsed.latestGalleryImage || null,
      latestPixelArtwork: parsed.latestPixelArtwork || null,
      plazaMessages: Array.isArray(parsed.plazaMessages) ? parsed.plazaMessages : [],
      siteStats: parsed.siteStats || null,
      cachedAt: Number(parsed.cachedAt || 0)
    };
  } catch (_) {
    return null;
  }
}

function writeHubPreviewCache(payload) {
  hubPreviewCache = {
    latestArticle: payload.latestArticle || null,
    latestGalleryImage: payload.latestGalleryImage || null,
    latestPixelArtwork: payload.latestPixelArtwork || null,
    plazaMessages: Array.isArray(payload.plazaMessages) ? payload.plazaMessages : [],
    siteStats: payload.siteStats || null,
    cachedAt: Date.now()
  };
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(HUB_PREVIEW_CACHE_KEY, JSON.stringify(hubPreviewCache));
  } catch (_) {}
}

const latestArticle = ref(hubPreviewCache?.latestArticle || null);
const latestGalleryImage = ref(hubPreviewCache?.latestGalleryImage || null);
const latestPixelArtwork = ref(hubPreviewCache?.latestPixelArtwork || null);
const plazaMessages = ref(hubPreviewCache?.plazaMessages || []);
const siteStats = ref(hubPreviewCache?.siteStats || null);
const previewLoading = ref(!hubPreviewCache);
const previewError = ref('');
const visitPopupPreview = ref({
  title: isEnglish.value ? 'Welcome to Tsukuyomi Space' : '欢迎来到月读空间',
  content: isEnglish.value ? 'The first-visit notice has not been configured yet.' : '首次访问弹窗尚未配置内容。'
});
const plazaQuick = reactive({
  content: '',
  loading: false,
  message: ''
});

function handleStatsUpdated(event) {
  const nextStats = event?.detail;
  if (!nextStats || typeof nextStats !== 'object') return;
  siteStats.value = nextStats;
  writeHubPreviewCache({
    latestArticle: latestArticle.value,
    latestGalleryImage: latestGalleryImage.value,
    latestPixelArtwork: latestPixelArtwork.value,
    plazaMessages: plazaMessages.value,
    siteStats: nextStats
  });
}

const sceneLinks = computed(() => [
  {
    href: '/plaza',
    name: props.t.plaza,
    desc: plazaMessages.value.length
      ? (isEnglish.value ? `${plazaMessages.value.length} recent messages` : `${plazaMessages.value.length} 条最近留言`)
      : (isEnglish.value ? 'Connect, share and discover' : '交流、分享、发现'),
    code: 'Plaza',
    icon: 'plaza',
    tone: 'cyan',
    spa: true,
    image: '',
    label: isEnglish.value ? 'Quick message' : '快速留言',
    kind: 'plaza'
  },
  {
    href: latestArticle.value?.id ? `/articles/${encodeURIComponent(latestArticle.value.id)}${latestArticle.value.slug ? `/${encodeURIComponent(latestArticle.value.slug)}` : ''}` : '/stage',
    name: latestArticle.value?.title || props.t.stage,
    desc: latestArticle.value?.excerpt || (isEnglish.value ? 'Notes, creations and knowledge' : '记录、创作、知识'),
    code: isEnglish.value ? englishArticleCategory(latestArticle.value?.category) : (latestArticle.value?.category || 'Stage'),
    icon: 'book',
    tone: 'blue',
    spa: true,
    image: latestArticle.value?.cover_image || latestArticle.value?.cover_image_url || '/assets/images/room-bg.webp',
    label: props.t.stage
  },
  {
    href: '/gallery',
    name: latestGalleryImage.value ? (isEnglish.value ? 'Latest gallery image' : '最新图库影像') : props.t.gallery,
    desc: latestGalleryImage.value
      ? (isEnglish.value ? `Published ${formatGalleryDate(latestGalleryImage.value) || 'recently'}` : `发布于 ${formatGalleryDate(latestGalleryImage.value) || '近期'}`)
      : (isEnglish.value ? 'Public images, illustrations and visual records' : '公开影像、插画与站点视觉记录'),
    code: 'Gallery',
    icon: 'image',
    tone: 'gold',
    spa: true,
    image: galleryImageUrl(latestGalleryImage.value) || '/assets/images/tsukuyomi-bg.webp',
    label: props.t.gallery
  },
  {
    href: '/pixel',
    name: latestPixelArtwork.value?.title || props.t.arena || '月光像素工坊',
    desc: latestPixelArtwork.value
      ? (isEnglish.value
        ? `Published by ${latestPixelArtwork.value.author || 'Guest'} on ${formatPixelDate(latestPixelArtwork.value) || 'a recent date'}`
        : `${latestPixelArtwork.value.author || '访客'} 发布于 ${formatPixelDate(latestPixelArtwork.value) || '近期'}`)
      : (isEnglish.value ? 'Draw, publish and like moonlit pixel art' : '绘制、发布、点赞月光像素画'),
    code: latestPixelArtwork.value ? `${artworkWidth(latestPixelArtwork.value)}x${artworkHeight(latestPixelArtwork.value)}` : 'Arena',
    icon: 'palette',
    tone: 'pink',
    spa: true,
    image: '/assets/images/tsukuyomi-bg.webp',
    label: latestPixelArtwork.value ? (isEnglish.value ? 'Latest pixel art' : '最新像素画') : props.t.arena,
    kind: 'arena',
    artwork: latestPixelArtwork.value
  }
]);

const orderedSceneLinks = computed(() => [sceneLinks.value[1], sceneLinks.value[2], sceneLinks.value[3], sceneLinks.value[0]]);

const plazaPreviewMessages = computed(() => plazaMessages.value.slice(0, 3));

function formatHubNumber(value) {
  return Number(value || 0).toLocaleString(isEnglish.value ? 'en-US' : 'zh-CN');
}

function formatHubUptime(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  if (days) return isEnglish.value ? `${days}d ${hours}h` : `${days}天${hours}时`;
  return isEnglish.value ? `${hours || 1}h` : `${hours || 1}小时`;
}

function galleryImageUrl(asset) {
  return asset?.url || asset?.access_url || asset?.display_url || '';
}

function formatGalleryDate(asset) {
  const value = asset?.created_at || asset?.updated_at;
  return value ? String(value).slice(0, 10) : '';
}

function formatPixelDate(artwork) {
  const value = artwork?.created_at || artwork?.updated_at;
  return value ? String(value).slice(0, 10) : '';
}

function artworkDimension(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function artworkWidth(artwork) {
  return artworkDimension(artwork?.width ?? artwork?.size, 96);
}

function artworkHeight(artwork) {
  return artworkDimension(artwork?.height ?? artwork?.size, 54);
}

function artworkPalette(artwork) {
  return Array.isArray(artwork?.palette) && artwork.palette.length ? artwork.palette : fallbackPixelPalette;
}

function artworkPixels(artwork) {
  if (Array.isArray(artwork?.pixels)) return artwork.pixels;
  if (!artwork || typeof artwork.pixels_base64 !== 'string' || !artwork.pixels_base64) return [];
  if (decodedPixelPreviews.has(artwork)) return decodedPixelPreviews.get(artwork);
  try {
    const bytes = atob(artwork.pixels_base64);
    const pixels = Array.from(bytes, value => value.charCodeAt(0) - 1);
    decodedPixelPreviews.set(artwork, pixels);
    return pixels;
  } catch (_) {
    return [];
  }
}

function artworkBackground(artwork) {
  return artwork?.background_color || artwork?.backgroundColor || '#0b1020';
}

function applyHubPreviewCache(cache) {
  if (!cache) return;
  latestArticle.value = cache.latestArticle || null;
  latestGalleryImage.value = cache.latestGalleryImage || null;
  latestPixelArtwork.value = cache.latestPixelArtwork || null;
  plazaMessages.value = Array.isArray(cache.plazaMessages) ? cache.plazaMessages : [];
  siteStats.value = cache.siteStats || null;
}

const stats = computed(() => [
  { label: isEnglish.value ? 'Visits today' : '今日访问', value: formatHubNumber(siteStats.value?.todayViews) },
  { label: isEnglish.value ? 'Total visits' : '总访问', value: formatHubNumber(siteStats.value?.totalViews) },
  { label: isEnglish.value ? 'Registered users' : '注册用户', value: formatHubNumber(siteStats.value?.users) },
  { label: isEnglish.value ? 'Articles' : '站内文章', value: formatHubNumber(siteStats.value?.articles) },
  { label: isEnglish.value ? 'Plaza messages' : '广场留言', value: formatHubNumber(siteStats.value?.messages) },
  { label: isEnglish.value ? 'Uptime' : '运行时间', value: siteStats.value?.uptime ? formatHubUptime(siteStats.value.uptime) : '--' }
]);

function englishArticleCategory(value) {
  const category = String(value || '').trim();
  return ({ 公告: 'Announcement', 传说: 'Lore', 技术: 'Technology', 二创: 'Fan work', 其他: 'Other' })[category] || category || 'Stage';
}

function openScene(scene, event) {
  if (scene.kind === 'plaza' && event?.target?.closest?.('form, input, textarea, button, a')) return;
  if (scene.spa) {
    event?.preventDefault?.();
    emit('go', scene.href);
    return;
  }
  window.location.href = scene.href;
}

function warmScene(scene) {
  if (scene?.spa) warmRoutePath(scene.href);
}

async function loadHubPreviewFast() {
  const cached = hubPreviewCache || readHubPreviewCache();
  if (cached) applyHubPreviewCache(cached);
  previewLoading.value = !cached;
  previewError.value = '';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), HUB_PREVIEW_TIMEOUT_MS);
  try {
    const response = await apiFetch(`/api/hub-preview?_=${Date.now().toString(36)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    const result = await parseResponse(response);
    if (!result.success || !result.data) throw new Error(result.message || 'Hub content unavailable');
    latestArticle.value = result.data.article || null;
    latestGalleryImage.value = result.data.gallery || null;
    latestPixelArtwork.value = result.data.pixel || null;
    plazaMessages.value = Array.isArray(result.data.messages) ? result.data.messages : [];
    siteStats.value = result.data.stats || siteStats.value;
    writeHubPreviewCache({
      latestArticle: latestArticle.value,
      latestGalleryImage: latestGalleryImage.value,
      latestPixelArtwork: latestPixelArtwork.value,
      plazaMessages: plazaMessages.value,
      siteStats: siteStats.value
    });
  } catch (error) {
    if (!cached) previewError.value = error.name === 'AbortError' ? '内容读取超时，请重试' : (error.message || '内容读取失败');
  } finally {
    window.clearTimeout(timeout);
    previewLoading.value = false;
  }
}

async function loadHubPreview(options = {}) {
  const force = options.force === true;
  const cached = hubPreviewCache || readHubPreviewCache();
  if (cached) applyHubPreviewCache(cached);
  if (!force && cached?.cachedAt && Date.now() - cached.cachedAt < HUB_PREVIEW_TTL_MS) {
    previewLoading.value = false;
    loadPublicStats({ force: true, maxAgeMs: 0, staleWhileRevalidate: false })
      .then((nextSiteStats) => {
        if (!nextSiteStats) return;
        siteStats.value = nextSiteStats;
        writeHubPreviewCache({
          latestArticle: latestArticle.value,
          latestGalleryImage: latestGalleryImage.value,
          latestPixelArtwork: latestPixelArtwork.value,
          plazaMessages: plazaMessages.value,
          siteStats: nextSiteStats
        });
      })
      .catch(() => {});
    return;
  }

  previewLoading.value = true;
  previewError.value = '';
  try {
    loadPublicStats({ force: true, maxAgeMs: 0, staleWhileRevalidate: false })
      .then((nextSiteStats) => {
        if (!nextSiteStats) return;
        siteStats.value = nextSiteStats;
        writeHubPreviewCache({
          latestArticle: latestArticle.value,
          latestGalleryImage: latestGalleryImage.value,
          latestPixelArtwork: latestPixelArtwork.value,
          plazaMessages: plazaMessages.value,
          siteStats: nextSiteStats
        });
      })
      .catch(() => {});

    const [articleResponse, messageResponse, galleryResponse, pixelResponse] = await Promise.all([
      apiFetch('/api/articles?limit=12'),
      apiFetch('/api/messages/plaza/latest'),
      apiFetch('/api/assets/gallery/public?limit=1'),
      apiFetch('/api/pixel-art/preview?sort=latest', { cache: 'no-store' })
    ]);
    const [articleResult, messageResult, galleryResult, pixelResult] = await Promise.all([
      parseResponse(articleResponse),
      parseResponse(messageResponse),
      parseResponse(galleryResponse),
      parseResponse(pixelResponse)
    ]);
    if (![articleResult, messageResult, galleryResult, pixelResult].some((result) => result.success)) {
      throw new Error(isEnglish.value ? 'Unable to load the latest Hub content' : '大厅最新内容读取失败');
    }
    const articles = articleResult.success && Array.isArray(articleResult.data) ? articleResult.data : [];
    const messages = messageResult.success && Array.isArray(messageResult.data) ? messageResult.data : [];
    const galleryAssets = galleryResult.success && Array.isArray(galleryResult.data?.assets) ? galleryResult.data.assets : [];
    const pixelArtworks = pixelResult.success && Array.isArray(pixelResult.data) ? pixelResult.data : [];

    const nextLatestArticle = [...articles]
      .sort((a, b) => compareAppDate(b.created_at || b.updated_at, a.created_at || a.updated_at))[0] || null;
    const nextLatestGalleryImage = galleryAssets[0] || null;
    const nextLatestPixelArtwork = pixelArtworks[0] || null;
    const nextPlazaMessages = [...messages]
      .filter((item) => !item.parent_id)
      .sort((a, b) => compareAppDate(b.created_at, a.created_at));

    latestArticle.value = nextLatestArticle;
    latestGalleryImage.value = nextLatestGalleryImage;
    latestPixelArtwork.value = nextLatestPixelArtwork;
    plazaMessages.value = nextPlazaMessages;
    writeHubPreviewCache({
      latestArticle: nextLatestArticle,
      latestGalleryImage: nextLatestGalleryImage,
      latestPixelArtwork: nextLatestPixelArtwork,
      plazaMessages: nextPlazaMessages,
      siteStats: siteStats.value
    });
  } catch (error) {
    if (!cached) {
      latestArticle.value = null;
      latestGalleryImage.value = null;
      latestPixelArtwork.value = null;
      plazaMessages.value = [];
      siteStats.value = null;
    previewError.value = error.message || (isEnglish.value ? 'Unable to load the latest Hub content' : '大厅最新内容读取失败');
    }
  } finally {
    previewLoading.value = false;
  }
}

async function submitPlazaQuick() {
  const content = plazaQuick.content.trim();
  plazaQuick.message = '';
  if (!content) {
    plazaQuick.message = isEnglish.value ? 'Message cannot be empty' : '留言不能为空';
    return;
  }
  if (!getSession()) {
    emit('go', '/login');
    return;
  }
  plazaQuick.loading = true;
  try {
    const response = await authFetch('/api/messages', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || (isEnglish.value ? 'Unable to publish' : '发布失败'));
    if (result.growth) applyGrowthResult(result.growth);
    if (result.data?.id) {
      plazaMessages.value = [
        { ...result.data, article_id: result.data.article_id || null },
        ...plazaMessages.value.filter((item) => item.id !== result.data.id)
      ];
      if (siteStats.value) {
        siteStats.value = {
          ...siteStats.value,
          messages: Number(siteStats.value.messages || 0) + 1
        };
        setPublicStatsCache(siteStats.value);
      }
    }
    plazaQuick.content = '';
    plazaQuick.message = isEnglish.value ? 'Published' : '已发布';
    writeHubPreviewCache({
      latestArticle: latestArticle.value,
      latestGalleryImage: latestGalleryImage.value,
      latestPixelArtwork: latestPixelArtwork.value,
      plazaMessages: plazaMessages.value,
      siteStats: siteStats.value
    });
    await loadHubPreviewFast();
  } catch (error) {
    plazaQuick.message = error.message || (isEnglish.value ? 'Unable to publish' : '发布失败');
  } finally {
    plazaQuick.loading = false;
  }
}

async function loadVisitPopupPreview() {
  try {
    const settings = await loadPublicSettings();
    const title = String(settings.visitPopupTitle || '').trim();
    const content = String(settings.visitPopupContent || '').trim();
    visitPopupPreview.value = {
      title: isEnglish.value && title === '欢迎来到月读空间'
        ? 'Welcome to Tsukuyomi Space'
        : (title || (isEnglish.value ? 'Welcome to Tsukuyomi Space' : '欢迎来到月读空间')),
      content: isEnglish.value && content === '首次访问弹窗尚未配置内容。'
        ? 'The first-visit notice has not been configured yet.'
        : (content || (isEnglish.value ? 'The first-visit notice has not been configured yet.' : '首次访问弹窗尚未配置内容。'))
    };
  } catch (_) {
    visitPopupPreview.value = {
      title: isEnglish.value ? 'First-visit notice' : '首访弹窗',
      content: isEnglish.value ? 'The notice is temporarily unavailable.' : '弹窗内容暂时无法读取。'
    };
  }
}

onMounted(() => {
  if (typeof window === 'undefined') {
    loadHubPreviewFast();
    loadVisitPopupPreview();
    return;
  }
  window.addEventListener(STATS_UPDATED_EVENT, handleStatsUpdated);
  window.requestAnimationFrame(() => {
    loadHubPreviewFast();
    loadVisitPopupPreview();
  });
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener(STATS_UPDATED_EVENT, handleStatsUpdated);
  }
});
</script>

<template>
  <main class="page hub" :aria-busy="previewLoading">
    <section class="hub-showcase">
      <div class="hub-hero-panel">
        <div class="hub-hero-copy">
          <span class="hub-kicker">TSUKUYOMI · A MOONLIT COMMUNITY</span>
          <p class="hub-welcome">{{ hubCopy.welcome }}</p>
          <h1 class="section-title">{{ t.brand }}</h1>
          <p class="hub-en-title">Tsukuyomi Space</p>
          <p class="section-subtitle">{{ hubCopy.hero }}</p>
          <div class="hub-actions">
            <a href="/room" class="primary-btn hub-primary" @click.prevent="$emit('go', '/room')">
              <TsIcon name="moon" :size="17" />
              <span>{{ hubCopy.room }}</span>
            </a>
            <a href="/stage" class="ghost-btn hub-secondary" @click.prevent="$emit('go', '/stage')">{{ hubCopy.browse }}<TsIcon name="arrowRight" :size="17" /></a>
          </div>
        </div>

        <figure class="hub-character" :aria-label="isEnglish ? 'Tsukimi Yachiyo' : '月见八千代'">
          <img :src="'/assets/images/yachiyo-hub-stand.png'" :alt="isEnglish ? 'Tsukimi Yachiyo' : '月见八千代'" loading="eager" decoding="async" fetchpriority="high">
        </figure>
      </div>
    </section>

    <details class="hub-notice">
      <summary><TsIcon name="bell" :size="17" /><span>{{ hubCopy.notice }}</span><strong>{{ visitPopupPreview.title }}</strong><small>{{ hubCopy.expand }}</small></summary>
      <p>{{ visitPopupPreview.content }}</p>
    </details>

    <section class="hub-grid-wrap">
      <div class="hub-section-head">
        <div>
          <h2>{{ hubCopy.latest }}</h2>
          <span>{{ hubCopy.desc }}</span>
        </div>
        <a href="/stage" class="hub-all-posts" @click.prevent="$emit('go', '/stage')">{{ hubCopy.browse }} <TsIcon name="arrowRight" :size="16" /></a>
      </div>
      <div class="scene-grid" :aria-busy="previewLoading">
        <LoadingSkeleton v-if="previewLoading" variant="hub" :count="4" :label="isEnglish ? 'Loading the latest Hub content' : '正在读取大厅最新内容'" />
        <div v-else-if="previewError" class="hub-preview-error" role="alert">{{ previewError }}</div>
        <template v-else>
        <component
          :is="scene.kind === 'plaza' ? 'section' : 'a'"
          v-for="scene in orderedSceneLinks"
          :key="scene.href"
          class="scene-card"
          :class="[`tone-${scene.tone}`, { 'scene-card-plaza': scene.kind === 'plaza', 'scene-card-arena': scene.kind === 'arena' }]"
          :style="{ '--scene-image': `url(${scene.image})` }"
          :href="scene.kind === 'plaza' ? undefined : scene.href"
          :aria-labelledby="scene.kind === 'plaza' ? 'hub-plaza-title' : undefined"
          @click="scene.kind !== 'plaza' && openScene(scene, $event)"
          @pointerenter="warmScene(scene)"
          @focus="warmScene(scene)"
          @pointerdown="warmScene(scene)"
          @keydown.enter="scene.kind !== 'plaza' && openScene(scene, $event)"
          @keydown.space="scene.kind !== 'plaza' && openScene(scene, $event)"
          >
          <span
            v-if="scene.kind === 'arena' && scene.artwork"
            class="hub-arena-cover"
            :style="{ '--hub-arena-bg': artworkBackground(scene.artwork) }"
            aria-hidden="true"
          >
            <PixelCanvasCells
              :pixels="artworkPixels(scene.artwork)"
              :palette="artworkPalette(scene.artwork)"
              :width="artworkWidth(scene.artwork)"
              :height="artworkHeight(scene.artwork)"
              :cell-size="1"
              :background-color="artworkBackground(scene.artwork)"
              :show-grid="false"
              :interactive="false"
              :aria-label="scene.name"
            />
          </span>
          <span v-if="scene.kind !== 'plaza'" class="scene-top">
            <span class="scene-icon" aria-hidden="true">
              <TsIcon :name="scene.icon" :size="22" :stroke-width="1.9" />
            </span>
            <span class="scene-code">{{ scene.code }}</span>
          </span>
          <header v-else class="hub-plaza-header">
            <div class="hub-plaza-heading">
              <span class="scene-icon" aria-hidden="true"><TsIcon :name="scene.icon" :size="22" :stroke-width="1.9" /></span>
              <div>
                <h3 id="hub-plaza-title" class="hub-plaza-title">{{ scene.name }}</h3>
                <p class="hub-plaza-intro">{{ isEnglish ? 'Small moments, shared under the moon.' : '分享此刻，也遇见同频的人。' }}</p>
              </div>
            </div>
            <a class="hub-plaza-more" :href="scene.href" @click.prevent="$emit('go', scene.href)">{{ isEnglish ? 'Visit Plaza' : '逛逛广场' }} <TsIcon name="arrowRight" :size="16" /></a>
          </header>
          <span v-if="scene.label" class="scene-label">{{ scene.label }}</span>
          <span v-if="scene.kind !== 'plaza'" class="scene-main">
            <span class="scene-name">{{ scene.name }}</span>
            <span class="scene-desc">{{ scene.desc }}</span>
          </span>
          <div v-else class="scene-main plaza-card-body">
            <span v-if="!plazaPreviewMessages.length" class="scene-desc">{{ isEnglish ? 'No messages yet. Leave the first greeting.' : '还没有留言，写下第一句问候。' }}</span>
            <div v-else class="hub-plaza-list">
              <a v-for="msg in plazaPreviewMessages" :key="msg.id" class="hub-plaza-message" :href="scene.href" @click.prevent="$emit('go', scene.href)">
                <span class="hub-plaza-author">
                  <span class="hub-plaza-avatar" aria-hidden="true">{{ [...(msg.author || (isEnglish ? 'Guest' : '访客'))][0] }}</span>
                  <strong>{{ msg.author || (isEnglish ? 'Guest' : '访客') }}</strong>
                </span>
                <p class="hub-plaza-content">{{ msg.content }}</p>
              </a>
            </div>
            <form class="hub-plaza-form" :aria-busy="plazaQuick.loading" @click.stop @keydown.stop @submit.prevent="submitPlazaQuick">
              <label class="hub-plaza-form-label" for="hub-plaza-input">{{ isEnglish ? 'Leave a greeting' : '留一句问候' }}</label>
              <input id="hub-plaza-input" v-model="plazaQuick.content" type="text" :placeholder="isEnglish ? 'What would you like to share today?' : '今天有什么想和大家分享的？'">
              <button
                class="hub-plaza-submit"
                type="submit"
                :disabled="plazaQuick.loading"
                :aria-busy="plazaQuick.loading"
                :aria-label="plazaQuick.loading ? (isEnglish ? 'Sending' : '发送中') : (isEnglish ? 'Send' : '发送')"
                :title="plazaQuick.loading ? (isEnglish ? 'Sending' : '发送中') : (isEnglish ? 'Send' : '发送')"
              >
                <TsIcon :name="plazaQuick.loading ? 'loader' : 'send'" :size="15" />
                <span>{{ plazaQuick.loading ? (isEnglish ? 'Sending' : '发送中') : (isEnglish ? 'Send' : '发送') }}</span>
              </button>
              <span v-if="plazaQuick.loading" class="ts-visually-hidden" role="status">{{ isEnglish ? 'Sending' : '发送中' }}</span>
            </form>
            <span v-if="plazaQuick.message" class="hub-plaza-feedback" role="status">{{ plazaQuick.message }}</span>
          </div>
        </component>
        </template>
      </div>
    </section>
    <footer class="hub-community-footer">
      <h2>{{ hubCopy.stats }}</h2>
      <div class="hub-stat-grid" :aria-busy="previewLoading">
        <div v-for="item in stats" :key="item.label"><strong><CountUpValue :value="item.value" /></strong><span>{{ item.label }}</span></div>
      </div>
      <BeianLink />
    </footer>
  </main>
</template>
