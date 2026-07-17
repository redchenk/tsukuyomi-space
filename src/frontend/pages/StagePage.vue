<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch, getAuthToken, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { formatDateMinute } from '../utils/time';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();

const articles = ref([]);
const articlesLoading = ref(true);
const articlesError = ref('');
const stageCategory = ref('all');
const stageSearch = ref('');
const stagePage = ref(1);
let applyingStageQuery = false;
const categories = ['all', '\u516c\u544a', '\u4f20\u8bf4', '\u6280\u672f', '\u4e8c\u521b', '\u5176\u4ed6'];
const STAGE_PAGE_SIZE = 6;
const STAGE_FETCH_LIMIT = 100;

const stagePageCopy = {
  resultUnit: '\u7bc7',
  showing: '\u5f53\u524d',
  page: '\u7b2c',
  pageSuffix: '\u9875',
  totalPages: '\u5171',
  pageSize: '\u6bcf\u9875 6 \u7bc7',
  prevPage: '\u4e0a\u4e00\u9875',
  nextPage: '\u4e0b\u4e00\u9875',
  jumpToPage: '\u8df3\u5230\u7b2c',
  rangeUnit: '\u7bc7'
};

const filteredArticles = computed(() => {
  let list = articles.value;
  if (stageCategory.value !== 'all') {
    list = list.filter((article) => article.category === stageCategory.value);
  }
  if (stageSearch.value) {
    const query = stageSearch.value.toLowerCase();
    list = list.filter((article) => (
      String(article.title || '').toLowerCase().includes(query) ||
      String(article.excerpt || '').toLowerCase().includes(query)
    ));
  }
  return list;
});

const stageTotalArticles = computed(() => filteredArticles.value.length);
const stageTotalPages = computed(() => Math.max(1, Math.ceil(stageTotalArticles.value / STAGE_PAGE_SIZE)));
const stageCurrentPage = computed(() => Math.min(Math.max(stagePage.value, 1), stageTotalPages.value));
const stagePageStart = computed(() => stageTotalArticles.value
  ? (stageCurrentPage.value - 1) * STAGE_PAGE_SIZE + 1
  : 0);
const stagePageEnd = computed(() => Math.min(stageCurrentPage.value * STAGE_PAGE_SIZE, stageTotalArticles.value));

const pagedArticles = computed(() => {
  const start = (stageCurrentPage.value - 1) * STAGE_PAGE_SIZE;
  return filteredArticles.value.slice(start, start + STAGE_PAGE_SIZE);
});

const stagePageItems = computed(() => {
  const total = stageTotalPages.value;
  const current = stageCurrentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('gap-left');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push('gap-right');
  pages.push(total);
  return pages;
});

const stageResultSummary = computed(() => `\u5171 ${stageFormatNumber(stageTotalArticles.value)} ${stagePageCopy.resultUnit}`);
const stageRangeSummary = computed(() => stageTotalArticles.value
  ? `${stagePageCopy.showing} ${stageFormatNumber(stagePageStart.value)}-${stageFormatNumber(stagePageEnd.value)} ${stagePageCopy.rangeUnit}`
  : '');
const stagePageSummary = computed(() => `${stagePageCopy.page} ${stageFormatNumber(stageCurrentPage.value)} ${stagePageCopy.pageSuffix} / ${stagePageCopy.totalPages} ${stageFormatNumber(stageTotalPages.value)} ${stagePageCopy.pageSuffix}`);
const stageReturnPath = computed(() => {
  const params = new URLSearchParams();
  if (stageCurrentPage.value > 1) params.set('page', String(stageCurrentPage.value));
  if (stageCategory.value !== 'all') params.set('category', stageCategory.value);
  const search = stageSearch.value.trim();
  if (search) params.set('q', search);
  const query = params.toString();
  return query ? `/stage?${query}` : '/stage';
});

function queryValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function queryPage(value) {
  const page = Number(queryValue(value));
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
}

function applyStageQuery(query = {}) {
  applyingStageQuery = true;
  const category = queryValue(query.category);
  stageCategory.value = categories.includes(category) ? category : 'all';
  stageSearch.value = String(queryValue(query.q)).slice(0, 120);
  stagePage.value = queryPage(query.page);
  nextTick(() => {
    applyingStageQuery = false;
  });
}

