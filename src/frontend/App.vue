<script setup>
import { computed, onMounted, provide, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { clearSession } from './api/client';
import { i18n } from './i18n';
import AppShell from './layouts/AppShell.vue';
import { useRoomMusic } from './composables/room/useRoomMusic';

const route = useRoute();
const router = useRouter();
const lang = ref(localStorage.getItem('lang') || 'zh');
const theme = ref(localStorage.getItem('tsukuyomi_theme') || 'dark');
const user = ref(loadStoredUser());
const t = computed(() => i18n[lang.value] || i18n.zh);
const isAccessRoute = computed(() => route.name === 'access' || route.name === 'accessAlias');
const isImmersiveRoute = computed(() => isAccessRoute.value);
const isAuthed = computed(() => Boolean(user.value));
const music = useRoomMusic();
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

function loadStoredUser() {
  const raw = localStorage.getItem('tsukuyomi_user') || localStorage.getItem('admin_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function refreshUser() {
  user.value = loadStoredUser();
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

function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark');
}

function go(path) {
  if (isAccessRoute.value && path === '/hub') {
    sessionStorage.setItem(VISIT_POPUP_PENDING_KEY, '1');
  }
  router.push(path);
}

function logout() {
  clearSession();
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
    const response = await fetch('/api/settings', { headers: { Accept: 'application/json' } });
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

function closeVisitPopup() {
  localStorage.setItem(VISIT_POPUP_SEEN_KEY, visitPopup.value.signature);
  visitPopup.value.visible = false;
}

provide('siteMusic', music);

watch(isAccessRoute, (next) => {
  document.body.classList.toggle('vue-access-route', next);
}, { immediate: true });

watch(lang, setLang, { immediate: true });
watch(theme, setTheme, { immediate: true });
watch(() => route.fullPath, refreshUser, { immediate: true });
watch(() => route.name, () => loadVisitPopup());
onMounted(() => {
  if (localStorage.getItem(VIEW_RECORDED_KEY) === '1') return;
  localStorage.setItem(VIEW_RECORDED_KEY, '1');
  const payload = JSON.stringify({ path: route.fullPath || '/' });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/stats/view', new Blob([payload], { type: 'application/json' }));
    return;
  }
  fetch('/api/stats/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true
  }).catch(() => {});
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
    <RouterView
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
  </AppShell>

  <div v-if="visitPopup.visible" class="visit-popup-backdrop" role="presentation">
    <section class="visit-popup-card" role="dialog" aria-modal="true" :aria-label="visitPopup.title">
      <span class="visit-popup-kicker">Tsukuyomi Notice</span>
      <h2>{{ visitPopup.title }}</h2>
      <p>{{ visitPopup.content }}</p>
      <button class="primary-btn" type="button" @click="closeVisitPopup">{{ visitPopup.button }}</button>
    </section>
  </div>
</template>
