<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { authFetch, authHeaders, noStoreUrl, parseResponse } from '../api/client';
import BeianLink from '../components/BeianLink.vue';
import SiteMusicDrawer from '../components/SiteMusicDrawer.vue';
import TsIcon from '../components/TsIcon.vue';
import { alternateLanguage } from '../i18n';
import { warmRoutePath } from '../router';
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
const growthLabel = computed(() => props.lang === 'ja' ? '月契成長' : props.lang === 'en' ? 'Bond growth' : '月契成长');

const navItems = computed(() => [
  { path: '/hub', key: 'hub', label: props.t.hub, icon: 'home', active: props.routeName === 'hub', spa: true },
  { path: '/room', key: 'room', label: props.t.room, icon: 'moon', active: props.routeName === 'room' || props.routeName === 'roomSettings', spa: true },
  { path: '/plaza', key: 'plaza', label: props.t.plaza, icon: 'plaza', active: props.routeName === 'plaza' || props.routeName === 'friendLinkApply', spa: true },
  { path: '/stage', key: 'stage', label: props.t.stage, icon: 'book', active: props.routeName === 'stage' || props.routeName === 'article' || props.routeName === 'editor', spa: true },
  { path: '/wiki', key: 'wiki', label: props.t.wiki, icon: 'crown', active: ['wiki', 'wikiCharacter', 'wikiTerm'].includes(props.routeName), spa: true },
  { path: '/gallery', key: 'gallery', label: props.t.gallery, icon: 'image', active: props.routeName === 'gallery' || props.routeName === 'galleryManage', spa: true },
  { path: '/pixel', key: 'pixel', label: props.t.arena, icon: 'palette', active: props.routeName === 'pixel', spa: true },
  { path: '/game', key: 'game', label: props.t.game, icon: 'gamepad', active: props.routeName === 'game', spa: true },
  ...(props.isAuthed ? [{ path: '/growth', key: 'growth', label: growthLabel.value, icon: 'sparkles', active: props.routeName === 'growth', spa: true }] : []),
  { path: '/reality', key: 'reality', label: props.t.reality, icon: 'compass', active: props.routeName === 'reality', spa: true },
  { path: '/agent-os', key: 'agentOs', label: props.t.agentOs, icon: 'bot', active: false, spa: false }
]);

