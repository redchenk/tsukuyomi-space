<script setup>
import { nameInitial } from '../utils/userName.mjs';
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiFetch, authFetch, authHeaders, getSession, loadCurrentSession, loadPublicStats, parseResponse } from '../api/client';
import PlazaComposer from '../components/PlazaComposer.vue';
import PlazaReplyForm from '../components/PlazaReplyForm.vue';
import ReplyRecipient from '../components/ReplyRecipient.vue';
import { messageThreads, replyCopy } from '../services/messageThreads.mjs';
import ModerationNotice from '../components/ModerationNotice.vue';
import SocialText from '../components/SocialText.vue';
import TsIcon from '../components/TsIcon.vue';
import UserLevelBadge from '../components/UserLevelBadge.vue';
import { useUserLevels } from '../composables/useUserLevels';
import { applyMessageLikeState } from '../services/messageLikes';
import { clearPlazaMessageCache, loadPlazaPage, loadPlazaReplies, PLAZA_PAGE_SIZE } from '../services/plazaMessages';
import { applyGrowthResult } from '../services/userGrowth';
import { compareAppDate, formatDateTime, parseAppDate } from '../utils/time';

const props = defineProps({
  lang: { type: String, required: true },
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const route = useRoute();
const router = useRouter();
const { hydrateUserLevels, userLevel } = useUserLevels();
const session = ref(getSession());
const plaza = reactive({
  messages: [],
  activity: [],
  pagination: { page: 1, total: 0, totalPages: 1 },
  repliesCursor: {},
  repliesLoaded: {},
  repliesLoading: {},
  repliesError: {},
  stats: null,
  topics: [],
  topicsLoading: true,
  topicsError: '',
  filter: 'latest',
  query: '',
  page: 1,
  loading: true,
  loadError: '',
  replyOpen: {},
  repliesExpanded: {}
});
const plazaToast = reactive({ text: '', type: 'success', visible: false });
const messageModeration = ref(null);
const compact = ref(false);
let compactQuery;
const updateCompact = () => { compact.value = compactQuery?.matches || false; };
const replyModeration = reactive({});
let plazaToastTimer = 0;
let plazaMounted = false;
let applyingPlazaPage = false;
let plazaRequestRevision = 0;
let plazaReloadTimer = 0;
let plazaLoadedAt = 0;
let plazaLoadedRequest = '';
let appliedTopic = '';
let renderedHash = '';
const successfulLikes = new Map();
const user = computed(() => session.value?.user || null);
const isAuthed = computed(() => Boolean(session.value));
const isZh = computed(() => props.lang === 'zh');
const isEn = computed(() => props.lang === 'en');
const plazaCopy = computed(() => isEn.value ? {
  friendRule: 'Apply for a link exchange through the dedicated entry above and track its review status there.'
} : isZh.value ? {
  friendRule: '\u53cb\u94fe\u7533\u8bf7\u8bf7\u4f7f\u7528\u4e0a\u65b9\u72ec\u7acb\u5165\u53e3\uff0c\u5ba1\u6838\u72b6\u6001\u53ef\u968f\u65f6\u67e5\u770b\u3002'
} : {
  friendRule: '\u76f8\u4e92\u30ea\u30f3\u30af\u306f\u4e0a\u306e\u5c02\u7528\u5165\u53e3\u304b\u3089\u7533\u8acb\u3057\u3001\u5be9\u67fb\u72b6\u6cc1\u3092\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002'
});

const friends = computed(() => {
  const builtIn = isEn.value ? [
    { name: 'Tsukuyomi Space', desc: 'Project repository and update history', url: 'https://github.com/redchenk/tsukuyomi-space', avatar: 'T', external: true },
    { name: 'Kaguya-hime Blog', desc: 'Articles, notices and creative notes', url: '/stage', avatar: 'B' },
    { name: 'Moonlit Pixel Workshop', desc: 'Draw pixel art and share it with the public gallery', url: '/pixel/', avatar: 'P' }
  ] : isZh.value ? [
    { name: '\u6708\u8bfb\u7a7a\u95f4\u5b98\u65b9', desc: '\u9879\u76ee\u4ed3\u5e93\u4e0e\u66f4\u65b0\u8bb0\u5f55', url: 'https://github.com/redchenk/tsukuyomi-space', avatar: '\u6708', external: true },
    { name: '\u8f89\u591c\u59ec\u535a\u5ba2', desc: '\u6587\u7ae0\u3001\u516c\u544a\u4e0e\u521b\u4f5c\u624b\u8bb0', url: '/stage', avatar: '\u6587' },
    { name: '\u6708\u5149\u50cf\u7d20\u5de5\u574a', desc: '\u753b\u50cf\u7d20\u753b\u5e76\u5206\u4eab\u5230\u516c\u5f00\u753b\u5eca', url: '/pixel/', avatar: '\u753b' }
  ] : [
    { name: '\u6708\u8aad\u7a7a\u9593\u516c\u5f0f', desc: '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u30ea\u30dd\u30b8\u30c8\u30ea\u3068\u66f4\u65b0\u8a18\u9332', url: 'https://github.com/redchenk/tsukuyomi-space', avatar: '\u6708', external: true },
    { name: '\u8f1d\u591c\u59eb\u30d6\u30ed\u30b0', desc: '\u8a18\u4e8b\u3001\u304a\u77e5\u3089\u305b\u3001\u5275\u4f5c\u30ce\u30fc\u30c8', url: '/stage', avatar: '\u6587' },
    { name: '\u6708\u5149\u30d4\u30af\u30bb\u30eb\u5de5\u623f', desc: '\u30d4\u30af\u30bb\u30eb\u30a2\u30fc\u30c8\u3092\u63cf\u3044\u3066\u5171\u6709\u30ae\u30e3\u30e9\u30ea\u30fc\u3078', url: '/pixel/', avatar: '\u753b' }
  ];
  return builtIn;
});

const designCopy = computed(() => isEn.value ? {
  intro: 'A little hello, a shared idea. Leave a moment of your day here.',
  composer: 'What’s on your mind?', composerNote: 'Greetings, feedback and inspiration are all welcome.',
  topics: 'Trending topics', sites: 'Around the plaza', info: 'About the plaza',
  directory: 'Partner sites', apply: 'Apply for a link exchange', clear: 'Clear search',
  topicCount: 'messages', search: 'Search messages, people or topics',
  refresh: 'Refresh messages', signIn: 'Sign in to join the conversation',
  guestHint: 'Browse freely. Sign in to post, reply and like.', allMessages: 'Show all messages'
} : isZh.value ? {
  intro: '留下一句问候，分享一点灵感。在这里，遇见同频的朋友。',
  composer: '今天有什么想分享的？', composerNote: '问候、反馈、灵感，都可以留在这里。',
  topics: '热门话题', sites: '广场周边', info: '关于广场',
  directory: '浏览友链', apply: '申请友链', clear: '清除搜索',
  topicCount: '条留言', search: '搜索留言、用户或话题',
  refresh: '刷新留言', signIn: '登录，加入这场对话',
  guestHint: '可以自由浏览，登录后即可发布、回复和点赞。', allMessages: '查看全部留言'
} : {
  intro: '挨拶も、ひらめきも。ここで同じ気持ちの仲間に出会う。',
  composer: '今日は何を話しましょう？', composerNote: '挨拶、フィードバック、アイデアを気軽に。',
  topics: '人気の話題', sites: '広場の周辺', info: '広場について',
  directory: '相互リンク一覧', apply: '相互リンクを申請', clear: '検索をクリア',
  topicCount: '件', search: 'メッセージ、ユーザー、話題を検索',
  refresh: '投稿を更新', signIn: 'ログインして会話に参加',
  guestHint: '閲覧は自由です。ログインして投稿、返信、いいね。', allMessages: 'すべての投稿を表示'
});

const fallback = computed(() => isEn.value ? {
  anonymous: 'Anonymous guest',
  visitor: 'Visitor',
  justNow: 'just now',
  minutesAgo: 'minutes ago',
  hoursAgo: 'hours ago',
  daysAgo: 'days ago',
  posted: 'posted a message',
  replied: 'replied',
  showing: 'Showing',
  page: 'Page',
  pageSuffix: '',
  totalPages: 'of',
  prevPage: 'Previous',
  nextPage: 'Next',
  jumpToPage: 'Go to page',
  messageRangeUnit: 'messages',
  moreReplies: 'Show all {count} replies',
  fullReply: 'Read full reply',
  collapseReplies: 'Collapse replies'
} : isZh.value ? {
  anonymous: '\u533f\u540d\u8bbf\u5ba2',
  visitor: '\u8bbf\u5ba2',
  justNow: '\u521a\u521a',
  minutesAgo: '\u5206\u949f\u524d',
  hoursAgo: '\u5c0f\u65f6\u524d',
  daysAgo: '\u5929\u524d',
  posted: '\u53d1\u5e03\u4e86\u7559\u8a00',
  replied: '\u56de\u590d\u4e86\u7559\u8a00',
  showing: '\u5f53\u524d',
  page: '\u7b2c',
  pageSuffix: '\u9875',
  totalPages: '\u5171',
  prevPage: '\u4e0a\u4e00\u9875',
  nextPage: '\u4e0b\u4e00\u9875',
  jumpToPage: '\u8df3\u5230\u7b2c',
  messageRangeUnit: '\u6761',
  moreReplies: '\u5c55\u5f00\u5168\u90e8 {count} \u6761\u56de\u590d',
  fullReply: '\u5c55\u5f00\u5b8c\u6574\u56de\u590d',
  collapseReplies: '\u6536\u8d77\u56de\u590d'
} : {
  anonymous: '\u533f\u540d\u30b2\u30b9\u30c8',
  visitor: '\u8a2a\u554f\u8005',
  justNow: '\u305f\u3063\u305f\u4eca',
  minutesAgo: '\u5206\u524d',
  hoursAgo: '\u6642\u9593\u524d',
  daysAgo: '\u65e5\u524d',
  posted: '\u30e1\u30c3\u30bb\u30fc\u30b8\u3092\u6295\u7a3f',
  replied: '\u30e1\u30c3\u30bb\u30fc\u30b8\u306b\u8fd4\u4fe1',
  showing: '\u8868\u793a\u4e2d',
  page: '\u30da\u30fc\u30b8',
  pageSuffix: '',
  totalPages: '\u5168',
  prevPage: '\u524d\u3078',
  nextPage: '\u6b21\u3078',
  jumpToPage: '\u30da\u30fc\u30b8\u3078\u79fb\u52d5',
  messageRangeUnit: '\u4ef6',
  moreReplies: '\u8fd4\u4fe1 {count} \u4ef6\u3092\u3059\u3079\u3066\u8868\u793a',
  fullReply: '\u8fd4\u4fe1\u306e\u5168\u6587\u3092\u8868\u793a',
  collapseReplies: '\u8fd4\u4fe1\u3092\u6298\u308a\u305f\u305f\u3080'
});

const threads = computed(() => messageThreads(plaza.messages));
const replyLabels = computed(() => replyCopy(props.lang));
const plazaMessages = computed(() => threads.value.top.map(item => ({
  ...item,
  replies: [...(threads.value.replies.get(String(item.id)) || [])].sort((a, b) =>
    compareAppDate(b.created_at, a.created_at) || Number(b.id || 0) - Number(a.id || 0))
})));
const plazaMessageNumbers = computed(() => Object.fromEntries(threads.value.top.map(item => [item.id, item.floor_number])));
const plazaActivity = computed(() => plaza.activity);
const plazaTotalMessages = computed(() => plaza.pagination.total);
const plazaTotalPages = computed(() => Math.max(1, plaza.pagination.totalPages));
const plazaCurrentPage = computed(() => Math.min(Math.max(plaza.page, 1), plazaTotalPages.value));
const plazaPageStart = computed(() => plazaTotalMessages.value
  ? (plazaCurrentPage.value - 1) * PLAZA_PAGE_SIZE + 1
  : 0);
const plazaPageEnd = computed(() => Math.min(plazaCurrentPage.value * PLAZA_PAGE_SIZE, plazaTotalMessages.value));

const pagedPlazaMessages = computed(() => plazaMessages.value);

function plazaVisibleReplies(message) {
  return plaza.repliesExpanded[message.id] ? message.replies : message.replies.slice(0, 1);
}

function plazaRepliesToggleLabel(message) {
  if (plaza.repliesExpanded[message.id]) return fallback.value.collapseReplies;
  if (message.reply_count === 1) return fallback.value.fullReply;
  return fallback.value.moreReplies.replace('{count}', plazaFormatNumber(message.reply_count));
}

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

const plazaRangeSummary = computed(() => plazaTotalMessages.value
  ? `${fallback.value.showing} ${plazaFormatNumber(plazaPageStart.value)}-${plazaFormatNumber(plazaPageEnd.value)} ${fallback.value.messageRangeUnit}`
  : '');
const plazaPageSummary = computed(() => `${fallback.value.page} ${plazaFormatNumber(plazaCurrentPage.value)} ${fallback.value.pageSuffix} / ${fallback.value.totalPages} ${plazaFormatNumber(plazaTotalPages.value)} ${fallback.value.pageSuffix}`);

function go(path) {
  emit('go', path);
}

function showPlazaToast(text, type = 'success') {
  plazaToast.text = text;
  plazaToast.type = type;
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

async function plazaSyncPageWithHash() {
  if (!plazaMounted || route.name !== 'plaza') return;
  renderedHash = route.hash;
  const match = String(location.hash || '').match(/^#msg-(\d+)$/);
  if (!match) return;
  const anchorId = match[1];
  let target = plaza.messages.find(item => String(item.id) === anchorId);
  if (!target) {
    await loadPlazaMessages({ anchorId });
    target = plaza.messages.find(item => String(item.id) === anchorId);
  }
  if (!target) return;
  const rootId = threads.value.rootId(target.id);
  if (target.parent_id && rootId) {
    plaza.repliesExpanded[rootId] = true;
    if (!plaza.repliesLoaded[rootId]) await fetchPlazaReplies(rootId);
  }
  nextTick(() => document.getElementById(`msg-${anchorId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

async function loadPlazaStats() {
  try {
    plaza.stats = await loadPublicStats({ force: true, maxAgeMs: 0, staleWhileRevalidate: false }) || {};
  } catch (_) {}
}

function keepLikeResults(messages) {
  return messages.map(item => {
    const liked = successfulLikes.get(String(item.id));
    return liked ? { ...item, viewer_liked: true, like_count: Math.max(Number(item.like_count || 0), liked.like_count) } : item;
  });
}

function hydratePlazaMessages(messages, revision = plazaRequestRevision) {
  hydrateUserLevels(messages.map(item => item.user_id)).catch(() => {});
  const owner = user.value?.id;
  const snapshot = messages.map(item => ({ ...item }));
  if (owner) applyMessageLikeState(snapshot).then(() => {
    if (revision !== plazaRequestRevision || owner !== user.value?.id) return;
    const liked = new Map(snapshot.map(item => [String(item.id), item.viewer_liked]));
    plaza.messages = keepLikeResults(plaza.messages.map(item => liked.has(String(item.id))
      ? { ...item, viewer_liked: liked.get(String(item.id)) } : item));
  }).catch(() => {});
}

function plazaRequestKey() {
  return JSON.stringify([plaza.page, plaza.filter, plaza.query]);
}

async function loadPlazaMessages({ force = false, anchorId = null, background = false } = {}) {
  const revision = ++plazaRequestRevision;
  const owner = user.value?.id || '';
  if (!background) plaza.loading = true;
  plaza.loadError = '';
  try {
    const result = await loadPlazaPage({ page: plaza.page, sort: plaza.filter, search: plaza.query, anchorId }, { force });
    if (revision !== plazaRequestRevision || owner !== (user.value?.id || '')) return;
    plaza.messages = keepLikeResults(result.messages || []);
    plaza.activity = result.activity || [];
    plaza.pagination = result.pagination;
    if (!background) plaza.repliesExpanded = {};
    plaza.repliesLoaded = {};
    plaza.repliesCursor = {};
    plaza.repliesError = {};
    plaza.repliesLoading = {};
    applyingPlazaPage = true;
    plaza.page = result.pagination.page;
    plazaLoadedAt = Date.now();
    plazaLoadedRequest = plazaRequestKey();
    nextTick(() => { applyingPlazaPage = false; });
    hydratePlazaMessages(plaza.messages, revision);
    if (background) {
      for (const message of result.messages || []) {
        if (!message.parent_id && plaza.repliesExpanded[message.id]) void fetchPlazaReplies(message.id);
      }
    }
    if (result.anchor_id) nextTick(plazaSyncPageWithHash);
  } catch (error) {
    if (revision !== plazaRequestRevision) return;
    if (background) return;
    plaza.messages = [];
    plaza.loadError = error.message || props.t.plazaLoadFailed;
    showPlazaToast(props.t.plazaLoadFailed, 'error');
  } finally {
    if (revision === plazaRequestRevision) plaza.loading = false;
  }
}

function schedulePlazaReload(delay = 0) {
  if (!plazaMounted) return;
  clearTimeout(plazaReloadTimer);
  // Invalidate a response as soon as the filter changes, before debounce ends.
  ++plazaRequestRevision;
  plazaReloadTimer = setTimeout(() => loadPlazaMessages(), delay);
}

async function fetchPlazaReplies(rootId, more = false) {
  if (plaza.repliesLoading[rootId]) return;
  const revision = plazaRequestRevision;
  plaza.repliesLoading[rootId] = true;
  plaza.repliesError[rootId] = '';
  try {
    const result = await loadPlazaReplies(rootId, more ? plaza.repliesCursor[rootId] : null);
    if (revision !== plazaRequestRevision) return;
    const merged = new Map(plaza.messages.map(item => [String(item.id), item]));
    for (const reply of result.replies) merged.set(String(reply.id), { ...merged.get(String(reply.id)), ...reply });
    plaza.messages = keepLikeResults([...merged.values()]);
    plaza.repliesLoaded[rootId] = true;
    plaza.repliesCursor[rootId] = result.next_before_id;
    hydratePlazaMessages(plaza.messages, revision);
  } catch (error) {
    if (revision === plazaRequestRevision) plaza.repliesError[rootId] = error.message || props.t.plazaLoadFailed;
  } finally { if (revision === plazaRequestRevision) delete plaza.repliesLoading[rootId]; }
}

function plazaReplyTarget(reply) {
  const target = threads.value.target(reply);
  return { ...target, id: target.id || (target.name ? reply.reply_to_id : null) };
}

async function loadTrendingTopics() {
  plaza.topicsLoading = true;
  plaza.topicsError = '';
  try {
    const response = await apiFetch('/api/messages/topics?limit=8');
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.plazaLoadFailed);
    plaza.topics = Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    plaza.topics = [];
    plaza.topicsError = error.message || props.t.plazaLoadFailed;
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
  if (normalized.user_id) hydrateUserLevels([normalized.user_id]).catch(() => {});
}

function patchPlazaMessage(message) {
  if (!message?.id) return;
  const index = plaza.messages.findIndex((item) => item.id === message.id);
  if (index >= 0) plaza.messages.splice(index, 1, { ...plaza.messages[index], ...message });
}

async function refreshPlaza({ force = true } = {}) {
  session.value = getSession();
  if (force) clearPlazaMessageCache();
  loadPlazaStats();
  loadTrendingTopics();
  const anchorId = String(location.hash || '').match(/^#msg-(\d+)$/)?.[1] || null;
  // Public messages never wait for session recovery, levels, likes or topics.
  const messages = loadPlazaMessages({ force, anchorId });
  if (!session.value) loadCurrentSession().then(() => {
    if (!plazaMounted) return;
    session.value = getSession();
    hydratePlazaMessages(plaza.messages);
    if (plaza.loading && session.value) loadPlazaMessages({ anchorId });
  }).catch(() => {});
  await messages;
}

async function plazaSubmitMessage(content) {
  messageModeration.value = null;
  if (!isAuthed.value) {
    go('/login');
    return false;
  }
  if (!content.trim()) {
    showPlazaToast(props.t.contentRequired, 'error');
    return false;
  }
  try {
    const response = await authFetch('/api/messages', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: content.trim() })
    });
    const result = await parseResponse(response);
    messageModeration.value = result.moderation || null;
    if (!result.success) throw new Error(result.message || props.t.publishFailed);
    if (result.growth) applyGrowthResult(result.growth);
    showPlazaToast(result.moderation?.status === 'pending' ? '已提交，等待人工审核。请查看原因提示。' : result.message || (isEn.value ? 'Message submitted.' : '留言已提交'));
    if (result.data?.id && (result.data.status || 'approved') === 'approved') {
      clearPlazaMessageCache();
      applyingPlazaPage = true;
      plaza.page = 1;
      nextTick(() => { applyingPlazaPage = false; });
      await loadPlazaMessages({ force: true });
      loadTrendingTopics();
    }
    loadPlazaStats();
    return true;
  } catch (error) {
    showPlazaToast(messageModeration.value?.status === 'rejected' ? '未能提交，请查看原因提示。' : error.message || props.t.publishFailed, 'error');
    return false;
  }
}

async function plazaSubmitReply(parentId, content) {
  replyModeration[parentId] = null;
  if (!isAuthed.value) {
    go('/login');
    return false;
  }
  if (!content.trim()) {
    showPlazaToast(props.t.replyContentRequired, 'error');
    return false;
  }
  try {
    const response = await authFetch(`/api/messages/${parentId}/reply`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: content.trim() })
    });
    const result = await parseResponse(response);
    replyModeration[parentId] = result.moderation || null;
    if (!result.success) throw new Error(result.message || props.t.replyFailed);
    if (result.growth) applyGrowthResult(result.growth);
    showPlazaToast(result.moderation?.status === 'pending' ? '回复已提交，等待人工审核。请查看原因提示。' : result.message || (isEn.value ? 'Reply submitted.' : '回复已提交'));
    if (result.data?.id && (result.data.status || 'approved') === 'approved') {
      clearPlazaMessageCache();
      const rootId = threads.value.rootId(parentId);
      upsertPlazaMessage(result.data);
      const root = plaza.messages.find(item => String(item.id) === rootId);
      if (root) root.reply_count = Number(root.reply_count || 0) + 1;
      if (rootId) {
        plaza.repliesExpanded[rootId] = true;
        fetchPlazaReplies(rootId);
      }
      loadTrendingTopics();
    }
    plaza.replyOpen = { ...plaza.replyOpen, [parentId]: false };
    const rootId = threads.value.rootId(parentId);
    if (rootId) plaza.repliesExpanded[rootId] = true;
    return true;
  } catch (error) {
    showPlazaToast(replyModeration[parentId]?.status === 'rejected' ? '未能提交，请查看原因提示。' : error.message || props.t.replyFailed, 'error');
    return false;
  }
}

async function plazaLikeMessage(id) {
  if (!isAuthed.value) {
    go('/login');
    return;
  }
  const current = plaza.messages.find((item) => item.id === id);
  if (current?.viewer_liked) {
    showPlazaToast(props.t.alreadyLiked, 'error');
    return;
  }
  try {
    const response = await authFetch(`/api/messages/${id}/like`, {
      method: 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.likeFailed);
    if (result.growth) applyGrowthResult(result.growth);
    clearPlazaMessageCache();
    if (result.data?.id) {
      successfulLikes.set(String(result.data.id), result.data);
      patchPlazaMessage(result.data);
    }
    else {
      const target = plaza.messages.find((item) => item.id === id);
      if (target) target.like_count = Number(target.like_count || 0) + 1;
    }
    showPlazaToast(props.t.likedToast);
  } catch (error) {
    showPlazaToast(error.message || props.t.likeFailed, 'error');
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
  session.value = getSession();
  if (!isAuthed.value) {
    go('/login');
    return;
  }
  plaza.replyOpen = { ...plaza.replyOpen, [id]: !plaza.replyOpen[id] };
}

function plazaToggleReplies(id) {
  plaza.repliesExpanded[id] = !plaza.repliesExpanded[id];
  if (plaza.repliesExpanded[id] && !plaza.repliesLoaded[id]) fetchPlazaReplies(id);
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
  if (route.query.topic !== value) router.replace({ query: { ...route.query, topic: value }, hash: route.hash });
}

function clearPlazaSearch() {
  plaza.query = '';
  if (route.query.topic) router.replace({ query: { ...route.query, topic: undefined }, hash: route.hash });
}

function plazaOpenActivity(id) {
  plaza.query = '';
  plaza.filter = 'latest';
  router.replace({ query: { ...route.query, topic: undefined }, hash: `#msg-${id}` })
    .then(plazaSyncPageWithHash);
}

function applyRouteTopic() {
  if (route.name !== 'plaza') return;
  const topic = Array.isArray(route.query.topic) ? route.query.topic[0] : route.query.topic;
  if ((topic || '') === appliedTopic) return;
  if (topic) plazaSelectTopic(topic);
  else if (appliedTopic) plaza.query = '';
  appliedTopic = topic || '';
}

function isPlazaMessageLiked(message) {
  return Boolean(message?.viewer_liked);
}

function plazaInitial(name) {
  return nameInitial(name, fallback.value.visitor);
}

function plazaAvatarAlt(name) {
  return `${name || fallback.value.anonymous} avatar`;
}

function plazaFormatDate(value) {
  if (!value) return '-';
  return formatDateTime(value, isEn.value ? 'en-US' : (isZh.value ? 'zh-CN' : 'ja-JP'));
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
  return Number(value || 0).toLocaleString(isEn.value ? 'en-US' : (isZh.value ? 'zh-CN' : 'ja-JP'));
}

function plazaMessageNumber(id) {
  return plazaFormatNumber(plazaMessageNumbers.value[id] || id);
}

function plazaFormatUptime(seconds) {
  const total = Math.floor(Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  if (isEn.value) return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  if (isZh.value) return days > 0 ? `${days}\u5929${hours}\u65f6` : `${hours}\u65f6`;
  return days > 0 ? `${days}\u65e5${hours}\u6642\u9593` : `${hours}\u6642\u9593`;
}

watch(() => [plaza.filter, plaza.query], (current, previous) => {
  applyingPlazaPage = true;
  plaza.page = 1;
  nextTick(() => { applyingPlazaPage = false; });
  schedulePlazaReload(current[1] !== previous[1] ? 180 : 0);
});
watch(() => plaza.page, () => { if (!applyingPlazaPage) schedulePlazaReload(); });
watch(() => route.query.topic, applyRouteTopic, { immediate: true });
watch(() => route.hash, plazaSyncPageWithHash, { flush: 'post' });
onMounted(() => {
  plazaMounted = true;
  compactQuery = window.matchMedia('(max-width: 900px)');
  updateCompact();
  compactQuery.addEventListener('change', updateCompact);
  window.addEventListener('hashchange', plazaSyncPageWithHash);
  refreshPlaza({ force: false });
});
onActivated(() => {
  if (plazaMounted) return;
  plazaMounted = true;
  session.value = getSession();
  updateCompact();
  compactQuery?.addEventListener('change', updateCompact);
  window.addEventListener('hashchange', plazaSyncPageWithHash);
  applyRouteTopic();
  clearTimeout(plazaReloadTimer);
  const changed = plazaRequestKey() !== plazaLoadedRequest;
  if (!plaza.loading && (changed || Date.now() - plazaLoadedAt > 30000)) {
    loadPlazaMessages({ background: !changed });
    loadPlazaStats();
    loadTrendingTopics();
  }
  if (route.hash !== renderedHash) nextTick(plazaSyncPageWithHash);
});
function pausePlaza() {
  plazaMounted = false;
  clearTimeout(plazaReloadTimer);
  clearTimeout(plazaToastTimer);
  plazaToast.visible = false;
  window.removeEventListener('hashchange', plazaSyncPageWithHash);
  compactQuery?.removeEventListener('change', updateCompact);
}
onDeactivated(pausePlaza);
onUnmounted(() => {
  pausePlaza();
  ++plazaRequestRevision;
});
</script>

<template>
  <main class="page plaza-page">
    <header class="plaza-intro">
      <div>
        <div class="plaza-eyebrow">{{ t.plazaEyebrow }}</div>
        <h1 class="plaza-title">{{ t.plazaTitle }}</h1>
        <p class="plaza-sub">{{ designCopy.intro }}</p>
      </div>
      <span class="plaza-channel"><TsIcon name="message" :size="16" />{{ t.channelValue }}</span>
    </header>

    <section class="plaza-layout">
      <section class="panel plaza-compose-panel" :aria-label="t.publish">
        <div v-if="!isAuthed" class="plaza-composer plaza-composer-locked">
          <div class="plaza-compose-icon"><TsIcon name="message" :size="24" /></div>
          <div class="plaza-guest-copy"><h2>{{ designCopy.signIn }}</h2><p>{{ designCopy.guestHint }}</p></div>
          <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.goLogin }}<TsIcon name="chevronRight" :size="16" /></a>
        </div>
        <div v-else class="plaza-composer">
          <div class="plaza-compose-heading">
            <div class="plaza-avatar"><img v-if="user.avatar" :src="user.avatar" :alt="plazaAvatarAlt(user.nickname || user.username)" /><span v-else>{{ plazaInitial(user.nickname || user.username) }}</span></div>
            <div><h2>{{ designCopy.composer }}</h2><p>{{ user.nickname || user.username }} · {{ designCopy.composerNote }}</p></div>
          </div>
          <PlazaComposer :t="t" :lang="lang" :on-submit="plazaSubmitMessage" />
          <ModerationNotice :feedback="messageModeration" />
        </div>
      </section>

      <section class="plaza-wall" :aria-busy="plaza.loading" :aria-label="t.wallTitle">
        <div class="plaza-section-head">
          <h2 class="plaza-section-title">{{ t.wallTitle }}<span v-if="!plaza.loading" class="plaza-count">{{ plazaFormatNumber(plazaTotalMessages) }}</span></h2>
          <button class="ghost-btn plaza-refresh-btn" type="button" :disabled="plaza.loading" :aria-busy="plaza.loading" :aria-label="designCopy.refresh" @click="refreshPlaza"><TsIcon name="refresh" :size="16" /><span>{{ t.refresh }}</span></button>
        </div>
        <div class="plaza-feed-controls">
          <div class="plaza-filters" :aria-label="t.wallTitle">
            <button class="chip" :class="{ active: plaza.filter === 'latest' }" :aria-pressed="plaza.filter === 'latest'" type="button" @click="plaza.filter = 'latest'">{{ t.filterLatest }}</button>
            <button class="chip" :class="{ active: plaza.filter === 'hot' }" :aria-pressed="plaza.filter === 'hot'" type="button" @click="plaza.filter = 'hot'">{{ t.filterHot }}</button>
            <button class="chip" :class="{ active: plaza.filter === 'replied' }" :aria-pressed="plaza.filter === 'replied'" type="button" @click="plaza.filter = 'replied'">{{ t.filterReplied }}</button>
            <button class="chip" :class="{ active: plaza.filter === 'mine' }" :aria-pressed="plaza.filter === 'mine'" type="button" @click="isAuthed ? plaza.filter = 'mine' : go('/login')">{{ t.filterMine }}</button>
          </div>
          <label class="plaza-search-wrap">
            <TsIcon name="search" :size="16" />
            <input autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true" name="plaza-page-plaza-query-query" v-model="plaza.query" class="plaza-search" type="search" :aria-label="designCopy.search" :placeholder="designCopy.search">
          </label>
        </div>
        <div v-if="plaza.query" class="plaza-active-query"><span>{{ plaza.query }}</span><button class="ghost-btn" type="button" :aria-label="designCopy.clear" @click="clearPlazaSearch"><TsIcon name="x" :size="14" />{{ designCopy.clear }}</button></div>
        <div v-if="!plaza.loading && plazaMessages.length" class="plaza-result-strip" role="status" aria-live="polite">
          <span>{{ plazaRangeSummary }}</span><span>{{ plazaPageSummary }}</span>
        </div>

        <LoadingSkeleton v-if="plaza.loading" variant="list" :count="6" :label="t.plazaConnecting" />
        <div v-else-if="plaza.loadError" class="plaza-empty error" role="alert">{{ plaza.loadError }}</div>
        <div v-else-if="!plazaMessages.length" class="plaza-empty">
          <div class="ts-empty-title">{{ t.noMessages }}</div>
          <div>{{ t.noMessagesHint }}</div>
          <button v-if="plaza.query || plaza.filter !== 'latest'" class="ghost-btn" type="button" @click="clearPlazaSearch(); plaza.filter = 'latest'">{{ designCopy.allMessages }}</button>
        </div>
        <div v-else class="plaza-messages plaza-message-region">
          <article v-for="msg in pagedPlazaMessages" :id="'msg-' + msg.id" :key="msg.id" class="plaza-msg-card">
            <div class="plaza-msg-meta">
              <div class="plaza-msg-author">
                <button class="plaza-author-link" type="button" @click="plazaOpenProfile(msg.author)">
                <div class="plaza-avatar">
                  <img v-if="msg.avatar" :src="msg.avatar" :alt="plazaAvatarAlt(msg.author_nickname || msg.author)" loading="lazy" decoding="async">
                  <span v-else>{{ plazaInitial(msg.author_nickname || msg.author) }}</span>
                </div>
                <div>
                  <div class="plaza-author-heading"><span class="plaza-author-name">{{ msg.author_nickname || msg.author || fallback.anonymous }}</span>
                  <UserLevelBadge v-if="msg.user_id" :level="userLevel(msg.user_id)" :lang="lang" compact :show-title="false" /></div>
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
              <button
                class="icon-btn like-btn"
                :class="{ liked: isPlazaMessageLiked(msg) }"
                :aria-pressed="isPlazaMessageLiked(msg)"
                type="button"
                @click="plazaLikeMessage(msg.id)"
              >
                <TsIcon name="heart" :size="15" />
                <span>{{ t.like }} {{ msg.like_count || 0 }}</span>
              </button>
              <button class="icon-btn" type="button" @click="plazaToggleReply(msg.id)">
                <TsIcon name="message" :size="15" />
                <span>{{ t.reply }} {{ msg.reply_count || 0 }}</span>
              </button>
              <button class="icon-btn plaza-copy-action" type="button" :aria-label="t.copyLink" :title="t.copyLink" @click="plazaCopyLink(msg.id)">
                <TsIcon name="copy" :size="15" />
              </button>
            </div>
            <div v-if="plaza.replyOpen[msg.id]" class="plaza-reply-form">
              <PlazaReplyForm :t="t" :lang="lang" :target="msg" :msg-id="msg.id" :on-submit="plazaSubmitReply" @cancel="plazaToggleReply(msg.id)" />
            </div>
            <ModerationNotice :feedback="replyModeration[msg.id]" />
            <div v-if="(msg.replies || []).length" :id="'plaza-replies-' + msg.id" class="plaza-replies">
              <div v-for="reply in plazaVisibleReplies(msg)" :id="'msg-' + reply.id" :key="reply.id" class="plaza-reply-card" :class="{ 'is-preview': !plaza.repliesExpanded[msg.id] }">
                <div class="plaza-msg-meta" style="margin-bottom:0.45rem;">
                  <div class="plaza-msg-author">
                    <button class="plaza-author-link" type="button" @click="plazaOpenProfile(reply.author)">
                    <div class="plaza-avatar small">
                      <img v-if="reply.avatar" :src="reply.avatar" :alt="plazaAvatarAlt(reply.author_nickname || reply.author)" loading="lazy" decoding="async">
                      <span v-else>{{ plazaInitial(reply.author_nickname || reply.author) }}</span>
                    </div>
                    <div>
                      <div class="plaza-author-heading"><span class="plaza-author-name">{{ reply.author_nickname || reply.author || fallback.anonymous }}</span>
                      <UserLevelBadge v-if="reply.user_id" :level="userLevel(reply.user_id)" :lang="lang" compact :show-title="false" /></div>
                      <div class="plaza-msg-date">{{ plazaFormatDate(reply.created_at) }}</div>
                    </div>
                    </button>
                  </div>
                </div>
                <ReplyRecipient :target="plazaReplyTarget(reply)" prefix="msg" :lang="lang" />
                <span v-if="!plaza.repliesExpanded[msg.id]" class="plaza-msg-content" style="margin-bottom:0;">{{ reply.content }}</span>
                <SocialText
                  v-else
                  class="plaza-msg-content"
                  style="margin-bottom:0;"
                  :content="reply.content"
                  @mention="plazaOpenProfile"
                  @topic="plazaSelectTopic"
                />
                <div class="plaza-msg-footer">
                  <button class="icon-btn" type="button" :aria-label="`${replyLabels.to} ${reply.author_nickname || reply.author || replyLabels.unknown}`" @click="plazaToggleReply(reply.id)"><TsIcon name="message" :size="15" /><span>{{ t.reply }}</span></button>
                </div>
                <div v-if="plaza.replyOpen[reply.id]" class="plaza-reply-form">
                  <PlazaReplyForm :t="t" :lang="lang" :target="reply" :msg-id="reply.id" :on-submit="plazaSubmitReply" @cancel="plazaToggleReply(reply.id)" />
                </div>
                <ModerationNotice :feedback="replyModeration[reply.id]" />
              </div>
            </div>
            <button
              v-if="(msg.replies || []).length"
              class="plaza-replies-toggle"
              type="button"
              :aria-expanded="Boolean(plaza.repliesExpanded[msg.id])"
              :aria-controls="'plaza-replies-' + msg.id"
              @click="plazaToggleReplies(msg.id)"
            >
              <span>{{ plazaRepliesToggleLabel(msg) }}</span>
              <TsIcon :name="plaza.repliesExpanded[msg.id] ? 'chevronUp' : 'chevronDown'" :size="16" />
            </button>
            <p v-if="plaza.repliesError[msg.id]" class="plaza-empty error" role="alert">{{ plaza.repliesError[msg.id] }}<button class="ghost-btn" type="button" @click="fetchPlazaReplies(msg.id)">{{ t.refresh }}</button></p>
            <button v-if="plaza.repliesExpanded[msg.id] && (plaza.repliesCursor[msg.id] || plaza.repliesLoading[msg.id])" class="ghost-btn plaza-replies-more" type="button" :disabled="plaza.repliesLoading[msg.id]" :aria-busy="Boolean(plaza.repliesLoading[msg.id])" @click="fetchPlazaReplies(msg.id, true)">{{ isEn ? 'Load more replies' : isZh ? '加载更多回复' : '返信をもっと見る' }}</button>
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
      </section>

      <aside class="plaza-side" :aria-label="designCopy.info">
        <details class="panel plaza-discovery" :open="!compact">
          <summary class="plaza-disclosure-heading"><span><TsIcon name="message" :size="18" />{{ designCopy.topics }}</span><span class="plaza-summary-end"><small>{{ plaza.topics.length }}</small><TsIcon name="chevronDown" :size="16" /></span></summary>
          <div class="plaza-topic-list" :aria-busy="plaza.topicsLoading">
            <LoadingSkeleton v-if="plaza.topicsLoading" variant="topics" :count="3" :label="t.syncing" />
            <div v-else-if="plaza.topicsError" class="plaza-topic-empty error" role="alert">{{ plaza.topicsError }}</div>
            <template v-else>
              <button v-for="topic in plaza.topics" :key="topic.topic" class="plaza-topic-chip" :class="{ active: plaza.query === '#' + topic.topic }" :aria-pressed="plaza.query === '#' + topic.topic" type="button" @click="plazaSelectTopic(topic.topic)"><span>#{{ topic.topic }}</span><small>{{ plazaFormatNumber(topic.count) }} {{ designCopy.topicCount }}</small><TsIcon name="chevronRight" :size="14" /></button>
              <div v-if="!plaza.topics.length" class="plaza-topic-empty">{{ isEn ? 'No topics yet. Try posting #TsukuyomiTea#' : isZh ? '还没有话题，试试发布 #月读茶会#' : '最初の #話題# を投稿してみましょう。' }}</div>
            </template>
          </div>
        </details>
        <details class="panel plaza-discovery" :open="!compact">
          <summary class="plaza-disclosure-heading"><span><TsIcon name="compass" :size="18" />{{ designCopy.sites }}</span><TsIcon name="chevronDown" :size="16" /></summary>
          <div class="plaza-friends">
            <a v-for="f in friends" :key="f.url" class="plaza-friend-card" :href="f.url" :target="f.external ? '_blank' : undefined" :rel="f.external ? 'noopener noreferrer' : undefined" @click="f.url.startsWith('/') && !f.external && ($event.preventDefault(), go(f.url))">
              <TsIcon :name="f.external ? 'code' : f.url === '/stage' ? 'book' : 'image'" :size="22" />
              <div><div class="plaza-friend-name">{{ f.name }}</div><div class="plaza-friend-desc">{{ f.desc }}</div></div>
              <TsIcon name="chevronRight" :size="16" />
            </a>
          </div>
          <div class="plaza-friend-actions"><a class="ghost-btn" href="/friend-links" @click.prevent="go('/friend-links')">{{ designCopy.directory }}</a><a class="ghost-btn" href="/friend-links/apply" @click.prevent="go('/friend-links/apply')"><TsIcon name="plus" :size="14" />{{ designCopy.apply }}</a></div>
        </details>
        <details class="panel plaza-info">
          <summary class="plaza-disclosure-heading"><span><TsIcon name="info" :size="18" />{{ designCopy.info }}</span><TsIcon name="chevronDown" :size="16" /></summary>
          <div class="plaza-info-content">
            <section><h3>{{ t.activity }}</h3><div class="plaza-activities">
              <p v-if="!plazaActivity.length" class="plaza-topic-empty">{{ t.plazaJustOpened }}</p>
              <a v-for="item in plazaActivity" :key="item.id" class="plaza-activity-item" :href="'#msg-' + item.id" @click.prevent="plazaOpenActivity(item.id)"><TsIcon name="message" :size="14" /><span>{{ item.author_nickname || item.author || fallback.visitor }} {{ item.parent_id ? fallback.replied : fallback.posted }}<small>{{ plazaFormatRelative(item.created_at) }}</small></span></a>
            </div></section>
            <section><h3>{{ t.rulesTitle }}</h3><div class="plaza-rules"><p>{{ t.rule1 }}</p><p>{{ plazaCopy.friendRule }}</p><p>{{ t.rule3 }}</p></div></section>
            <section class="plaza-stats" :aria-label="t.plazaStatusLabel">
              <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsArticles }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.articles) }}</div></div>
              <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsUsers }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.users) }}</div></div>
              <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsMessages }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.messages) }}</div></div>
              <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsUptime }}</div><div class="plaza-stat-value">{{ plazaFormatUptime(plaza.stats?.uptime) }}</div></div>
            </section>
            <div class="plaza-status-line"><span>{{ t.plazaStatusLabel }}</span><span class="plaza-status-value">{{ plaza.loading ? t.syncing : plaza.loadError ? t.plazaLoadFailed : t.online }}</span></div>
          </div>
        </details>
      </aside>
    </section>

    <div v-if="plazaToast.visible" class="plaza-toast show" :class="plazaToast.type" :role="plazaToast.type === 'error' ? 'alert' : 'status'">{{ plazaToast.text }}</div>
  </main>
</template>
