<script setup>
import { computed, ref, watch } from 'vue';
import SiteMusicDrawer from '../components/SiteMusicDrawer.vue';

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

const navItems = computed(() => [
  { path: '/hub', key: 'hub', label: props.t.hub, icon: '⌂', active: props.routeName === 'hub', spa: true },
  { path: '/room', key: 'room', label: props.t.room, icon: '☾', active: props.routeName === 'room' || props.routeName === 'roomSettings', spa: true },
  { path: '/plaza', key: 'plaza', label: props.t.plaza, icon: '✧', active: props.routeName === 'plaza', spa: true },
  { path: '/stage', key: 'stage', label: props.t.stage, icon: '▤', active: props.routeName === 'stage' || props.routeName === 'article' || props.routeName === 'editor', spa: true },
  { path: '/arena', key: 'arena', label: props.t.arena, icon: '◇', active: props.routeName === 'arena', spa: true },
  { path: '/reality', key: 'reality', label: props.t.reality, icon: '◎', active: props.routeName === 'reality', spa: true }
]);

const accountLabel = computed(() => (props.isAuthed ? props.t.ucTitle : props.t.login));

function userInitial() {
  return String(props.user?.username || props.user?.email || props.t.brand || '月').slice(0, 1).toUpperCase();
}

watch(() => props.routeName, () => {
  navOpen.value = false;
});
</script>

<template>
  <div class="app-shell" :class="{ 'room-shell': routeName === 'room' }">
    <div v-if="routeName !== 'room'" class="site-global-bg" aria-hidden="true"></div>
    <div v-if="showChrome && routeName !== 'room'" class="moon" aria-hidden="true"></div>
    <aside v-if="showChrome" class="site-rail" aria-label="Quick navigation">
      <a href="/hub" class="rail-mark" :aria-label="t.brand" @click.prevent="$emit('go', '/hub')">✦</a>
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
          <span aria-hidden="true">{{ item.icon }}</span>
        </a>
      </nav>
      <div class="rail-footer">
        <button
          class="rail-link rail-theme"
          type="button"
          :aria-label="theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
          :title="theme === 'dark' ? '浅色主题' : '深色主题'"
          @click="$emit('toggle-theme')"
        >
          <span aria-hidden="true">{{ theme === 'dark' ? '☀' : '☾' }}</span>
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
          <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </a>
        <a v-if="isAuthed" href="/user-center" class="nav-link user-chip" :class="{ 'router-link-active': routeName === 'userCenter' }" @click.prevent="navOpen = false; $emit('go', '/user-center')">{{ t.ucTitle }}</a>
        <a v-if="!isAuthed" href="/login" class="nav-link" :class="{ 'router-link-active': routeName === 'login' }" @click.prevent="navOpen = false; $emit('go', '/login')">{{ t.login }}</a>
        <a v-if="!isAuthed" href="/register" class="nav-link" :class="{ 'router-link-active': routeName === 'register' }" @click.prevent="navOpen = false; $emit('go', '/register')">{{ t.register }}</a>
        <button v-if="isAuthed" class="ghost-btn nav-link" type="button" @click="navOpen = false; $emit('logout')">{{ t.logout }}</button>
        <button
          class="theme-toggle nav-link"
          type="button"
          :aria-label="theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
          :title="theme === 'dark' ? '浅色主题' : '深色主题'"
          @click="$emit('toggle-theme')"
        >
          <span aria-hidden="true">{{ theme === 'dark' ? '☀' : '☾' }}</span>
          <span>{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
        </button>
        <div class="lang-switcher" aria-label="Language">
          <button class="lang-btn" :class="{ active: lang === 'zh' }" type="button" @click="$emit('set-lang', 'zh')">中文</button>
          <button class="lang-btn" :class="{ active: lang === 'ja' }" type="button" @click="$emit('set-lang', 'ja')">日本語</button>
        </div>
      </div>
    </header>
    <SiteMusicDrawer v-if="showChrome && music" :music="music" />
    <slot></slot>
  </div>
</template>
