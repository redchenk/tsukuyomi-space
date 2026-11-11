<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { authFetch, authHeaders, noStoreUrl, parseResponse } from '../api/client';
import { NOTIFICATION_BADGE_EVENT, normalizeNotificationCount, publishNotificationBadge } from '../services/notificationBadge';
import { navigationCopy } from '../services/siteNavigation';
import { alternateLanguage } from '../i18n';
import { warmRoutePath } from '../router';
import { lockPageScroll } from '../utils/pageScrollLock';
import { keepModalFocus } from '../composables/useModalDialog';
import { useMobileKeyboard } from '../composables/useMobileKeyboard';
import TsIcon from '../components/TsIcon.vue';
import BeianLink from '../components/BeianLink.vue';
import SeasonThemePicker from '../components/SeasonThemePicker.vue';
import ContentTranslationControl from '../components/ContentTranslationControl.vue';
import brandLogo from '../assets/sakura/sakura-moon-logo.webp';
const SiteSearch = defineAsyncComponent(() => import('../components/SiteSearch.vue'));
const SiteMusicDrawer = defineAsyncComponent(() => import('../components/SiteMusicDrawer.vue'));
const props = defineProps({ isAuthed: Boolean, lang: { type: String, default: 'zh' }, routeName: String, showChrome: Boolean, music: Object, t: Object, theme: String, user: Object });
const emit = defineEmits(['go', 'logout', 'set-lang', 'toggle-theme', 'open-guide']);
const tr = (zh, en, ja = zh) => props.lang === 'en' ? en : props.lang === 'ja' ? ja : zh;
const copy = computed(() => navigationCopy(props.lang));
const isRoom = computed(() => ['room', 'roomShared'].includes(props.routeName));
const growthLabel = computed(() => tr('月契成长', 'Bond growth', '月契成長'));
const themeLabel = computed(() => props.theme === 'dark' ? props.t.switchLightTheme : props.t.switchDarkTheme);
const searchOpen = ref(false), navOpen = ref(false), menuMode = ref('explore'), navigationRef = ref(null), scrolled = ref(false);
const compactFooter = ref(false);
let footerMedia;
function syncFooterLayout() { compactFooter.value = footerMedia.matches; }
const { keyboardOpen, viewportStyle } = useMobileKeyboard();
const unreadNotifications = ref(0);
const UNREAD_POLL_INTERVAL_MS = 60000;
let unreadPollId = 0, unreadRequest = null, releaseScroll = null, lastTrigger = null;
const navItems = computed(() => [
  { path: '/hub', key: 'hub', label: tr('首页', 'Home', 'ホーム'), icon: 'home', active: props.routeName === 'hub', spa: true },
  { path: '/room', key: 'room', label: props.t.room, icon: 'moon', active: isRoom.value || props.routeName === 'roomSettings', spa: true },
  { path: '/plaza', key: 'plaza', label: tr('广场', 'Plaza', '広場'), icon: 'plaza', active: props.routeName === 'plaza', spa: true },
  { path: '/stage', key: 'stage', label: tr('阅读', 'Read', '読む'), icon: 'book', active: props.routeName === 'stage' || ['article', 'articleDetail', 'editor'].includes(props.routeName), spa: true },
  { path: '/drift', key: 'drift', label: props.lang === 'en' ? 'Starlit Letters' : props.lang === 'ja' ? '星の海からの手紙' : '星海来信', icon: 'moonStar', active: props.routeName === 'drift', spa: true },
  { path: '/wiki', key: 'wiki', label: props.t.wiki, icon: 'crown', active: ['wiki', 'wikiCharacter', 'wikiTerm'].includes(props.routeName), spa: true },
  { path: '/gallery', key: 'gallery', label: props.t.gallery, icon: 'image', active: props.routeName === 'gallery' || props.routeName === 'galleryManage', spa: true },
  { path: '/pixel', key: 'pixel', label: props.t.arena, icon: 'palette', active: props.routeName === 'pixel', spa: true },
  { path: '/game', key: 'game', label: tr('游戏', 'Play', 'ゲーム'), icon: 'gamepad', active: ['game', 'gomoku', 'kaguyaRun'].includes(props.routeName), spa: true },
  ...(props.isAuthed ? [{ path: '/growth', key: 'growth', label: growthLabel.value, icon: 'sparkles', active: props.routeName === 'growth', spa: true }] : []),
  { path: '/friend-links', key: 'friendLinks', label: copy.value.friendLinks, icon: 'external', active: ['friendLinks', 'friendLinkApply'].includes(props.routeName), spa: true },
  { path: '/download', key: 'download', label: copy.value.download, icon: 'download', active: props.routeName === 'download', spa: true },
  { path: '/reality', key: 'reality', label: props.t.reality, icon: 'compass', active: props.routeName === 'reality', spa: true },
  { path: '/', key: 'opening', label: tr('重看开场', 'Revisit the entrance', 'オープニングを見る'), icon: 'play', active: false, spa: true },
  { path: '/agent-os', key: 'agentOs', label: props.t.agentOs, icon: 'bot', active: false, spa: false },
  { path: '/rss.xml', key: 'rss', label: copy.value.rss, icon: 'rss', active: false, spa: false }
]);


