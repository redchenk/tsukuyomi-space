<script setup>
import { computed, onMounted, reactive } from 'vue';
import { authFetch, authHeaders, noStoreUrl, parseResponse } from '../api/client';
import { formatDateTime } from '../utils/time';
import TsIcon from '../components/TsIcon.vue';
import { publishNotificationBadge } from '../services/notificationBadge';

const emit = defineEmits(['go']);

const inbox = reactive({
  loading: true,
  message: '',
  unread: 0,
  items: []
});

const unreadLabel = computed(() => inbox.unread > 99 ? '99+' : String(inbox.unread || 0));

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

async function loadNotifications() {
  inbox.loading = true;
  inbox.message = '';
  try {
    const response = await authFetch(noStoreUrl('/api/user/notifications'), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) {
      if (response.status === 404 || /Cannot GET/i.test(result.message || '')) {
        inbox.items = [];
        setUnreadCount(0);
        return;
      }
      throw new Error(result.message || '加载失败');
    }
    inbox.items = Array.isArray(result.data) ? result.data : [];
    setUnreadCount(result.unread);
  } catch (error) {
    inbox.message = error.message || '站内信加载失败';
  } finally {
    inbox.loading = false;
  }
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
    <section class="notifications-shell">
      <header class="notifications-hero">
        <div>
          <span class="notifications-kicker">Inbox</span>
          <h1>站内信</h1>
          <p>这里会收纳你收到的回复、点赞和互动提醒。</p>
        </div>
        <div class="notifications-actions">
          <span class="notifications-count">{{ unreadLabel }}</span>
          <button class="ghost-btn" type="button" :disabled="!inbox.unread" @click="markAllRead">全部已读</button>
          <button class="primary-btn" type="button" @click="loadNotifications">刷新</button>
        </div>
      </header>

      <div v-if="inbox.loading" class="notifications-status">加载中...</div>
      <div v-else-if="inbox.message" class="notifications-status error">{{ inbox.message }}</div>
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
    </section>
  </main>
</template>
