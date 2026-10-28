<script setup>
import { useContentTranslationRefresh } from '../composables/useContentTranslationRefresh';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import TsIcon from './TsIcon.vue';
import { loadStageArticles } from '../services/stageArticles';
import { filterNavigationItems, navigationCopy } from '../services/siteNavigation';
import { lockPageScroll } from '../utils/pageScrollLock';

const props = defineProps({ items: { type: Array, required: true }, lang: { type: String, default: 'zh' } });
const emit = defineEmits(['close', 'go']);
const dialog = ref(null);
const input = ref(null);
const query = ref('');
const articles = ref([]);
const loading = ref(false);
const failed = ref(false);
const activeKey = ref('');
const copy = computed(() => navigationCopy(props.lang));
const normalizedQuery = computed(() => query.value.trim().slice(0, 120));
const matches = computed(() => filterNavigationItems(props.items, normalizedQuery.value));
const results = computed(() => [
  ...matches.value.map(item => ({ ...item, resultKey: `page-${item.key}` })),
  ...articles.value.map(article => ({ path: articlePath(article), label: article.title, resultKey: `article-${article.id}` })),
  ...(articles.value.length ? [{ path: `/stage?q=${encodeURIComponent(normalizedQuery.value)}`, resultKey: 'all-articles' }] : [])
]);
const activeIndex = computed(() => results.value.findIndex(item => item.resultKey === activeKey.value));
const activeId = computed(() => activeIndex.value >= 0 ? `site-result-${activeIndex.value}` : undefined);
const keyboardHelp = computed(() => props.lang === 'en' ? '↑ ↓ Choose · Enter Open' : props.lang === 'ja' ? '↑ ↓ 選択 · Enter 開く' : '↑ ↓ 选择 · Enter 打开');
function resultId(key) { return `site-result-${results.value.findIndex(item => item.resultKey === key)}`; }
let requestRun = 0;
let timer;
let restoreScroll;
let previousFocus;

async function searchArticles(force = false) {
  clearTimeout(timer);
  const run = ++requestRun;
  const search = normalizedQuery.value;
  articles.value = [];
  failed.value = false;
  loading.value = Boolean(search);
  if (!search) return;
  try {
    const result = await loadStageArticles({ search, limit: 4 }, { force });
    if (run === requestRun) articles.value = result.articles;
  } catch (_) {
    if (run === requestRun) failed.value = true;
  } finally {
    if (run === requestRun) loading.value = false;
  }
}

useContentTranslationRefresh(() => searchArticles());
watch(normalizedQuery, () => {
  activeKey.value = '';
  ++requestRun;
  clearTimeout(timer);
  articles.value = [];
  failed.value = false;
  loading.value = Boolean(normalizedQuery.value);
  timer = setTimeout(searchArticles, 300);
});

