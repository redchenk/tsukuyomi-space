<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { authHeaders, parseResponse } from '../api/client';
import SiteMusicDrawer from '../components/SiteMusicDrawer.vue';
import TsIcon from '../components/TsIcon.vue';

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
const unreadNotifications = ref(0);

const hasGlobalBackground = computed(() => props.routeName !== 'access' && props.routeName !== 'accessAlias' && props.routeName !== 'room');
const showNotifications = computed(() => props.isAuthed);

const navItems = computed(() => [
  { path: '/hub', key: 'hub', label: props.t.hub, icon: 'home', active: props.routeName === 'hub', spa: true },
  { path: '/room', key: 'room', label: props.t.room, icon: 'moon', active: props.routeName === 'room' || props.routeName === 'roomSettings', spa: true },
  { path: '/plaza', key: 'plaza', label: props.t.plaza, icon: 'plaza', active: props.routeName === 'plaza', spa: true },
  { path: '/stage', key: 'stage', label: props.t.stage, icon: 'book', active: props.routeName === 'stage' || props.routeName === 'article' || props.routeName === 'editor', spa: true },
  { path: '/arena', key: 'arena', label: props.t.arena, icon: 'gamepad', active: props.routeName === 'arena', spa: true },
  { path: '/reality', key: 'reality', label: props.t.reality, icon: 'compass', active: props.routeName === 'reality', spa: true }
]);

const mobilePrimaryItems = computed(() => navItems.value.slice(0, 4));
const accountLabel = computed(() => (props.isAuthed ? props.t.ucTitle : props.t.login));
const themeLabel = computed(() => (props.theme === 'dark' ? '切换浅色主题' : '切换深色主题'));
const moreLabel = computed(() => (props.lang === 'ja' ? 'その他' : '更多'));

function userInitial() {
  return String(props.user?.username || props.user?.email || props.t.brand || '月').slice(0, 1).toUpperCase();
}

async function loadUnreadNotifications() {
  if (!props.isAuthed) {
    unreadNotifications.value = 0;
    return;
  }

  try {
    const response = await fetch('/api/user/notifications/unread-count', { headers: authHeaders() });
    const result = await parseResponse(response);
    if (result.success) unreadNotifications.value = Number(result.data?.count || 0);
  } catch (_) {
    unreadNotifications.value = 0;
  }
}

watch(() => props.routeName, () => {
  navOpen.value = false;
  loadUnreadNotifications();
});

watch(() => props.isAuthed, loadUnreadNotifications, { immediate: true });
onMounted(loadUnreadNotifications);
</script>

