<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { authFetch, authHeaders, noStoreUrl, parseResponse } from '../api/client';
import BeianLink from '../components/BeianLink.vue';
import SiteMusicDrawer from '../components/SiteMusicDrawer.vue';
import TsIcon from '../components/TsIcon.vue';
import {
  NOTIFICATION_BADGE_EVENT,
  normalizeNotificationCount,
  publishNotificationBadge
} from '../services/notificationBadge';

const props = defineProps({
  isAuthed: { type: Boolean, default: false },
  lang: { type: String, required: true },
  routeName: { type: String, default: 'access' },
  showChrome: { type: Boolean, default: true },
  music: { type: Object, default: null },
  t: { type: Object, required: true },
  theme: { type: String, default: 'dark' },
  user: { type: Object, default: null }
});

defineEmits(['go', 'logout', 'set-lang', 'toggle-theme']);

const navOpen = ref(false);
const railExpandedKey = ref(null);
const railRef = ref(null);
const unreadNotifications = ref(0);
const UNREAD_POLL_INTERVAL_MS = 60000;
let unreadPollId = 0;
let unreadRequest = null;

const hasGlobalBackground = computed(() => props.showChrome && props.routeName !== 'access' && props.routeName !== 'accessAlias' && props.routeName !== 'room');
const showSiteBeian = computed(() => props.showChrome && !['hub', 'room', 'roomSettings'].includes(props.routeName));
const showNotifications = computed(() => props.isAuthed);

const navItems = computed(() => [
  { path: '/hub', key: 'hub', label: props.t.hub, icon: 'home', active: props.routeName === 'hub', spa: true },
  { path: '/room', key: 'room', label: props.t.room, icon: 'moon', active: props.routeName === 'room' || props.routeName === 'roomSettings', spa: true },
  { path: '/plaza', key: 'plaza', label: props.t.plaza, icon: 'plaza', active: props.routeName === 'plaza', spa: true },
  { path: '/stage', key: 'stage', label: props.t.stage, icon: 'book', active: props.routeName === 'stage' || props.routeName === 'article' || props.routeName === 'editor', spa: true },
  { path: '/gallery', key: 'gallery', label: '图库', icon: 'image', active: props.routeName === 'gallery' || props.routeName === 'galleryManage', spa: true },
  { path: '/pixel', key: 'pixel', label: props.t.arena, icon: 'palette', active: props.routeName === 'pixel', spa: true },
  { path: '/reality', key: 'reality', label: props.t.reality, icon: 'compass', active: props.routeName === 'reality', spa: true },
  { path: '/agent-os', key: 'agentOs', label: 'Agent OS', icon: 'bot', active: false, spa: false }
]);

const mobilePrimaryItems = computed(() => navItems.value.slice(0, 4));
const mobileSecondaryItems = computed(() => navItems.value.slice(4));
const activeNavItem = computed(() => navItems.value.find((item) => item.active) || navItems.value[0]);
const accountLabel = computed(() => (props.isAuthed ? props.t.ucTitle : props.t.login));
const themeLabel = computed(() => (props.theme === 'dark' ? '切换浅色主题' : '切换深色主题'));
const railThemeLabel = computed(() => {
  if (props.lang === 'ja') return props.theme === 'dark' ? 'ライト' : 'ダーク';
  return props.theme === 'dark' ? '浅色' : '深色';
});
const railNotificationsLabel = computed(() => (props.lang === 'ja' ? '通知' : '站内信'));
const moreLabel = computed(() => (props.lang === 'ja' ? 'その他' : '更多'));

function userInitial() {
  return String(props.user?.username || props.user?.email || props.t.brand || '月').slice(0, 1).toUpperCase();
}

async function loadUnreadNotifications() {
  if (!props.isAuthed) {
    unreadNotifications.value = publishNotificationBadge(0);
    return;
  }

  if (unreadRequest) return unreadRequest;

  unreadRequest = (async () => {
    try {
      const response = await authFetch(noStoreUrl('/api/user/notifications/unread-count'), {
        headers: authHeaders(),
        cache: 'no-store'
      });
      const result = await parseResponse(response);
      if (response.status === 401) {
        unreadNotifications.value = publishNotificationBadge(0);
        return;
      }
      if (result.success && props.isAuthed) {
        unreadNotifications.value = publishNotificationBadge(result.data?.count);
      }
    } catch (_) {
      // Preserve the last known count during transient network failures.
    } finally {
      unreadRequest = null;
    }
  })();

  return unreadRequest;
}

