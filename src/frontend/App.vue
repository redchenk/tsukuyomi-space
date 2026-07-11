<script setup>
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { apiBeacon, apiFetch, getSession, loadCurrentSession, logoutSession, noStoreUrl } from './api/client';
import { i18n } from './i18n';
import AppShell from './layouts/AppShell.vue';
import SitePet from './components/SitePet.vue';
import { useRoomMusic } from './composables/room/useRoomMusic';
import { setPublicAssetBaseUrl } from './utils/assetUrl';
import { isAuthPath, withAuthRedirect } from './utils/authRedirect';

const route = useRoute();
const router = useRouter();
const lang = ref(localStorage.getItem('lang') || 'zh');
const theme = ref(localStorage.getItem('tsukuyomi_theme') || 'dark');
const user = ref(null);
const t = computed(() => i18n[lang.value] || i18n.zh);
const isAccessRoute = computed(() => route.name === 'access' || route.name === 'accessAlias');
const isAuthRoute = computed(() => route.name === 'login' || route.name === 'register');
const isLive2DRoute = computed(() => route.name === 'live2d');
const isImmersiveRoute = computed(() => isAccessRoute.value || isAuthRoute.value || isLive2DRoute.value);
const routeTransitionName = computed(() => isLive2DRoute.value ? '' : 'ts-route');
const hasGlobalBackground = computed(() => !isAccessRoute.value && !isAuthRoute.value && route.name !== 'room' && !isLive2DRoute.value);
const showSitePet = computed(() => !['access', 'accessAlias', 'login', 'register', 'room', 'roomSettings'].includes(route.name));
const isAuthed = computed(() => Boolean(user.value));
const music = useRoomMusic();
const routeTransitioning = ref(false);
const VIEW_RECORDED_KEY = 'tsukuyomi_site_view_recorded';
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
let routeTransitionTimer = 0;
let refreshUserRun = 0;

function hydrateCachedUser() {
  const cachedSession = getSession();
  if (!cachedSession?.user) return false;
  user.value = cachedSession.user;
  return true;
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
    return;
  }
  if (allowClear) user.value = getSession()?.user || null;
}

function setLang(nextLang) {
  lang.value = i18n[nextLang] ? nextLang : 'zh';
  localStorage.setItem('lang', lang.value);
  document.documentElement.lang = lang.value === 'zh' ? 'zh-CN' : 'ja';
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

function beginRouteTransition() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(routeTransitionTimer);
  routeTransitioning.value = true;
  routeTransitionTimer = window.setTimeout(() => {
    routeTransitioning.value = false;
  }, 500);
}

function finishRouteTransition() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(routeTransitionTimer);
  routeTransitionTimer = window.setTimeout(() => {
    routeTransitioning.value = false;
  }, 40);
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
    const response = await apiFetch(noStoreUrl('/api/settings'), { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const result = await response.json();
    const settings = result?.data || {};
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

async function loadPublicSettings() {
  try {
    const response = await apiFetch(noStoreUrl('/api/settings'), { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const result = await response.json();
    const settings = result?.data || {};
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
  if (event?.persisted) hydrateCachedUser();
  refreshUser();
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  hydrateCachedUser();
  refreshUser();
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
  refreshUser();
}, { immediate: true });
watch(() => route.name, () => loadVisitPopup());
onMounted(() => {
  refreshUser();
  loadPublicSettings();
  window.addEventListener('pageshow', handlePageShow);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (localStorage.getItem(VIEW_RECORDED_KEY) === '1') return;
  localStorage.setItem(VIEW_RECORDED_KEY, '1');
  const payload = JSON.stringify({ path: route.fullPath || '/' });
  if (apiBeacon('/api/stats/view', new Blob([payload], { type: 'application/json' }))) {
    return;
  }
  apiFetch('/api/stats/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true
  }).catch(() => {});
});

onUnmounted(() => {
  if (typeof window === 'undefined') return;
  window.clearTimeout(routeTransitionTimer);
  window.removeEventListener('pageshow', handlePageShow);
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
    <div class="route-stage" :class="{ 'route-stage-immersive': isImmersiveRoute, 'route-stage-transitioning': routeTransitioning }">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <Transition
          :name="routeTransitionName"
          appear
          @before-leave="beginRouteTransition"
          @after-enter="finishRouteTransition"
          @enter-cancelled="finishRouteTransition"
          @after-leave="finishRouteTransition"
          @leave-cancelled="finishRouteTransition"
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

  <div v-if="routeTransitioning" class="route-transition-veil" aria-hidden="true"></div>

  <SitePet v-if="showSitePet" :lang="lang" :route-name="route.name" />

  <div v-if="visitPopup.visible" class="visit-popup-backdrop" role="presentation">
    <section class="visit-popup-card" role="dialog" aria-modal="true" :aria-label="visitPopup.title">
      <span class="visit-popup-kicker">Tsukuyomi Notice</span>
      <h2>{{ visitPopup.title }}</h2>
      <p>{{ visitPopup.content }}</p>
      <button class="primary-btn" type="button" @click="closeVisitPopup">{{ visitPopup.button }}</button>
    </section>
  </div>
</template>
