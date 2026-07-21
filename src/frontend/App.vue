<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { authFetch, getSession, loadCurrentSession, loadPublicSettings, logoutSession, parseResponse, setPublicStatsCache } from './api/client';
import { documentLanguage, i18n, normalizeLanguage } from './i18n';
import AppShell from './layouts/AppShell.vue';
import { useRoomMusic } from './composables/room/useRoomMusic';
import { setPublicAssetBaseUrl } from './utils/assetUrl';
import { isAuthPath, withAuthRedirect } from './utils/authRedirect';
import { animateRouteEnter, cancelRouteMotion } from './utils/motion';
import {
  getPerformanceProfile,
  PERFORMANCE_PROFILE_EVENT,
  scheduleIdleTask
} from './utils/performance';

const SitePet = defineAsyncComponent(() => import('./components/SitePet.vue'));

const route = useRoute();
const router = useRouter();
const lang = ref(normalizeLanguage(localStorage.getItem('lang')));
const theme = ref(localStorage.getItem('tsukuyomi_theme') || 'dark');
const user = ref(null);
const t = computed(() => i18n[lang.value] || i18n.zh);
const routeLoadingLabel = computed(() => lang.value === 'ja'
  ? 'ページを読み込み中'
  : lang.value === 'en' ? 'Loading page' : '页面加载中');
const isAccessRoute = computed(() => route.name === 'access' || route.name === 'accessAlias');
const isAuthRoute = computed(() => route.name === 'login' || route.name === 'register');
const isLive2DRoute = computed(() => route.name === 'live2d');
const isRoomRoute = computed(() => route.name === 'room');
const isImmersiveRoute = computed(() => isAccessRoute.value || isAuthRoute.value || isLive2DRoute.value);
const hasGlobalBackground = computed(() => !isAccessRoute.value && !isAuthRoute.value && route.name !== 'room' && !isLive2DRoute.value);
const showSitePet = computed(() => Boolean(route.name)
  && !['access', 'accessAlias', 'login', 'register', 'room', 'roomSettings'].includes(route.name));
const performanceProfile = ref(getPerformanceProfile());
const petReady = ref(false);
const petReduced = computed(() => performanceProfile.value === 'reduced');
const isAuthed = computed(() => Boolean(user.value));
const music = useRoomMusic();
const routeProgressVisible = ref(false);
const routeProgressCompleting = ref(false);
const ROUTE_PROGRESS_DELAY_MS = 96;
const ROUTE_PROGRESS_SETTLE_MS = 140;
const VIEW_RECORDED_KEY = 'tsukuyomi_site_view_recorded';
const STATS_UPDATED_EVENT = 'tsukuyomi:stats-updated';
const VISIT_POPUP_SEEN_KEY = 'tsukuyomi_visit_popup_seen';
const VISIT_POPUP_PENDING_KEY = 'tsukuyomi_visit_popup_after_access';
const visitPopup = ref({
  visible: false,
  title: '',
  content: '',
  button: '我知道了',
  signature: ''
});

let lastTrustedAuthAt = 0;
let routeProgressTimer = 0;
let refreshUserRun = 0;
let initialRouteReady = false;
let cancelPetWarmup = null;
let removeRouteProgressGuard = null;
let removeRouteProgressHook = null;
let removeRouteErrorHook = null;
const viewRecordRequests = new Map();

function hydrateCachedUser() {
  const cachedSession = getSession();
  if (!cachedSession?.user) return false;
  user.value = cachedSession.user;
  return true;
}

function hongKongDay() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dailyViewMarker() {
  const currentUser = user.value || getSession()?.user || null;
  const scope = currentUser?.scope === 'admin' ? 'admin' : 'user';
  const identity = currentUser?.id ? `${scope}:${currentUser.id}` : 'visitor';
  return `${hongKongDay()}:${identity}`;
}

function recordDailyView() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const marker = dailyViewMarker();
  if (localStorage.getItem(VIEW_RECORDED_KEY) === marker) return Promise.resolve(null);
  if (viewRecordRequests.has(marker)) return viewRecordRequests.get(marker);

  const request = authFetch('/api/stats/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: route.fullPath || '/' }),
    keepalive: true
  })
    .then(async (response) => {
      const result = await parseResponse(response);
      if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
      localStorage.setItem(VIEW_RECORDED_KEY, marker);
      if (result.data && typeof result.data === 'object') {
        setPublicStatsCache(result.data);
        window.dispatchEvent(new CustomEvent(STATS_UPDATED_EVENT, { detail: result.data }));
      }
      return result;
    })
    .catch(() => null)
    .finally(() => viewRecordRequests.delete(marker));

  viewRecordRequests.set(marker, request);
  return request;
}