function handleNotificationBadge(event) {
  unreadNotifications.value = normalizeNotificationCount(event.detail?.count);
}

function refreshUnreadWhenVisible() {
  if (!document.hidden) loadUnreadNotifications();
}

function restartUnreadPolling() {
  if (unreadPollId) window.clearInterval(unreadPollId);
  unreadPollId = 0;
  if (!props.isAuthed) return;

  unreadPollId = window.setInterval(refreshUnreadWhenVisible, UNREAD_POLL_INTERVAL_MS);
}

function expandRail(key) {
  railExpandedKey.value = key;
}

function collapseRail(key) {
  if (railExpandedKey.value === key) railExpandedKey.value = null;
}

function closeRailOnOutside(event) {
  if (!railRef.value || railRef.value.contains(event.target)) return;
  railExpandedKey.value = null;
}

watch(() => props.routeName, () => {
  navOpen.value = false;
  railExpandedKey.value = null;
  loadUnreadNotifications();
});

watch(() => props.isAuthed, () => {
  loadUnreadNotifications();
  restartUnreadPolling();
}, { immediate: true });
onMounted(() => {
  loadUnreadNotifications();
  document.addEventListener('pointerdown', closeRailOnOutside, { passive: true });
  document.addEventListener('visibilitychange', refreshUnreadWhenVisible, { passive: true });
  window.addEventListener(NOTIFICATION_BADGE_EVENT, handleNotificationBadge);
});
onUnmounted(() => {
  if (unreadPollId) window.clearInterval(unreadPollId);
  document.removeEventListener('pointerdown', closeRailOnOutside);
  document.removeEventListener('visibilitychange', refreshUnreadWhenVisible);
  window.removeEventListener(NOTIFICATION_BADGE_EVENT, handleNotificationBadge);
});
</script>