function navigate(event, item) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
  if (item.spa !== false) {
    event.preventDefault();
    emit('go', item.path);
  }
  emit('close');
}
function articlePath(article) { return `/articles/${encodeURIComponent(article.id)}${article.slug ? '/' + encodeURIComponent(article.slug) : ''}`; }
function submitSearch(event) {
  if (event.isComposing || event.keyCode === 229) return;
  const selected = results.value[activeIndex.value] || results.value[0];
  if (selected?.spa === false) window.location.assign(selected.path);
  else if (selected) navigate(event, selected);
  else if (normalizedQuery.value) navigate(event, { path: `/stage?q=${encodeURIComponent(normalizedQuery.value)}` });
}
async function chooseResult(event) {
  if (event.isComposing || event.keyCode === 229 || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  const count = results.value.length;
  if (!count) return;
  const index = activeIndex.value < 0
    ? (event.key === 'ArrowDown' ? 0 : count - 1)
    : (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
  activeKey.value = results.value[index].resultKey;
  await nextTick();
  document.getElementById(activeId.value)?.scrollIntoView({ block: 'nearest' });
}
function onBackdrop(event) {
  if (event.target !== dialog.value) return;
  const r = dialog.value.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) emit('close');
}
function moveResult(event) {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key) || event.target === input.value) return;
  const results = [...dialog.value.querySelectorAll('.site-search-result')];
  const index = results.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  if (event.key === 'ArrowUp' && index === 0) input.value.focus();
  else results[(index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length]?.focus();
}
onMounted(async () => {
  previousFocus = document.activeElement;
  const path = location.pathname + location.search;
  restoreScroll = lockPageScroll(() => location.pathname + location.search === path);
  dialog.value.showModal();
  await nextTick();
  input.value.focus({ preventScroll: true });
});
onUnmounted(() => {
  ++requestRun;
  clearTimeout(timer);
  dialog.value?.close();
  restoreScroll?.();
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>

<template>
  <dialog id="site-search" ref="dialog" class="site-search-dialog" aria-labelledby="site-search-title" @cancel.prevent="emit('close')" @click="onBackdrop" @keydown="moveResult">
    <div class="site-nav-drawer-head"><div><small>TSUKUYOMI SEARCH</small><h2 id="site-search-title">{{ copy.searchTitle }}</h2></div><button type="button" class="site-tool-button" :aria-label="copy.close" @click="emit('close')"><TsIcon name="x" :size="20" /></button></div>
    <form class="site-search-field" role="search" autocomplete="off" @submit.prevent="submitSearch"><TsIcon name="search" :size="21" /><input autocapitalize="off" autocorrect="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true" name="site-search-query-query" ref="input" v-model="query" type="search" maxlength="120" :aria-label="copy.search" :placeholder="copy.searchHint" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="site-search-options" aria-expanded="true" :aria-activedescendant="activeId" @keydown="chooseResult"><button class="site-tool-button" type="submit" :aria-label="copy.search"><TsIcon name="arrowRight" :size="20" /></button></form>
    <div id="site-search-options" class="site-search-results" role="listbox" :aria-label="copy.searchTitle">
      <section v-if="matches.length" role="presentation"><h3>{{ copy.shortcuts }}</h3><a v-for="item in matches" :key="item.key" class="site-search-result" role="option" :id="resultId(`page-${item.key}`)" :aria-selected="activeKey === `page-${item.key}`" :href="item.path" @click="navigate($event, item)"><TsIcon :name="item.icon" :size="20" /><span>{{ item.label }}</span><small>{{ item.path }}</small><TsIcon name="arrowRight" :size="15" /></a></section>
      <section v-if="normalizedQuery" role="presentation" :aria-busy="loading"><h3>{{ copy.articles }}</h3><p v-if="loading" class="site-search-status" role="status">{{ copy.loading }}</p><div v-else-if="failed" class="site-search-status" role="status">{{ copy.failed }} <button type="button" class="site-preference-button" @click="searchArticles(true)">{{ copy.retry }}</button></div><template v-else><a v-for="article in articles" :key="article.id" class="site-search-result" role="option" :id="resultId(`article-${article.id}`)" :aria-selected="activeKey === `article-${article.id}`" :href="articlePath(article)" @click="navigate($event, { path: articlePath(article) })"><TsIcon name="book" :size="20" /><span>{{ article.title }}</span><TsIcon name="arrowRight" :size="15" /></a><p v-if="!articles.length" class="site-search-status" role="status">{{ copy.empty }}</p><a v-else class="site-search-result site-search-all" role="option" :id="resultId('all-articles')" :aria-selected="activeKey === 'all-articles'" :href="`/stage?q=${encodeURIComponent(normalizedQuery)}`" @click="navigate($event, { path: `/stage?q=${encodeURIComponent(normalizedQuery)}` })">{{ copy.allArticles }}<TsIcon name="arrowRight" :size="16" /></a></template></section>
    </div>
    <p class="site-search-help"><span>{{ keyboardHelp }}</span><span>{{ copy.searchHelp }} <kbd>Esc</kbd></span></p>
  </dialog>
</template>