async function refreshUser(trustedUser = null) {
  const refreshRun = ++refreshUserRun;
  if (trustedUser) {
    user.value = trustedUser;
    lastTrustedAuthAt = Date.now();
  } else if (!user.value) {
    hydrateCachedUser();
  }

  const allowClear = !user.value || Date.now() - lastTrustedAuthAt > 8000;
  const session = await loadCurrentSession({ allowClear });
  if (refreshRun !== refreshUserRun) return;

  if (session?.user) {
    user.value = session.user;
    recordDailyView();
    return;
  }
  if (allowClear) user.value = getSession()?.user || null;
  recordDailyView();
}

function setLang(nextLang) {
  lang.value = normalizeLanguage(nextLang);
  localStorage.setItem('lang', lang.value);
  document.documentElement.lang = documentLanguage(lang.value);
}

function setTheme(nextTheme) {
  theme.value = nextTheme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('tsukuyomi_theme', theme.value);
  document.documentElement.dataset.theme = theme.value;
}

function toggleTheme(event) {
  const next = theme.value === 'dark' ? 'light' : 'dark';
  const root = document.documentElement;
  const reduceMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof document.startViewTransition !== 'function' || reduceMotion) {
    setTheme(next);
    return;
  }

  const hasPointer = Number.isFinite(event?.clientX) && (event.clientX || event.clientY);
  root.style.setProperty('--tt-x', hasPointer ? `${event.clientX}px` : '50%');
  root.style.setProperty('--tt-y', hasPointer ? `${event.clientY}px` : '8%');
  root.classList.add('ts-theme-transition');
  const transition = document.startViewTransition(() => setTheme(next));
  transition.finished.finally(() => root.classList.remove('ts-theme-transition'));
}

function resolveNavigationPath(path) {
  const value = String(path || '/hub');
  if (!isAuthPath(value)) return value;

  try {
    const target = new URL(value, window.location.origin);
    if (target.searchParams.get('redirect')) return value;
  } catch (_) {
    // Fall through and attach the current route when the path is still an auth path.
  }

  const redirect = (!isAuthRoute.value && !isAccessRoute.value) ? route.fullPath : '';
  return withAuthRedirect(value, redirect);
}

function go(path) {
  const target = resolveNavigationPath(path);
  if (isAccessRoute.value && path === '/hub') {
    sessionStorage.setItem(VISIT_POPUP_PENDING_KEY, '1');
  }
  router.push(target);
}

function scheduleRouteProgress(to, from) {
  if (typeof window === 'undefined' || !from?.name || to.fullPath === from.fullPath) return;
  const routeOwnsLoading = ['access', 'accessAlias', 'room', 'live2d'].includes(String(from.name))
    || ['room', 'live2d'].includes(String(to.name));
  if (routeOwnsLoading) return;
  window.clearTimeout(routeProgressTimer);
  routeProgressVisible.value = false;
  routeProgressCompleting.value = false;
  routeProgressTimer = window.setTimeout(() => {
    routeProgressVisible.value = true;
  }, ROUTE_PROGRESS_DELAY_MS);
}

function finishRouteProgress() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(routeProgressTimer);
  if (!routeProgressVisible.value) return;
  routeProgressCompleting.value = true;
  routeProgressTimer = window.setTimeout(() => {
    routeProgressVisible.value = false;
    routeProgressCompleting.value = false;
  }, ROUTE_PROGRESS_SETTLE_MS);
}

function enterRoute(element, done) {
  animateRouteEnter(element, done);
}

function leaveRoute(element, done) {
  cancelRouteMotion(element);
  done();
}

async function logout() {
  await logoutSession();
  refreshUser();
  router.push('/');
}

function makePopupSignature(settings) {
  return encodeURIComponent([
    settings.visitPopupTitle || '',
    settings.visitPopupContent || '',
    settings.visitPopupButton || ''
  ].join('\n'));
}

async function loadVisitPopup() {
  if (route.name !== 'hub' || sessionStorage.getItem(VISIT_POPUP_PENDING_KEY) !== '1') return;
  sessionStorage.removeItem(VISIT_POPUP_PENDING_KEY);
  try {
    const settings = await loadPublicSettings();
    const content = String(settings.visitPopupContent || '').trim();
    const title = String(settings.visitPopupTitle || '').trim();
    if (settings.visitPopupEnabled !== true || (!title && !content)) return;
    const signature = makePopupSignature(settings);
    if (localStorage.getItem(VISIT_POPUP_SEEN_KEY) === signature) return;
    visitPopup.value = {
      visible: true,
      title: title || '月读空间',
      content,
      button: String(settings.visitPopupButton || '').trim() || '我知道了',
      signature
    };
  } catch (error) {
    console.warn('Visit popup settings failed:', error);
  }
}

