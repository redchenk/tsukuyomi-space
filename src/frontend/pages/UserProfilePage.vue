<script setup>
import { nameInitial } from '../utils/userName.mjs';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import UserLevelBadge from '../components/UserLevelBadge.vue';
import { useUserLevels } from '../composables/useUserLevels';
import { assetUrl } from '../utils/assetUrl';
import profileMetadata from '../../../shared/profile-search.cjs';
import { applySeo } from '../utils/seo';
import { formatDateOnly, compareAppDate } from '../utils/time';

import TsButton from '../components/TsButton.vue';
import TsButtonLink from '../components/TsButtonLink.vue';
import TsFilterChip from '../components/TsFilterChip.vue';
import TsIconButton from '../components/TsIconButton.vue';
import { readingTimeLabel } from '../utils/reading';
import { isEnglishSite } from '../utils/siteVariant';

const props = defineProps({
  lang: { type: String, required: true },
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);
const route = useRoute();
const session = ref(getSession());
const profile = ref(null);
const loading = ref(true);
const message = ref('');
const followLoading = ref(false);
const avatarFailed = ref(false);
const failedCovers = ref(new Set());
const { hydrateUserLevels, userLevel } = useUserLevels();

const username = computed(() => String(route.params.username || '').trim());
const locale = computed(() => props.lang === 'en' ? 'en-US' : (props.lang === 'zh' ? 'zh-CN' : 'ja-JP'));
const isAuthed = computed(() => Boolean(session.value || props.user));
const profileUser = computed(() => profile.value?.user || null);
const profileStats = computed(() => profile.value?.stats || {});
const viewer = computed(() => profile.value?.viewer || {});
const profileArticles = computed(() => Array.isArray(profile.value?.articles) ? profile.value.articles : []);
const tr = (zh, en, ja) => props.lang === 'en' ? en : props.lang === 'ja' ? ja : zh;
const category = ref(null);
const search = ref('');
const sort = ref('latest');
const copied = ref('');
const shareInput = ref(null);
let generation = 0;

const articleDate = item => item.published_at || item.publish_date || item.created_at;
const displayName = computed(() => profileUser.value?.nickname || profileUser.value?.username);
const articleCategory = item => String(item.category || '').trim();
const categoryLabel = value => value || tr('未分类', 'Uncategorized', '未分類');
const categories = computed(() => {
  const counts = new Map();
  for (const article of profileArticles.value) {
    const key = articleCategory(article);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
});
const sortedArticles = computed(() =>
  [...profileArticles.value].sort((a, b) => compareAppDate(articleDate(b), articleDate(a)))
);
const visibleArticles = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = sortedArticles.value.filter(article =>
    (category.value === null || articleCategory(article) === category.value) &&
    (!query || [article.title, article.excerpt].some(text => text?.toLocaleLowerCase().includes(query)))
  );
  return sort.value === 'popular' ? matches.sort((a, b) => b.view_count - a.view_count) : matches;
});
const showLead = computed(() => sort.value === 'latest' && category.value === null && !search.value.trim());
const limited = computed(() => profileStats.value.articles > profileArticles.value.length);
const profileStatsList = computed(() => [
  [tr('公开文章', 'Articles', '公開記事'), profileStats.value.articles],
  [tr('累计阅读', 'Total reads', '総閲覧数'), profileStats.value.totalViews],
  [tr('关注者', 'Followers', 'フォロワー'), profileStats.value.followers],
  [tr('正在关注', 'Following', 'フォロー中'), profileStats.value.following]
]);
const recentDate = computed(() => articleDate(sortedArticles.value[0] || {}));
const shareUrl = computed(() => new URL('/users/' + encodeURIComponent(username.value), window.location.origin).href);
async function copyProfile() {
  const run = generation;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    if (run === generation) copied.value = 'done';
  } catch {
    if (run !== generation) return;
    copied.value = 'manual';
    await nextTick();
    shareInput.value?.focus();
    shareInput.value?.select();
  }
}
function clearFilters() {
  category.value = null;
  search.value = '';
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(locale.value);
}

function formatDate(value) {
  return value ? formatDateOnly(value, locale.value) : '-';
}

function articlePath(article) {
  return `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}`;
}