const desktopItems = computed(() => ['stage', 'gallery', 'plaza', 'wiki', 'game', 'download'].map(key => navItems.value.find(item => item.key === key)));
const dockItems = computed(() => ['hub', 'stage', 'room', 'plaza'].map(key => navItems.value.find(item => item.key === key)));
const footerGroups = computed(() => [
  { title: tr('发现', 'Discover'), keys: ['stage', 'gallery', 'wiki'] },
  { title: tr('相遇', 'Connect'), keys: ['room', 'plaza', 'drift'] },
  { title: tr('关于', 'About'), keys: ['reality', 'download', 'rss'] }
].map(group => ({ title: group.title, items: group.keys.map(key => ({
  ...navItems.value.find(item => item.key === key),
  ...({ room: { label: tr('八千代的房间', 'Yachiyo’s room') }, plaza: { label: tr('月读广场', 'Plaza') }, reality: { label: tr('关于本站', 'About us') } }[key])
})) })));
const accountItems = computed(() => props.isAuthed ? [
  { key: 'account', path: '/user-center', label: props.t.ucTitle, icon: 'user' },
  { key: 'notifications', path: '/notifications', label: props.t.notifications, icon: 'bell' },
  { key: 'attachments', path: '/attachments', label: props.t.attachments, icon: 'image' },
  { key: 'growth', path: '/growth', label: growthLabel.value, icon: 'sparkles' }
] : [
  { key: 'login', path: '/login', label: props.t.login, icon: 'user' },
  { key: 'register', path: '/register', label: props.t.register, icon: 'badge' }
]);
const searchItems = computed(() => [...navItems.value, ...accountItems.value]);
const exploreGroups = computed(() => [
  { title: tr('阅读与发现', 'Discover'), keys: ['stage', 'gallery', 'wiki', 'plaza'] },
  { title: tr('创作与陪伴', 'Create & connect'), keys: ['room', 'drift', 'pixel', 'game'] },
  { title: tr('更多空间', 'More spaces'), keys: ['opening', 'download', 'agentOs', 'friendLinks', 'reality', 'rss'] }
].map(group => ({ ...group, items: group.keys.map(key => navItems.value.find(item => item.key === key)).filter(Boolean) })));
function navigate(event, item) {
  if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0)) return;
  navOpen.value = false;
  if (item.spa !== false) { event?.preventDefault(); emit('go', item.path); }
}
function openNavigation(mode, event) { lastTrigger = event?.currentTarget || document.activeElement; menuMode.value = mode; navOpen.value = true; }
async function openSearch() { navOpen.value = false; await nextTick(); searchOpen.value = true; }
function shortcut(event) {
  if (props.showChrome && !event.isComposing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
}
function backdrop(event) {
  if (event.target !== navigationRef.value) return;
  const box = navigationRef.value.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) navOpen.value = false;
}
function openMusic() { if (props.music && !props.music.drawer.open) props.music.toggleShell(); }
function trackScroll() { scrolled.value = window.scrollY > 24; }
watch(navOpen, open => {
  const dialog = navigationRef.value;
  if (open && dialog && !dialog.open) { releaseScroll = lockPageScroll(); dialog.showModal(); }
  if (!open) { dialog?.close(); releaseScroll?.(); releaseScroll = null; if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true }); }
}, { flush: 'post' });
watch(() => props.routeName, () => { navOpen.value = false; searchOpen.value = false; loadUnreadNotifications(); nextTick(trackScroll); });
watch(() => props.isAuthed, () => { loadUnreadNotifications(); restartUnreadPolling(); }, { immediate: true });
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