async function applyPublicSettings() {
  try {
    const settings = await loadPublicSettings();
    setPublicAssetBaseUrl(settings.publicAssetBaseUrl || '');
  } catch (error) {
    console.warn('Public settings failed:', error);
  }
}

function closeVisitPopup() {
  localStorage.setItem(VISIT_POPUP_SEEN_KEY, visitPopup.value.signature);
  visitPopup.value.visible = false;
}

function handlePageShow(event) {
  if (!event?.persisted) return;
  hydrateCachedUser();
  refreshUser();
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  hydrateCachedUser();
  refreshUser();
}

function scheduleSitePet() {
  cancelPetWarmup?.();
  cancelPetWarmup = scheduleIdleTask(() => {
    petReady.value = true;
    cancelPetWarmup = null;
  }, {
    delay: performanceProfile.value === 'reduced' ? 900 : 1800,
    timeout: performanceProfile.value === 'reduced' ? 1400 : 3500
  });
}

function handlePerformanceProfile(event) {
  performanceProfile.value = event.detail?.profile || getPerformanceProfile();
  if (!petReady.value) scheduleSitePet();
}

provide('siteMusic', music);

watch(isAccessRoute, (next) => {
  document.body.classList.toggle('vue-access-route', next);
}, { immediate: true });

watch(hasGlobalBackground, (next) => {
  document.body.classList.toggle('vue-global-bg-route', next);
}, { immediate: true });

watch(isLive2DRoute, (next) => {
  document.body.classList.toggle('vue-live2d-route', next);
}, { immediate: true });

watch(lang, setLang, { immediate: true });
watch(theme, setTheme, { immediate: true });
watch(() => route.fullPath, () => {
  if (initialRouteReady) refreshUser();
});

watch(isRoomRoute, (next) => {
  document.body.classList.toggle('vue-room-route', next);
}, { immediate: true });
router.isReady().then(() => {
  initialRouteReady = true;
  refreshUser();
});
watch(() => route.name, () => loadVisitPopup());
onMounted(() => {
  removeRouteProgressGuard = router.beforeEach((to, from) => scheduleRouteProgress(to, from));
  removeRouteProgressHook = router.afterEach(() => finishRouteProgress());
  removeRouteErrorHook = router.onError(() => finishRouteProgress());
  applyPublicSettings();
  scheduleSitePet();
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener(PERFORMANCE_PROFILE_EVENT, handlePerformanceProfile);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  if (typeof window === 'undefined') return;
  window.clearTimeout(routeProgressTimer);
  cancelPetWarmup?.();
  removeRouteProgressGuard?.();
  removeRouteProgressHook?.();
  removeRouteErrorHook?.();
  window.removeEventListener('pageshow', handlePageShow);
  window.removeEventListener(PERFORMANCE_PROFILE_EVENT, handlePerformanceProfile);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <AppShell
    :lang="lang"
    :route-name="route.name"
    :show-chrome="!isImmersiveRoute"
    :t="t"
    :theme="theme"
    :user="user"
    :is-authed="isAuthed"
    :music="music"
    @go="go"
    @logout="logout"
    @set-lang="setLang"
    @toggle-theme="toggleTheme"
  >
    <div class="route-stage" :class="{ 'route-stage-immersive': isImmersiveRoute }">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <Transition
          appear
          :css="false"
          @enter="enterRoute"
          @leave="leaveRoute"
          @enter-cancelled="cancelRouteMotion"
        >
          <component
            :is="Component"
            :key="viewRoute.fullPath"
            class="route-view"
            :lang="lang"
            :t="t"
            :theme="theme"
            :user="user"
            :route-name="route.name"
            @auth-changed="refreshUser"
            @go="go"
            @logout="logout"
            @toggle-theme="toggleTheme"
          />
        </Transition>
      </RouterView>
    </div>
  </AppShell>

  <div
    v-if="routeProgressVisible"
    class="route-navigation-progress"
    :class="{ 'is-completing': routeProgressCompleting }"
    role="status"
    :aria-label="routeLoadingLabel"
    aria-busy="true"
  ><span aria-hidden="true"></span></div>

  <SitePet v-if="showSitePet && petReady" :lang="lang" :route-name="route.name" :reduced="petReduced" />

  <div v-if="visitPopup.visible" class="visit-popup-backdrop" role="presentation">
    <section class="visit-popup-card" data-material="popover" role="dialog" aria-modal="true" :aria-label="visitPopup.title">
      <span class="visit-popup-kicker">Tsukuyomi Notice</span>
      <h2>{{ visitPopup.title }}</h2>
      <p>{{ visitPopup.content }}</p>
      <button class="primary-btn" type="button" @click="closeVisitPopup">{{ visitPopup.button }}</button>
    </section>
  </div>
</template>
