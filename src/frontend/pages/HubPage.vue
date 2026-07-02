<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { apiFetch, authFetch, authHeaders, getSession, loadPublicStats, noStoreUrl, parseResponse, setPublicStatsCache } from '../api/client';
import BeianLink from '../components/BeianLink.vue';
import PixelCanvasCells from '../components/PixelCanvasCells.vue';
import TsIcon from '../components/TsIcon.vue';
import { compareAppDate } from '../utils/time';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);

const HUB_PREVIEW_CACHE_KEY = 'tsukuyomi_hub_preview_cache_v2';
const HUB_PREVIEW_TTL_MS = 30000;
const fallbackPixelPalette = ['#0b1020', '#ffffff', '#aef2ff', '#7b8cf6', '#ff9aba', '#f1d98e'];
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
const visitPopupPreview = ref({
  title: '欢迎来到月读空间',
  content: '首次访问弹窗尚未配置内容。'
});
const plazaQuick = reactive({
  content: '',
  loading: false,
  message: ''
});

const sceneLinks = computed(() => [
  {
    href: '/plaza',
    name: props.t.plaza,
    desc: plazaMessages.value.length ? `${plazaMessages.value.length} 条最近留言` : '交流、分享、发现',
    code: 'Plaza',
    icon: 'plaza',
    tone: 'cyan',
    spa: true,
    image: '',
    label: '快速留言',
    kind: 'plaza'
  },
  {
    href: '/stage',
    name: latestArticle.value?.title || props.t.stage,
    desc: latestArticle.value?.excerpt || '记录、创作、知识',
    code: latestArticle.value?.category || 'Stage',
    icon: 'book',
    tone: 'blue',
    spa: true,
    image: latestArticle.value?.cover_image || '/assets/images/room-bg.png',
    label: props.t.stage
  },
  {
    href: '/gallery',
    name: latestGalleryImage.value ? '最新图库影像' : '图库',
    desc: latestGalleryImage.value ? `发布于 ${formatGalleryDate(latestGalleryImage.value) || '近期'}` : '公开影像、插画与站点视觉记录',
    code: 'Gallery',
    icon: 'image',
    tone: 'gold',
    spa: true,
    image: galleryImageUrl(latestGalleryImage.value) || '/assets/images/tsukuyomi-bg.png',
    label: '图库'
  },
  {
    href: '/arena',
    name: latestPixelArtwork.value?.title || props.t.arena || '月光像素工坊',
    desc: latestPixelArtwork.value
      ? `${latestPixelArtwork.value.author || '访客'} 发布于 ${formatPixelDate(latestPixelArtwork.value) || '近期'}`
      : '绘制、发布、点赞月光像素画',
    code: latestPixelArtwork.value ? `${artworkWidth(latestPixelArtwork.value)}x${artworkHeight(latestPixelArtwork.value)}` : 'Arena',
    icon: 'palette',
    tone: 'pink',
    spa: true,
    image: '/assets/images/tsukuyomi-bg.png',
    label: latestPixelArtwork.value ? '最新像素画' : '像素画',
    kind: 'arena',
    artwork: latestPixelArtwork.value
  }
]);

const orderedSceneLinks = computed(() => sceneLinks.value);

const plazaPreviewMessages = computed(() => plazaMessages.value.slice(0, 4));

function formatHubNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function formatHubUptime(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  if (days) return `${days}天${hours}时`;
  return `${hours || 1}小时`;
}

function galleryImageUrl(asset) {
  return asset?.access_url || asset?.display_url || asset?.url || '';
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
  return Array.isArray(artwork?.pixels) ? artwork.pixels : [];
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
  { label: '今日访问', value: formatHubNumber(siteStats.value?.todayViews) },
  { label: '总访问', value: formatHubNumber(siteStats.value?.totalViews) },
  { label: '注册用户', value: formatHubNumber(siteStats.value?.users) },
  { label: '站内文章', value: formatHubNumber(siteStats.value?.articles) },
  { label: '广场留言', value: formatHubNumber(siteStats.value?.messages) },
  { label: '运行时间', value: siteStats.value?.uptime ? formatHubUptime(siteStats.value.uptime) : '--' }
]);

