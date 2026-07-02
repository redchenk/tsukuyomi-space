<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch, authFetch, authHeaders, getSession, parseResponse } from '../api/client';
import SocialText from '../components/SocialText.vue';
import { renderBilibiliEmbed, renderIframeEmbed, renderMarkdown, renderMediaCard, sanitizeRenderedHtml } from '../utils/markdown';
import { applySeo, articleSeo } from '../utils/seo';
import { formatDateTime } from '../utils/time';

const props = defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();
const article = ref(null);
const comments = ref([]);
const loading = ref(true);
const message = ref('');
const commentText = ref('');
const replyText = reactive({});
const openReplies = reactive({});
const session = ref(getSession());
const bookmark = reactive({
  loading: false,
  ready: false,
  bookmarked: false,
  count: 0
});

const articleId = computed(() => String(route.query.id || route.params.id || ''));
const articlePath = computed(() => {
  if (!article.value?.id) return `/article?id=${encodeURIComponent(articleId.value)}`;
  return `/articles/${encodeURIComponent(article.value.id)}${article.value.slug ? `/${encodeURIComponent(article.value.slug)}` : ''}`;
});
const articleBackPath = computed(() => normalizeStageReturnPath(route.query.from));
const topComments = computed(() => comments.value.filter((item) => !item.parent_id));
const bookmarkLabel = computed(() => {
  const count = bookmark.count ? ` ${Number(bookmark.count).toLocaleString('zh-CN')}` : '';
  return bookmark.bookmarked ? `已收藏${count}` : `收藏${count}`;
});

function formatDate(value) {
  return formatDateTime(value, 'zh-CN');
}

function queryValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function normalizeStageReturnPath(value) {
  let raw = String(queryValue(value)).trim();
  if (!raw) return '/stage';
  try {
    raw = decodeURIComponent(raw);
  } catch (_) {
    // Vue Router usually decodes query values already.
  }
  if (!raw.startsWith('/stage')) return '/stage';

  try {
    const url = new URL(raw, 'https://yachiyo.hk');
    if (url.pathname !== '/stage') return '/stage';

    const params = new URLSearchParams();
    const page = Number(url.searchParams.get('page'));
    if (Number.isFinite(page) && page > 1) params.set('page', String(Math.trunc(page)));

    const category = String(url.searchParams.get('category') || '').slice(0, 40);
    if (category) params.set('category', category);

    const search = String(url.searchParams.get('q') || '').slice(0, 120);
    if (search) params.set('q', search);

    const query = params.toString();
    return query ? `/stage?${query}` : '/stage';
  } catch (_) {
    return '/stage';
  }
}

