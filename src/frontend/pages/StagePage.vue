<script setup>
import { RouterLink } from 'vue-router';
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadStageArticles, STAGE_PAGE_SIZE } from '../services/stageArticles';
import { useArticleCategories } from '../composables/useArticleCategories';
import UserLevelBadge from '../components/UserLevelBadge.vue';
import { useUserLevels } from '../composables/useUserLevels';
import { formatDateMinute } from '../utils/time';
import { createArticleDiscoveryTracker } from '../services/articleDiscovery.mjs';
import { useContentTranslationRefresh } from '../composables/useContentTranslationRefresh';
import { readingTimeLabel } from '../utils/reading';
import { nameInitial } from '../utils/userName.mjs';
import TsIcon from '../components/TsIcon.vue';
const props = defineProps({ lang: { type: String, default: 'zh' }, t: Object });
const route = useRoute(), router = useRouter();
const { hydrateUserLevels, userLevel } = useUserLevels();
const tr = (zh, en, ja = zh) => props.lang === 'en' ? en : props.lang === 'ja' ? ja : zh;
const { categories } = useArticleCategories({ enabled: computed(() => route.name === 'stage') });
const articles = ref([]), loading = ref(true), loadingMore = ref(false), error = ref(''), search = ref('');
const page = ref(1), total = ref(0), totalPages = ref(1);
const category = computed(() => String(route.query.category || ''));
const order = computed(() => ['daily', 'featured'].includes(route.query.sort) ? route.query.sort : 'latest');
const querySearch = computed(() => String(route.query.q || ''));
let revision = 0, timer = 0, snapshot = '', loadedAt = 0, active = true, loadedQuery = '';
const queryKey = () => JSON.stringify([category.value, order.value, querySearch.value, route.query.page || 1, props.lang]);
const stageGrid = ref(null);
const discoveryTracker = createArticleDiscoveryTracker();
const discoveryContext = () => ({ page: page.value, limit: STAGE_PAGE_SIZE, category: category.value, search: querySearch.value, sort: order.value, snapshot });
async function trackVisibleArticles() {
  await nextTick();
  if (active && !error.value) void discoveryTracker.start(stageGrid.value, discoveryContext());
}
const author = article => article.author_nickname || article.author_username || article.author || tr('月下旅人', 'Moonlit traveler');
const publishedAt = article => article?.published_at || article?.created_at || article?.publish_date;
const date = article => formatDateMinute(publishedAt(article), props.lang === 'en' ? 'en-US' : props.lang === 'ja' ? 'ja-JP' : 'zh-CN');
const articlePath = article => `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}?from=${encodeURIComponent(route.fullPath)}`;
function setFilter(key, value) {
  const query = { ...route.query }; delete query.page;
  if (!value || key === 'sort' && value === 'latest') delete query[key]; else query[key] = value;
  router.replace({ path: '/stage', query });
}
async function load(more = false, background = false) {
  if (more && (loadingMore.value || page.value >= totalPages.value)) return;
  const run = ++revision;
  const requestedQuery = queryKey();
  const requestPage = more ? page.value + 1 : Math.max(1, Number.parseInt(route.query.page, 10) || 1);
  if (more) loadingMore.value = true;
  else if (!background) { loading.value = true; snapshot = ''; }
  error.value = '';
  try {
    const result = await loadStageArticles({ page: requestPage, limit: STAGE_PAGE_SIZE, category: category.value, search: querySearch.value, sort: order.value, snapshot });
    if (run !== revision) return;
    const existing = more ? articles.value : [];
    articles.value = [...new Map([...existing, ...result.articles].map(article => [article.id, article])).values()];
    page.value = result.pagination.page; total.value = result.pagination.total; totalPages.value = result.pagination.totalPages;
    snapshot = result.recommendationSnapshot; loadedAt = Date.now(); loadedQuery = requestedQuery;
    hydrateUserLevels(result.articles.map(article => article.author_id)).catch(() => {});
  } catch (cause) {
    if (run !== revision) return;
    if (more && cause.status === 409) { snapshot = ''; return load(false); }
    if (background) return;
    error.value = cause.message || tr('文章暂时未能加载，请重试。', 'Unable to load stories. Please try again.');
    if (!more) articles.value = [];
  } finally { if (run === revision) { loading.value = false; loadingMore.value = false; trackVisibleArticles(); } }
}
watch(search, value => { clearTimeout(timer); if (value !== querySearch.value) timer = setTimeout(() => setFilter('q', value.trim()), 250); });
watch(() => [category.value, order.value, querySearch.value, route.query.page, props.lang], () => {
  if (route.name !== 'stage') return;
  search.value = querySearch.value;
  if (!loadedAt || loadedQuery !== queryKey()) load();
});
onMounted(() => { search.value = querySearch.value; load(); });
onActivated(() => { active = true; if (loadedAt && Date.now() - loadedAt > 30000) load(false, true); else if (loadedAt) trackVisibleArticles(); });
onDeactivated(() => { active = false; discoveryTracker.stop(); clearTimeout(timer); });
onBeforeUnmount(() => { active = false; discoveryTracker.destroy(); revision++; clearTimeout(timer); });
useContentTranslationRefresh(() => load());
</script>

