<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  isAuthed: { type: Boolean, default: false },
  lang: { type: String, required: true },
  routeName: { type: String, default: 'access' },
  showChrome: { type: Boolean, default: true },
  t: { type: Object, required: true },
  theme: { type: String, default: 'light' },
  user: { type: Object, default: null }
});

defineEmits(['go', 'logout', 'set-lang', 'toggle-theme']);

const navOpen = ref(false);

watch(() => props.routeName, () => {
  navOpen.value = false;
});
</script>

<template>
  <div class="app-shell">
    <div v-if="showChrome" class="moon" aria-hidden="true"></div>
    <header v-if="showChrome" class="topbar site-commandbar">
      <a href="/hub" class="brand room-brand site-brand" @click.prevent="$emit('go', '/hub')">
        <span class="room-brand-mark site-brand-mark room-user-avatar">
          <img v-if="user?.avatar" :src="user.avatar" :alt="user?.username || user?.email || t.brand">
          <span v-else>{{ String(user?.username || user?.email || t.brand || '月').slice(0, 1).toUpperCase() }}</span>
        </span>
        <span>
          <strong>{{ t.brand }}</strong>
          <small>Tsukuyomi Space</small>
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
        <a href="/hub" class="nav-link" :class="{ 'router-link-active': routeName === 'hub' }" @click.prevent="navOpen = false; $emit('go', '/hub')">{{ t.hub }}</a>
        <a href="/room" class="nav-link" :class="{ 'router-link-active': routeName === 'room' || routeName === 'roomSettings' }" @click.prevent="navOpen = false; $emit('go', '/room')">{{ t.room }}</a>
        <a href="/stage" class="nav-link" :class="{ 'router-link-active': routeName === 'stage' }" @click.prevent="navOpen = false; $emit('go', '/stage')">{{ t.stage }}</a>
        <a href="/plaza" class="nav-link" :class="{ 'router-link-active': routeName === 'plaza' }" @click.prevent="navOpen = false; $emit('go', '/plaza')">{{ t.plaza }}</a>
        <a href="/reality" class="nav-link" :class="{ 'router-link-active': routeName === 'reality' }" @click.prevent="navOpen = false; $emit('go', '/reality')">{{ t.reality }}</a>
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
    <slot></slot>
  </div>
</template>
