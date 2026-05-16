<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { authHeaders, getSession, parseResponse } from '../api/client';
import { renderMarkdown } from '../utils/markdown';
import { applySeo, articleSeo } from '../utils/seo';

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

const articleId = computed(() => String(route.query.id || route.params.id || ''));
const topComments = computed(() => comments.value.filter((item) => !item.parent_id));

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
}

function formatContent(content) {
  return renderMarkdown(content);
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
    const response = await fetch(`/api/articles/${encodeURIComponent(articleId.value)}`);
    const result = await parseResponse(response);
    if (!result.success || !result.data) throw new Error(result.message || '文章不存在');
    article.value = result.data;
    applySeo(articleSeo(result.data, `/article?id=${encodeURIComponent(articleId.value)}`));
    await loadComments();
  } catch (error) {
    message.value = error.message || props.t.loadFailed || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadComments() {
  try {
    const response = await fetch(`/api/messages?article_id=${encodeURIComponent(articleId.value)}`);
    const result = await parseResponse(response);
    comments.value = result.success && Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    comments.value = [];
  }
}

function repliesFor(commentId) {
  return comments.value.filter((item) => item.parent_id === commentId);
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

  const response = await fetch('/api/messages', {
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
  message.value = '';
  await loadComments();
}

async function submitReply(commentId) {
  if (!requireLogin()) return;
  const content = String(replyText[commentId] || '').trim();
  if (!content) {
    message.value = '回复内容不能为空';
    return;
  }

  const response = await fetch(`/api/messages/${commentId}/reply`, {
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
  message.value = '';
  await loadComments();
}

async function likeComment(commentId) {
  if (!requireLogin()) return;
  if (localStorage.getItem(`liked_${commentId}`) === '1') {
    message.value = '已经点过赞了';
    return;
  }

  const response = await fetch(`/api/messages/${commentId}/like`, {
    method: 'POST',
    headers: authHeaders()
  });
  const result = await parseResponse(response);
  if (!result.success) {
    message.value = result.message || '点赞失败';
    return;
  }
  localStorage.setItem(`liked_${commentId}`, '1');
  message.value = '';
  await loadComments();
}

onMounted(loadArticle);
watch(articleId, loadArticle);
</script>

<template>
  <main class="page article-page">
    <div class="article-shell">
      <a class="ghost-btn article-back" href="/stage" @click.prevent="$emit('go', '/stage')">返回主舞台</a>

      <div v-if="loading" class="article-status">{{ t.loading }}</div>
      <div v-else-if="message && !article" class="article-status">{{ message }}</div>

      <article v-else-if="article" class="article-reader">
        <header class="article-hero">
          <div class="article-kicker">{{ article.category || '未分类' }}</div>
          <h1>{{ article.title }}</h1>
          <div class="article-meta">
            <span>{{ formatDate(article.publish_date || article.created_at) }}</span>
            <span>{{ article.author_username || 'admin' }}</span>
            <span>{{ article.read_time || '5 min' }}</span>
            <span>{{ Number(article.view_count || 0).toLocaleString('zh-CN') }} views</span>
          </div>
        </header>

        <img v-if="article.cover_image" class="article-cover" :src="article.cover_image" alt="">
        <section class="article-content" v-html="formatContent(article.content)"></section>

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
            <article v-for="comment in topComments" :key="comment.id" class="comment-item">
              <div class="comment-header">
                <strong>{{ comment.author || comment.username || '访客' }}</strong>
                <span>{{ formatDate(comment.created_at) }}</span>
              </div>
              <p>{{ comment.content }}</p>
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
                <div v-for="reply in repliesFor(comment.id)" :key="reply.id" class="comment-item reply-item">
                  <div class="comment-header">
                    <strong>{{ reply.author || reply.username || '访客' }}</strong>
                    <span>{{ formatDate(reply.created_at) }}</span>
                  </div>
                  <p>{{ reply.content }}</p>
                </div>
              </div>
            </article>
          </div>
        </section>
      </article>
    </div>
  </main>
</template>
