<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { authFetch, authHeaders, noStoreUrl, parseResponse } from '../api/client';
import BeianLink from '../components/BeianLink.vue';
import NotificationBell from '../components/NotificationBell.vue';
import SiteMusicDrawer from '../components/SiteMusicDrawer.vue';
import TsIcon from '../components/TsIcon.vue';
import { alternateLanguage } from '../i18n';
import { navigationCopy } from '../services/siteNavigation';
const SiteSearch = defineAsyncComponent(() => import('../components/SiteSearch.vue'));
import { warmRoutePath } from '../router';
import { useMobileKeyboard } from '../composables/useMobileKeyboard';
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

const emit = defineEmits(['go', 'logout', 'set-lang', 'toggle-theme']);

const navOpen = ref(false);
const searchOpen = ref(false);
const menuMode = ref('explore');
const copy = computed(() => navigationCopy(props.lang));
let lastNavigationTrigger = null;
const navigationRef = ref(null);
const { keyboardOpen, viewportStyle } = useMobileKeyboard();
let releaseNavigationScroll = null;
let mobileNavigationQuery = null;
const unreadNotifications = ref(0);
const UNREAD_POLL_INTERVAL_MS = 60000;
let unreadPollId = 0;
let unreadRequest = null;

const isRoom = computed(() => ['room', 'roomShared'].includes(props.routeName));
const hasGlobalBackground = computed(() => !isRoom.value && !['access', 'accessAlias'].includes(props.routeName));
const showSiteBeian = computed(() => props.showChrome && !['hub', 'room', 'roomShared', 'roomSettings'].includes(props.routeName));
const showNotifications = computed(() => props.isAuthed);
const growthLabel = computed(() => props.lang === 'ja' ? '月契成長' : props.lang === 'en' ? 'Bond growth' : '月契成长');

const navItems = computed(() => [
  { path: '/hub', key: 'hub', label: props.t.hub, icon: 'home', active: props.routeName === 'hub', spa: true },
  { path: '/room', key: 'room', label: props.t.room, icon: 'moon', active: isRoom.value || props.routeName === 'roomSettings', spa: true },
  { path: '/plaza', key: 'plaza', label: props.t.plaza, icon: 'plaza', active: props.routeName === 'plaza', spa: true },
  { path: '/stage', key: 'stage', label: props.t.stage, icon: 'book', active: props.routeName === 'stage' || ['article', 'articleDetail', 'editor'].includes(props.routeName), spa: true },
  { path: '/wiki', key: 'wiki', label: props.t.wiki, icon: 'crown', active: ['wiki', 'wikiCharacter', 'wikiTerm'].includes(props.routeName), spa: true },
  { path: '/gallery', key: 'gallery', label: props.t.gallery, icon: 'image', active: props.routeName === 'gallery' || props.routeName === 'galleryManage', spa: true },
  { path: '/pixel', key: 'pixel', label: props.t.arena, icon: 'palette', active: props.routeName === 'pixel', spa: true },
  { path: '/game', key: 'game', label: props.t.game, icon: 'gamepad', active: props.routeName === 'game', spa: true },
  ...(props.isAuthed ? [{ path: '/growth', key: 'growth', label: growthLabel.value, icon: 'sparkles', active: props.routeName === 'growth', spa: true }] : []),
  { path: '/friend-links', key: 'friendLinks', label: copy.value.friendLinks, icon: 'external', active: ['friendLinks', 'friendLinkApply'].includes(props.routeName), spa: true },
  { path: '/reality', key: 'reality', label: props.t.reality, icon: 'compass', active: props.routeName === 'reality', spa: true },
  { path: '/agent-os', key: 'agentOs', label: props.t.agentOs, icon: 'bot', active: false, spa: false }
]);