<template>
  <main class="page stage-page" :aria-busy="loading || loadingMore">
    <header class="stage-heading"><div><span class="eyebrow">THE JOURNAL</span><h1 class="section-title">{{ tr('主舞台', 'The journal', 'メインステージ') }}<span class="title-dot">.</span></h1><p class="section-subtitle">{{ tr('故事、创作与生活的切片。每一种表达，都有自己的光。', 'Stories, creations, and everyday discoveries. Every voice has its own light.') }}</p></div><RouterLink to="/editor" class="ghost-btn"><TsIcon name="penLine" :size="17" />{{ tr('写点什么', 'Write a story', '書いてみる') }}</RouterLink></header>
    <div class="journal-toolbar"><div class="journal-tabs" :aria-label="tr('文章分类', 'Categories')"><button :aria-pressed="!category" @click="setFilter('category', '')">{{ tr('全部', 'All') }}</button><button v-for="item in categories" :key="item.id" :aria-pressed="category === item.name" @click="setFilter('category', item.name)">{{ item.name }}</button></div><div class="journal-tools"><label class="journal-search"><TsIcon name="search" :size="17" /><input v-model="search" type="search" :aria-label="t.searchPlaceholder" :placeholder="tr('搜索文章…', 'Search stories…')"></label><select :value="order" :aria-label="tr('文章排序', 'Sort stories')" @change="setFilter('sort', $event.target.value)"><option value="latest">{{ tr('最新发布', 'Latest') }}</option><option value="featured">{{ tr('编辑精选', 'Featured') }}</option><option value="daily">{{ tr('每日推荐', 'Daily picks') }}</option></select></div></div>
    <div class="journal-result-line"><span>{{ category || tr('所有故事', 'All stories') }}</span><span>{{ total }} {{ tr('篇文字', 'stories') }}</span></div>
    <LoadingSkeleton v-if="loading" variant="stage" :count="3" :label="t.loading" />
    <div v-else-if="!articles.length && !error" class="empty-state"><p>{{ tr('这里还没有找到故事。换一个关键词试试。', 'No stories found. Try another search.') }}</p><button v-if="category || search" class="ghost-btn" @click="router.replace('/stage')">{{ tr('浏览全部文章', 'See all stories') }}</button></div>
    <div v-else ref="stageGrid" class="journal-list">
      <article v-for="article in articles" :key="article.id" :data-article-id="article.id" class="journal-row">
        <div class="journal-copy"><div class="journal-meta"><span>{{ article.category }}</span><span v-if="article.pinned_at" class="journal-pinned"><TsIcon name="sparkles" :size="13" />{{ tr('精选', 'Featured') }}</span><span>{{ readingTimeLabel(article, lang) }}</span></div><RouterLink :to="articlePath(article)" class="journal-title"><h2>{{ article.title }}</h2></RouterLink><p class="journal-excerpt">{{ article.excerpt }}</p><div class="journal-byline"><RouterLink v-if="article.author_username" :to="`/users/${encodeURIComponent(article.author_username)}`" class="journal-author"><span class="journal-avatar"><img v-if="article.author_avatar" :src="article.author_avatar" alt="" loading="lazy"><span v-else>{{ nameInitial(author(article)) }}</span></span>{{ author(article) }}</RouterLink><span v-else>{{ author(article) }}</span><UserLevelBadge v-if="article.author_id" :level="userLevel(article.author_id)" :lang="lang" compact :show-title="false" /><time :datetime="publishedAt(article)">{{ date(article) }}</time><span class="journal-engagement"><TsIcon name="eye" :size="14" />{{ article.view_count || 0 }}<TsIcon name="heart" :size="14" />{{ article.like_count || 0 }}</span></div></div>
        <RouterLink v-if="article.cover_image" class="journal-cover" :to="articlePath(article)" :aria-label="article.title"><img :src="article.cover_image" alt="" loading="lazy" width="400" height="260"></RouterLink>
      </article>
    </div>
    <div v-if="error" class="journal-error" role="alert"><p>{{ error }}</p><button class="ghost-btn" @click="load(Boolean(articles.length))">{{ tr('重新加载', 'Try again') }}</button></div>
    <footer v-if="!loading && articles.length" class="journal-pagination"><span>{{ tr('已读到这里', 'You’re here') }} · {{ articles.length }} / {{ total }}</span><button v-if="page < totalPages" class="ghost-btn" :disabled="loadingMore" @click="load(true)">{{ loadingMore ? tr('正在加载…', 'Loading…') : tr('再读一些', 'More stories') }}<TsIcon :name="loadingMore ? 'loader' : 'arrowDown'" :size="17" /></button><p v-else>{{ tr('暂时读到这里，新的故事还在路上。', 'That’s all for now. More stories are on their way.') }}</p></footer>
  </main>
</template>
