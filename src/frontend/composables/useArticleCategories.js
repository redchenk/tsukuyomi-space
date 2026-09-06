import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { apiFetch, noStoreUrl } from '../api/client';

const categories = ref([]);
const revision = ref('');
const error = ref('');
const loading = ref(false);
let consumers = 0;
let controller;
let retryTimer;
let retryDelay = 1000;
let needsSnapshot = false;

export function applyArticleCategories(payload) {
  if (!payload?.success || !Array.isArray(payload.data) || !/^[1-9]\d*$/.test(payload.revision)) {
    throw new Error('Invalid category response');
  }
  if (Number(payload.revision) < Number(revision.value)) return;
  if (revision.value !== payload.revision) categories.value = payload.data;
  revision.value = payload.revision;
  error.value = '';
}

export async function refreshArticleCategories() {
  const response = await apiFetch(noStoreUrl('/api/article-categories'), { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
  applyArticleCategories(payload);
  return payload;
}

function stop() {
  clearTimeout(retryTimer);
  controller?.abort();
  controller = null;
  loading.value = false;
}

async function listen() {
  if (!consumers || document.hidden || controller) return;
  const request = new AbortController();
  controller = request;
  loading.value = !revision.value;
  const timeout = setTimeout(() => request.abort(), 30000);
  let delay = 0;
  try {
    const path = revision.value && !needsSnapshot
      ? `/api/article-categories/changes?revision=${encodeURIComponent(revision.value)}`
      : '/api/article-categories';
    const response = await apiFetch(noStoreUrl(path), { cache: 'no-store', signal: request.signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
    if (controller !== request) return;
    applyArticleCategories(payload);
    needsSnapshot = false;
    retryDelay = 1000;
  } catch (cause) {
    if (controller !== request) return;
    // Refresh once after transport failure so CDN retries cannot starve updates.
    needsSnapshot = true;
    error.value = cause.message || 'Category sync failed';
    delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, 30000);
  } finally {
    clearTimeout(timeout);
    if (controller === request) {
      controller = null;
      loading.value = false;
      if (consumers && !document.hidden) retryTimer = setTimeout(listen, delay);
    }
  }
}

function resume() {
  stop();
  if (!document.hidden) void listen();
}

export function useArticleCategories({ enabled = ref(true) } = {}) {
  let active = false;
  let unwatch;
  function toggle(next) {
    if (active === Boolean(next)) return;
    active = Boolean(next);
    consumers += active ? 1 : -1;
    if (consumers === 1 && active) {
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('online', resume);
      void listen();
    } else if (!consumers) {
      stop();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    }
  }
  onMounted(() => { unwatch = watch(enabled, toggle, { immediate: true }); });
  onUnmounted(() => { unwatch?.(); toggle(false); });
  return { categories: computed(() => categories.value), revision, error, loading, refresh: refreshArticleCategories };
}