const desktopItems = computed(() => ['hub', 'stage', 'plaza', 'wiki'].map((key) => navItems.value.find((item) => item.key === key)));
const mobilePrimaryItems = computed(() => navItems.value.slice(0, 4));
const mobileNavLabel = (item) => copy.value.shortLabels[item.key] || item.label;
const activeNavItem = computed(() => navItems.value.find((item) => item.active));
const currentPageLabel = computed(() => ({
  notifications: props.t.notifications,
  userCenter: props.t.ucTitle,
  userProfile: props.t.ucTitle,
  attachments: props.t.attachments,
  roomSettings: props.lang === 'en' ? 'Room settings' : props.lang === 'ja' ? 'ルーム設定' : '房间设置',
  friendLinks: props.lang === 'en' ? 'Friend links' : props.lang === 'ja' ? 'リンク集' : '友情链接'
}[props.routeName] || activeNavItem.value?.label || props.t.brand));
const moreActive = computed(() => navOpen.value || !mobilePrimaryItems.value.some((item) => item.active));
const accountLabel = computed(() => (props.isAuthed ? props.t.ucTitle : props.t.login));
const themeLabel = computed(() => (props.theme === 'dark' ? props.t.switchLightTheme : props.t.switchDarkTheme));
const moreLabel = computed(() => props.t.more);
const notificationsActionLabel = computed(() => (props.lang === 'ja'
  ? `${props.t.notifications}、未読 ${unreadNotifications.value} 件`
  : props.lang === 'en'
    ? `${props.t.notifications}, ${unreadNotifications.value} unread`
    : `${props.t.notifications}，${unreadNotifications.value} 条未读`));

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

const accountItems = computed(() => props.isAuthed ? [
  { key: 'account', path: '/user-center', label: props.t.ucTitle, icon: 'user', spa: true },
  { key: 'growth', path: '/growth', label: growthLabel.value, icon: 'sparkles', spa: true },
  { key: 'notifications', path: '/notifications', label: props.t.notifications, icon: 'bell', spa: true },
  { key: 'attachments', path: '/attachments', label: props.t.attachments, icon: 'image', spa: true }
] : [
  { key: 'login', path: '/login', label: props.t.login, icon: 'user', spa: true },
  { key: 'register', path: '/register', label: props.t.register, icon: 'badge', spa: true }
]);
const searchItems = computed(() => [...navItems.value.filter(item => item.key !== 'growth'), ...accountItems.value]);
const exploreGroups = computed(() => [
  { title: copy.value.discover, keys: ['wiki'] },
  { title: copy.value.create, keys: ['gallery', 'pixel', 'game'] },
  { title: copy.value.spaces, keys: ['agentOs', 'reality', 'friendLinks'] }
].map(group => ({ ...group, items: navItems.value.filter(item => group.keys.includes(item.key)) }))
  .filter(group => group.items.length));
const exploreActive = computed(() => navItems.value.some(item => item.active && ['gallery', 'pixel', 'game', 'agentOs', 'reality', 'friendLinks'].includes(item.key)));

function navigate(event, item) {
  if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0)) return;
  navOpen.value = false;
  if (item.spa !== false) {
    event?.preventDefault();
    emit('go', item.path);
  }
}
function openNavigation(mode, event) {
  lastNavigationTrigger = event?.currentTarget || document.activeElement;
  menuMode.value = mode;
  navOpen.value = true;
}
async function openSearch() {
  navOpen.value = false;
  await nextTick();
  searchOpen.value = true;
}
function searchShortcut(event) {
  if (!props.showChrome || event.isComposing || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
  event.preventDefault();
  if (!searchOpen.value) openSearch();
}

function closeNavigationOnResize(event) {
  if (!event.matches) navOpen.value = false;
}

function closeNavigationOnBackdrop(event) {
  if (event.target !== navigationRef.value) return;
  const rect = navigationRef.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) navOpen.value = false;
}

function cycleNavigationFocus(event) {
  const controls = [...navigationRef.value.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled)')].filter((node) => node.getClientRects().length);
  const target = event.shiftKey ? controls.at(-1) : controls[0];
  if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
    event.preventDefault();
    target?.focus();
  }
}