function goBackToStage() {
  emit('go', articleBackPath.value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeMediaUrl(value) {
  return /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(String(value || '').trim());
}

function renderBlockContent(content) {
  try {
    const blocks = JSON.parse(String(content || '[]'));
    if (!Array.isArray(blocks)) return renderMarkdown(content);
    return sanitizeRenderedHtml(blocks.map((block) => {
      if (block?.type === 'heading') return `<h2>${escapeHtml(block.text || '')}</h2>`;
      if (block?.type === 'image' && isSafeMediaUrl(block.url)) return `<figure class="markdown-image"><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || '')}" loading="lazy"></figure>`;
      if (block?.type === 'bilibili') return renderBilibiliEmbed(block.bvid || block.url || block.aid, block.title || 'Bilibili video');
      if (block?.type === 'video' && /bilibili\.com|BV[a-zA-Z0-9]+|av\d+/i.test(`${block.url || ''} ${block.bvid || ''} ${block.aid || ''}`)) return renderBilibiliEmbed(block.bvid || block.url || block.aid, block.title || 'Bilibili video');
      if (block?.type === 'iframe' && block.url) return renderIframeEmbed(block.url, block.title || 'Embedded content', block.height);
      if (block?.type === 'media' && block.url) return renderMediaCard(block.url, block.title, block.description);
      if (block?.type === 'video' && block.url) return renderMediaCard(block.url, block.title || 'Video', block.description || '');
      return `<p>${escapeHtml(block?.text || block?.content || '')}</p>`;
    }).join(''));
  } catch (_) {
    return renderMarkdown(content);
  }
}

function formatContent(content, format = 'markdown') {
  if (format === 'block') return renderBlockContent(content);
  if (format === 'html') return escapeHtml(content).replace(/\n/g, '<br>');
  return renderMarkdown(content);
}

function goProfile(username) {
  const value = String(username || '').trim();
  if (!value) return;
  emit('go', `/users/${encodeURIComponent(value)}`);
}

function goTopic(topic) {
  const value = String(topic || '').trim();
  if (!value) return;
  emit('go', `/plaza?topic=${encodeURIComponent(value)}`);
}

function commentAuthorName(item) {
  return item?.author || item?.username || '访客';
}

function commentInitial(item) {
  return String(commentAuthorName(item)).trim().slice(0, 1).toUpperCase();
}

function commentAvatarAlt(item) {
  return `${commentAuthorName(item)} avatar`;
}

async function loadArticle() {
  loading.value = true;
  message.value = '';
  article.value = null;

  if (!articleId.value) {
    message.value = '文章 ID 不存在';
    loading.value = false;
    return;
  }

  try {
    const response = await apiFetch(`/api/articles/${encodeURIComponent(articleId.value)}/live/${Date.now()}`, {
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success || !result.data) throw new Error(result.message || '文章不存在');
    article.value = result.data;
    applySeo(articleSeo(result.data, articlePath.value));
    await Promise.all([loadComments(), loadBookmarkStatus()]);
  } catch (error) {
    message.value = error.message || props.t.loadFailed || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadBookmarkStatus() {
  session.value = getSession();
  bookmark.ready = false;
  bookmark.bookmarked = false;
  bookmark.count = 0;
  if (!session.value || !articleId.value) return;

  bookmark.loading = true;
  try {
    const response = await authFetch(`/api/user/bookmarks/${encodeURIComponent(articleId.value)}/status`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (result.success) {
      bookmark.ready = true;
      bookmark.bookmarked = Boolean(result.data?.bookmarked);
      bookmark.count = Number(result.data?.count || 0);
    }
  } catch (_) {
    bookmark.ready = false;
  } finally {
    bookmark.loading = false;
  }
}

async function loadComments() {
  try {
    const response = await apiFetch(`/api/articles/${encodeURIComponent(articleId.value)}/messages`);
    const result = await parseResponse(response);
    comments.value = result.success && Array.isArray(result.data)
      ? result.data.filter((item) => String(item.article_id) === String(articleId.value))
      : [];
  } catch (_) {
    comments.value = [];
  }
}

function repliesFor(commentId) {
  return comments.value.filter((item) => item.parent_id === commentId);
}

function upsertComment(message) {
  if (!message?.id) return;
  const normalized = { ...message, article_id: message.article_id || articleId.value };
  const index = comments.value.findIndex((item) => item.id === normalized.id);
  if (index >= 0) comments.value.splice(index, 1, { ...comments.value[index], ...normalized });
  else comments.value.unshift(normalized);
}

function patchComment(message) {
  if (!message?.id) return;
  const index = comments.value.findIndex((item) => item.id === message.id);
  if (index >= 0) comments.value.splice(index, 1, { ...comments.value[index], ...message });
}

function requireLogin() {
  session.value = getSession();
  if (session.value) return true;
  emit('go', '/login');
  return false;
}

async function submitComment() {
  if (!requireLogin()) return;
  const content = commentText.value.trim();
  if (!content) {
    message.value = '评论内容不能为空';
    return;
  }

  const response = await authFetch('/api/messages', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content, article_id: articleId.value })
  });
  const result = await parseResponse(response);
  if (!result.success) {
    message.value = result.message || '发布失败';
    return;
  }
  commentText.value = '';
  message.value = result.message || '';
  if (result.data?.id && (result.data.status || 'approved') === 'approved') upsertComment(result.data);
}

async function submitReply(commentId) {
  if (!requireLogin()) return;
  const content = String(replyText[commentId] || '').trim();
  if (!content) {
    message.value = '回复内容不能为空';
    return;
  }

  const response = await authFetch(`/api/messages/${commentId}/reply`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content })
  });
  const result = await parseResponse(response);
  if (!result.success) {
    message.value = result.message || '回复失败';
    return;
  }
  replyText[commentId] = '';
  openReplies[commentId] = false;
  message.value = result.message || '';
  if (result.data?.id && (result.data.status || 'approved') === 'approved') upsertComment(result.data);
}

async function likeComment(commentId) {
  if (!requireLogin()) return;
  if (localStorage.getItem(`liked_${commentId}`) === '1') {
    message.value = '已经点过赞了';
    return;
  }

  const response = await authFetch(`/api/messages/${commentId}/like`, {
    method: 'POST',
    headers: authHeaders()
  });
  const result = await parseResponse(response);
  if (!result.success) {
    message.value = result.message || '点赞失败';
    return;
  }
  localStorage.setItem(`liked_${commentId}`, '1');
  if (result.data?.id) patchComment(result.data);
  else {
    const target = comments.value.find((item) => item.id === commentId);
    if (target) target.like_count = Number(target.like_count || 0) + 1;
  }
  message.value = '';
}

