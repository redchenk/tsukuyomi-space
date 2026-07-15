<script setup>
import { computed, onMounted, reactive } from 'vue';
import { apiFetch, noStoreUrl, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';

const props = defineProps({
  lang: { type: String, required: true }
});

const emit = defineEmits(['go']);
const state = reactive({
  links: [],
  loading: true,
  error: ''
});

const isZh = computed(() => props.lang === 'zh');
const copy = computed(() => isZh.value ? {
  eyebrow: 'Friend Links',
  title: '友链',
  subtitle: '一些值得顺路拜访的站点。',
  back: '返回广场',
  apply: '申请友链',
  directory: '站点目录',
  count: '个站点',
  visit: '访问站点',
  loading: '正在读取友链',
  loadFailed: '友链读取失败',
  retry: '重新加载',
  empty: '暂时还没有公开友链',
  emptyAction: '成为第一个友邻'
} : {
  eyebrow: 'Friend Links',
  title: '相互リンク',
  subtitle: '寄り道したくなるサイトを集めました。',
  back: '広場へ戻る',
  apply: '相互リンクを申請',
  directory: 'サイト一覧',
  count: 'サイト',
  visit: 'サイトを開く',
  loading: '相互リンクを読み込み中',
  loadFailed: '相互リンクを読み込めませんでした',
  retry: '再読み込み',
  empty: '公開中の相互リンクはまだありません',
  emptyAction: '最初の申請を送る'
});

function go(path) {
  emit('go', path);
}

function initial(name) {
  return String(name || '?').trim().slice(0, 1).toUpperCase();
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return url;
  }
}

async function loadLinks() {
  state.loading = true;
  state.error = '';
  try {
    const response = await apiFetch(noStoreUrl('/api/friend-links'), { cache: 'no-store' });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || copy.value.loadFailed);
    state.links = Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    state.links = [];
    state.error = error.message || copy.value.loadFailed;
  } finally {
    state.loading = false;
  }
}

onMounted(loadLinks);
</script>

<template>
  <main class="page friend-link-page friend-links-page" :aria-busy="state.loading">
    <header class="friend-link-hero" data-material="content">
      <button class="friend-link-back" type="button" @click="go('/plaza')">
        <TsIcon name="arrowLeft" :size="18" />
        <span>{{ copy.back }}</span>
      </button>
      <div class="friend-link-hero-copy">
        <span class="friend-link-eyebrow">{{ copy.eyebrow }}</span>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.subtitle }}</p>
      </div>
      <div class="friend-links-hero-side">
        <div class="friend-link-hero-icon" aria-hidden="true">
          <TsIcon name="external" :size="30" :stroke-width="1.7" />
        </div>
        <button class="primary-btn" type="button" @click="go('/friend-links/apply')">
          <TsIcon name="send" :size="17" />
          <span>{{ copy.apply }}</span>
        </button>
      </div>
    </header>

    <section class="friend-links-directory" aria-labelledby="friend-links-heading">
      <header class="friend-links-directory-head">
        <div>
          <span class="friend-link-eyebrow">Directory</span>
          <h2 id="friend-links-heading">{{ copy.directory }}</h2>
        </div>
        <span v-if="!state.loading && !state.error" class="friend-links-count">{{ state.links.length }} {{ copy.count }}</span>
      </header>

      <div v-if="state.loading" class="friend-links-loading">
        <StatusLoader :label="copy.loading" />
      </div>

      <div v-else-if="state.error" class="friend-links-feedback" role="alert">
        <TsIcon name="x" :size="22" />
        <strong>{{ copy.loadFailed }}</strong>
        <button class="ghost-btn" type="button" @click="loadLinks">{{ copy.retry }}</button>
      </div>

      <div v-else-if="!state.links.length" class="friend-links-feedback">
        <TsIcon name="external" :size="24" />
        <strong>{{ copy.empty }}</strong>
        <button class="primary-btn" type="button" @click="go('/friend-links/apply')">{{ copy.emptyAction }}</button>
      </div>

      <div v-else class="friend-links-grid">
        <a
          v-for="link in state.links"
          :key="link.id"
          class="friend-links-card"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`${copy.visit}: ${link.name}`"
        >
          <div class="friend-links-card-top">
            <span class="friend-links-avatar" aria-hidden="true">{{ initial(link.name) }}</span>
            <TsIcon name="external" :size="17" />
          </div>
          <div class="friend-links-card-copy">
            <h3>{{ link.name }}</h3>
            <p>{{ link.description || hostLabel(link.url) }}</p>
          </div>
          <span class="friend-links-host">{{ hostLabel(link.url) }}</span>
        </a>
      </div>
    </section>
  </main>
</template>