<template>
  <div class="app-shell" :class="{ 'room-shell': routeName === 'room' }">
    <div v-if="hasGlobalBackground" class="site-global-bg" aria-hidden="true"></div>
    <div v-if="showChrome && routeName !== 'room'" class="moon" aria-hidden="true"></div>

    <aside v-if="showChrome" class="site-rail" aria-label="Quick navigation">
      <a href="/hub" class="rail-mark" :aria-label="t.brand" @click.prevent="$emit('go', '/hub')">
        <TsIcon name="moon" :size="24" :stroke-width="1.8" />
      </a>

      <nav class="rail-nav">
        <a
          v-for="item in navItems"
          :key="item.key"
          :href="item.path"
          class="rail-link"
          :class="{ active: item.active }"
          :aria-label="item.label"
          :title="item.label"
          @click="item.spa && ($event.preventDefault(), $emit('go', item.path))"
        >
          <TsIcon :name="item.icon" :size="20" />
        </a>
      </nav>

      <div class="rail-footer">
        <button
          v-if="showNotifications"
          class="rail-link rail-notifications"
          type="button"
          :aria-label="`站内信，${unreadNotifications} 条未读`"
          :title="`站内信，${unreadNotifications} 条未读`"
          @click="$emit('go', '/notifications')"
        >
          <TsIcon name="bell" :size="20" />
          <i v-if="unreadNotifications" class="rail-badge">{{ unreadNotifications > 99 ? '99+' : unreadNotifications }}</i>
        </button>

        <button
          class="rail-link rail-theme"
          type="button"
          :aria-label="themeLabel"
          :title="themeLabel"
          @click="$emit('toggle-theme')"
        >
          <TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="20" />
        </button>

        <a
          class="rail-link rail-account"
          :class="{ active: routeName === 'userCenter' || routeName === 'login' }"
          :href="isAuthed ? '/user-center' : '/login'"
          :aria-label="accountLabel"
          :title="accountLabel"
          @click.prevent="$emit('go', isAuthed ? '/user-center' : '/login')"
        >
          <img v-if="user?.avatar" :src="user.avatar" :alt="user?.username || user?.email || t.brand">
          <span v-else aria-hidden="true">{{ userInitial() }}</span>
        </a>
      </div>
    </aside>

    <header v-if="showChrome && routeName !== 'room'" class="topbar site-commandbar">
      <a href="/hub" class="brand room-brand site-brand" @click.prevent="$emit('go', '/hub')">
        <span class="room-brand-mark site-brand-mark room-user-avatar">
          <img v-if="user?.avatar" :src="user.avatar" :alt="user?.username || user?.email || t.brand">
          <span v-else>{{ userInitial() }}</span>
        </span>
        <span>
          <strong>{{ t.brand }}</strong>
          <small>Web UI Redesign Concept</small>
        </span>
      </a>

      <button
        class="mobile-nav-toggle"
        type="button"
        :aria-expanded="navOpen"
        aria-controls="site-navigation"
        @click="navOpen = !navOpen"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div id="site-navigation" class="nav-actions room-nav-links site-nav-links" :class="{ open: navOpen }">
        <a
          v-for="item in navItems"
          :key="item.key"
          :href="item.path"
          class="nav-link"
          :class="{ 'router-link-active': item.active }"
          @click="navOpen = false; item.spa && ($event.preventDefault(), $emit('go', item.path))"
        >
          <TsIcon class="nav-icon" :name="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </a>

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

        <a v-if="isAuthed" href="/user-center" class="nav-link user-chip" :class="{ 'router-link-active': routeName === 'userCenter' }" @click.prevent="navOpen = false; $emit('go', '/user-center')">{{ t.ucTitle }}</a>
        <a v-if="!isAuthed" href="/login" class="nav-link" :class="{ 'router-link-active': routeName === 'login' }" @click.prevent="navOpen = false; $emit('go', '/login')">{{ t.login }}</a>
        <a v-if="!isAuthed" href="/register" class="nav-link" :class="{ 'router-link-active': routeName === 'register' }" @click.prevent="navOpen = false; $emit('go', '/register')">{{ t.register }}</a>
        <button v-if="isAuthed" class="ghost-btn nav-link" type="button" @click="navOpen = false; $emit('logout')">{{ t.logout }}</button>

        <button
          class="theme-toggle nav-link"
          type="button"
          :aria-label="themeLabel"
          :title="themeLabel"
          @click="$emit('toggle-theme')"
        >
          <TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" />
          <span>{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
        </button>

        <div class="lang-switcher" aria-label="Language">
          <button class="lang-btn" :class="{ active: lang === 'zh' }" type="button" @click="$emit('set-lang', 'zh')">中文</button>
          <button class="lang-btn" :class="{ active: lang === 'ja' }" type="button" @click="$emit('set-lang', 'ja')">日本語</button>
        </div>
      </div>
    </header>

    <nav v-if="showChrome && routeName !== 'room'" class="mobile-bottom-nav" aria-label="Mobile primary navigation">
      <a
        v-for="item in mobilePrimaryItems"
        :key="item.key"
        :href="item.path"
        class="mobile-bottom-link"
        :class="{ active: item.active }"
        :aria-label="item.label"
        @click="item.spa && ($event.preventDefault(), $emit('go', item.path))"
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
  </div>
</template>
