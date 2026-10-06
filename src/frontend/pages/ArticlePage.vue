<script setup>
import { nameInitial } from '../utils/userName.mjs';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useQualifiedArticleRead } from '../composables/useQualifiedArticleRead';
import { useArticleReading } from '../composables/useArticleReading';
import { readingTimeLabel } from '../utils/reading';
import { useRoute } from 'vue-router';
import { apiFetch, authFetch, authHeaders, getSession, parseResponse } from '../api/client';
import SocialShareDialog from '../components/SocialShareDialog.vue';
import SocialText from '../components/SocialText.vue';
import ModerationNotice from '../components/ModerationNotice.vue';
import PlazaReplyForm from '../components/PlazaReplyForm.vue';
import ReplyRecipient from '../components/ReplyRecipient.vue';
import { messageThreads, replyCopy } from '../services/messageThreads.mjs';
import TsIcon from '../components/TsIcon.vue';
import UserLevelBadge from '../components/UserLevelBadge.vue';
import { useUserLevels } from '../composables/useUserLevels';
import { applyMessageLikeState } from '../services/messageLikes';
import { renderBilibiliEmbed, renderIframeEmbed, renderMarkdown, renderMediaCard, sanitizeRenderedHtml } from '../utils/markdown';
import { handleMarkdownClick } from '../utils/markdownActions';
import { applySeo, articleSeo } from '../utils/seo';
import { formatDateMinute, formatDateTime } from '../utils/time';