<template>
  <div class="app-shell" :class="{ 'room-shell': routeName === 'room' }">
    <div v-if="hasGlobalBackground" class="site-global-bg" aria-hidden="true"></div>
    <div v-if="showChrome && routeName !== 'room'" class="moon" aria-hidden="true"></div>

    <aside v-if="showChrome" ref="railRef" class="site-rail" aria-label="Quick navigation">
      <a href="/hub" class="rail-mark" :aria-label="t.brand" @click.prevent="$emit('go', '/hub')">
        <TsIcon name="eclipse" :size="24" :stroke-width="1.9" />
        <span class="rail-mark-label">{{ t.brand }}</span>
      </a>

      <nav class="rail-nav">
        <a
          v-for="item in navItems"
          :key="item.key"
          :href="item.path"
          class="rail-link"
          :class="{ active: item.active, expanded: railExpandedKey === item.key }"
          :aria-label="item.label"
          :title="item.label"
          @pointerenter="expandRail(item.key)"
          @pointerleave="collapseRail(item.key)"
          @focus="expandRail(item.key)"
          @blur="collapseRail(item.key)"
          @click="expandRail(item.key); item.spa && ($event.preventDefault(), $emit('go', item.path))"
        >
          <span class="rail-icon"><TsIcon :name="item.icon" :size="20" /></span>
          <span class="rail-label">{{ item.label }}</span>
        </a>
      </nav>

      <div class="rail-footer">
        <button
          v-if="showNotifications"
          class="rail-link rail-notifications"
          :class="{ active: routeName === 'notifications', expanded: railExpandedKey === 'notifications' }"
          type="button"
          :aria-label="`站内信，${unreadNotifications} 条未读`"
          :title="`站内信，${unreadNotifications} 条未读`"
          @pointerenter="expandRail('notifications')"
          @pointerleave="collapseRail('notifications')"
          @focus="expandRail('notifications')"
          @blur="collapseRail('notifications')"
          @click="expandRail('notifications'); $emit('go', '/notifications')"
        >
          <span class="rail-icon"><TsIcon name="bell" :size="20" /></span>
          <span class="rail-label">{{ railNotificationsLabel }}</span>
          <i v-if="unreadNotifications" class="rail-badge">{{ unreadNotifications > 99 ? '99+' : unreadNotifications }}</i>
        </button>

        <button
          class="rail-link rail-theme"
          type="button"
          :aria-label="themeLabel"
          :title="themeLabel"
          :class="{ expanded: railExpandedKey === 'theme' }"
          @pointerenter="expandRail('theme')"
          @pointerleave="collapseRail('theme')"
          @focus="expandRail('theme')"
          @blur="collapseRail('theme')"
          @click="expandRail('theme'); $emit('toggle-theme', $event)"
        >
          <span class="rail-icon"><TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="20" /></span>
          <span class="rail-label">{{ railThemeLabel }}</span>
        </button>

        <a
          class="rail-link rail-account"
          :class="{ active: routeName === 'userCenter' || routeName === 'userProfile' || routeName === 'login', expanded: railExpandedKey === 'account' }"
          :href="isAuthed ? '/user-center' : '/login'"
          :aria-label="accountLabel"
          :title="accountLabel"
          @pointerenter="expandRail('account')"
          @pointerleave="collapseRail('account')"
          @focus="expandRail('account')"
          @blur="collapseRail('account')"
          @click.prevent="expandRail('account'); $emit('go', isAuthed ? '/user-center' : '/login')"
        >
          <span class="rail-icon rail-account-icon">
            <img v-if="user?.avatar" :src="user.avatar" :alt="user?.username || user?.email || t.brand">
            <span v-else aria-hidden="true">{{ userInitial() }}</span>
          </span>
          <span class="rail-label">{{ accountLabel }}</span>
        </a>
      </div>
    </aside>

    <header v-if="showChrome && routeName !== 'room'" class="topbar site-commandbar">
      <a href="/hub" class="brand room-brand site-brand" @click.prevent="$emit('go', '/hub')">
        <span class="room-brand-mark site-brand-mark site-brand-icon" aria-hidden="true">
          <TsIcon name="eclipse" :size="21" :stroke-width="1.9" />
        </span>
        <span>
          <strong>{{ t.brand }}</strong>
          <small>{{ activeNavItem?.label || 'Tsukuyomi Live Portal' }}</small>
        </span>
      </a>

      <div class="mobile-command-actions" aria-label="Mobile quick actions">
        <button
          v-if="showNotifications"
          class="mobile-command-btn"
          type="button"
          :class="{ active: routeName === 'notifications' }"
          :aria-label="`站内信，${unreadNotifications} 条未读`"
          @click="$emit('go', '/notifications')"
        >
          <TsIcon name="bell" :size="18" />
          <span v-if="unreadNotifications" class="mobile-command-badge">{{ unreadNotifications > 99 ? '99+' : unreadNotifications }}</span>
        </button>
        <button
          class="mobile-command-btn mobile-account-btn"
          type="button"
          :class="{ active: routeName === 'userCenter' || routeName === 'userProfile' || routeName === 'login' }"
          :aria-label="accountLabel"
          @click="$emit('go', isAuthed ? '/user-center' : '/login')"
        >
          <img v-if="isAuthed && user?.avatar" :src="user.avatar" :alt="user?.username || user?.email || t.brand">
          <span v-else-if="isAuthed">{{ userInitial() }}</span>
          <TsIcon v-else name="user" :size="18" />
        </button>
      </div>
    </header>

    <button
      v-if="showChrome && navOpen"
      class="site-navigation-scrim"
      type="button"
      aria-label="关闭导航"
      @click="navOpen = false"
    ></button>

    <div v-if="showChrome && navOpen" id="site-navigation" class="nav-actions room-nav-links site-nav-links open" role="dialog" aria-modal="true" :aria-label="moreLabel">
      <div class="site-nav-drawer-head">
        <div>
          <strong>{{ moreLabel }}</strong>
          <span>{{ activeNavItem?.label || t.brand }}</span>
        </div>
        <button class="site-nav-close" type="button" aria-label="关闭导航" @click="navOpen = false">
          <TsIcon name="x" :size="18" />
        </button>
      </div>

      <section class="site-nav-section">
        <span class="site-nav-section-title">{{ lang === 'ja' ? '探索' : '探索' }}</span>
        <div class="site-nav-grid">
          <a
            v-for="item in mobileSecondaryItems"
            :key="item.key"
            :href="item.path"
            class="nav-link"
            :class="{ 'router-link-active': item.active }"
            @click="navOpen = false; item.spa && ($event.preventDefault(), $emit('go', item.path))"
          >
            <TsIcon class="nav-icon" :name="item.icon" :size="18" />
            <span>{{ item.label }}</span>
          </a>
        </div>
      </section>

      <section v-if="showNotifications || isAuthed" class="site-nav-section">
        <span class="site-nav-section-title">{{ lang === 'ja' ? 'アカウント' : '账户' }}</span>
        <div class="site-nav-grid">
          <a
            v-if="showNotifications"
            href="/notifications"
            class="nav-link"
            :class="{ 'router-link-active': routeName === 'notifications' }"
            @click.prevent="navOpen = false; $emit('go', '/notifications')"
          >
            <TsIcon class="nav-icon" name="bell" :size="18" />
            <span>站内信</span>
            <span v-if="unreadNotifications" class="nav-inline-badge">{{ unreadNotifications > 99 ? '99+' : unreadNotifications }}</span>
          </a>
          <a v-if="isAuthed" href="/user-center" class="nav-link user-chip" :class="{ 'router-link-active': routeName === 'userCenter' || routeName === 'userProfile' }" @click.prevent="navOpen = false; $emit('go', '/user-center')">
            <TsIcon class="nav-icon" name="user" :size="18" />
            <span>{{ t.ucTitle }}</span>
          </a>
          <a v-if="isAuthed" href="/attachments" class="nav-link" :class="{ 'router-link-active': routeName === 'attachments' }" @click.prevent="navOpen = false; $emit('go', '/attachments')">
            <TsIcon class="nav-icon" name="image" :size="18" />
            <span>附件库</span>
          </a>
          <button v-if="isAuthed" class="ghost-btn nav-link" type="button" @click="navOpen = false; $emit('logout')">
            <TsIcon class="nav-icon" name="x" :size="18" />
            <span>{{ t.logout }}</span>
          </button>
        </div>
      </section>

      <section v-else class="site-nav-section">
        <span class="site-nav-section-title">{{ lang === 'ja' ? 'アカウント' : '账户' }}</span>
        <div class="site-nav-grid">
          <a href="/login" class="nav-link" :class="{ 'router-link-active': routeName === 'login' }" @click.prevent="navOpen = false; $emit('go', '/login')">
            <TsIcon class="nav-icon" name="user" :size="18" />
            <span>{{ t.login }}</span>
          </a>
          <a href="/register" class="nav-link" :class="{ 'router-link-active': routeName === 'register' }" @click.prevent="navOpen = false; $emit('go', '/register')">
            <TsIcon class="nav-icon" name="badge" :size="18" />
            <span>{{ t.register }}</span>
          </a>
        </div>
      </section>

      <section class="site-nav-section">
        <span class="site-nav-section-title">{{ lang === 'ja' ? '表示' : '偏好' }}</span>
        <div class="site-nav-preferences">
          <button
            class="theme-toggle nav-link"
            type="button"
            :aria-label="themeLabel"
            :title="themeLabel"
            @click="$emit('toggle-theme', $event)"
          >
            <TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" />
            <span>{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
          </button>

          <div class="lang-switcher" aria-label="Language">
            <button class="lang-btn" :class="{ active: lang === 'zh' }" type="button" @click="$emit('set-lang', 'zh')">中文</button>
            <button class="lang-btn" :class="{ active: lang === 'ja' }" type="button" @click="$emit('set-lang', 'ja')">日本語</button>
          </div>
        </div>
      </section>
    </div>

    <nav v-if="showChrome" class="mobile-bottom-nav" aria-label="Mobile primary navigation">
      <a
        v-for="item in mobilePrimaryItems"
        :key="item.key"
        :href="item.path"
        class="mobile-bottom-link"
        :class="{ active: item.active }"
        :aria-label="item.label"
        @click="navOpen = false; item.spa && ($event.preventDefault(), $emit('go', item.path))"
      >
        <TsIcon :name="item.icon" :size="20" />
        <span>{{ item.label }}</span>
      </a>
      <button
        class="mobile-bottom-link"
        :class="{ active: navOpen }"
        type="button"
        :aria-label="moreLabel"
        :aria-expanded="navOpen"
        aria-controls="site-navigation"
        @click="navOpen = !navOpen"
      >
        <TsIcon name="menu" :size="20" />
        <span>{{ moreLabel }}</span>
      </button>
    </nav>

    <SiteMusicDrawer v-if="showChrome && music" :music="music" />
    <slot></slot>
    <footer v-if="showSiteBeian" class="site-beian-footer">
      <BeianLink />
    </footer>
  </div>
</template>
