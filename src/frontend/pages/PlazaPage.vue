<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch, authFetch, authHeaders, getSession, loadPublicStats, parseResponse } from '../api/client';
import PlazaComposer from '../components/PlazaComposer.vue';
import PlazaReplyForm from '../components/PlazaReplyForm.vue';
import SocialText from '../components/SocialText.vue';
import TsIcon from '../components/TsIcon.vue';
import { compareAppDate, formatDateTime, parseAppDate } from '../utils/time';

const props = defineProps({
  lang: { type: String, required: true },
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();
const session = ref(getSession());
const plaza = reactive({
  messages: [],
  stats: null,
  topics: [],
  topicsLoading: false,
  filter: 'latest',
  query: '',
  page: 1,
  loading: false,
  replyOpen: {}
});
const plazaToast = reactive({ text: '', visible: false });
let plazaToastTimer = 0;
const PLAZA_PAGE_SIZE = 8;

const user = computed(() => session.value?.user || null);
const isAuthed = computed(() => Boolean(session.value));
const isZh = computed(() => props.lang === 'zh');

const friends = computed(() => isZh.value ? [
  { name: '\u6708\u8bfb\u7a7a\u95f4\u5b98\u65b9', desc: '\u9879\u76ee\u4ed3\u5e93\u4e0e\u66f4\u65b0\u8bb0\u5f55', url: 'https://github.com/redchenk/tsukuyomi-space', avatar: '\u6708' },
  { name: '\u8f89\u591c\u59ec\u535a\u5ba2', desc: '\u6587\u7ae0\u3001\u516c\u544a\u4e0e\u521b\u4f5c\u624b\u8bb0', url: '/stage', avatar: '\u6587' },
  { name: '\u6708\u5149\u50cf\u7d20\u5de5\u574a', desc: '\u753b\u50cf\u7d20\u753b\u5e76\u5206\u4eab\u5230\u516c\u5f00\u753b\u5eca', url: '/arena/', avatar: '\u753b' },
  { name: '\u53cb\u94fe\u7533\u8bf7', desc: '\u7559\u4e0b\u7ad9\u70b9\u4fe1\u606f\u7b49\u5f85\u5ba1\u6838', url: '/terminal', avatar: '\u94fe' }
] : [
  { name: '\u6708\u8aad\u7a7a\u9593\u516c\u5f0f', desc: '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u30ea\u30dd\u30b8\u30c8\u30ea\u3068\u66f4\u65b0\u8a18\u9332', url: 'https://github.com/redchenk/tsukuyomi-space', avatar: '\u6708' },
  { name: '\u8f1d\u591c\u59eb\u30d6\u30ed\u30b0', desc: '\u8a18\u4e8b\u3001\u304a\u77e5\u3089\u305b\u3001\u5275\u4f5c\u30ce\u30fc\u30c8', url: '/stage', avatar: '\u6587' },
  { name: '\u6708\u5149\u30d4\u30af\u30bb\u30eb\u5de5\u623f', desc: '\u30d4\u30af\u30bb\u30eb\u30a2\u30fc\u30c8\u3092\u63cf\u3044\u3066\u5171\u6709\u30ae\u30e3\u30e9\u30ea\u30fc\u3078', url: '/arena/', avatar: '\u753b' },
  { name: '\u76f8\u4e92\u30ea\u30f3\u30af\u7533\u8acb', desc: '\u30b5\u30a4\u30c8\u60c5\u5831\u3092\u6b8b\u3057\u3066\u5be9\u67fb\u3092\u304a\u5f85\u3061\u304f\u3060\u3055\u3044', url: '/terminal', avatar: '\u30ea' }
]);

const fallback = computed(() => isZh.value ? {
  anonymous: '\u533f\u540d\u8bbf\u5ba2',
  visitor: '\u8bbf\u5ba2',
  search: '\u641c\u7d22...',
  justNow: '\u521a\u521a',
  minutesAgo: '\u5206\u949f\u524d',
  hoursAgo: '\u5c0f\u65f6\u524d',
  daysAgo: '\u5929\u524d',
  posted: '\u53d1\u5e03\u4e86\u7559\u8a00',
  replied: '\u56de\u590d\u4e86\u7559\u8a00',
  arrow: '\u2192',
  filteredMessages: '\u6761\u5339\u914d\u7559\u8a00',
  showing: '\u5f53\u524d',
  page: '\u7b2c',
  pageSuffix: '\u9875',
  totalPages: '\u5171',
  pageSize: '\u6bcf\u9875 8 \u6761',
  prevPage: '\u4e0a\u4e00\u9875',
  nextPage: '\u4e0b\u4e00\u9875',
  jumpToPage: '\u8df3\u5230\u7b2c',
  messageRangeUnit: '\u6761'
} : {
  anonymous: '\u533f\u540d\u30b2\u30b9\u30c8',
  visitor: '\u8a2a\u554f\u8005',
  search: '\u691c\u7d22...',
  justNow: '\u305f\u3063\u305f\u4eca',
  minutesAgo: '\u5206\u524d',
  hoursAgo: '\u6642\u9593\u524d',
  daysAgo: '\u65e5\u524d',
  posted: '\u30e1\u30c3\u30bb\u30fc\u30b8\u3092\u6295\u7a3f',
  replied: '\u30e1\u30c3\u30bb\u30fc\u30b8\u306b\u8fd4\u4fe1',
  arrow: '\u2192',
  filteredMessages: '\u4ef6\u306e\u30e1\u30c3\u30bb\u30fc\u30b8',
  showing: '\u8868\u793a\u4e2d',
  page: '\u30da\u30fc\u30b8',
  pageSuffix: '',
  totalPages: '\u5168',
  pageSize: '1\u30da\u30fc\u30b8 8 \u4ef6',
  prevPage: '\u524d\u3078',
  nextPage: '\u6b21\u3078',
  jumpToPage: '\u30da\u30fc\u30b8\u3078\u79fb\u52d5',
  messageRangeUnit: '\u4ef6'
});

const plazaMessages = computed(() => {
  const repliesByParent = {};
  plaza.messages.forEach((item) => {
    if (!item.parent_id) return;
    (repliesByParent[item.parent_id] = repliesByParent[item.parent_id] || []).push(item);
  });

  let top = plaza.messages.filter((item) => !item.parent_id).map((item) => ({
    ...item,
    replies: (repliesByParent[item.id] || []).sort((a, b) => compareAppDate(a.created_at, b.created_at))
  }));

  if (plaza.query) {
    const q = plaza.query.toLowerCase();
    top = top.filter((item) => {
      const replyText = item.replies.map((reply) => `${reply.author || ''} ${reply.content || ''}`).join(' ');
      return `${item.author || ''} ${item.content || ''} ${replyText}`.toLowerCase().includes(q);
    });
  }

  const currentUsername = user.value?.username;
  if (plaza.filter === 'hot') {
    top.sort((a, b) => (b.like_count || 0) - (a.like_count || 0) || compareAppDate(b.created_at, a.created_at));
  } else if (plaza.filter === 'replied') {
    top = top.filter((item) => item.replies.length > 0);
    top.sort((a, b) => b.replies.length - a.replies.length || compareAppDate(b.created_at, a.created_at));
  } else if (plaza.filter === 'mine') {
    top = top.filter((item) => currentUsername && item.author === currentUsername);
    top.sort((a, b) => compareAppDate(b.created_at, a.created_at));
  } else {
    top.sort((a, b) => compareAppDate(b.created_at, a.created_at));
  }

  return top;
});

const plazaMessageNumbers = computed(() => {
  return plaza.messages
    .filter((item) => !item.article_id && !item.parent_id)
    .sort((a, b) => compareAppDate(a.created_at, b.created_at) || Number(a.id || 0) - Number(b.id || 0))
    .reduce((numbers, item, index) => {
      numbers[item.id] = index + 1;
      return numbers;
    }, {});
});

const plazaActivity = computed(() => [...plaza.messages]
  .sort((a, b) => compareAppDate(b.created_at, a.created_at))
  .slice(0, 6));

const plazaTotalMessages = computed(() => plazaMessages.value.length);
const plazaTotalPages = computed(() => Math.max(1, Math.ceil(plazaTotalMessages.value / PLAZA_PAGE_SIZE)));
const plazaCurrentPage = computed(() => Math.min(Math.max(plaza.page, 1), plazaTotalPages.value));
const plazaPageStart = computed(() => plazaTotalMessages.value
  ? (plazaCurrentPage.value - 1) * PLAZA_PAGE_SIZE + 1
  : 0);
const plazaPageEnd = computed(() => Math.min(plazaCurrentPage.value * PLAZA_PAGE_SIZE, plazaTotalMessages.value));

const pagedPlazaMessages = computed(() => {
  const start = (plazaCurrentPage.value - 1) * PLAZA_PAGE_SIZE;
  return plazaMessages.value.slice(start, start + PLAZA_PAGE_SIZE);
});

const plazaPageItems = computed(() => {
  const total = plazaTotalPages.value;
  const current = plazaCurrentPage.value;
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

const plazaResultSummary = computed(() => `${plazaFormatNumber(plazaTotalMessages.value)} ${fallback.value.filteredMessages}`);
const plazaRangeSummary = computed(() => plazaTotalMessages.value
  ? `${fallback.value.showing} ${plazaFormatNumber(plazaPageStart.value)}-${plazaFormatNumber(plazaPageEnd.value)} ${fallback.value.messageRangeUnit}`
  : '');
const plazaPageSummary = computed(() => `${fallback.value.page} ${plazaFormatNumber(plazaCurrentPage.value)} ${fallback.value.pageSuffix} / ${fallback.value.totalPages} ${plazaFormatNumber(plazaTotalPages.value)} ${fallback.value.pageSuffix}`);

function go(path) {
  emit('go', path);
}

function showPlazaToast(text) {
  plazaToast.text = text;
  plazaToast.visible = true;
  clearTimeout(plazaToastTimer);
  plazaToastTimer = setTimeout(() => {
    plazaToast.visible = false;
  }, 2200);
}

function plazaSetPage(page, { scroll = true } = {}) {
  const numericPage = Number(page);
  if (!Number.isFinite(numericPage)) return;
  const nextPage = Math.min(Math.max(Math.trunc(numericPage), 1), plazaTotalPages.value);
  if (nextPage === plaza.page) return;
  plaza.page = nextPage;
  if (!scroll) return;
  nextTick(() => {
    document.querySelector('.plaza-message-region')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function isPlazaPageGap(item) {
  return typeof item === 'string';
}

function plazaSyncPageWithHash() {
  const match = String(location.hash || '').match(/^#msg-(\d+)$/);
  if (!match) return;
  const anchorId = match[1];
  const target = plaza.messages.find((item) => String(item.id) === anchorId);
  const topLevelId = target?.parent_id || target?.id;
  if (!topLevelId) return;
  const index = plazaMessages.value.findIndex((item) => String(item.id) === String(topLevelId));
  if (index < 0) return;
  plazaSetPage(Math.floor(index / PLAZA_PAGE_SIZE) + 1, { scroll: false });
  nextTick(() => {
    document.getElementById(`msg-${topLevelId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

async function loadPlazaStats() {
  try {
    plaza.stats = await loadPublicStats({ force: true, maxAgeMs: 0, staleWhileRevalidate: false }) || {};
  } catch (_) {}
}

async function loadPlazaMessages() {
  try {
    const response = await apiFetch('/api/messages/plaza/latest');
    const result = await parseResponse(response);
    if (result.success) {
      plaza.messages = Array.isArray(result.data)
        ? result.data.filter((item) => !item.article_id)
        : [];
      plazaSyncPageWithHash();
    }
  } catch (_) {
    showPlazaToast(props.t.plazaLoadFailed);
  }
}

async function loadTrendingTopics() {
  plaza.topicsLoading = true;
  try {
    const response = await apiFetch('/api/messages/topics?limit=8');
    const result = await parseResponse(response);
    plaza.topics = result.success && Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    plaza.topics = [];
  } finally {
    plaza.topicsLoading = false;
  }
}

function upsertPlazaMessage(message) {
  if (!message?.id) return;
  const normalized = { ...message, article_id: message.article_id || null };
  const index = plaza.messages.findIndex((item) => item.id === normalized.id);
  if (index >= 0) {
    plaza.messages.splice(index, 1, { ...plaza.messages[index], ...normalized });
    return;
  }
  plaza.messages.unshift(normalized);
}

function patchPlazaMessage(message) {
  if (!message?.id) return;
  const index = plaza.messages.findIndex((item) => item.id === message.id);
  if (index >= 0) plaza.messages.splice(index, 1, { ...plaza.messages[index], ...message });
}

async function refreshPlaza() {
  plaza.loading = true;
  session.value = getSession();
  loadPlazaStats();
  try {
    await Promise.all([loadPlazaMessages(), loadTrendingTopics()]);
  } finally {
    plaza.loading = false;
  }
}

async function plazaSubmitMessage(content) {
  if (!isAuthed.value) {
    go('/login');
    return false;
  }
  if (!content.trim()) {
    showPlazaToast(props.t.contentRequired);
    return false;
  }
  try {
    const response = await authFetch('/api/messages', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: content.trim() })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.publishFailed);
    showPlazaToast(result.message || '留言已提交，审核通过后会公开显示');
    if (result.data?.id && (result.data.status || 'approved') === 'approved') {
      plaza.page = 1;
      upsertPlazaMessage(result.data);
      loadTrendingTopics();
    } else await loadPlazaStats();
    return true;
  } catch (error) {
    showPlazaToast(error.message || props.t.publishFailed);
    return false;
  }
}

async function plazaSubmitReply(parentId, content) {
  if (!isAuthed.value) {
    go('/login');
    return false;
  }
  if (!content.trim()) {
    showPlazaToast(props.t.replyContentRequired);
    return false;
  }
  try {
    const response = await authFetch(`/api/messages/${parentId}/reply`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: content.trim() })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.replyFailed);
    showPlazaToast(result.message || '回复已提交，审核通过后会公开显示');
    if (result.data?.id && (result.data.status || 'approved') === 'approved') {
      upsertPlazaMessage(result.data);
      loadTrendingTopics();
    }
    plaza.replyOpen = { ...plaza.replyOpen, [parentId]: false };
    return true;
  } catch (error) {
    showPlazaToast(error.message || props.t.replyFailed);
    return false;
  }
}

async function plazaLikeMessage(id) {
  if (!isAuthed.value) {
    go('/login');
    return;
  }
  if (localStorage.getItem(`liked_${id}`) === '1') {
    showPlazaToast(props.t.alreadyLiked);
    return;
  }
  try {
    const response = await authFetch(`/api/messages/${id}/like`, {
      method: 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.likeFailed);
    if (result.data?.id) patchPlazaMessage(result.data);
    else {
      const target = plaza.messages.find((item) => item.id === id);
      if (target) target.like_count = Number(target.like_count || 0) + 1;
    }
    localStorage.setItem(`liked_${id}`, '1');
    showPlazaToast(props.t.likedToast);
  } catch (error) {
    showPlazaToast(error.message || props.t.likeFailed);
  }
}

async function plazaCopyLink(id) {
  const url = `${location.origin}/plaza#msg-${id}`;
  try {
    await navigator.clipboard.writeText(url);
    showPlazaToast(props.t.linkCopied);
  } catch (_) {
    location.hash = `msg-${id}`;
    showPlazaToast(props.t.linkCopied);
  }
}

function plazaToggleReply(id) {
  if (!isAuthed.value) {
    go('/login');
    return;
  }
  plaza.replyOpen = { ...plaza.replyOpen, [id]: !plaza.replyOpen[id] };
}

function plazaOpenProfile(username) {
  const value = String(username || '').trim();
  if (!value) return;
  emit('go', `/users/${encodeURIComponent(value)}`);
}

function plazaSelectTopic(topic) {
  const value = String(topic || '').trim();
  if (!value) return;
  plaza.query = `#${value}`;
  plaza.filter = 'latest';
  try {
    history.replaceState(null, '', `/plaza?topic=${encodeURIComponent(value)}`);
  } catch (_) {}
}

function applyRouteTopic() {
  const topic = Array.isArray(route.query.topic) ? route.query.topic[0] : route.query.topic;
  if (topic) plazaSelectTopic(topic);
}

function isPlazaMessageLiked(id) {
  try {
    return localStorage.getItem(`liked_${id}`) === '1';
  } catch (_) {
    return false;
  }
}

function plazaInitial(name) {
  return String(name || fallback.value.visitor).trim().slice(0, 1).toUpperCase();
}

function plazaAvatarAlt(name) {
  return `${name || fallback.value.anonymous} avatar`;
}

function plazaFormatDate(value) {
  if (!value) return '-';
  return formatDateTime(value, isZh.value ? 'zh-CN' : 'ja-JP');
}

function plazaFormatRelative(value) {
  const diff = Math.max(0, Date.now() - (parseAppDate(value)?.getTime() || Date.now()));
  const min = Math.floor(diff / 60000);
  if (min < 1) return fallback.value.justNow;
  if (min < 60) return `${min} ${fallback.value.minutesAgo}`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} ${fallback.value.hoursAgo}`;
  return `${Math.floor(hour / 24)} ${fallback.value.daysAgo}`;
}

function plazaFormatNumber(value) {
  return Number(value || 0).toLocaleString(isZh.value ? 'zh-CN' : 'ja-JP');
}

function plazaMessageNumber(id) {
  return plazaFormatNumber(plazaMessageNumbers.value[id] || id);
}

function plazaFormatUptime(seconds) {
  const total = Math.floor(Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  if (isZh.value) return days > 0 ? `${days}\u5929${hours}\u65f6` : `${hours}\u65f6`;
  return days > 0 ? `${days}\u65e5${hours}\u6642\u9593` : `${hours}\u6642\u9593`;
}

watch(() => [plaza.filter, plaza.query], () => {
  plaza.page = 1;
});
watch(plazaTotalPages, (total) => {
  if (plaza.page > total) plaza.page = total;
  if (plaza.page < 1) plaza.page = 1;
});
watch(() => route.query.topic, applyRouteTopic, { immediate: true });
onMounted(refreshPlaza);
</script>

<template>
  <main class="page plaza-page">
    <section class="plaza-hero">
      <div class="plaza-hero-main">
        <div class="plaza-eyebrow">{{ t.plazaEyebrow }}</div>
        <h1 class="plaza-title">{{ t.plazaTitle }}</h1>
        <p class="plaza-sub">{{ t.plazaSubtitle }}</p>
      </div>
      <aside class="plaza-status panel">
        <div class="plaza-status-line"><span>{{ t.channelStatus }}</span><span class="plaza-status-value">{{ t.channelValue }}</span></div>
        <div class="plaza-status-line"><span>{{ t.plazaStatusLabel }}</span><span class="plaza-status-value">{{ plaza.loading ? t.syncing : t.online }}</span></div>
        <div v-if="isAuthed" class="plaza-login-card">
          <strong>{{ user.username }}</strong>
          <p>{{ t.loggedInDesc }}</p>
        </div>
        <div v-else class="plaza-login-card">
          <strong>{{ t.guestMode }}</strong>
          <p>{{ t.guestDesc }}</p>
          <div style="margin-top:0.8rem;"><a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.goLogin }}</a></div>
        </div>
      </aside>
    </section>

    <section class="plaza-stats">
      <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsArticles }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.articles || 0) }}</div><div class="plaza-stat-note">{{ t.statsArticlesNote }}</div></div>
      <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsUsers }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.users || 0) }}</div><div class="plaza-stat-note">{{ t.statsUsersNote }}</div></div>
      <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsMessages }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.messages || 0) }}</div><div class="plaza-stat-note">{{ t.statsMessagesNote }}</div></div>
      <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsUptime }}</div><div class="plaza-stat-value">{{ plazaFormatUptime(plaza.stats?.uptime || 0) }}</div><div class="plaza-stat-note">{{ t.statsUptimeNote }}</div></div>
    </section>

    <section class="plaza-layout">
      <div class="panel plaza-wall">
        <div class="plaza-section-head">
          <h2 class="plaza-section-title"><span>01</span> {{ t.wallTitle }}</h2>
          <div class="plaza-toolbar">
            <label class="plaza-search-wrap">
              <TsIcon name="search" :size="16" />
              <input v-model="plaza.query" class="plaza-search" type="search" :placeholder="t.searchPlaceholder || fallback.search">
            </label>
            <button class="ghost-btn plaza-refresh-btn" type="button" @click="refreshPlaza">
              <TsIcon name="refresh" :size="16" />
              <span>{{ t.refresh }}</span>
            </button>
          </div>
        </div>
        <div class="plaza-filters">
          <button class="chip" :class="{ active: plaza.filter === 'latest' }" type="button" @click="plaza.filter = 'latest'">{{ t.filterLatest }}</button>
          <button class="chip" :class="{ active: plaza.filter === 'hot' }" type="button" @click="plaza.filter = 'hot'">{{ t.filterHot }}</button>
          <button class="chip" :class="{ active: plaza.filter === 'replied' }" type="button" @click="plaza.filter = 'replied'">{{ t.filterReplied }}</button>
          <button class="chip" :class="{ active: plaza.filter === 'mine' }" type="button" @click="plaza.filter = 'mine'">{{ t.filterMine }}</button>
        </div>
        <div v-if="!plaza.loading && plazaMessages.length" class="plaza-result-strip">
          <div>
            <strong>{{ plazaResultSummary }}</strong>
            <span>{{ plazaRangeSummary }}</span>
          </div>
          <div class="plaza-result-page">
            <span>{{ plazaPageSummary }}</span>
            <small>{{ fallback.pageSize }}</small>
          </div>
        </div>

        <div v-if="!isAuthed" class="plaza-composer plaza-composer-locked">
          <div class="plaza-empty">
            <div class="ts-empty-title">{{ t.loginToPost }}</div>
            <div class="ts-empty-desc">{{ t.loginToPostDesc }}</div>
            <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.goLogin }}</a>
          </div>
        </div>
        <div v-else class="plaza-composer">
          <PlazaComposer :t="t" :on-submit="plazaSubmitMessage" />
        </div>

        <div v-if="plaza.loading" class="plaza-empty">{{ t.plazaConnecting }}</div>
        <div v-else-if="!plazaMessages.length" class="plaza-empty">
          <div class="ts-empty-title">{{ t.noMessages }}</div>
          <div>{{ t.noMessagesHint }}</div>
        </div>
        <div v-else class="plaza-messages plaza-message-region">
          <article v-for="msg in pagedPlazaMessages" :id="'msg-' + msg.id" :key="msg.id" class="plaza-msg-card">
            <div class="plaza-msg-meta">
              <div class="plaza-msg-author">
                <button class="plaza-author-link" type="button" @click="plazaOpenProfile(msg.author)">
                <div class="plaza-avatar">
                  <img v-if="msg.avatar" :src="msg.avatar" :alt="plazaAvatarAlt(msg.author)">
                  <span v-else>{{ plazaInitial(msg.author) }}</span>
                </div>
                <div>
                  <div class="plaza-author-name">{{ msg.author || fallback.anonymous }}</div>
                  <div class="plaza-msg-date">{{ plazaFormatDate(msg.created_at) }}</div>
                </div>
                </button>
              </div>
              <div class="plaza-msg-date">#{{ plazaMessageNumber(msg.id) }}</div>
            </div>
            <SocialText
              class="plaza-msg-content"
              :content="msg.content"
              @mention="plazaOpenProfile"
              @topic="plazaSelectTopic"
            />
            <div class="plaza-msg-footer">
              <button class="icon-btn" :class="{ liked: isPlazaMessageLiked(msg.id) }" type="button" @click="plazaLikeMessage(msg.id)">
                <TsIcon name="heart" :size="15" />
                <span>{{ t.like }} {{ msg.like_count || 0 }}</span>
              </button>
              <button class="icon-btn" type="button" @click="plazaToggleReply(msg.id)">
                <TsIcon name="message" :size="15" />
                <span>{{ t.reply }} {{ (msg.replies || []).length }}</span>
              </button>
              <button class="icon-btn" type="button" @click="plazaCopyLink(msg.id)">
                <TsIcon name="copy" :size="15" />
                <span>{{ t.copyLink }}</span>
              </button>
            </div>
            <div v-if="plaza.replyOpen[msg.id]" class="plaza-reply-form">
              <PlazaReplyForm :t="t" :msg-id="msg.id" :on-submit="plazaSubmitReply" @cancel="plazaToggleReply(msg.id)" />
            </div>
            <div v-if="(msg.replies || []).length" class="plaza-replies">
              <div v-for="reply in msg.replies" :key="reply.id" class="plaza-reply-card">
                <div class="plaza-msg-meta" style="margin-bottom:0.45rem;">
                  <div class="plaza-msg-author">
                    <button class="plaza-author-link" type="button" @click="plazaOpenProfile(reply.author)">
                    <div class="plaza-avatar small">
                      <img v-if="reply.avatar" :src="reply.avatar" :alt="plazaAvatarAlt(reply.author)">
                      <span v-else>{{ plazaInitial(reply.author) }}</span>
                    </div>
                    <div>
                      <div class="plaza-author-name" style="font-size:0.82rem;">{{ reply.author || fallback.anonymous }}</div>
                      <div class="plaza-msg-date">{{ plazaFormatDate(reply.created_at) }}</div>
                    </div>
                    </button>
                  </div>
                </div>
                <SocialText
                  class="plaza-msg-content"
                  style="margin-bottom:0;"
                  :content="reply.content"
                  @mention="plazaOpenProfile"
                  @topic="plazaSelectTopic"
                />
              </div>
            </div>
          </article>
          <nav v-if="plazaTotalPages > 1" class="plaza-pagination" aria-label="Plaza messages pagination">
            <div class="plaza-pagination-info">{{ plazaPageSummary }}</div>
            <div class="plaza-pagination-controls">
              <button
                class="plaza-page-btn plaza-page-nav"
                type="button"
                :disabled="plazaCurrentPage <= 1"
                @click="plazaSetPage(plazaCurrentPage - 1)"
              >
                {{ fallback.prevPage }}
              </button>
              <template v-for="item in plazaPageItems" :key="item">
                <span v-if="isPlazaPageGap(item)" class="plaza-page-gap">...</span>
                <button
                  v-else
                  class="plaza-page-btn"
                  :class="{ active: item === plazaCurrentPage }"
                  type="button"
                  :aria-current="item === plazaCurrentPage ? 'page' : undefined"
                  :aria-label="`${fallback.jumpToPage} ${item}`"
                  @click="plazaSetPage(item)"
                >
                  {{ item }}
                </button>
              </template>
              <button
                class="plaza-page-btn plaza-page-nav"
                type="button"
                :disabled="plazaCurrentPage >= plazaTotalPages"
                @click="plazaSetPage(plazaCurrentPage + 1)"
              >
                {{ fallback.nextPage }}
              </button>
            </div>
          </nav>
        </div>
      </div>

      <aside class="plaza-side">
        <div class="panel">
          <div class="panel-title">热门话题 <span>{{ plaza.topics.length }}</span></div>
          <div class="plaza-topic-list">
            <div v-if="plaza.topicsLoading" class="plaza-topic-empty">同步中...</div>
            <button
              v-for="topic in plaza.topics"
              :key="topic.topic"
              class="plaza-topic-chip"
              type="button"
              @click="plazaSelectTopic(topic.topic)"
            >
              <span>#{{ topic.topic }}</span>
              <small>{{ plazaFormatNumber(topic.count) }} · {{ plazaFormatNumber(topic.score) }}</small>
            </button>
            <div v-if="!plaza.topicsLoading && !plaza.topics.length" class="plaza-topic-empty">还没有话题，试试发布 #月读茶会#</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">{{ t.residents }} <span>{{ friends.length }}</span></div>
          <div class="plaza-friends">
            <a v-for="f in friends" :key="f.name" class="plaza-friend-card" :href="f.url" @click="f.url.startsWith('/') && !f.external && ($event.preventDefault(), go(f.url))">
              <div class="plaza-friend-avatar">{{ f.avatar }}</div>
              <div>
                <div class="plaza-friend-name">{{ f.name }}</div>
                <div class="plaza-friend-desc">{{ f.desc }}</div>
              </div>
              <div class="plaza-friend-arrow">{{ fallback.arrow }}</div>
            </a>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">{{ t.activity }}</div>
          <div class="plaza-activities">
            <div v-if="!plazaActivity.length" class="plaza-activity-item"><span class="plaza-dot"></span><span>{{ t.plazaJustOpened }}</span></div>
            <div v-for="item in plazaActivity" :key="item.id" class="plaza-activity-item">
              <span class="plaza-dot"></span>
              <span>{{ item.author || fallback.visitor }} {{ item.parent_id ? fallback.replied : fallback.posted }} · {{ plazaFormatRelative(item.created_at) }}</span>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">{{ t.rulesTitle }}</div>
          <div class="plaza-rules">
            <p>{{ t.rule1 }}</p>
            <p>{{ t.rule2 }}</p>
            <p>{{ t.rule3 }}</p>
          </div>
        </div>
      </aside>
    </section>

    <div v-if="plazaToast.visible" class="plaza-toast show">{{ plazaToast.text }}</div>
  </main>
</template>
