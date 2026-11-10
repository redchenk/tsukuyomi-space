<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import BeianLink from '../components/BeianLink.vue';
import TsIcon from '../components/TsIcon.vue';
import WaterMirrorScene from '../components/WaterMirrorScene.vue';
import brandLogo from '../assets/sakura/sakura-moon-logo.webp';

const props = defineProps({
  t: { type: Object, required: true },
  entering: Boolean,
  cinematic: Boolean,
  canPlayIntro: Boolean,
  entryFailed: Boolean
});
const emit = defineEmits(['enter', 'warm']);
const scene = ref(null);
const SOUND_KEY = 'tsukuyomi_access_sound';
const motionAllowed = ref(false);
const userPaused = ref(false);
const sound = ref(true);
try { sound.value = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (_) { /* Optional preference. */ }
let splashTimer = 0;
let motionQuery;
let connection;

function toggleSound() {
  sound.value = !sound.value;
  try { localStorage.setItem(SOUND_KEY, sound.value ? 'on' : 'off'); } catch (_) { /* Optional preference. */ }
}

function warm() {
  scene.value?.warm();
  emit('warm');
}

function syncMotionPreference() {
  motionAllowed.value = !motionQuery?.matches && !connection?.saveData;
}

function startAccess(event) {
  if (props.entering) return;
  const rect = event.currentTarget.getBoundingClientRect();
  emit('enter', {
    x: event.detail ? event.clientX : rect.left + rect.width / 2,
    y: event.detail ? event.clientY : rect.top + rect.height / 2,
    sound: sound.value
  });
}

function entryReady() {
  window.clearTimeout(splashTimer);
  window.dispatchEvent(new Event('tsukuyomi:entry-ready'));
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  connection = navigator.connection;
  motionQuery.addEventListener('change', syncMotionPreference);
  connection?.addEventListener?.('change', syncMotionPreference);
  syncMotionPreference();
  splashTimer = window.setTimeout(entryReady, 1200);
});

onBeforeUnmount(() => {
  entryReady();
  motionQuery?.removeEventListener('change', syncMotionPreference);
  connection?.removeEventListener?.('change', syncMotionPreference);
});
</script>

<template>
  <main class="page center-page access-page" :aria-busy="entering">
    <WaterMirrorScene ref="scene" :allow-motion="motionAllowed"
      :allow-intro="motionAllowed && (canPlayIntro || cinematic)"
      :moving="motionAllowed && !userPaused && (!entering || cinematic)" @ready="entryReady" />
    <div class="access-content">
      <header class="access-brand">
        <img :src="brandLogo" alt="" width="64" height="64" decoding="async">
        <span>{{ t.brand }}</span>
      </header>
      <div class="access-controls">
        <button v-if="motionAllowed" class="access-motion-control" type="button"
          :aria-label="userPaused ? t.accessPlay : t.accessPause" :title="userPaused ? t.accessPlay : t.accessPause"
          :aria-pressed="userPaused" @click="userPaused = !userPaused">
          <TsIcon :name="userPaused ? 'play' : 'pause'" :size="18" />
        </button>
        <button class="access-motion-control access-sound-control" type="button" :aria-pressed="sound"
          :aria-label="t.accessSound" :title="t.accessSound" @click="toggleSound">
          <TsIcon name="volume" :size="18" />
        </button>
      </div>
      <section class="access-hero" aria-labelledby="access-title">
        <p class="access-kicker">TSUKUYOMI SPACE</p>
        <h1 id="access-title" class="access-title">{{ t.title }}</h1>
        <div class="access-divider" aria-hidden="true"><TsIcon name="flower" :size="18" :stroke-width="1.2" /></div>
        <p class="access-subtitle">{{ t.subtitle }}</p>
        <button class="access-enter" type="button" :disabled="entering"
          :aria-busy="entering" @pointerenter="warm" @focus="warm" @click="startAccess">
          <span v-if="entering && !cinematic" class="access-enter-spinner" aria-hidden="true"></span>
          <TsIcon v-else class="access-enter-moon" name="moon" :size="21" />
          <span>{{ entering && !cinematic ? t.accessOpening : entryFailed ? t.accessReload : t.accessEnter }}</span>
          <TsIcon name="arrowRight" :size="20" :stroke-width="1.5" />
        </button>
        <p class="access-invitation">{{ t.accessInvitation }}</p>
        <p v-if="entryFailed" class="access-entry-error" role="alert">{{ t.accessRetry }}</p>
        <span class="access-entry-status" role="status" aria-live="polite">{{ entering ? t.accessOpening : '' }}</span>
      </section>
      <footer class="access-beian">
        <p class="access-copyright">{{ t.accessCopyright }}</p>
        <BeianLink />
      </footer>
    </div>
  </main>
</template>
