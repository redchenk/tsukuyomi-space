<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { assetUrl } from '../utils/assetUrl';
import { applySeo } from '../utils/seo';
import { formatDateOnly } from '../utils/time';

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
const failedCovers = ref(new Set());

const username = computed(() => String(route.params.username || '').trim());
const locale = computed(() => props.lang === 'zh' ? 'zh-CN' : 'ja-JP');
const isAuthed = computed(() => Boolean(session.value || props.user));
const profileUser = computed(() => profile.value?.user || null);
const profileStats = computed(() => profile.value?.stats || {});
const viewer = computed(() => profile.value?.viewer || {});
const profileArticles = computed(() => Array.isArray(profile.value?.articles) ? profile.value.articles : []);
const roleIcon = computed(() => profileUser.value?.role === 'admin' ? 'crown' : 'user');
const roleText = computed(() => {
  if (!profileUser.value?.role) return 'Creator';
  if (profileUser.value.role === 'admin') return props.lang === 'zh' ? '管理员' : 'Admin';
  return props.lang === 'zh' ? '创作者' : 'Creator';
});
const profileInitial = computed(() => String(profileUser.value?.username || '月').trim().slice(0, 1).toUpperCase());
const latestArticle = computed(() => profileArticles.value[0] || null);
const profileCategoryChips = computed(() => {
  const categories = profileArticles.value.map((article) => String(article.category || '').trim()).filter(Boolean);
  return [...new Set(categories)].slice(0, 6);
});
const profileStatCards = computed(() => [
  { key: 'articles', icon: 'fileText', label: props.lang === 'zh' ? '文章' : 'Articles', value: profileStats.value.articles, note: props.lang === 'zh' ? '公开发布' : 'Published' },
  { key: 'views', icon: 'layers', label: props.lang === 'zh' ? '阅读' : 'Views', value: profileStats.value.totalViews, note: props.lang === 'zh' ? '累计浏览' : 'Total reads' },
  { key: 'followers', icon: 'users', label: props.lang === 'zh' ? '关注者' : 'Followers', value: profileStats.value.followers, note: props.lang === 'zh' ? '正在等候更新' : 'Following updates' },
  { key: 'following', icon: 'userCheck', label: props.lang === 'zh' ? '正在关注' : 'Following', value: profileStats.value.following, note: props.lang === 'zh' ? '连接的创作者' : 'Creator links' }
]);

function formatNumber(value) {
  return Number(value || 0).toLocaleString(locale.value);
}

function formatDate(value) {
  return value ? formatDateOnly(value, locale.value) : '-';
}

function avatarSrc(user) {
  if (user?.avatar) return user.avatar;
  const initial = encodeURIComponent(String(user?.username || '\u6708').slice(0, 1));
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23ffb7c5'/%3E%3Cstop offset='1' stop-color='%237edbe8'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='50' fill='url(%23g)'/%3E%3Ctext x='50' y='62' text-anchor='middle' font-size='42' font-family='Arial' fill='%231a1025'%3E${initial}%3C/text%3E%3C/svg%3E`;
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
    if (!result.success) throw new Error(result.message || '\u7528\u6237\u4e3b\u9875\u8bfb\u53d6\u5931\u8d25');
    profile.value = result.data;
    const publicUser = result.data?.user || {};
    const publicArticles = Array.isArray(result.data?.articles) ? result.data.articles : [];
    const description = String(publicUser.bio || `${publicUser.username || username.value} 在月读空间发布的公开文章与创作资料。`).trim();
    applySeo({
      title: `${publicUser.username || username.value}的公开主页`,
      description,
      keywords: [publicUser.username, '月读空间创作者', ...publicArticles.map((article) => article.category)].filter(Boolean),
      path: `/users/${encodeURIComponent(publicUser.username || username.value)}`,
      image: /^https?:\/\//i.test(publicUser.avatar || '') ? publicUser.avatar : undefined,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `${publicUser.username || username.value}的公开主页`,
        description,
        url: `https://yachiyo.hk/users/${encodeURIComponent(publicUser.username || username.value)}`,
        mainEntity: {
          '@type': 'Person',
          name: publicUser.username || username.value,
          description
        }
      }
    });
  } catch (error) {
    profile.value = null;
    message.value = error.message || '\u7528\u6237\u4e3b\u9875\u8bfb\u53d6\u5931\u8d25';
    applySeo({
      title: '公开主页不存在',
      description: '请求的月读空间公开用户主页不存在。',
      path: `/users/${encodeURIComponent(username.value)}`,
      noindex: true
    });
  } finally {
    loading.value = false;
  }
}

