<script setup>
defineProps({
  isAuthed: { type: Boolean, default: false },
  lang: { type: String, required: true },
  routeName: { type: String, default: 'access' },
  showChrome: { type: Boolean, default: true },
  t: { type: Object, required: true },
  user: { type: Object, default: null }
});

defineEmits(['go', 'logout', 'set-lang']);
</script>

<template>
  <div class="app-shell">
    <div v-if="showChrome" class="moon" aria-hidden="true"></div>
    <header v-if="showChrome" class="topbar">
      <a href="/hub" class="brand" @click.prevent="$emit('go', '/hub')">{{ t.brand }}</a>
      <div class="nav-actions">
        <a href="/hub" class="nav-link" :class="{ 'router-link-active': routeName === 'hub' }" @click.prevent="$emit('go', '/hub')">{{ t.hub }}</a>
        <a href="/stage" class="nav-link" :class="{ 'router-link-active': routeName === 'stage' }" @click.prevent="$emit('go', '/stage')">{{ t.stage }}</a>
        <a href="/plaza" class="nav-link" :class="{ 'router-link-active': routeName === 'plaza' }" @click.prevent="$emit('go', '/plaza')">{{ t.plaza }}</a>
        <a href="/reality" class="nav-link" :class="{ 'router-link-active': routeName === 'reality' }" @click.prevent="$emit('go', '/reality')">{{ t.reality }}</a>
        <a v-if="!isAuthed" href="/login" class="nav-link" :class="{ 'router-link-active': routeName === 'login' }" @click.prevent="$emit('go', '/login')">{{ t.login }}</a>
        <a v-if="!isAuthed" href="/register" class="nav-link" :class="{ 'router-link-active': routeName === 'register' }" @click.prevent="$emit('go', '/register')">{{ t.register }}</a>
        <a v-if="isAuthed" href="/user-center" class="user-chip" :class="{ 'router-link-active': routeName === 'userCenter' }" @click.prevent="$emit('go', '/user-center')">{{ user?.username || user?.email }}</a>
        <button v-if="isAuthed" class="ghost-btn" type="button" @click="$emit('logout')">{{ t.logout }}</button>
        <div class="lang-switcher" aria-label="Language">
          <button class="lang-btn" :class="{ active: lang === 'zh' }" type="button" @click="$emit('set-lang', 'zh')">中文</button>
          <button class="lang-btn" :class="{ active: lang === 'ja' }" type="button" @click="$emit('set-lang', 'ja')">日本語</button>
        </div>
      </div>
    </header>
    <slot></slot>
  </div>
</template>