const props = defineProps({
  lang: { type: String, default: 'zh' },
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();
const article = ref(null);
const readingReceipt = ref(null);
useQualifiedArticleRead(article, readingReceipt);
let articleLoadRevision = 0;
let articleRequests;
const articleContentRef = ref(null);
const renderedContent = computed(() => article.value ? formatContent(article.value.content, article.value.content_format) : '');
const { headings, activeHeading, progress, plainText, tocOpen, goToHeading } = useArticleReading(articleContentRef, renderedContent);
// Scrolling updates progress, not the text used to calculate reading time.
const articleReadingTime = computed(() => readingTimeLabel(article.value, props.lang, plainText.value));
const readerCopy = computed(() => ({
  zh: { back: '返回主舞台', toc: '文章目录', share: '分享', views: '次阅读', category: '未分类', bookmark: '收藏', saved: '已收藏', like: '点赞', liked: '已点赞', comments: '评论' },
  ja: { back: 'ステージに戻る', toc: '目次', share: 'シェア', views: '回閲覧', category: '未分類', bookmark: '保存', saved: '保存済み', like: 'いいね', liked: 'いいね済み', comments: 'コメント' },
  en: { back: 'Back to the Stage', toc: 'On this page', share: 'Share', views: 'views', category: 'Uncategorized', bookmark: 'Bookmark', saved: 'Bookmarked', like: 'Like', liked: 'Liked', comments: 'Comments' }
}[props.lang]));
const comments = ref([]);
const commentsLoading = ref(false);
const commentsError = ref(false);
const loading = ref(true);
const message = ref('');
const messageType = ref('error');
const commentText = ref('');
const openReplies = reactive({});
const expandedReplies = reactive({});
const commentModeration = ref(null);
const replyModeration = reactive({});
const session = ref(getSession());
const articleShareOpen = ref(false);
const articleLike = reactive({ loading: false, liked: false, count: 0 });
const bookmark = reactive({
  loading: false,
  ready: false,
  bookmarked: false,
  count: 0
});
const { hydrateUserLevels, userLevel } = useUserLevels();

const articleId = computed(() => String(route.query.id || route.params.id || ''));
const articlePath = computed(() => {
  if (!article.value?.id) return `/article?id=${encodeURIComponent(articleId.value)}`;
  return `/articles/${encodeURIComponent(article.value.id)}${article.value.slug ? `/${encodeURIComponent(article.value.slug)}` : ''}`;
});
const articleBackPath = computed(() => normalizeStageReturnPath(route.query.from));
const threads = computed(() => messageThreads(comments.value));
const topComments = computed(() => threads.value.top);
const replyLabels = computed(() => replyCopy(props.lang));
const bookmarkLabel = computed(() => {
  const count = bookmark.count ? ` ${Number(bookmark.count).toLocaleString('zh-CN')}` : '';
  return `${bookmark.bookmarked ? readerCopy.value.saved : readerCopy.value.bookmark}${count}`;
});

function formatDate(value) {
  return formatDateTime(value, 'zh-CN');
}

function formatPublishedDate(value) {
  return formatDateMinute(value, 'zh-CN');
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
    if (['featured', 'latest', 'daily'].includes(url.searchParams.get('sort'))) params.set('sort', url.searchParams.get('sort'));
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

function absoluteUrl(value) {
  try {
    return new URL(String(value || ''), location.origin).href;
  } catch (_) {
    return location.href;
  }
}

function openArticleShare() {
  if (!article.value) return;
  articleShareOpen.value = true;
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
    if (!Array.isArray(blocks)) return renderMarkdown(content, { lang: props.lang });
    return sanitizeRenderedHtml(blocks.map((block) => {
      if (block?.type === 'heading') return `<h2>${escapeHtml(block.text || '')}</h2>`;
      if (block?.type === 'image' && isSafeMediaUrl(block.url)) return `<figure class="markdown-image"><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || '')}" loading="lazy" decoding="async" data-image-bloom></figure>`;
      if (block?.type === 'bilibili') return renderBilibiliEmbed(block.bvid || block.url || block.aid, block.title || 'Bilibili video');
      if (block?.type === 'video' && /bilibili\.com|BV[a-zA-Z0-9]+|av\d+/i.test(`${block.url || ''} ${block.bvid || ''} ${block.aid || ''}`)) return renderBilibiliEmbed(block.bvid || block.url || block.aid, block.title || 'Bilibili video');
      if (block?.type === 'iframe' && block.url) return renderIframeEmbed(block.url, block.title || 'Embedded content', block.height);
      if (block?.type === 'media' && block.url) return renderMediaCard(block.url, block.title, block.description);
      if (block?.type === 'video' && block.url) return renderMediaCard(block.url, block.title || 'Video', block.description || '');
      return `<p>${escapeHtml(block?.text || block?.content || '')}</p>`;
    }).join(''));
  } catch (_) {
    return renderMarkdown(content, { lang: props.lang });
  }
}

function formatContent(content, format = 'markdown') {
  if (format === 'block') return renderBlockContent(content);
  if (format === 'html') return escapeHtml(content).replace(/\n/g, '<br>');
  return renderMarkdown(content, { lang: props.lang });
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
  return item?.author_nickname || item?.author || item?.username || '访客';
}

function commentInitial(item) {
  return nameInitial(commentAuthorName(item));
}

function commentAvatarAlt(item) {
  return `${commentAuthorName(item)} avatar`;
}

function showMessage(text, type = 'error') {
  message.value = text || '';
  messageType.value = type;
}

async function loadArticle() {
  const revision = ++articleLoadRevision;
  articleRequests?.abort();
  articleRequests = new AbortController();
  const context = { revision, id: articleId.value, signal: articleRequests.signal };
  readingReceipt.value = null;
  comments.value = [];
  commentsLoading.value = false;
  commentsError.value = false;
  commentModeration.value = null;
  Object.keys(replyModeration).forEach(key => delete replyModeration[key]);
  Object.keys(expandedReplies).forEach(key => delete expandedReplies[key]);
  Object.keys(openReplies).forEach(key => delete openReplies[key]);
  loading.value = true;
  showMessage('');
  article.value = null;

  if (!articleId.value) {
    showMessage('文章 ID 不存在');
    loading.value = false;
    return;
  }

  try {
    const response = await authFetch(`/api/articles/${encodeURIComponent(articleId.value)}/live/${Date.now()}`, {
      cache: 'no-store', signal: context.signal
    });
    const result = await parseResponse(response);
    if (revision !== articleLoadRevision) return;
    if (!result.success || !result.data) throw new Error(result.message || '文章不存在');
    article.value = result.data;
    readingReceipt.value = result.reading || null;
    applySeo(articleSeo(result.data, articlePath.value));
    // Publish the body immediately. Slow or unavailable secondary services must
    // not gate reading, and each result belongs to this navigation revision.
    loading.value = false;
    void loadComments(context);
    void loadBookmarkStatus(context);
    void loadArticleLikeStatus(context);
    void hydrateUserLevels([result.data.author_id]).catch(() => {});
  } catch (error) {
    if (revision !== articleLoadRevision) return;
    showMessage(error.message || props.t.loadFailed || '加载失败');
  } finally {
    if (revision === articleLoadRevision) loading.value = false;
  }
}

function isCurrentArticle(context) {
  return context.revision === articleLoadRevision && context.id === articleId.value && !context.signal?.aborted;
}

async function loadBookmarkStatus(context) {
  session.value = getSession();
  bookmark.ready = false;
  bookmark.bookmarked = false;
  bookmark.loading = false;
  bookmark.count = Number(article.value?.bookmark_count || 0);
  if (!session.value || !articleId.value) return;

  bookmark.loading = true;
  try {
    const response = await authFetch(`/api/user/bookmarks/${encodeURIComponent(context.id)}/status`, {
      headers: authHeaders(),
      cache: 'no-store', signal: context.signal
    });
    const result = await parseResponse(response);
    if (isCurrentArticle(context) && result.success) {
      bookmark.ready = true;
      bookmark.bookmarked = Boolean(result.data?.bookmarked);
      bookmark.count = Number(result.data?.count || 0);
    }
  } catch (_) {
    if (isCurrentArticle(context)) bookmark.ready = false;
  } finally {
    if (isCurrentArticle(context)) bookmark.loading = false;
  }
}

async function loadArticleLikeStatus(context) {
  const id = context.id;
  articleLike.liked = false;
  articleLike.count = Number(article.value?.like_count || 0);
  articleLike.loading = false;
  if (!getSession() || !id) return;
  articleLike.loading = true;
  try {
    const response = await authFetch(`/api/user/article-likes/${encodeURIComponent(id)}/status`, { headers: authHeaders(), cache: 'no-store', signal: context.signal });
    const result = await parseResponse(response);
    if (isCurrentArticle(context) && result.success) {
      articleLike.liked = Boolean(result.data?.liked);
      articleLike.count = Number(result.data?.count || 0);
    }
  } catch (_) {
    // The public count remains visible when the private status cannot be read.
  } finally {
    if (isCurrentArticle(context)) articleLike.loading = false;
  }
}

async function toggleArticleLike() {
  if (articleLike.loading || !requireLogin()) return;
  const id = articleId.value;
  articleLike.loading = true;
  try {
    const response = await authFetch(`/api/user/article-likes/${encodeURIComponent(id)}`, {
      method: articleLike.liked ? 'DELETE' : 'POST', headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.loadFailed);
    if (id !== articleId.value) return;
    articleLike.liked = Boolean(result.data?.liked);
    articleLike.count = Number(result.data?.count || 0);
    showMessage('');
  } catch (error) {
    if (id === articleId.value) showMessage(error.message || props.t.loadFailed);
  } finally {
    if (id === articleId.value) articleLike.loading = false;
  }
}

async function loadComments(context = { revision: articleLoadRevision, id: articleId.value, signal: articleRequests?.signal }) {
  commentsLoading.value = true;
  commentsError.value = false;
  try {
    const response = await apiFetch(`/api/articles/${encodeURIComponent(context.id)}/messages`, { signal: context.signal });
    const result = await parseResponse(response);
    if (!isCurrentArticle(context)) return;
    if (!result.success || !Array.isArray(result.data)) throw new Error('comments_unavailable');
    const loaded = result.data.filter((item) => String(item.article_id) === context.id);
    comments.value = loaded;
    void hydrateUserLevels(loaded.map(item => item.user_id)).catch(() => {});
    // Mutate only the captured list; an old like request cannot affect a new article.
    if (session.value) void applyMessageLikeState(comments.value).catch(() => {});
  } catch (_) {
    if (isCurrentArticle(context)) commentsError.value = true;
  } finally {
    if (isCurrentArticle(context)) {
      commentsLoading.value = false;
      await revealCommentHash();
    }
  }
}

function repliesFor(commentId) {
  return [...(threads.value.replies.get(String(commentId)) || [])].sort((a, b) => Number(b.id) - Number(a.id));
}

function visibleReplies(commentId) {
  const replies = repliesFor(commentId);
  return expandedReplies[commentId] ? replies : replies.slice(0, 1);
}

function repliesToggleLabel(commentId) {
  const count = repliesFor(commentId).length;
  if (props.lang === 'en') return expandedReplies[commentId] ? 'Collapse replies' : `Show all ${count} replies`;
  if (props.lang === 'ja') return expandedReplies[commentId] ? '返信を折りたたむ' : `${count} 件の返信をすべて表示`;
  return expandedReplies[commentId] ? '收起回复' : `展开全部 ${count} 条回复`;
}

async function revealCommentHash() {
  const match = String(route.hash || '').match(/^#comment-(\d+)$/);
  if (!match || loading.value || commentsLoading.value) return;
  await revealComment(match[1]);
}

async function revealComment(id) {
  const root = threads.value.rootId(id);
  if (!root) return;
  if (root !== String(id)) expandedReplies[root] = true;
  await nextTick();
  document.getElementById(`comment-${id}`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
}

function upsertComment(message) {
  if (!message?.id) return;
  const normalized = { ...message, article_id: message.article_id || articleId.value };
  const index = comments.value.findIndex((item) => item.id === normalized.id);
  if (index >= 0) comments.value.splice(index, 1, { ...comments.value[index], ...normalized });
  else comments.value.unshift(normalized);
  if (normalized.user_id) hydrateUserLevels([normalized.user_id]).catch(() => {});
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
  commentModeration.value = null;
  if (!requireLogin()) return;
  const content = commentText.value.trim();
  if (!content) {
    showMessage('评论内容不能为空');
    return;
  }

  try {
    const response = await authFetch('/api/messages', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content, article_id: articleId.value })
    });
    const result = await parseResponse(response);
    commentModeration.value = result.moderation || null;
    if (!result.success) throw new Error(result.message || '发布失败');
    commentText.value = '';
    showMessage(result.moderation?.status === 'pending' ? '评论已提交，等待人工审核。' : result.message || '评论已提交', 'success');
    if (result.data?.id && (result.data.status || 'approved') === 'approved') upsertComment(result.data);
  } catch (error) {
    showMessage(error.message || '发布失败');
  }
}

async function submitReply(commentId, text) {
  replyModeration[commentId] = null;
  if (!requireLogin()) return false;
  const content = String(text || '').trim();
  if (!content) {
    showMessage('回复内容不能为空');
    return false;
  }

  try {
    const response = await authFetch(`/api/messages/${commentId}/reply`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content })
    });
    const result = await parseResponse(response);
    replyModeration[commentId] = result.moderation || null;
    if (!result.success) throw new Error(result.message || '回复失败');
    openReplies[commentId] = false;
    showMessage(result.moderation?.status === 'pending' ? '回复已提交，等待人工审核。' : result.message || '回复已提交', 'success');
    if (result.data?.id && (result.data.status || 'approved') === 'approved') upsertComment(result.data);
    return true;
  } catch (error) {
    showMessage(error.message || '回复失败');
    return false;
  }
}

