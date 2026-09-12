<script setup>
import { computed, onMounted, reactive } from 'vue';
import { authFetch, authHeaders, noStoreUrl, parseResponse } from '../api/client';
import { formatDateTime } from '../utils/time';
import TsIcon from '../components/TsIcon.vue';
import { publishNotificationBadge } from '../services/notificationBadge';

const props = defineProps({
  lang: { type: String, default: 'zh' }
});

const emit = defineEmits(['go']);
const NOTIFICATIONS_PAGE_SIZE = 12;

const inbox = reactive({
  loading: true,
  message: '',
  unread: 0,
  items: [],
  page: 1,
  pageSize: NOTIFICATIONS_PAGE_SIZE,
  total: 0,
  totalPages: 1
});

const unreadLabel = computed(() => inbox.unread > 99 ? '99+' : String(inbox.unread || 0));
const paginationCopy = computed(() => {
  if (props.lang === 'en') {
    return { label: 'Inbox pagination', previous: 'Previous', next: 'Next', jump: 'Go to page' };
  }
  if (props.lang === 'ja') {
    return {
      label: '\u901a\u77e5\u306e\u30da\u30fc\u30b8\u5207\u308a\u66ff\u3048',
      previous: '\u524d\u306e\u30da\u30fc\u30b8',
      next: '\u6b21\u306e\u30da\u30fc\u30b8',
      jump: '\u30da\u30fc\u30b8\u3078\u79fb\u52d5'
    };
  }
  return {
    label: '\u7ad9\u5185\u4fe1\u5206\u9875',
    previous: '\u4e0a\u4e00\u9875',
    next: '\u4e0b\u4e00\u9875',
    jump: '\u8df3\u5230\u7b2c'
  };
});
const paginationItems = computed(() => {
  const total = inbox.totalPages;
  const current = inbox.page;
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
const pageSummary = computed(() => {
  const start = inbox.total ? (inbox.page - 1) * inbox.pageSize + 1 : 0;
  const end = Math.min(inbox.page * inbox.pageSize, inbox.total);
  if (props.lang === 'en') return `${start}-${end} of ${inbox.total}`;
  if (props.lang === 'ja') return `${inbox.total}\u4ef6\u4e2d ${start}-${end}\u4ef6`;
  return `\u7b2c ${start}-${end} \u6761\uff0c\u5171 ${inbox.total} \u6761`;
});

function setUnreadCount(value) {
  inbox.unread = publishNotificationBadge(value);
}

function formatDate(value) {
  return formatDateTime(value, 'zh-CN');
}

function notificationIcon(type) {
  const icons = {
    like: 'heart',
    reply: 'message',
    mention: 'mail',
    follow: 'userPlus',
    bookmark: 'bookmark'
  };
  return icons[type] || 'bell';
}

function actorInitial(item) {
  return String(item.actor_username || item.metadata?.actorName || '月').slice(0, 1).toUpperCase();
}

async function loadNotifications(page = inbox.page) {
  const numericPage = Number(page);
  const requestedPage = Number.isFinite(numericPage) ? Math.max(1, Math.trunc(numericPage)) : inbox.page;
  inbox.loading = true;
  inbox.message = '';
  try {
    const params = new URLSearchParams({
      page: String(requestedPage),
      limit: String(NOTIFICATIONS_PAGE_SIZE)
    });
    const response = await authFetch(noStoreUrl(`/api/user/notifications?${params.toString()}`), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) {
      if (response.status === 404 || /Cannot GET/i.test(result.message || '')) {
        inbox.items = [];
        inbox.page = 1;
        inbox.total = 0;
        inbox.totalPages = 1;
        setUnreadCount(0);
        return;
      }
      throw new Error(result.message || '加载失败');
    }
    inbox.items = Array.isArray(result.data) ? result.data : [];
    inbox.page = Math.max(1, Number.parseInt(result.pagination?.page, 10) || requestedPage);
    inbox.pageSize = Math.max(1, Number.parseInt(result.pagination?.limit, 10) || NOTIFICATIONS_PAGE_SIZE);
    inbox.total = Math.max(0, Number.parseInt(result.pagination?.total, 10) || inbox.items.length);
    inbox.totalPages = Math.max(1, Number.parseInt(result.pagination?.totalPages, 10) || Math.ceil(inbox.total / inbox.pageSize));
    setUnreadCount(result.unread);
  } catch (error) {
    inbox.message = error.message || '站内信加载失败';
  } finally {
    inbox.loading = false;
  }
}

async function changePage(page) {
  const nextPage = Math.min(Math.max(Number(page) || 1, 1), inbox.totalPages);
  if (inbox.loading || nextPage === inbox.page) return;
  await loadNotifications(nextPage);
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.querySelector('.notifications-list')?.scrollIntoView({
    block: 'start',
    behavior: reduceMotion ? 'auto' : 'smooth'
  });
}

function isPageGap(item) {
  return typeof item === 'string';
}

async function markRead(item) {
  if (!item?.id || !item.unread) return;
  const response = await authFetch(`/api/user/notifications/${item.id}/read`, {
    method: 'POST',
    headers: authHeaders()
  });
  const result = await parseResponse(response);
  if (result.success) {
    item.unread = false;
    item.read_at = result.data?.read_at || new Date().toISOString();
    setUnreadCount(result.unread ?? Math.max(0, inbox.unread - 1));
  }
}

async function markAllRead() {
  const response = await authFetch('/api/user/notifications/read-all', {
    method: 'POST',
    headers: authHeaders()
  });
  const result = await parseResponse(response);
  if (result.success) {
    inbox.items = inbox.items.map(item => ({ ...item, unread: false, read_at: item.read_at || new Date().toISOString() }));
    setUnreadCount(result.data?.count);
  }
}

async function openNotification(item) {
  await markRead(item);
  if (item.link) emit('go', item.link);
}

onMounted(loadNotifications);
</script>

<template>
  <main class="page notifications-page">
    <section class="notifications-shell" :aria-busy="inbox.loading">
      <header class="notifications-hero">
        <div>
          <span class="notifications-kicker">Inbox</span>
          <h1>站内信</h1>
          <p>这里会收纳你收到的回复、点赞和互动提醒。</p>
        </div>
        <div class="notifications-actions">
          <span class="notifications-count">{{ unreadLabel }}</span>
          <button class="ghost-btn" type="button" :disabled="!inbox.unread" @click="markAllRead">全部已读</button>
          <button class="primary-btn" type="button" :disabled="inbox.loading" :aria-busy="inbox.loading" @click="loadNotifications()">刷新</button>
        </div>
      </header>

      <LoadingSkeleton v-if="inbox.loading" variant="list" :count="5" label="正在加载站内信" />
      <div v-else-if="inbox.message" class="notifications-status error" role="alert">{{ inbox.message }}</div>
      <div v-else-if="!inbox.items.length" class="notifications-empty">
        暂时没有新消息。等有人回应你的文字时，这里会亮起来。
      </div>

      <div v-else class="notifications-list">
        <article
          v-for="item in inbox.items"
          :key="item.id"
          class="notification-card"
          :class="{ unread: item.unread }"
        >
          <div class="notification-avatar">
            <img v-if="item.actor_avatar" :src="item.actor_avatar" alt="">
            <span v-else>{{ actorInitial(item) }}</span>
          </div>
          <div class="notification-main">
            <div class="notification-head">
              <strong><span class="notification-type-icon" aria-hidden="true"><TsIcon :name="notificationIcon(item.type)" :size="16" /></span> {{ item.title }}</strong>
              <time>{{ formatDate(item.created_at) }}</time>
            </div>
            <p>{{ item.content }}</p>
            <div class="notification-tools">
              <button v-if="item.link" class="primary-btn compact" type="button" @click="openNotification(item)">查看</button>
              <button v-if="item.unread" class="ghost-btn compact" type="button" @click="markRead(item)">标为已读</button>
              <span v-else>已读</span>
            </div>
          </div>
        </article>
      </div>

      <nav
        v-if="!inbox.loading && !inbox.message && inbox.items.length && inbox.totalPages > 1"
        class="notifications-pagination"
        :aria-label="paginationCopy.label"
      >
        <span class="notifications-page-summary">{{ pageSummary }}</span>
        <div class="notifications-page-controls">
          <button
            class="notifications-page-button notifications-page-nav"
            type="button"
            :disabled="inbox.page <= 1"
            :aria-label="paginationCopy.previous"
            @click="changePage(inbox.page - 1)"
          >
            <TsIcon name="arrowLeft" :size="16" />
            <span>{{ paginationCopy.previous }}</span>
          </button>
          <template v-for="item in paginationItems" :key="item">
            <span v-if="isPageGap(item)" class="notifications-page-gap" aria-hidden="true">...</span>
            <button
              v-else
              class="notifications-page-button"
              :class="{ active: item === inbox.page }"
              type="button"
              :aria-current="item === inbox.page ? 'page' : undefined"
              :aria-label="`${paginationCopy.jump} ${item}`"
              @click="changePage(item)"
            >
              {{ item }}
            </button>
          </template>
          <button
            class="notifications-page-button notifications-page-nav"
            type="button"
            :disabled="inbox.page >= inbox.totalPages"
            :aria-label="paginationCopy.next"
            @click="changePage(inbox.page + 1)"
          >
            <span>{{ paginationCopy.next }}</span>
            <TsIcon name="arrowRight" :size="16" />
          </button>
        </div>
      </nav>
    </section>
  </main>
</template>