function openScene(scene, event) {
  if (scene.kind === 'plaza' && event?.target?.closest?.('form, input, textarea, button, a')) return;
  if (scene.spa) {
    event?.preventDefault?.();
    emit('go', scene.href);
    return;
  }
  window.location.href = scene.href;
}

async function loadHubPreview(options = {}) {
  const force = options.force === true;
  const cached = hubPreviewCache || readHubPreviewCache();
  if (cached) applyHubPreviewCache(cached);
  if (!force && cached?.cachedAt && Date.now() - cached.cachedAt < HUB_PREVIEW_TTL_MS) {
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
      apiFetch('/api/pixel-art?sort=latest&limit=1')
    ]);
    const [articleResult, messageResult, galleryResult, pixelResult] = await Promise.all([
      parseResponse(articleResponse),
      parseResponse(messageResponse),
      parseResponse(galleryResponse),
      parseResponse(pixelResponse)
    ]);
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
  } catch (_) {
    if (!cached) {
      latestArticle.value = null;
      latestGalleryImage.value = null;
      latestPixelArtwork.value = null;
      plazaMessages.value = [];
      siteStats.value = null;
    }
  }
}

async function submitPlazaQuick() {
  const content = plazaQuick.content.trim();
  plazaQuick.message = '';
  if (!content) {
    plazaQuick.message = '留言不能为空';
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
    if (!result.success) throw new Error(result.message || '发布失败');
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
    plazaQuick.message = '已发布';
    writeHubPreviewCache({
      latestArticle: latestArticle.value,
      latestGalleryImage: latestGalleryImage.value,
      latestPixelArtwork: latestPixelArtwork.value,
      plazaMessages: plazaMessages.value,
      siteStats: siteStats.value
    });
    await loadHubPreview({ force: true });
  } catch (error) {
    plazaQuick.message = error.message || '发布失败';
  } finally {
    plazaQuick.loading = false;
  }
}

