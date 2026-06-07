<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
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

const username = computed(() => String(route.params.username || '').trim());
const locale = computed(() => props.lang === 'zh' ? 'zh-CN' : 'ja-JP');
const isAuthed = computed(() => Boolean(session.value || props.user));
const profileUser = computed(() => profile.value?.user || null);
const profileStats = computed(() => profile.value?.stats || {});
const viewer = computed(() => profile.value?.viewer || {});
const profileArticles = computed(() => Array.isArray(profile.value?.articles) ? profile.value.articles : []);

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

async function loadProfile() {
  if (!username.value) {
    message.value = '\u7528\u6237\u4e0d\u5b58\u5728';
    loading.value = false;
    return;
  }

  loading.value = true;
  message.value = '';
  session.value = getSession();
  try {
    const response = await authFetch(noStoreUrl(`/api/user/public/${encodeURIComponent(username.value)}`), {
      headers: authHeaders({ Accept: 'application/json' }),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '\u7528\u6237\u4e3b\u9875\u8bfb\u53d6\u5931\u8d25');
    profile.value = result.data;
  } catch (error) {
    profile.value = null;
    message.value = error.message || '\u7528\u6237\u4e3b\u9875\u8bfb\u53d6\u5931\u8d25';
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
  <main class="page user-profile-page">
    <div v-if="loading" class="user-profile-status panel">Loading...</div>
    <div v-else-if="message && !profile" class="user-profile-status panel">{{ message }}</div>

    <template v-else-if="profile">
      <section class="profile-hero">
        <div class="profile-avatar">
          <img :src="avatarSrc(profileUser)" :alt="profileUser?.username || ''">
        </div>
        <div class="profile-main">
          <div class="profile-kicker">User Profile</div>
          <h1>{{ profileUser?.username }}</h1>
          <p>{{ profileUser?.bio || '\u8fd9\u4f4d\u521b\u4f5c\u8005\u8fd8\u6ca1\u6709\u5199\u4e0b\u4e2a\u4eba\u7b80\u4ecb\u3002' }}</p>
          <div class="profile-meta">
            <span>{{ profileUser?.role || 'user' }}</span>
            <span>{{ formatDate(profileUser?.created_at) }}</span>
          </div>
        </div>
        <div class="profile-actions">
          <button
            v-if="!viewer.isSelf"
            class="primary-btn"
            type="button"
            :disabled="followLoading"
            @click="toggleFollow"
          >
            {{ viewer.isFollowing ? '\u53d6\u6d88\u5173\u6ce8' : '\u5173\u6ce8\u4f5c\u8005' }}
          </button>
          <a v-else class="primary-btn" href="/user-center" @click.prevent="emit('go', '/user-center')">编辑个人资料</a>
          <a class="ghost-btn" href="/stage" @click.prevent="emit('go', '/stage')">回到主舞台</a>
        </div>
      </section>

      <section class="profile-stats">
        <div class="profile-stat"><span>文章</span><strong>{{ formatNumber(profileStats.articles) }}</strong></div>
        <div class="profile-stat"><span>阅读</span><strong>{{ formatNumber(profileStats.totalViews) }}</strong></div>
        <div class="profile-stat"><span>关注者</span><strong>{{ formatNumber(profileStats.followers) }}</strong></div>
        <div class="profile-stat"><span>正在关注</span><strong>{{ formatNumber(profileStats.following) }}</strong></div>
      </section>

      <section class="panel profile-articles">
        <div class="profile-section-head">
          <h2>公开文章</h2>
          <span>{{ formatNumber(profileArticles.length) }}</span>
        </div>
        <div v-if="message" class="form-message error">{{ message }}</div>
        <div v-if="!profileArticles.length" class="profile-empty">暂无公开文章。</div>
        <div v-else class="profile-article-list">
          <article v-for="article in profileArticles" :key="article.id" class="profile-article">
            <div>
              <div class="profile-article-meta">
                <span>{{ article.category || '\u672a\u5206\u7c7b' }}</span>
                <span>{{ formatDate(article.publish_date || article.created_at) }}</span>
                <span>{{ formatNumber(article.view_count) }} views</span>
              </div>
              <h3>{{ article.title }}</h3>
              <p>{{ article.excerpt }}</p>
            </div>
            <a class="icon-btn" :href="articlePath(article)" @click.prevent="emit('go', articlePath(article))">阅读</a>
          </article>
        </div>
      </section>
    </template>
  </main>
</template>