async function likeComment(commentId) {
  if (!requireLogin()) return;
  if (isCommentLiked(commentId)) {
    showMessage('已经点过赞了');
    return;
  }

  try {
    const response = await authFetch(`/api/messages/${commentId}/like`, {
      method: 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || '点赞失败');
    if (result.data?.id) patchComment(result.data);
    else {
      const target = comments.value.find((item) => item.id === commentId);
      if (target) target.like_count = Number(target.like_count || 0) + 1;
    }
    showMessage('');
  } catch (error) {
    showMessage(error.message || '点赞失败');
  }
}

function isCommentLiked(commentId) {
  return Boolean(comments.value.find((item) => item.id === commentId)?.viewer_liked);
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
    showMessage(result.message || '', 'success');
  } catch (error) {
    showMessage(error.message || '操作失败');
  } finally {
    bookmark.loading = false;
  }
}

function toggleReply(id) {
  if (!requireLogin()) return;
  openReplies[id] = !openReplies[id];
}

function jumpToArticleTarget(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

onMounted(loadArticle);
onBeforeUnmount(() => {
  articleLoadRevision += 1;
  articleRequests?.abort();
});
watch(articleId, loadArticle);
watch(() => route.hash, revealCommentHash);
</script>

<template>
  <main id="article-top" tabindex="-1" class="page article-page" :aria-busy="loading">
    <div class="article-progress" :style="{ transform: `scaleX(${progress})` }" aria-hidden="true"></div>
    <div class="article-shell">
      <a class="ghost-btn article-back" :href="articleBackPath" @click.prevent="goBackToStage">
        <TsIcon name="arrowLeft" :size="17" />
        <span>{{ readerCopy.back }}</span>
      </a>

      <LoadingSkeleton v-if="loading" variant="article" :count="1" :label="t.loading" />
      <div v-else-if="message && !article" class="article-status error" role="alert">{{ message }}</div>

      <article v-else-if="article" class="article-reader">
        <header class="article-hero">
          <div class="article-kicker">{{ article.category || readerCopy.category }}</div>
          <h1>{{ article.title }}</h1>
          <div class="article-meta">
            <span>{{ formatPublishedDate(article.published_at || article.created_at || article.publish_date) }}</span>
            <a
              class="article-author-link"
              :href="`/users/${encodeURIComponent(article.author_username || 'admin')}`"
              @click.prevent="goProfile(article.author_username || 'admin')"
            >{{ article.author_nickname || article.author_username || 'admin' }}</a>
            <UserLevelBadge v-if="userLevel(article.author_id)" :level="userLevel(article.author_id)" :lang="lang" compact />
            <span>{{ articleReadingTime }}</span>
            <span>{{ Number(article.view_count || 0).toLocaleString('zh-CN') }} {{ readerCopy.views }}</span>
          </div>
          <section v-if="article.excerpt?.trim()" class="article-excerpt" :aria-label="t.editorFieldExcerpt">
            <h2>{{ t.editorFieldExcerpt }}</h2>
            <p>{{ article.excerpt }}</p>
          </section>
          <div class="article-social-actions">
            <button class="article-bookmark-btn article-like-btn" :class="{ liked: articleLike.liked }" type="button" :disabled="articleLike.loading" :aria-busy="articleLike.loading" :aria-pressed="articleLike.liked" @click="toggleArticleLike">
              <TsIcon :class="{ 'ts-status-loader-icon': articleLike.loading }" :name="articleLike.loading ? 'loader' : 'heart'" :size="17" />
              <span>{{ articleLike.liked ? readerCopy.liked : readerCopy.like }} {{ articleLike.count.toLocaleString(lang) }}</span>
            </button>
            <button class="article-bookmark-btn" type="button" @click="openArticleShare">
              <TsIcon name="external" :size="17" />
              <span>{{ readerCopy.share }}</span>
            </button>
            <button
              class="article-bookmark-btn"
              :class="{ liked: bookmark.bookmarked }"
              type="button"
              :disabled="bookmark.loading"
              :aria-busy="bookmark.loading"
              @click="toggleBookmark"
            >
              <TsIcon :class="{ 'ts-status-loader-icon': bookmark.loading }" :name="bookmark.loading ? 'loader' : 'bookmark'" :size="17" />
              <span>{{ bookmarkLabel }}</span>
              <span v-if="bookmark.loading" class="ts-visually-hidden" role="status">正在更新收藏状态</span>
            </button>
          </div>
        </header>

        <img v-if="article.cover_image" class="article-cover" :src="article.cover_image" alt="" loading="eager" decoding="async" fetchpriority="high" data-image-bloom>
        <div class="article-reading-layout" :class="{ 'has-toc': headings.length > 1 }">
          <aside v-if="headings.length > 1" class="article-toc">
            <details :open="tocOpen" @toggle="tocOpen = $event.target.open">
              <summary>{{ readerCopy.toc }}<TsIcon name="chevronDown" :size="16" /></summary>
              <nav :aria-label="readerCopy.toc">
                <a v-for="heading in headings" :key="heading.id" :href="`#${heading.id}`" :class="{ 'is-subheading': heading.level === 3 }" :aria-current="activeHeading === heading.id ? 'location' : undefined" @click.prevent="goToHeading(heading.id)">{{ heading.text }}</a>
              </nav>
            </details>
          </aside>
          <section ref="articleContentRef" class="article-content" @click="handleMarkdownClick" v-html="renderedContent"></section>
        </div>

        <section id="article-comments" tabindex="-1" class="comments-section" :aria-busy="commentsLoading">
          <div class="comments-head">
            <h2>{{ readerCopy.comments }}</h2>
            <span>{{ comments.length }}</span>
          </div>

          <div v-if="message" class="form-message" :class="messageType" :role="messageType === 'error' ? 'alert' : 'status'">{{ message }}</div>
          <ModerationNotice :feedback="commentModeration" />

          <div v-if="session" class="comment-form">
            <textarea v-model="commentText" class="comment-input" placeholder="写下你的评论..."></textarea>
            <div class="comment-actions">
              <button class="primary-btn" type="button" :disabled="commentsLoading" @click="submitComment">
                <TsIcon name="send" :size="17" />
                <span>发布评论</span>
              </button>
            </div>
          </div>
          <div v-else class="comment-login">
            <span>登录后可以发表评论和回复。</span>
            <a class="ghost-btn" href="/login" @click.prevent="$emit('go', '/login')">
              <TsIcon name="user" :size="17" />
              <span>去登录</span>
            </a>
          </div>

          <div v-if="commentsLoading && !topComments.length" class="article-empty" role="status">{{ t.loading }}</div>
          <div v-else-if="commentsError" class="article-empty" role="status">
            {{ t.loadFailed }} <button class="ghost-btn" type="button" @click="loadComments()">{{ lang === 'en' ? 'Retry' : lang === 'ja' ? '再試行' : '重试' }}</button>
          </div>
          <div v-else-if="!topComments.length" class="article-empty">暂无评论，快来发布第一条吧。</div>
          <div v-else class="comment-list">
            <article v-for="comment in topComments" :id="'comment-' + comment.id" :key="comment.id" class="comment-item">
              <div class="comment-header">
                <button class="comment-author-link" type="button" @click="goProfile(comment.author || comment.username)">
                  <span class="comment-avatar">
                    <img v-if="comment.avatar" :src="comment.avatar" :alt="commentAvatarAlt(comment)" loading="lazy" decoding="async">
                    <span v-else>{{ commentInitial(comment) }}</span>
                  </span>
                  <span class="comment-author-name">{{ commentAuthorName(comment) }}</span>
                  <UserLevelBadge v-if="userLevel(comment.user_id)" :level="userLevel(comment.user_id)" :lang="lang" compact :show-title="false" />
                </button>
                <span class="comment-time">{{ formatDate(comment.created_at) }}</span>
              </div>
              <SocialText class="comment-content" :content="comment.content" @mention="goProfile" @topic="goTopic" />
              <div class="comment-tools">
                <button
                  class="icon-btn comment-tool-btn like-btn"
                  :class="{ liked: isCommentLiked(comment.id) }"
                  :aria-pressed="isCommentLiked(comment.id)"
                  type="button"
                  @click="likeComment(comment.id)"
                >
                  <TsIcon name="heart" :size="16" />
                  <span>喜欢 {{ comment.like_count || 0 }}</span>
                </button>
                <button class="icon-btn comment-tool-btn" type="button" @click="toggleReply(comment.id)">
                  <TsIcon name="message" :size="16" />
                  <span>回复</span>
                </button>
              </div>

              <div v-if="openReplies[comment.id]" class="reply-form">
                <PlazaReplyForm :t="t" :lang="lang" :target="comment" :msg-id="comment.id" variant="article" :on-submit="submitReply" @cancel="toggleReply(comment.id)" />
              </div>

              <ModerationNotice :feedback="replyModeration[comment.id]" />
              <div v-if="repliesFor(comment.id).length" :id="'article-replies-' + comment.id" class="reply-list">
                <div v-for="reply in visibleReplies(comment.id)" :id="'comment-' + reply.id" :key="reply.id" class="comment-item reply-item">
                  <div class="comment-header">
                    <button class="comment-author-link" type="button" @click="goProfile(reply.author || reply.username)">
                      <span class="comment-avatar small">
                        <img v-if="reply.avatar" :src="reply.avatar" :alt="commentAvatarAlt(reply)" loading="lazy" decoding="async">
                        <span v-else>{{ commentInitial(reply) }}</span>
                      </span>
                      <span class="comment-author-name">{{ commentAuthorName(reply) }}</span>
                      <UserLevelBadge v-if="userLevel(reply.user_id)" :level="userLevel(reply.user_id)" :lang="lang" compact :show-title="false" />
                    </button>
                    <span class="comment-time">{{ formatDate(reply.created_at) }}</span>
                  </div>
                  <ReplyRecipient :target="threads.target(reply)" prefix="comment" :lang="lang" @navigate="revealComment" />
                  <SocialText class="comment-content" :content="reply.content" @mention="goProfile" @topic="goTopic" />
                  <div class="comment-tools">
                    <button class="icon-btn comment-tool-btn" type="button" :aria-label="`${replyLabels.to} ${commentAuthorName(reply)}`" @click="toggleReply(reply.id)"><TsIcon name="message" :size="16" /><span>{{ t.reply }}</span></button>
                  </div>
                  <div v-if="openReplies[reply.id]" class="reply-form">
                    <PlazaReplyForm :t="t" :lang="lang" :target="reply" :msg-id="reply.id" variant="article" :on-submit="submitReply" @cancel="toggleReply(reply.id)" />
                  </div>
                  <ModerationNotice :feedback="replyModeration[reply.id]" />
                </div>
              </div>
              <button v-if="repliesFor(comment.id).length > 1" class="ghost-btn article-replies-toggle" type="button"
                :aria-expanded="Boolean(expandedReplies[comment.id])" :aria-controls="'article-replies-' + comment.id"
                @click="expandedReplies[comment.id] = !expandedReplies[comment.id]">
                <TsIcon :name="expandedReplies[comment.id] ? 'chevronUp' : 'chevronDown'" :size="16" />
                <span>{{ repliesToggleLabel(comment.id) }}</span>
              </button>
            </article>
          </div>
        </section>
      </article>
    </div>
  </main>
  <Teleport to="body">
    <nav v-if="article && !loading" class="article-quick-nav" :aria-label="replyLabels.navigation">
      <button class="article-quick-button" type="button" :aria-label="replyLabels.comments" :title="replyLabels.comments" @click="jumpToArticleTarget('article-comments')"><TsIcon name="message" :size="19" /><span>{{ replyLabels.comments }}</span></button>
      <button class="article-quick-button" type="button" :aria-label="replyLabels.top" :title="replyLabels.top" @click="jumpToArticleTarget('article-top')"><TsIcon name="chevronUp" :size="20" /><span>{{ replyLabels.top }}</span></button>
    </nav>
  </Teleport>
  <SocialShareDialog
    :open="articleShareOpen"
    :title="article?.title || '月读空间文章'"
    :text="article?.excerpt || ''"
    :url="absoluteUrl(articlePath)"
    :image-url="absoluteUrl(article?.cover_image || '/assets/icons/icon-512.png')"
    @close="articleShareOpen = false"
  />
</template>