async function loadVisitPopupPreview() {
  try {
    const response = await apiFetch(noStoreUrl('/api/settings'), {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    const settings = result?.data || {};
    const title = String(settings.visitPopupTitle || '').trim();
    const content = String(settings.visitPopupContent || '').trim();
    visitPopupPreview.value = {
      title: title || '欢迎来到月读空间',
      content: content || '首次访问弹窗尚未配置内容。'
    };
  } catch (_) {
    visitPopupPreview.value = {
      title: '首访弹窗',
      content: '弹窗内容暂时无法读取。'
    };
  }
}

onMounted(() => {
  if (typeof window === 'undefined') {
    loadHubPreview();
    loadVisitPopupPreview();
    return;
  }
  window.requestAnimationFrame(() => {
    loadHubPreview();
    loadVisitPopupPreview();
  });
});
</script>

<template>
  <main class="page hub">
    <section class="hub-showcase">
      <div class="hub-hero-panel">
        <div class="hub-stage-ribbon" aria-hidden="true">
          <span>TSUKUYOMI</span>
          <span>月读空间</span>
          <span>LIVE PORTAL</span>
        </div>
        <div class="hub-hero-copy">
          <span class="hub-kicker">TSUKUYOMI / LIVE PORTAL</span>
          <p class="hub-welcome">欢迎来到</p>
          <h1 class="section-title">{{ t.brand }}</h1>
          <p class="hub-en-title">Tsukuyomi Space</p>
          <p class="section-subtitle">{{ t.heroCopy }}</p>
          <div class="hub-actions">
            <a href="/room" class="primary-btn hub-primary" @click.prevent="$emit('go', '/room')">
              <TsIcon name="moon" :size="17" />
              <span>进入私人居所</span>
            </a>
          </div>
        </div>

        <figure class="hub-character" aria-label="月见八千代">
          <img :src="'/assets/images/yachiyo-hub-stand.png'" alt="月见八千代" loading="eager" decoding="async" fetchpriority="high">
        </figure>
        <div class="hub-scroll-thread" aria-hidden="true">
          <span></span>
          <strong>01</strong>
        </div>
      </div>

      <aside class="hub-side-panel">
        <div class="hub-side-head">
          <span>本站统计</span>
          <small>Site Analytics</small>
        </div>
        <div class="hub-stat-grid">
          <div v-for="item in stats" :key="item.label">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </div>
        </div>
        <div class="hub-side-card hub-visit-card">
          <span class="hub-visit-eyebrow">公告</span>
          <div class="hub-visit-title-row">
            <strong>{{ visitPopupPreview.title }}</strong>
          </div>
          <p class="hub-visit-content">{{ visitPopupPreview.content }}</p>
        </div>
        <div class="hub-beian">
          <BeianLink />
        </div>
      </aside>
    </section>

    <section class="hub-grid-wrap">
      <div class="hub-section-head">
        <div>
          <h2>中枢大厅</h2>
          <span>选择一个入口，开启你的旅程</span>
        </div>
        <span class="hub-online">STATUS: ONLINE</span>
      </div>
      <div class="scene-grid">
        <component
          :is="scene.kind === 'plaza' ? 'div' : 'a'"
          v-for="scene in orderedSceneLinks"
          :key="scene.href"
          class="scene-card"
          :class="[`tone-${scene.tone}`, { 'scene-card-plaza': scene.kind === 'plaza', 'scene-card-arena': scene.kind === 'arena' }]"
          :style="{ '--scene-image': `url(${scene.image})` }"
          :href="scene.kind === 'plaza' ? undefined : scene.href"
          :role="scene.kind === 'plaza' ? 'link' : undefined"
          :tabindex="scene.kind === 'plaza' ? 0 : undefined"
          @click="openScene(scene, $event)"
          @keydown.enter="openScene(scene, $event)"
          @keydown.space.prevent="openScene(scene, $event)"
          >
          <span v-if="scene.kind === 'arena' && scene.artwork" class="hub-arena-cover" :style="{ '--hub-arena-bg': artworkBackground(scene.artwork) }" aria-hidden="true">
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
          <span class="scene-top">
            <span class="scene-icon" aria-hidden="true">
              <TsIcon :name="scene.icon" :size="22" :stroke-width="1.9" />
            </span>
            <span class="scene-code">{{ scene.code }}</span>
          </span>
          <span v-if="scene.label" class="scene-label">{{ scene.label }}</span>
          <span v-if="scene.kind !== 'plaza'" class="scene-main">
            <span class="scene-name">{{ scene.name }}</span>
            <span class="scene-desc">{{ scene.desc }}</span>
          </span>
          <span v-else class="scene-main plaza-card-body">
            <span class="scene-name hub-plaza-title">{{ scene.name }}</span>
            <span v-if="!plazaPreviewMessages.length" class="scene-desc">还没有留言，写下第一句问候。</span>
            <span v-else class="hub-plaza-list">
              <span v-for="msg in plazaPreviewMessages" :key="msg.id" class="hub-plaza-message">
                <strong>{{ msg.author || '访客' }}</strong>
                <span>{{ msg.content }}</span>
              </span>
            </span>
            <form class="hub-plaza-form" @click.stop @keydown.stop @submit.prevent="submitPlazaQuick">
              <input v-model="plazaQuick.content" type="text" placeholder="快速留言...">
              <button
                class="hub-plaza-submit"
                type="submit"
                :disabled="plazaQuick.loading"
                :aria-label="plazaQuick.loading ? '发送中' : '发送'"
                :title="plazaQuick.loading ? '发送中' : '发送'"
              >
                <TsIcon :name="plazaQuick.loading ? 'loader' : 'send'" :size="15" />
              </button>
            </form>
            <span v-if="plazaQuick.message" class="hub-plaza-feedback">{{ plazaQuick.message }}</span>
          </span>
        </component>
      </div>
    </section>
  </main>
</template>
