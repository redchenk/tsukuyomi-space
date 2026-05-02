<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { authHeaders, getSession, parseResponse } from '../api/client';
import PlazaComposer from '../components/PlazaComposer.vue';
import PlazaReplyForm from '../components/PlazaReplyForm.vue';

const props = defineProps({
  lang: { type: String, required: true },
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const session = ref(getSession());
const plaza = reactive({
  messages: [],
  stats: null,
  filter: 'latest',
  query: '',
  loading: false,
  replyOpen: {}
});
const plazaToast = reactive({ text: '', visible: false });
let plazaToastTimer = 0;

const user = computed(() => session.value?.user || null);
const isAuthed = computed(() => Boolean(session.value));
const isZh = computed(() => props.lang === 'zh');

const friends = computed(() => isZh.value ? [
  { name: '\u6708\u8bfb\u7a7a\u95f4\u5b98\u65b9', desc: '\u9879\u76ee\u4ed3\u5e93\u4e0e\u66f4\u65b0\u8bb0\u5f55', url: 'https://github.com/redchenk/tsukuyomi-space', avatar: '\u6708' },
  { name: '\u8f89\u591c\u59ec\u535a\u5ba2', desc: '\u6587\u7ae0\u3001\u516c\u544a\u4e0e\u521b\u4f5c\u624b\u8bb0', url: '/pages/stage', avatar: '\u6587' },
  { name: 'KASSEN \u7ade\u6280\u573a', desc: '3v3 \u5bf9\u6297\u539f\u578b', url: '/pages/arena', avatar: '\u6218' },
  { name: '\u53cb\u94fe\u7533\u8bf7', desc: '\u7559\u4e0b\u7ad9\u70b9\u4fe1\u606f\u7b49\u5f85\u5ba1\u6838', url: '/pages/terminal', avatar: '\u94fe' }
] : [
  { name: '\u6708\u8aad\u7a7a\u9593\u516c\u5f0f', desc: '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u30ea\u30dd\u30b8\u30c8\u30ea\u3068\u66f4\u65b0\u8a18\u9332', url: 'https://github.com/redchenk/tsukuyomi-space', avatar: '\u6708' },
  { name: '\u8f1d\u591c\u59eb\u30d6\u30ed\u30b0', desc: '\u8a18\u4e8b\u3001\u304a\u77e5\u3089\u305b\u3001\u5275\u4f5c\u30ce\u30fc\u30c8', url: '/pages/stage', avatar: '\u6587' },
  { name: 'KASSEN \u30a2\u30ea\u30fc\u30ca', desc: '3v3 \u5bfe\u6226\u30d7\u30ed\u30c8\u30bf\u30a4\u30d7', url: '/pages/arena', avatar: '\u6226' },
  { name: '\u76f8\u4e92\u30ea\u30f3\u30af\u7533\u8acb', desc: '\u30b5\u30a4\u30c8\u60c5\u5831\u3092\u6b8b\u3057\u3066\u5be9\u67fb\u3092\u304a\u5f85\u3061\u304f\u3060\u3055\u3044', url: '/pages/terminal', avatar: '\u30ea' }
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
  arrow: '\u2192'
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
  arrow: '\u2192'
});

const plazaMessages = computed(() => {
  const repliesByParent = {};
  plaza.messages.forEach((item) => {
    if (!item.parent_id) return;
    (repliesByParent[item.parent_id] = repliesByParent[item.parent_id] || []).push(item);
  });

  let top = plaza.messages.filter((item) => !item.parent_id).map((item) => ({
    ...item,
    replies: (repliesByParent[item.id] || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
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
    top.sort((a, b) => (b.like_count || 0) - (a.like_count || 0) || new Date(b.created_at) - new Date(a.created_at));
  } else if (plaza.filter === 'replied') {
    top = top.filter((item) => item.replies.length > 0);
    top.sort((a, b) => b.replies.length - a.replies.length || new Date(b.created_at) - new Date(a.created_at));
  } else if (plaza.filter === 'mine') {
    top = top.filter((item) => currentUsername && item.author === currentUsername);
    top.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    top.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  return top;
});

const plazaActivity = computed(() => [...plaza.messages]
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .slice(0, 6));

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

async function loadPlazaStats() {
  try {
    const response = await fetch('/api/stats');
    const result = await parseResponse(response);
    if (result.success) plaza.stats = result.data || {};
  } catch (_) {}
}

async function loadPlazaMessages() {
  try {
    const response = await fetch('/api/messages');
    const result = await parseResponse(response);
    if (result.success) plaza.messages = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    showPlazaToast(props.t.plazaLoadFailed);
  }
}

async function refreshPlaza() {
  plaza.loading = true;
  session.value = getSession();
  try {
    await Promise.all([loadPlazaStats(), loadPlazaMessages()]);
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
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: content.trim() })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.publishFailed);
    showPlazaToast(props.t.msgPublished);
    await refreshPlaza();
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
    const response = await fetch(`/api/messages/${parentId}/reply`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: content.trim() })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.replyFailed);
    showPlazaToast(props.t.replyPublished);
    await refreshPlaza();
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
    const response = await fetch(`/api/messages/${id}/like`, {
      method: 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || props.t.likeFailed);
    localStorage.setItem(`liked_${id}`, '1');
    showPlazaToast(props.t.likedToast);
    await refreshPlaza();
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

function plazaFormatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString(isZh.value ? 'zh-CN' : 'ja-JP', { hour12: false });
}

function plazaFormatRelative(value) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
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

function plazaFormatUptime(seconds) {
  const total = Math.floor(Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  if (isZh.value) return days > 0 ? `${days}\u5929${hours}\u65f6` : `${hours}\u65f6`;
  return days > 0 ? `${days}\u65e5${hours}\u6642\u9593` : `${hours}\u6642\u9593`;
}

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
            <input v-model="plaza.query" class="plaza-search" type="search" :placeholder="t.searchPlaceholder || fallback.search">
            <button class="ghost-btn" type="button" @click="refreshPlaza">{{ t.refresh }}</button>
          </div>
        </div>
        <div class="plaza-filters">
          <button class="chip" :class="{ active: plaza.filter === 'latest' }" type="button" @click="plaza.filter = 'latest'">{{ t.filterLatest }}</button>
          <button class="chip" :class="{ active: plaza.filter === 'hot' }" type="button" @click="plaza.filter = 'hot'">{{ t.filterHot }}</button>
          <button class="chip" :class="{ active: plaza.filter === 'replied' }" type="button" @click="plaza.filter = 'replied'">{{ t.filterReplied }}</button>
          <button class="chip" :class="{ active: plaza.filter === 'mine' }" type="button" @click="plaza.filter = 'mine'">{{ t.filterMine }}</button>
        </div>

        <div v-if="!isAuthed" class="plaza-composer plaza-composer-locked">
          <div class="plaza-empty">
            <div style="font-weight:700;color:#fff;margin-bottom:0.45rem;">{{ t.loginToPost }}</div>
            <div style="margin-bottom:1rem;">{{ t.loginToPostDesc }}</div>
            <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.goLogin }}</a>
          </div>
        </div>
        <div v-else class="plaza-composer">
          <PlazaComposer :t="t" :on-submit="plazaSubmitMessage" />
        </div>

        <div v-if="plaza.loading" class="plaza-empty">{{ t.plazaConnecting }}</div>
        <div v-else-if="!plazaMessages.length" class="plaza-empty">
          <div style="font-weight:700;color:#fff;margin-bottom:0.45rem;">{{ t.noMessages }}</div>
          <div>{{ t.noMessagesHint }}</div>
        </div>
        <div v-else class="plaza-messages">
          <article v-for="msg in plazaMessages" :id="'msg-' + msg.id" :key="msg.id" class="plaza-msg-card">
            <div class="plaza-msg-meta">
              <div class="plaza-msg-author">
                <div class="plaza-avatar">{{ plazaInitial(msg.author) }}</div>
                <div>
                  <div class="plaza-author-name">{{ msg.author || fallback.anonymous }}</div>
                  <div class="plaza-msg-date">{{ plazaFormatDate(msg.created_at) }}</div>
                </div>
              </div>
              <div class="plaza-msg-date">#{{ msg.id }}</div>
            </div>
            <div class="plaza-msg-content">{{ msg.content }}</div>
            <div class="plaza-msg-footer">
              <button class="icon-btn" :class="{ liked: isPlazaMessageLiked(msg.id) }" type="button" @click="plazaLikeMessage(msg.id)">{{ t.like }} {{ msg.like_count || 0 }}</button>
              <button class="icon-btn" type="button" @click="plazaToggleReply(msg.id)">{{ t.reply }} {{ (msg.replies || []).length }}</button>
              <button class="icon-btn" type="button" @click="plazaCopyLink(msg.id)">{{ t.copyLink }}</button>
            </div>
            <div v-if="plaza.replyOpen[msg.id]" class="plaza-reply-form">
              <PlazaReplyForm :t="t" :msg-id="msg.id" :on-submit="plazaSubmitReply" @cancel="plazaToggleReply(msg.id)" />
            </div>
            <div v-if="(msg.replies || []).length" class="plaza-replies">
              <div v-for="reply in msg.replies" :key="reply.id" class="plaza-reply-card">
                <div class="plaza-msg-meta" style="margin-bottom:0.45rem;">
                  <div class="plaza-msg-author">
                    <div class="plaza-avatar" style="width:30px;height:30px;font-size:0.78rem;">{{ plazaInitial(reply.author) }}</div>
                    <div>
                      <div class="plaza-author-name" style="font-size:0.82rem;">{{ reply.author || fallback.anonymous }}</div>
                      <div class="plaza-msg-date">{{ plazaFormatDate(reply.created_at) }}</div>
                    </div>
                  </div>
                </div>
                <div class="plaza-msg-content" style="margin-bottom:0;">{{ reply.content }}</div>
              </div>
            </div>
          </article>
        </div>
      </div>

      <aside class="plaza-side">
        <div class="panel">
          <div class="panel-title">{{ t.residents }} <span>{{ friends.length }}</span></div>
          <div class="plaza-friends">
            <a v-for="f in friends" :key="f.name" class="plaza-friend-card" :href="f.url">
              <div class="plaza-friend-avatar">{{ f.avatar }}</div>
              <div>
                <div class="plaza-friend-name">{{ f.name }}</div>
                <div class="plaza-friend-desc">{{ f.desc }}</div>
              </div>
              <div style="color:rgba(255,225,235,0.42);">{{ fallback.arrow }}</div>
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