watch(navOpen, (open) => {
  const dialog = navigationRef.value;
  if (open && dialog && !dialog.open) {
    const scrollY = window.scrollY;
    const previous = ['position', 'top', 'width', 'overflow'].map((key) => [key, document.body.style[key]]);
    Object.assign(document.body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%', overflow: 'hidden' });
    releaseNavigationScroll = () => {
      for (const [key, value] of previous) document.body.style[key] = value;
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
    dialog.showModal();
  } else if (!open) {
    dialog?.close();
    releaseNavigationScroll?.();
    releaseNavigationScroll = null;
    if (lastNavigationTrigger?.isConnected) lastNavigationTrigger.focus({ preventScroll: true });
  }
}, { flush: 'post' });

watch(() => props.showChrome, (visible) => {
  if (!visible) { navOpen.value = false; searchOpen.value = false; }
});

watch(() => props.routeName, () => {
  navOpen.value = false;
  searchOpen.value = false;
  loadUnreadNotifications();
});

watch(() => props.isAuthed, () => {
  loadUnreadNotifications();
  restartUnreadPolling();
}, { immediate: true });
onMounted(() => {
  mobileNavigationQuery = window.matchMedia('(max-width: 860px)');
  mobileNavigationQuery.addEventListener('change', closeNavigationOnResize);
  loadUnreadNotifications();
  document.addEventListener('keydown', searchShortcut);
  document.addEventListener('visibilitychange', refreshUnreadWhenVisible, { passive: true });
  window.addEventListener(NOTIFICATION_BADGE_EVENT, handleNotificationBadge);
});
onUnmounted(() => {
  navigationRef.value?.close();
  releaseNavigationScroll?.();
  mobileNavigationQuery?.removeEventListener('change', closeNavigationOnResize);
  if (unreadPollId) window.clearInterval(unreadPollId);
  document.removeEventListener('keydown', searchShortcut);
  document.removeEventListener('visibilitychange', refreshUnreadWhenVisible);
  window.removeEventListener(NOTIFICATION_BADGE_EVENT, handleNotificationBadge);
});
</script>

<template>
  <div class="app-shell unified-navigation" :class="{ 'room-shell': isRoom, 'site-background-shell': hasGlobalBackground, 'content-shell': showChrome && !isRoom, 'pixel-shell': routeName === 'pixel', 'is-keyboard-open': keyboardOpen }" :style="viewportStyle">
    <div v-if="hasGlobalBackground" class="site-global-bg" aria-hidden="true"></div>
    <div v-if="showChrome && !isRoom && routeName !== 'game'" class="moon" aria-hidden="true"></div>

    <header v-if="showChrome" class="topbar site-commandbar" data-material="header">
      <a href="/hub" class="site-brand" @pointerenter="warmRoutePath('/hub')" @focus="warmRoutePath('/hub')" @click="navigate($event, { path: '/hub' })">
        <span class="site-brand-symbol"><TsIcon name="eclipse" :size="23" /></span>
        <span><strong>{{ t.brand }}</strong><small>{{ currentPageLabel }}</small></span>
      </a>
      <nav class="desktop-navigation" :aria-label="t.navigation">
        <a v-for="item in desktopItems" :key="item.key" :href="item.path" :aria-label="item.label" :aria-current="item.active ? 'page' : undefined" @pointerenter="warmRoutePath(item.path)" @focus="warmRoutePath(item.path)" @click="navigate($event, item)">{{ mobileNavLabel(item) }}</a>
        <button type="button" :class="{ active: exploreActive }" :aria-expanded="navOpen && menuMode === 'explore'" aria-controls="site-navigation" @click="openNavigation('explore', $event)">{{ copy.explore }}<TsIcon name="chevronDown" :size="14" /></button>
      </nav>
      <div class="site-header-tools">
        <button class="site-search-trigger" type="button" :aria-label="copy.search" aria-haspopup="dialog" aria-controls="site-search" @click="openSearch"><TsIcon name="search" :size="19" /><span>{{ copy.search }}</span><kbd>⌘ K</kbd></button>
        <button v-if="showNotifications" class="site-tool-button" type="button" :aria-label="notificationsActionLabel" @click="$emit('go', '/notifications')"><NotificationBell :size="19" :unread="unreadNotifications > 0" /></button>
        <button class="site-tool-button site-theme-button" type="button" :aria-label="themeLabel" @click="$emit('toggle-theme', $event)"><TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="19" /></button>
        <button class="site-account-trigger" type="button" :aria-label="copy.account" :aria-expanded="navOpen && menuMode === 'account'" aria-controls="site-navigation" @click="openNavigation('account', $event)">
          <img v-if="isAuthed && user?.avatar" :src="user.avatar" alt="" width="28" height="28"><span v-else class="site-account-avatar"><TsIcon name="user" :size="18" /></span><span class="site-account-name">{{ isAuthed ? user?.username || accountLabel : t.login }}</span><TsIcon name="chevronDown" :size="12" />
        </button>
        <a class="site-room-cta" href="/room" :aria-current="isRoom || routeName === 'roomSettings' ? 'page' : undefined" @pointerenter="warmRoutePath('/room')" @click="navigate($event, { path: '/room' })"><TsIcon name="moon" :size="17" /><span>{{ copy.enterRoom }}</span></a>
      </div>
    </header>

    <dialog v-if="showChrome" ref="navigationRef" id="site-navigation" class="site-navigation-dialog" :class="{ 'is-account-menu': menuMode === 'account' }" data-material="popover" role="dialog" :aria-label="menuMode === 'account' ? copy.account : moreLabel" @cancel.prevent="navOpen = false" @close="navOpen = false" @click="closeNavigationOnBackdrop" @keydown.tab="cycleNavigationFocus">
      <div class="site-nav-drawer-head">
        <div><small>{{ menuMode === 'account' ? 'YOUR SPACE' : 'EXPLORE' }}</small><strong>{{ menuMode === 'account' ? copy.account : copy.exploreTitle }}</strong></div>
        <button class="site-tool-button" type="button" autofocus :aria-label="t.closeNavigation" @click="navOpen = false"><TsIcon name="x" :size="20" /></button>
      </div>
      <template v-if="menuMode === 'explore'">
        <button class="site-menu-search" type="button" @click="openSearch"><TsIcon name="search" :size="18" /><span>{{ copy.searchHint }}</span><kbd>⌘ K</kbd></button>
        <div class="site-explore-columns">
          <section v-for="group in exploreGroups" :key="group.title" class="site-nav-section">
            <h3>{{ group.title }}</h3>
            <a v-for="item in group.items" :key="item.key" :href="item.path" class="site-menu-link" :aria-current="item.active ? 'page' : undefined" @pointerenter="item.spa && warmRoutePath(item.path)" @focus="item.spa && warmRoutePath(item.path)" @click="navigate($event, item)"><TsIcon :name="item.icon" :size="21" /><span><strong>{{ item.label }}</strong><small>{{ copy.descriptions[item.key] }}</small></span><TsIcon name="arrowRight" :size="15" /></a>
          </section>
        </div>
      </template>
      <div v-else class="site-account-links">
        <p v-if="isAuthed" class="site-account-greeting">{{ user?.username || accountLabel }}</p>
        <a v-for="item in accountItems" :key="item.key" :href="item.path" class="site-menu-link" @click="navigate($event, item)"><NotificationBell v-if="item.key === 'notifications'" :unread="unreadNotifications > 0" /><TsIcon v-else :name="item.icon" :size="20" /><span>{{ item.label }}</span></a>
        <button v-if="isAuthed" class="site-menu-link" type="button" @click="navOpen = false; $emit('logout')"><TsIcon name="arrowLeft" :size="20" /><span>{{ t.logout }}</span></button>
      </div>
      <div class="site-menu-preferences">
        <button class="site-preference-button" type="button" :aria-label="themeLabel" @click="$emit('toggle-theme', $event)"><TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" /><span>{{ theme === 'dark' ? t.lightTheme : t.darkTheme }}</span></button>
        <button v-if="lang !== 'en'" class="site-preference-button" type="button" :aria-label="lang === 'zh' ? '日本語' : '中文'" @click="$emit('set-lang', alternateLanguage(lang))"><TsIcon name="languages" :size="18" /><span>{{ lang === 'zh' ? '日本語' : '中文' }}</span></button>
        <button v-if="menuMode === 'explore'" class="site-preference-button site-menu-account" type="button" @click="menuMode = 'account'"><TsIcon name="user" :size="18" /><span>{{ accountLabel }}</span></button>
      </div>
    </dialog>
    <SiteSearch v-if="searchOpen" :items="searchItems" :lang="lang" @close="searchOpen = false" @go="$emit('go', $event)" />

    <nav v-if="showChrome" class="mobile-bottom-nav" data-material="header" :aria-label="t.mobilePrimaryNavigation">
      <a
        v-for="item in mobilePrimaryItems"
        :key="item.key"
        :href="item.path"
        class="mobile-bottom-link"
        :class="{ active: item.active }"
        :aria-current="item.active ? 'page' : undefined"
        :aria-label="item.label"
        @pointerenter="item.spa && warmRoutePath(item.path)"
        @focus="item.spa && warmRoutePath(item.path)"
        @pointerdown="item.spa && warmRoutePath(item.path)"
        @click="navigate($event, item)"
      >
        <TsIcon :name="item.icon" :size="20" />
        <span>{{ mobileNavLabel(item) }}</span>
      </a>
      <button
        class="mobile-bottom-link"
        :class="{ active: moreActive }"
        type="button"
        :aria-label="moreLabel"
        :aria-expanded="navOpen"
        aria-controls="site-navigation"
        @click="openNavigation('explore', $event)"
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