function syncStageUrl() {
  if (applyingStageQuery || typeof window === 'undefined') return;
  const nextPath = stageReturnPath.value;
  if (`${window.location.pathname}${window.location.search}` === nextPath) return;
  const state = window.history.state && typeof window.history.state === 'object'
    ? { ...window.history.state, current: nextPath }
    : window.history.state;
  window.history.replaceState(state, '', nextPath);
}

function stageCategoryLabel(category) {
  const map = {
    all: props.t.filterAll,
    '\u516c\u544a': props.t.filterAnnouncement,
    '\u4f20\u8bf4': props.t.filterLegend,
    '\u6280\u672f': props.t.filterTechnology,
    '\u4e8c\u521b': props.t.filterFanwork,
    '\u5176\u4ed6': props.t.filterOther
  };
  return map[category] || category;
}

function stageFormatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function stageSetPage(page, { scroll = true } = {}) {
  const numericPage = Number(page);
  if (!Number.isFinite(numericPage)) return;
  const nextPage = Math.min(Math.max(Math.trunc(numericPage), 1), stageTotalPages.value);
  if (nextPage === stagePage.value) return;
  stagePage.value = nextPage;
  if (!scroll) return;
  nextTick(() => {
    document.querySelector('.stage-list-region')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function isStagePageGap(item) {
  return typeof item === 'string';
}

async function loadArticles() {
  articlesLoading.value = true;
  articlesError.value = '';
  try {
    const loaded = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await apiFetch(`/api/articles?limit=${STAGE_FETCH_LIMIT}&page=${page}`);
      const result = await parseResponse(response);
      if (!result.success) throw new Error(result.message || props.t.loadFailed);
      if (Array.isArray(result.data)) loaded.push(...result.data);
      totalPages = Math.max(1, Number.parseInt(result.pagination?.totalPages, 10) || 1);
      page += 1;
    } while (page <= totalPages);
    articles.value = loaded;
  } catch (error) {
    articles.value = [];
    articlesError.value = error.message || props.t.loadFailed;
  } finally {
    articlesLoading.value = false;
  }
}

function checkEditorAuth(event) {
  if (getAuthToken()) return;
  event.preventDefault();
  alert(props.t.loginRequired);
  emit('go', '/login');
}

function articlePath(article) {
  const basePath = `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}`;
  const params = new URLSearchParams({ from: stageReturnPath.value });
  return `${basePath}?${params.toString()}`;
}

function stageAuthorName(article) {
  return article.author_username || 'admin';
}

function stageAuthorInitial(article) {
  return String(stageAuthorName(article)).trim().slice(0, 1).toUpperCase();
}

function stageAuthorAlt(article) {
  return `${stageAuthorName(article)} avatar`;
}

function stagePublishedAt(article) {
  return article?.published_at || article?.created_at || article?.publish_date || '';
}

function stagePublishedTime(article) {
  return formatDateMinute(stagePublishedAt(article), 'zh-CN');
}

function stageOpenAuthor(article) {
  const username = String(article?.author_username || '').trim();
  if (!username) return;
  emit('go', `/users/${encodeURIComponent(username)}`);
}

watch([stageCategory, stageSearch], () => {
  if (applyingStageQuery) return;
  stagePage.value = 1;
});
watch([stagePage, stageCategory, stageSearch], syncStageUrl);
watch(stageTotalPages, (total) => {
  if (stagePage.value > total) stagePage.value = total;
  if (stagePage.value < 1) stagePage.value = 1;
});
watch(() => route.query, (query) => {
  if (route.name === 'stage') applyStageQuery(query);
});
applyStageQuery(route.query);
onMounted(loadArticles);
</script>

<template>
  <main class="page stage-page" :aria-busy="articlesLoading">
    <header class="stage-header">
      <h1 class="section-title">{{ t.stageTitle }}</h1>
      <p class="section-subtitle">{{ t.stageSubtitle }}</p>
      <p class="stage-seo-intro">
        主舞台集中展示月读空间的文章、公告、技术记录、二创作品与创作日志，内容覆盖 Live2D、AI 角色、
        个人网站开发、二次元网页设计和日常项目复盘。
      </p>
    </header>

    <div class="stage-controls">
      <div class="search-box">
        <TsIcon class="stage-search-icon" name="search" :size="17" />
        <input v-model="stageSearch" type="text" :placeholder="t.searchPlaceholder">
      </div>
      <a href="/editor" class="stage-new-btn" @click="checkEditorAuth">
        <TsIcon name="penLine" :size="17" />
        <span>{{ t.newPost }}</span>
      </a>
    </div>

    <div class="stage-filters">
      <button
        v-for="category in categories"
        :key="category"
        class="filter-btn"
        :class="{ active: stageCategory === category }"
        type="button"
        @click="stageCategory = category"
      >
        {{ stageCategoryLabel(category) }}
      </button>
    </div>
    <div v-if="!articlesLoading && filteredArticles.length" class="stage-result-strip">
      <div>
        <span class="stage-result-count">{{ stageResultSummary }}</span>
        <span>{{ stageRangeSummary }}</span>
      </div>
      <div class="stage-result-page">
        <span>{{ stagePageSummary }}</span>
        <small>{{ stagePageCopy.pageSize }}</small>
      </div>
    </div>

    <LoadingSkeleton v-if="articlesLoading" variant="stage" :count="6" :label="t.loading" />
    <div v-else-if="articlesError" class="stage-status error" role="alert">{{ articlesError }}</div>
    <div v-else-if="!filteredArticles.length" class="stage-status">{{ t.noArticles }}</div>
    <div v-else class="stage-list stage-list-region">
      <a
        v-for="article in pagedArticles"
        :key="article.id"
        :href="articlePath(article)"
        class="stage-card"
        @click.prevent="$emit('go', articlePath(article))"
      >
        <div class="stage-card-body">
          <div class="stage-card-meta">
            <span class="tag">{{ article.category }}</span>
            <span
              class="tag tag-author stage-author stage-author-link"
              role="link"
              tabindex="0"
              @click.stop.prevent="stageOpenAuthor(article)"
              @keydown.enter.stop.prevent="stageOpenAuthor(article)"
            >
              <span class="stage-author-avatar">
                <img v-if="article.author_avatar" :src="article.author_avatar" :alt="stageAuthorAlt(article)">
                <span v-else>{{ stageAuthorInitial(article) }}</span>
              </span>
              <span>{{ stageAuthorName(article) }}</span>
            </span>
          </div>
          <h3 class="stage-card-title">{{ article.title }}</h3>
          <p class="stage-card-excerpt">{{ article.excerpt }}</p>
          <div class="stage-card-footer">
            <span class="read-time">Time {{ article.read_time || '5 min' }}</span>
            <time class="stage-publish-time" :datetime="stagePublishedAt(article)">
              <TsIcon name="calendar" :size="14" />
              <span>{{ stagePublishedTime(article) }}</span>
            </time>
          </div>
        </div>
        <div v-if="article.cover_image" class="stage-card-cover">
          <img :src="article.cover_image" alt="" class="stage-cover-img">
        </div>
      </a>
      <nav v-if="stageTotalPages > 1" class="stage-pagination" aria-label="Stage articles pagination">
        <div class="stage-pagination-info">{{ stagePageSummary }}</div>
        <div class="stage-pagination-controls">
          <button
            class="stage-page-btn stage-page-nav"
            type="button"
            :disabled="stageCurrentPage <= 1"
            @click="stageSetPage(stageCurrentPage - 1)"
          >
            <TsIcon name="arrowLeft" :size="16" />
            <span>{{ stagePageCopy.prevPage }}</span>
          </button>
          <template v-for="item in stagePageItems" :key="item">
            <span v-if="isStagePageGap(item)" class="stage-page-gap">...</span>
            <button
              v-else
              class="stage-page-btn"
              :class="{ active: item === stageCurrentPage }"
              type="button"
              :aria-current="item === stageCurrentPage ? 'page' : undefined"
              :aria-label="`${stagePageCopy.jumpToPage} ${item}`"
              @click="stageSetPage(item)"
            >
              {{ item }}
            </button>
          </template>
          <button
            class="stage-page-btn stage-page-nav"
            type="button"
            :disabled="stageCurrentPage >= stageTotalPages"
            @click="stageSetPage(stageCurrentPage + 1)"
          >
            <span>{{ stagePageCopy.nextPage }}</span>
            <TsIcon name="arrowRight" :size="16" />
          </button>
        </div>
      </nav>
    </div>
  </main>
</template>