async function toggleFollow() {
  if (!profileUser.value?.id) return;
  session.value = getSession();
  if (!isAuthed.value) {
    emit('go', '/login');
    return;
  }

  followLoading.value = true;
  try {
    const following = Boolean(viewer.value.isFollowing);
    const response = await authFetch(`/api/user/follow/${encodeURIComponent(profileUser.value.id)}`, {
      method: following ? 'DELETE' : 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
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
    message.value = error.message || '\u64cd\u4f5c\u5931\u8d25';
  } finally {
    followLoading.value = false;
  }
}

watch(username, loadProfile);
onMounted(loadProfile);
</script>

<template>
  <main class="page user-profile-page" :aria-busy="loading">
    <LoadingSkeleton v-if="loading" variant="profile" :count="1" label="正在读取公开主页" />
    <div v-else-if="message && !profile" class="user-profile-status panel" role="alert">{{ message }}</div>

    <template v-else-if="profile">
      <section class="profile-hero">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar">
            <img :src="avatarSrc(profileUser)" :alt="profileUser?.username || ''">
          </div>
          <span class="profile-avatar-initial">{{ profileInitial }}</span>
        </div>
        <div class="profile-main">
          <div class="profile-kicker"><TsIcon name="star" :size="15" /> User Profile</div>
          <h1>{{ profileUser?.username }}</h1>
          <p>{{ profileUser?.bio || '这位创作者还没有写下个人简介。' }}</p>
          <div class="profile-meta">
            <span><TsIcon :name="roleIcon" :size="15" /> {{ roleText }}</span>
            <span><TsIcon name="calendar" :size="15" /> {{ formatDate(profileUser?.created_at) }}</span>
            <span><TsIcon name="book" :size="15" /> {{ formatNumber(profileStats.articles) }} 篇公开文章</span>
          </div>
        </div>
        <div class="profile-actions">
          <button
            v-if="!viewer.isSelf"
            class="primary-btn profile-icon-action"
            type="button"
            :disabled="followLoading"
            :aria-busy="followLoading"
            @click="toggleFollow"
          >
            <TsIcon :class="{ 'ts-status-loader-icon': followLoading }" :name="followLoading ? 'loader' : (viewer.isFollowing ? 'userCheck' : 'userPlus')" :size="17" />
            <span :role="followLoading ? 'status' : undefined">{{ followLoading ? '正在更新关注状态' : (viewer.isFollowing ? '取消关注' : '关注作者') }}</span>
          </button>
          <a v-else class="primary-btn profile-icon-action" href="/user-center" @click.prevent="emit('go', '/user-center')">
            <TsIcon name="penLine" :size="17" />
            <span>编辑个人资料</span>
          </a>
          <a class="ghost-btn profile-icon-action" href="/stage" @click.prevent="emit('go', '/stage')">
            <TsIcon name="book" :size="17" />
            <span>回到主舞台</span>
          </a>
        </div>
        <aside class="profile-presence">
          <div>
            <span>创作档案</span>
            <strong>{{ latestArticle ? latestArticle.title : '等待新的公开记录' }}</strong>
          </div>
          <p>{{ latestArticle ? (latestArticle.excerpt || '最近公开的文章会出现在这里。') : '这里会收纳这个用户发布到月读空间的公开文章、关注关系和创作痕迹。' }}</p>
          <div class="profile-presence-grid">
            <span><b>{{ formatNumber(profileStats.totalViews) }}</b><small>累计阅读</small></span>
            <span><b>{{ formatNumber(profileStats.followers) }}</b><small>关注者</small></span>
          </div>
        </aside>
      </section>

      <section class="profile-stats">
        <div v-for="card in profileStatCards" :key="card.key" class="profile-stat">
          <div class="profile-stat-icon"><TsIcon :name="card.icon" :size="26" /></div>
          <div>
            <span>{{ card.label }}</span>
            <strong>{{ formatNumber(card.value) }}</strong>
            <small>{{ card.note }}</small>
          </div>
        </div>
      </section>

      <div class="profile-content-grid">
        <section class="panel profile-articles">
          <div class="profile-section-head">
            <div>
              <span>Published Notes</span>
              <h2><TsIcon name="fileText" :size="19" /> 公开文章</h2>
            </div>
            <strong>{{ formatNumber(profileArticles.length) }}</strong>
          </div>
          <div v-if="message" class="form-message error">{{ message }}</div>
          <div v-if="!profileArticles.length" class="profile-empty">
            <TsIcon name="fileText" :size="28" />
            <strong>暂无公开文章</strong>
            <span>当这位用户发布文章后，会在这里形成公开创作列表。</span>
          </div>
          <div v-else class="profile-article-list">
            <article v-for="article in profileArticles" :key="article.id" class="profile-article">
              <a class="profile-article-cover" :href="articlePath(article)" @click.prevent="emit('go', articlePath(article))">
                <img
                  v-if="articleCover(article)"
                  :src="articleCover(article)"
                  :alt="article.title || ''"
                  loading="lazy"
                  @error="handleArticleCoverError(article)"
                >
                <span v-else>
                  <TsIcon name="fileText" :size="28" />
                  <b>{{ article.category || '未分类' }}</b>
                </span>
              </a>
              <div class="profile-article-body">
                <div class="profile-article-meta">
                  <span>{{ article.category || '未分类' }}</span>
                  <span>{{ formatDate(article.publish_date || article.created_at) }}</span>
                  <span>{{ formatNumber(article.view_count) }} views</span>
                </div>
                <h3>
                  <a :href="articlePath(article)" @click.prevent="emit('go', articlePath(article))">{{ article.title }}</a>
                </h3>
                <p>{{ article.excerpt || '这篇文章还没有摘要。' }}</p>
              </div>
              <a class="icon-btn profile-icon-action" :href="articlePath(article)" @click.prevent="emit('go', articlePath(article))">
                <TsIcon name="eye" :size="16" />
                <span>阅读</span>
              </a>
            </article>
          </div>
        </section>

        <aside class="profile-side-stack">
          <section class="profile-side-card">
            <div class="profile-side-title">
              <h2>创作索引</h2>
              <TsIcon name="grid" :size="20" />
            </div>
            <div class="profile-side-metrics">
              <div>
                <span>公开文章</span>
                <strong>{{ formatNumber(profileStats.articles) }}</strong>
              </div>
              <div>
                <span>累计阅读</span>
                <strong>{{ formatNumber(profileStats.totalViews) }}</strong>
              </div>
            </div>
            <div class="profile-topic-list">
              <button v-for="category in profileCategoryChips" :key="category" type="button">{{ category }}</button>
              <span v-if="!profileCategoryChips.length">还没有可展示的文章分类</span>
            </div>
          </section>

          <section v-if="latestArticle" class="profile-side-card profile-latest-card">
            <span>Latest</span>
            <h2>{{ latestArticle.title }}</h2>
            <p>{{ latestArticle.excerpt || '最近公开的文章。' }}</p>
            <a class="ghost-btn profile-icon-action" :href="articlePath(latestArticle)" @click.prevent="emit('go', articlePath(latestArticle))">
              <TsIcon name="external" :size="16" />
              <span>查看最新文章</span>
            </a>
          </section>
        </aside>
      </div>
    </template>
  </main>
</template>
