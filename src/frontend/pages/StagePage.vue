<script setup>
import { computed, onMounted, ref } from 'vue';
import { getAuthToken, parseResponse } from '../api/client';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);

const articles = ref([]);
const articlesLoading = ref(true);
const stageCategory = ref('all');
const stageSearch = ref('');
const categories = ['all', '\u516c\u544a', '\u4f20\u8bf4', '\u6280\u672f', '\u5176\u4ed6'];

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

function stageCategoryLabel(category) {
  const map = {
    all: props.t.filterAll,
    '\u516c\u544a': props.t.filterAnnouncement,
    '\u4f20\u8bf4': props.t.filterLegend,
    '\u6280\u672f': props.t.filterTechnology,
    '\u5176\u4ed6': props.t.filterOther
  };
  return map[category] || category;
}

async function loadArticles() {
  articlesLoading.value = true;
  try {
    const response = await fetch('/api/articles');
    const result = await parseResponse(response);
    articles.value = result.success && Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    articles.value = [];
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
  return `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}`;
}

onMounted(loadArticles);
</script>

<template>
  <main class="page stage-page">
    <header class="stage-header">
      <h1 class="section-title">{{ t.stageTitle }}</h1>
      <p class="section-subtitle">{{ t.stageSubtitle }}</p>
    </header>

    <div class="stage-controls">
      <div class="search-box">
        <input v-model="stageSearch" type="text" :placeholder="t.searchPlaceholder">
      </div>
      <a href="/editor" class="stage-new-btn" @click="checkEditorAuth">{{ t.newPost }}</a>
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

    <div v-if="articlesLoading" class="stage-status">{{ t.loading }}</div>
    <div v-else-if="!filteredArticles.length" class="stage-status">{{ t.noArticles }}</div>
    <div v-else class="stage-list">
      <a
        v-for="article in filteredArticles"
        :key="article.id"
        :href="articlePath(article)"
        class="stage-card"
        @click.prevent="$emit('go', articlePath(article))"
      >
        <div class="stage-card-body">
          <div class="stage-card-meta">
            <span class="tag">{{ article.category }}</span>
            <span class="tag tag-author">{{ article.author_username || 'admin' }}</span>
          </div>
          <h3 class="stage-card-title">{{ article.title }}</h3>
          <p class="stage-card-excerpt">{{ article.excerpt }}</p>
          <div class="stage-card-footer">
            <span class="read-time">Time {{ article.read_time || '5 min' }}</span>
          </div>
        </div>
        <div v-if="article.cover_image" class="stage-card-cover">
          <img :src="article.cover_image" alt="" class="stage-cover-img">
        </div>
      </a>
    </div>
  </main>
</template>