onMounted(() => {
  footerMedia = window.matchMedia('(max-width: 600px)');
  syncFooterLayout(); footerMedia.addEventListener('change', syncFooterLayout);
  window.addEventListener('tsukuyomi:music-open', openMusic);
  trackScroll(); window.addEventListener('scroll', trackScroll, { passive: true });
  document.addEventListener('keydown', shortcut); document.addEventListener('visibilitychange', refreshUnreadWhenVisible);
  window.addEventListener(NOTIFICATION_BADGE_EVENT, handleNotificationBadge);
});
onUnmounted(() => {
  footerMedia?.removeEventListener('change', syncFooterLayout);
  window.removeEventListener('tsukuyomi:music-open', openMusic);
  releaseScroll?.(); clearInterval(unreadPollId); navigationRef.value?.close();
  window.removeEventListener('scroll', trackScroll); document.removeEventListener('keydown', shortcut);
  document.removeEventListener('visibilitychange', refreshUnreadWhenVisible); window.removeEventListener(NOTIFICATION_BADGE_EVENT, handleNotificationBadge);
});
</script>

<template>
  <div class="app-shell" :class="{ 'content-shell': showChrome, 'site-background-shell': showChrome || ['login', 'register'].includes(routeName), 'room-shell': isRoom, 'drift-scene-shell': routeName === 'drift', 'hub-shell': routeName === 'hub', 'is-keyboard-open': keyboardOpen }" :style="viewportStyle">
    <header v-if="showChrome" class="site-header" :class="{ 'on-hero': routeName === 'hub' && !scrolled }">
      <a href="/hub" class="site-brand" @click="navigate($event, { path: '/hub' })"><img :src="brandLogo" alt="" width="32" height="32"><span>{{ lang === 'en' ? 'Tsukuyomi' : t.brand }}</span></a>
      <nav class="desktop-nav" :aria-label="t.navigation">
        <a v-for="item in desktopItems" :key="item.key" :href="item.path" :aria-current="item.active ? 'page' : undefined" @pointerenter="warmRoutePath(item.path)" @click="navigate($event, item)">{{ item.key === 'download' ? tr('下载', 'Download', 'ダウンロード') : item.label }}</a>
        <button type="button" :aria-expanded="navOpen && menuMode === 'explore'" aria-controls="site-navigation" @click="openNavigation('explore', $event)">{{ tr('更多', 'More', 'もっと') }}<TsIcon name="chevronDown" :size="13" /></button>
      </nav>
      <div class="header-actions">
        <a class="site-tool-button header-download" href="/download" :aria-label="copy.download" :title="copy.download" :aria-current="routeName === 'download' ? 'page' : undefined" @pointerenter="warmRoutePath('/download')" @click="navigate($event, { path: '/download' })"><TsIcon name="download" :size="19" /></a>
        <button class="header-search" :aria-label="copy.search" @click="openSearch"><TsIcon name="search" :size="19" /><span>{{ tr('搜索', 'Search', '検索') }}</span><kbd>⌘ K</kbd></button>
        <button v-if="music" class="site-tool-button header-music" :class="{ active: music.playing.value }" :aria-label="tr('站内音乐', 'Music')" :aria-expanded="music.drawer.open" @click="music.toggleShell"><TsIcon name="audioLines" :size="19" /></button>
        <button class="site-tool-button header-theme" :aria-label="themeLabel" @click="$emit('toggle-theme', $event)"><TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="19" /></button>
        <button class="site-tool-button header-account" :aria-label="copy.account" aria-controls="site-navigation" :aria-expanded="navOpen && menuMode === 'account'" @click="openNavigation('account', $event)"><img v-if="isAuthed && user?.avatar" :src="user.avatar" alt="" width="28" height="28"><TsIcon v-else name="user" :size="19" /><span v-if="unreadNotifications" class="unread-dot"></span></button>
        <a class="header-room" href="/room" @pointerenter="warmRoutePath('/room')" @click="navigate($event, { path: '/room' })">{{ copy.enterRoom }}<TsIcon name="arrowUpRight" :size="16" /></a>
      </div>
    </header>
    <dialog ref="navigationRef" id="site-navigation" class="site-navigation-dialog" @keydown="keepModalFocus($event, navigationRef)" :aria-label="menuMode === 'account' ? copy.account : copy.explore" @cancel.prevent="navOpen = false" @close="navOpen = false" @click="backdrop">
      <header class="menu-heading"><div><span class="eyebrow">{{ menuMode === 'account' ? 'YOUR SPACE' : 'TAKE YOUR TIME' }}</span><h2>{{ menuMode === 'account' ? (user?.nickname || copy.account) : copy.exploreTitle }}</h2></div><button class="icon-button" :aria-label="t.closeNavigation" autofocus @click="navOpen = false"><TsIcon name="x" :size="22" /></button></header>
      <template v-if="menuMode === 'explore'">
        <div class="explore-groups"><section v-for="group in exploreGroups" :key="group.title"><h3>{{ group.title }}</h3><a v-for="item in group.items" :key="item.key" :href="item.path" class="menu-link" @click="navigate($event, item)"><TsIcon :name="item.icon" :size="20" /><span><strong>{{ item.label }}</strong><small>{{ copy.descriptions[item.key] }}</small></span><TsIcon name="arrowRight" :size="15" /></a></section></div>
      </template>
      <div v-else class="account-menu"><a v-for="item in accountItems" :key="item.key" :href="item.path" class="menu-link" @click="navigate($event, item)"><TsIcon :name="item.icon" :size="20" /><span>{{ item.label }}</span><span v-if="item.key === 'notifications' && unreadNotifications">{{ unreadNotifications }}</span></a><button v-if="isAuthed" class="menu-link" @click="navOpen = false; emit('logout')"><TsIcon name="logOut" :size="20" />{{ t.logout }}</button></div>
      <button class="menu-link" type="button" @click="navOpen = false; emit('open-guide')"><TsIcon name="helpCircle" :size="20" /><span>{{ tr('八千代使用向导', 'Yachiyo guide', '八千代ガイド') }}</span><TsIcon name="arrowRight" :size="15" /></button>
      <footer class="menu-preferences"><button class="site-preference-button" @click="emit('toggle-theme', $event)"><TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" />{{ themeLabel }}</button><button v-if="lang !== 'en'" class="site-preference-button" @click="emit('set-lang', alternateLanguage(lang))"><TsIcon name="languages" :size="18" />{{ lang === 'zh' ? '日本語' : '中文' }}</button><SeasonThemePicker :lang="lang" /><ContentTranslationControl /></footer>
    </dialog>
    <SiteSearch v-if="searchOpen" :items="searchItems" :lang="lang" @close="searchOpen = false" @go="emit('go', $event)" />
    <SiteMusicDrawer v-if="music?.drawer.open" :music="music" :lang="lang" />
    <slot />
    <footer v-if="showChrome" class="site-footer">
      <div class="footer-top">
        <div class="footer-intro"><a href="/hub" class="footer-brand" @click="navigate($event, { path: '/hub' })">{{ t.brand }}</a><p>{{ tr('在月光下相遇，把喜欢的事慢慢写下来。', 'A little moonlight. A place to belong.') }}</p></div>
        <nav :aria-label="tr('页脚导航', 'Footer')">
          <details v-for="group in footerGroups" :key="group.title" class="footer-link-group" :open="!compactFooter">
            <summary :tabindex="compactFooter ? 0 : -1" @click="!compactFooter && $event.preventDefault()"><h3>{{ group.title }}</h3><TsIcon name="chevronDown" :size="14" /></summary>
            <ul><li v-for="item in group.items" :key="item.key"><a :href="item.path" class="footer-link" @click="navigate($event, item)">{{ item.label }}</a></li></ul>
          </details>
        </nav>
      </div>
      <div class="footer-bottom">
        <span class="footer-copyright">© {{ new Date().getFullYear() }} {{ t.brand }}</span>
        <div class="footer-legal"><a href="/privacy">{{ tr('隐私政策', 'Privacy') }}</a><a href="/delete-account">{{ tr('账号注销', 'Delete account') }}</a></div>
        <BeianLink />
      </div>
    </footer>
    <nav v-if="showChrome && !keyboardOpen" class="mobile-dock" :aria-label="t.mobilePrimaryNavigation">
      <a v-for="item in dockItems" :key="item.key" :href="item.path" :class="{ 'dock-room': item.key === 'room' }" :aria-current="item.active ? 'page' : undefined" @click="navigate($event, item)"><span class="dock-icon"><TsIcon :name="item.icon" :size="22" /></span><span class="dock-label">{{ item.key === 'room' ? tr('八千代', 'Yachiyo') : item.label }}</span></a>
      <button :aria-expanded="navOpen && menuMode === 'explore'" aria-controls="site-navigation" @click="openNavigation('explore', $event)"><span class="dock-icon"><TsIcon name="compass" :size="22" /></span><span class="dock-label">{{ copy.explore }}</span></button>
    </nav>
  </div>
</template>
