<script setup>
import { computed, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { clearSession } from './api/client';
import { i18n } from './i18n';
import AppShell from './layouts/AppShell.vue';

const route = useRoute();
const router = useRouter();
const lang = ref(localStorage.getItem('lang') || 'zh');
const user = ref(loadStoredUser());
const t = computed(() => i18n[lang.value] || i18n.zh);
const isAccessRoute = computed(() => route.name === 'access' || route.name === 'accessAlias');
const isImmersiveRoute = computed(() => isAccessRoute.value || route.name === 'room');
const isAuthed = computed(() => Boolean(user.value));

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

function go(path) {
  router.push(path);
}

function logout() {
  clearSession();
  refreshUser();
  router.push('/');
}

watch(isAccessRoute, (next) => {
  document.body.classList.toggle('vue-access-route', next);
}, { immediate: true });

watch(lang, setLang, { immediate: true });
watch(() => route.fullPath, refreshUser, { immediate: true });
</script>

<template>
  <AppShell
    :lang="lang"
    :route-name="route.name"
    :show-chrome="!isImmersiveRoute"
    :t="t"
    :user="user"
    :is-authed="isAuthed"
    @go="go"
    @logout="logout"
    @set-lang="setLang"
  >
    <RouterView :lang="lang" :t="t" @auth-changed="refreshUser" @go="go" />
  </AppShell>
</template>