async function toggleBookmark() {
  if (!requireLogin()) return;
  bookmark.loading = true;
  try {
    const response = await authFetch(`/api/user/bookmarks/${encodeURIComponent(articleId.value)}`, {
      method: bookmark.bookmarked ? 'DELETE' : 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '操作失败');
    bookmark.ready = true;
    bookmark.bookmarked = Boolean(result.data?.bookmarked);
    bookmark.count = Number(result.data?.count || 0);
    message.value = result.message || '';
  } catch (error) {
    message.value = error.message || '操作失败';
  } finally {
    bookmark.loading = false;
  }
}

onMounted(loadArticle);
watch(articleId, loadArticle);
</script>

<template>
  <main class="page article-page">
    <div class="article-shell">
      <a class="ghost-btn article-back" :href="articleBackPath" @click.prevent="goBackToStage">返回主舞台</a>

      <div v-if="loading" class="article-status">{{ t.loading }}</div>
      <div v-else-if="message && !article" class="article-status">{{ message }}</div>

      <article v-else-if="article" class="article-reader">
        <header class="article-hero">
          <div class="article-kicker">{{ article.category || '未分类' }}</div>
          <h1>{{ article.title }}</h1>
          <div class="article-meta">
            <span>{{ formatDate(article.publish_date || article.created_at) }}</span>
            <a
              class="article-author-link"
              :href="`/users/${encodeURIComponent(article.author_username || 'admin')}`"
              @click.prevent="goProfile(article.author_username || 'admin')"
            >{{ article.author_username || 'admin' }}</a>
            <span>{{ article.read_time || '5 min' }}</span>
            <span>{{ Number(article.view_count || 0).toLocaleString('zh-CN') }} views</span>
          </div>
          <div class="article-social-actions">
            <button
              class="icon-btn"
              :class="{ liked: bookmark.bookmarked }"
              type="button"
              :disabled="bookmark.loading"
              @click="toggleBookmark"
            >
              {{ bookmarkLabel }}
            </button>
          </div>
        </header>

        <img v-if="article.cover_image" class="article-cover" :src="article.cover_image" alt="">
        <section class="article-content" v-html="formatContent(article.content, article.content_format)"></section>

        <section class="comments-section">
          <div class="comments-head">
            <h2>评论</h2>
            <span>{{ comments.length }}</span>
          </div>

          <div v-if="message" class="form-message error">{{ message }}</div>

          <div v-if="session" class="comment-form">
            <textarea v-model="commentText" class="comment-input" placeholder="写下你的评论..."></textarea>
            <div class="comment-actions">
              <button class="primary-btn" type="button" @click="submitComment">发布评论</button>
            </div>
          </div>
          <div v-else class="comment-login">
            <span>登录后可以发表评论和回复。</span>
            <a class="ghost-btn" href="/login" @click.prevent="$emit('go', '/login')">去登录</a>
          </div>

          <div v-if="!topComments.length" class="article-empty">暂无评论，快来发布第一条吧。</div>
          <div v-else class="comment-list">
            <article v-for="comment in topComments" :id="'comment-' + comment.id" :key="comment.id" class="comment-item">
              <div class="comment-header">
                <button class="comment-author-link" type="button" @click="goProfile(commentAuthorName(comment))">
                  <span class="comment-avatar">
                    <img v-if="comment.avatar" :src="comment.avatar" :alt="commentAvatarAlt(comment)">
                    <span v-else>{{ commentInitial(comment) }}</span>
                  </span>
                  <span class="comment-author-name">{{ commentAuthorName(comment) }}</span>
                </button>
                <span class="comment-time">{{ formatDate(comment.created_at) }}</span>
              </div>
              <SocialText class="comment-content" :content="comment.content" @mention="goProfile" @topic="goTopic" />
              <div class="comment-tools">
                <button class="icon-btn" type="button" @click="likeComment(comment.id)">喜欢 {{ comment.like_count || 0 }}</button>
                <button class="icon-btn" type="button" @click="openReplies[comment.id] = !openReplies[comment.id]">回复</button>
              </div>

              <div v-if="openReplies[comment.id]" class="reply-form">
                <textarea v-model="replyText[comment.id]" class="comment-input" placeholder="写下回复..."></textarea>
                <div class="comment-actions">
                  <button class="primary-btn" type="button" @click="submitReply(comment.id)">发布回复</button>
                </div>
              </div>

              <div v-if="repliesFor(comment.id).length" class="reply-list">
                <div v-for="reply in repliesFor(comment.id)" :id="'comment-' + reply.id" :key="reply.id" class="comment-item reply-item">
                  <div class="comment-header">
                    <button class="comment-author-link" type="button" @click="goProfile(commentAuthorName(reply))">
                      <span class="comment-avatar small">
                        <img v-if="reply.avatar" :src="reply.avatar" :alt="commentAvatarAlt(reply)">
                        <span v-else>{{ commentInitial(reply) }}</span>
                      </span>
                      <span class="comment-author-name">{{ commentAuthorName(reply) }}</span>
                    </button>
                    <span class="comment-time">{{ formatDate(reply.created_at) }}</span>
                  </div>
                  <SocialText class="comment-content" :content="reply.content" @mention="goProfile" @topic="goTopic" />
                </div>
              </div>
            </article>
          </div>
        </section>
      </article>
    </div>
  </main>
</template>