const mobilePrimaryItems = computed(() => navItems.value.slice(0, 4));
const mobileSecondaryItems = computed(() => navItems.value.slice(4));
const activeNavItem = computed(() => navItems.value.find((item) => item.active) || navItems.value[0]);
const accountLabel = computed(() => (props.isAuthed ? props.t.ucTitle : props.t.login));
const themeLabel = computed(() => (props.theme === 'dark' ? props.t.switchLightTheme : props.t.switchDarkTheme));
const railThemeLabel = computed(() => (props.theme === 'dark' ? props.t.lightTheme : props.t.darkTheme));
const railNotificationsLabel = computed(() => props.t.notifications);
const moreLabel = computed(() => props.t.more);
const languageTargetLabel = computed(() => (props.lang === 'zh' ? '日本語' : '中文'));
const languageActionLabel = computed(() => (props.lang === 'zh' ? props.t.switchToJapanese : props.t.switchToChinese));
const notificationsActionLabel = computed(() => (props.lang === 'ja'
  ? `${props.t.notifications}、未読 ${unreadNotifications.value} 件`
  : props.lang === 'en'
    ? `${props.t.notifications}, ${unreadNotifications.value} unread`
    : `${props.t.notifications}，${unreadNotifications.value} 条未读`));

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
    <div v-if="showChrome && !['room', 'game'].includes(routeName)" class="moon" aria-hidden="true"></div>

    <aside v-if="showChrome" ref="railRef" class="site-rail" data-material="sidebar" :aria-label="t.navigation">
      <a href="/hub" class="rail-mark" :aria-label="t.brand" @pointerenter="warmRoutePath('/hub')" @focus="warmRoutePath('/hub')" @pointerdown="warmRoutePath('/hub')" @click.prevent="$emit('go', '/hub')">
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
          @pointerenter="item.spa && warmRoutePath(item.path); expandRail(item.key)"
          @pointerleave="collapseRail(item.key)"
          @focus="item.spa && warmRoutePath(item.path); expandRail(item.key)"
          @pointerdown="item.spa && warmRoutePath(item.path)"
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
          :aria-label="notificationsActionLabel"
          :title="notificationsActionLabel"
          @pointerenter="warmRoutePath('/notifications'); expandRail('notifications')"
          @pointerleave="collapseRail('notifications')"
          @focus="warmRoutePath('/notifications'); expandRail('notifications')"
          @pointerdown="warmRoutePath('/notifications')"
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

        <button
          v-if="lang !== 'en'"
          class="rail-link rail-language"
          type="button"
          :aria-label="languageActionLabel"
          :title="languageActionLabel"
          :class="{ expanded: railExpandedKey === 'language' }"
          @pointerenter="expandRail('language')"
          @pointerleave="collapseRail('language')"
          @focus="expandRail('language')"
          @blur="collapseRail('language')"
          @click="expandRail('language'); $emit('set-lang', alternateLanguage(lang))"
        >
          <span class="rail-icon"><TsIcon name="languages" :size="20" /></span>
          <span class="rail-label" :lang="lang === 'zh' ? 'ja' : 'zh-CN'">{{ languageTargetLabel }}</span>
        </button>

        <a
          class="rail-link rail-account"
          :class="{ active: routeName === 'userCenter' || routeName === 'userProfile' || routeName === 'login', expanded: railExpandedKey === 'account' }"
          :href="isAuthed ? '/user-center' : '/login'"
          :aria-label="accountLabel"
          :title="accountLabel"
          @pointerenter="warmRoutePath(isAuthed ? '/user-center' : '/login'); expandRail('account')"
          @pointerleave="collapseRail('account')"
          @focus="warmRoutePath(isAuthed ? '/user-center' : '/login'); expandRail('account')"
          @pointerdown="warmRoutePath(isAuthed ? '/user-center' : '/login')"
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

    <header v-if="showChrome && routeName !== 'room'" class="topbar site-commandbar" data-material="header">
      <a href="/hub" class="brand room-brand site-brand" @pointerenter="warmRoutePath('/hub')" @focus="warmRoutePath('/hub')" @pointerdown="warmRoutePath('/hub')" @click.prevent="$emit('go', '/hub')">
        <span class="room-brand-mark site-brand-mark site-brand-icon" aria-hidden="true">
          <TsIcon name="eclipse" :size="21" :stroke-width="1.9" />
        </span>
        <span>
          <strong>{{ t.brand }}</strong>
          <small>{{ activeNavItem?.label || 'Tsukuyomi Live Portal' }}</small>
        </span>
      </a>

      <div class="mobile-command-actions" :aria-label="t.mobileQuickActions">
        <button
          v-if="showNotifications"
          class="mobile-command-btn"
          type="button"
          :class="{ active: routeName === 'notifications' }"
          :aria-label="notificationsActionLabel"
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
      :aria-label="t.closeNavigation"
      @click="navOpen = false"
    ></button>

    <div v-if="showChrome && navOpen" id="site-navigation" class="nav-actions room-nav-links site-nav-links open" data-material="popover" role="dialog" aria-modal="true" :aria-label="moreLabel">
      <div class="site-nav-drawer-head">
        <div>
          <strong>{{ moreLabel }}</strong>
          <span>{{ activeNavItem?.label || t.brand }}</span>
        </div>
        <button class="site-nav-close" type="button" :aria-label="t.closeNavigation" @click="navOpen = false">
          <TsIcon name="x" :size="18" />
        </button>
      </div>

      <section class="site-nav-section">
        <span class="site-nav-section-title">{{ t.explore }}</span>
        <div class="site-nav-grid">
          <a
            v-for="item in mobileSecondaryItems"
            :key="item.key"
            :href="item.path"
            class="nav-link"
            :class="{ 'router-link-active': item.active }"
            @pointerenter="item.spa && warmRoutePath(item.path)"
            @focus="item.spa && warmRoutePath(item.path)"
            @pointerdown="item.spa && warmRoutePath(item.path)"
            @click="navOpen = false; item.spa && ($event.preventDefault(), $emit('go', item.path))"
          >
            <TsIcon class="nav-icon" :name="item.icon" :size="18" />
            <span>{{ item.label }}</span>
          </a>
        </div>
      </section>

      <section v-if="showNotifications || isAuthed" class="site-nav-section">
        <span class="site-nav-section-title">{{ t.accountSection }}</span>
        <div class="site-nav-grid">
          <a
            v-if="showNotifications"
            href="/notifications"
            class="nav-link"
            :class="{ 'router-link-active': routeName === 'notifications' }"
            @click.prevent="navOpen = false; $emit('go', '/notifications')"
          >
            <TsIcon class="nav-icon" name="bell" :size="18" />
            <span>{{ t.notifications }}</span>
            <span v-if="unreadNotifications" class="nav-inline-badge">{{ unreadNotifications > 99 ? '99+' : unreadNotifications }}</span>
          </a>
          <a v-if="isAuthed" href="/user-center" class="nav-link user-chip" :class="{ 'router-link-active': routeName === 'userCenter' || routeName === 'userProfile' }" @click.prevent="navOpen = false; $emit('go', '/user-center')">
            <TsIcon class="nav-icon" name="user" :size="18" />
            <span>{{ t.ucTitle }}</span>
          </a>
          <a v-if="isAuthed" href="/attachments" class="nav-link" :class="{ 'router-link-active': routeName === 'attachments' }" @click.prevent="navOpen = false; $emit('go', '/attachments')">
            <TsIcon class="nav-icon" name="image" :size="18" />
            <span>{{ t.attachments }}</span>
          </a>
          <button v-if="isAuthed" class="ghost-btn nav-link" type="button" @click="navOpen = false; $emit('logout')">
            <TsIcon class="nav-icon" name="x" :size="18" />
            <span>{{ t.logout }}</span>
          </button>
        </div>
      </section>

      <section v-else class="site-nav-section">
        <span class="site-nav-section-title">{{ t.accountSection }}</span>
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
        <span class="site-nav-section-title">{{ t.preferences }}</span>
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

          <div v-if="lang !== 'en'" class="lang-switcher" :aria-label="t.language">
            <button class="lang-btn" :class="{ active: lang === 'zh' }" :aria-pressed="lang === 'zh'" lang="zh-CN" type="button" @click="$emit('set-lang', 'zh')">中文</button>
            <button class="lang-btn" :class="{ active: lang === 'ja' }" :aria-pressed="lang === 'ja'" lang="ja" type="button" @click="$emit('set-lang', 'ja')">日本語</button>
          </div>
        </div>
      </section>
    </div>

    <nav v-if="showChrome" class="mobile-bottom-nav" data-material="header" :aria-label="t.mobilePrimaryNavigation">
      <a
        v-for="item in mobilePrimaryItems"
        :key="item.key"
        :href="item.path"
        class="mobile-bottom-link"
        :class="{ active: item.active }"
        :aria-label="item.label"
        @pointerenter="item.spa && warmRoutePath(item.path)"
        @focus="item.spa && warmRoutePath(item.path)"
        @pointerdown="item.spa && warmRoutePath(item.path)"
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

    <SiteMusicDrawer v-if="showChrome && music && routeName !== 'game'" :music="music" />
    <slot></slot>
    <footer v-if="showSiteBeian" class="site-beian-footer">
      <BeianLink />
    </footer>
  </div>
</template>