function articleCover(article) {
  const key = articleCoverKey(article);
  if (!key || failedCovers.value.has(key)) return '';
  return assetUrl(article.cover_image);
}

function articleCoverKey(article) {
  return String(article?.id || article?.cover_image || '');
}

function handleArticleCoverError(article) {
  const key = articleCoverKey(article);
  if (!key) return;
  const next = new Set(failedCovers.value);
  next.add(key);
  failedCovers.value = next;
}

async function loadProfile() {
  const run = ++generation;
  clearFilters();
  sort.value = 'latest';
  copied.value = '';
  avatarFailed.value = false;
  followLoading.value = false;
  if (!username.value) {
    message.value = '\u7528\u6237\u4e0d\u5b58\u5728';
    loading.value = false;
    return;
  }

  loading.value = true;
  message.value = '';
  failedCovers.value = new Set();
  session.value = getSession();
  try {
    const response = await authFetch(noStoreUrl(`/api/user/public/${encodeURIComponent(username.value)}`), {
      headers: authHeaders({ Accept: 'application/json' }),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (run !== generation) return;
    if (!result.success) throw new Error(result.message || '\u7528\u6237\u4e3b\u9875\u8bfb\u53d6\u5931\u8d25');
    profile.value = result.data;
    const publicUser = result.data?.user || {};
    await hydrateUserLevels([publicUser.id]).catch(() => {});
    if (run !== generation) return;
    const publicArticles = Array.isArray(result.data?.articles) ? result.data.articles : [];
    const description = profileMetadata.profileDescription(publicUser, publicArticles);
    applySeo({
      title: `${publicUser.nickname || publicUser.username || username.value}的公开主页`,
      description,
      keywords: [publicUser.nickname, publicUser.username, '月读空间创作者', ...publicArticles.map((article) => article.category)].filter(Boolean),
      path: `/users/${encodeURIComponent(publicUser.username || username.value)}`,
      image: /^https?:\/\//i.test(publicUser.avatar || '') ? publicUser.avatar : undefined,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `${publicUser.nickname || publicUser.username || username.value}的公开主页`,
        description,
        url: `${isEnglishSite() ? 'https://tsukuyomi-space.com' : 'https://yachiyo.hk'}/users/${encodeURIComponent(publicUser.username || username.value)}`,
        mainEntity: {
          '@type': 'Person',
          name: publicUser.nickname || publicUser.username || username.value,
          description
        }
      }
    });
  } catch (error) {
    if (run !== generation) return;
    profile.value = null;
    message.value = error.message || '\u7528\u6237\u4e3b\u9875\u8bfb\u53d6\u5931\u8d25';
    applySeo({
      title: '公开主页不存在',
      description: '请求的月读空间公开用户主页不存在。',
      path: `/users/${encodeURIComponent(username.value)}`,
      noindex: true
    });
  } finally {
    if (run === generation) loading.value = false;
  }
}

async function toggleFollow() {
  if (!profileUser.value?.id || followLoading.value) return;
  const run = generation;
  session.value = getSession();
  if (!isAuthed.value) {
    emit('go', '/login');
    return;
  }

  message.value = '';
  followLoading.value = true;
  try {
    const following = Boolean(viewer.value.isFollowing);
    const response = await authFetch(`/api/user/follow/${encodeURIComponent(profileUser.value.id)}`, {
      method: following ? 'DELETE' : 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (run !== generation) return;
    if (!result.success) throw new Error(result.message || '\u64cd\u4f5c\u5931\u8d25');
    profile.value = {
      ...profile.value,
      stats: {
        ...profileStats.value,
        followers: result.data?.followers ?? profileStats.value.followers,
        following: result.data?.following ?? profileStats.value.following
      },
      viewer: {
        ...viewer.value,
        isFollowing: Boolean(result.data?.isFollowing)
      }
    };
  } catch (error) {
    if (run !== generation) return;
    message.value = error.message || '\u64cd\u4f5c\u5931\u8d25';
  } finally {
    if (run === generation) followLoading.value = false;
  }
}

watch(username, loadProfile, { immediate: true });
</script>

<template>
  <main data-ui-layout="content" class="page user-profile-page creator-page" :aria-busy="loading">
    <LoadingSkeleton v-if="loading" variant="profile" :count="1" :label="tr('正在读取公开主页', 'Loading profile', 'プロフィールを読み込み中')" />
    <div v-else-if="!profile" class="creator-panel creator-empty" role="alert">{{ message }}</div>
    <template v-else>
      <header class="creator-panel creator-masthead">
        <div class="creator-banner profile-actions">
          <TsButtonLink to="/stage" size="sm" variant="secondary" class="profile-icon-action">
            <TsIcon name="arrowLeft" :size="15" />{{ tr('回到主舞台', 'Back to Main Stage', 'メインステージへ') }}
          </TsButtonLink>
          <TsIcon name="moon" class="creator-emblem" :size="78" aria-hidden="true" />
        </div>
        <div class="creator-identity">
          <div class="creator-portrait">
            <img v-if="profileUser.avatar && !avatarFailed" :src="profileUser.avatar" alt="" @error="avatarFailed = true">
            <span v-else>{{ nameInitial(displayName) }}</span>
          </div>
          <div class="creator-name">
            <div class="creator-name-line">
              <h1>{{ displayName }}</h1>
              <UserLevelBadge :level="userLevel(profileUser.id)" :lang="lang" />
              <span v-if="profileUser.role === 'admin'" class="creator-role">{{ tr('管理员', 'Admin', '管理者') }}</span>
            </div>
            <p class="creator-handle">@{{ profileUser.username }} <span v-if="profileUser.created_at">· {{ tr('加入于', 'Joined', '登録日') }} {{ formatDate(profileUser.created_at) }}</span></p>
          </div>
          <div class="creator-actions">
            <TsButton v-if="!viewer.isSelf" :variant="viewer.isFollowing ? 'secondary' : 'primary'" :busy="followLoading" @click="toggleFollow">
              <TsIcon :name="viewer.isFollowing ? 'userCheck' : 'userPlus'" :size="17" />
              {{ viewer.isFollowing ? tr('取消关注', 'Unfollow', 'フォロー解除') : tr('关注作者', 'Follow author', 'フォローする') }}
            </TsButton>
            <TsButtonLink v-else to="/user-center" variant="primary"><TsIcon name="penLine" :size="16" />{{ tr('编辑个人资料', 'Edit profile', 'プロフィールを編集') }}</TsButtonLink>
            <TsIconButton icon="copy" :label="tr('复制主页链接', 'Copy profile link', 'プロフィールリンクをコピー')" @click="copyProfile" />
          </div>
        </div>
        <div class="creator-intro">
          <p v-if="profileUser.bio">{{ profileUser.bio }}</p>
          <p v-if="message" role="alert" class="form-message error">{{ message }}</p>
          <span role="status">{{ copied === 'done' ? tr('主页链接已复制', 'Profile link copied', 'リンクをコピーしました') : '' }}</span>
          <label v-if="copied === 'manual'">{{ tr('请复制主页链接', 'Copy this profile link', 'このリンクをコピー') }}
            <input ref="shareInput" :value="shareUrl" readonly @focus="$event.target.select()">
          </label>
        </div>
        <dl class="creator-metrics">
          <div v-for="[label, value] in profileStatsList" :key="label"><dt>{{ label }}</dt><dd>{{ formatNumber(value) }}</dd></div>
        </dl>
      </header>

      <div class="creator-layout">
        <section aria-labelledby="creator-works">
          <div class="creator-section-head">
            <h2 id="creator-works">{{ tr('公开文章', 'Published articles', '公開記事') }}</h2>
            <span role="status" class="creator-count">{{ formatNumber(visibleArticles.length) }} / {{ formatNumber(profileStats.articles) }}</span>
          </div>
          <template v-if="profileArticles.length">
            <p v-if="limited" class="creator-scope">{{ tr('筛选、排序和主题分布仅涵盖本页展示的文章。', 'Filters, sorting and topics cover the articles shown on this page.', '絞り込み・並べ替え・テーマの集計対象はこのページの記事です。') }}</p>
            <div class="creator-filters">
              <div class="creator-chips" role="group" :aria-label="tr('文章分类', 'Categories', 'カテゴリー')">
                <TsFilterChip :selected="category === null" @click="category = null">{{ tr('全部', 'All', 'すべて') }}</TsFilterChip>
                <TsFilterChip v-for="[key, count] in categories" :key="key" :selected="category === key" @click="category = key">{{ categoryLabel(key) }} {{ count }}</TsFilterChip>
              </div>
              <div class="creator-tools">
                <label class="creator-search"><TsIcon name="search" :size="16" />
                  <input v-model="search" type="search" :aria-label="tr('搜索本页文章', 'Search articles on this page', 'このページの記事を検索')" :placeholder="tr('搜索标题或摘要', 'Search titles or summaries', 'タイトル・概要を検索')">
                </label>
                <div class="creator-sort" role="group" :aria-label="tr('文章排序', 'Sort articles', '並べ替え')">
                  <TsButton size="sm" :variant="sort === 'latest' ? 'choice' : 'quiet'" :aria-pressed="sort === 'latest'" @click="sort = 'latest'">{{ tr('最新', 'Latest', '新着') }}</TsButton>
                  <TsButton size="sm" :variant="sort === 'popular' ? 'choice' : 'quiet'" :aria-pressed="sort === 'popular'" @click="sort = 'popular'">{{ tr('热门', 'Popular', '人気') }}</TsButton>
                </div>
              </div>
            </div>
          </template>
          <div v-if="!visibleArticles.length" class="creator-panel creator-empty">
            <h3>{{ profileArticles.length ? tr('没有匹配的文章', 'No matching articles', '該当する記事はありません') : tr('暂无公开文章', 'No published articles yet', '公開記事はまだありません') }}</h3>
            <TsButton v-if="profileArticles.length" @click="clearFilters">{{ tr('清除筛选', 'Clear filters', '絞り込みを解除') }}</TsButton>
          </div>
          <div v-else class="creator-stories">
            <article v-for="(article, i) in visibleArticles" :key="article.id" class="creator-story" :class="{ 'creator-lead': showLead && i === 0 }">
              <div class="creator-art" aria-hidden="true">
                <img v-if="articleCover(article)" :src="articleCover(article)" alt="" :loading="i ? 'lazy' : 'eager'" @error="handleArticleCoverError(article)">
                <span v-else><TsIcon name="book" :size="34" /><b>{{ categoryLabel(articleCategory(article)) }}</b></span>
              </div>
              <div class="creator-story-copy">
                <div class="creator-byline">
                  <strong v-if="showLead && i === 0">{{ limited ? tr('本页最新', 'Latest on this page', 'このページの新着') : tr('最新创作', 'Latest work', '最新作') }}</strong>
                  <span>{{ categoryLabel(articleCategory(article)) }}</span><time :datetime="articleDate(article)">{{ formatDate(articleDate(article)) }}</time>
                </div>
                <h3><RouterLink :to="articlePath(article)">{{ article.title }}</RouterLink></h3>
                <p v-if="article.excerpt">{{ article.excerpt }}</p>
                <div class="creator-byline"><span>{{ formatNumber(article.view_count) }} {{ tr('次阅读', 'views', '閲覧') }}</span><span>{{ readingTimeLabel(article, lang) }}</span></div>
              </div>
            </article>
          </div>
        </section>
        <aside v-if="profileArticles.length" class="creator-rail">
          <section class="creator-panel creator-side">
            <h2>{{ limited ? tr('本页主题分布', 'Topics on this page', 'このページのテーマ') : tr('主题分布', 'Topics', 'テーマ分布') }}</h2>
            <button v-for="[key, count] in categories" :key="key" data-ui-part="row" type="button" class="creator-topic" :aria-pressed="category === key" @click="category = category === key ? null : key">
              <span>{{ categoryLabel(key) }}</span><small>{{ formatNumber(count) }} · {{ Math.round(100 * count / profileArticles.length) }}%</small>
              <progress :value="count" :max="profileArticles.length" aria-hidden="true"></progress>
            </button>
          </section>
          <section class="creator-panel creator-side">
            <h2>{{ tr('创作档案', 'Writing record', '創作記録') }}</h2>
            <dl class="creator-record">
              <div><dt>{{ tr('本页最近发布', 'Latest on this page', 'このページの最終公開') }}</dt><dd>{{ formatDate(recentDate) }}</dd></div>
              <div><dt>{{ tr('篇均阅读', 'Reads per article', '記事あたりの閲覧数') }}</dt><dd>{{ formatNumber(Math.round(profileStats.totalViews / (profileStats.articles || 1))) }}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </template>
  </main>
</template>
