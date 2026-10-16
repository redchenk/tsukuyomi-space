<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import BeianLink from '../components/BeianLink.vue';
import TsIcon from '../components/TsIcon.vue';
import brandLogo from '../assets/sakura/sakura-moon-logo.webp';
import desktopVideo from '../assets/access/moon-gate-desktop-v1.mp4';
import mobileVideo from '../assets/access/moon-gate-mobile-v1.mp4';
import accessPosterSrc from '../assets/access/moon-gate-poster-v1.webp';

const props = defineProps({
  t: { type: Object, required: true },
  entering: { type: Boolean, default: false },
  entryFailed: { type: Boolean, default: false }
});
const emit = defineEmits(['enter', 'warm']);
const videoEl = ref(null);
const accessVideoSrc = ref('');
const motionAllowed = ref(false);
const userPaused = ref(false);
const videoState = reactive({ ready: false, failed: false });
const isMotionPaused = computed(() => userPaused.value || !motionAllowed.value);
let splashTimer = 0;
let disposed = false;
let playVersion = 0;
let reducedMotionQuery;
let connection;

function markVideoFailed() {
  videoState.ready = false;
  videoState.failed = true;
}

function tryPlayAccessVideo() {
  const video = videoEl.value;
  if (!video || isMotionPaused.value || videoState.failed || document.hidden || disposed) return;
  video.muted = true;
  video.playsInline = true;
  const attempt = ++playVersion;
  video.play()?.catch(() => {
    // Preference changes and leaving can interrupt play without a media failure.
    if (attempt === playVersion && !disposed && !isMotionPaused.value && !document.hidden) markVideoFailed();
  });
}

function markVideoReady() {
  videoState.ready = true;
  videoState.failed = false;
}

function toggleMotion() {
  userPaused.value = !userPaused.value;
  if (userPaused.value) { playVersion++; videoEl.value?.pause(); }
  else tryPlayAccessVideo();
}

async function syncMotionPreference() {
  motionAllowed.value = !reducedMotionQuery?.matches && !connection?.saveData;
  if (!motionAllowed.value) {
    playVersion++;
    videoEl.value?.pause();
    videoState.ready = false;
    return;
  }
  videoState.failed = false;
  await nextTick();
  if (!disposed) tryPlayAccessVideo();
}

function syncVisibility() {
  if (document.hidden) { playVersion++; videoEl.value?.pause(); }
  else tryPlayAccessVideo();
}

function restoreEntry(event) {
  // Safari can restore a page captured during the exit fade from BFCache.
  // Entry controls must never depend on video playback, focus, or a gesture.
  if (event?.persisted || !document.hidden) {
    tryPlayAccessVideo();
  }
}

function preventVideoFullscreen() {
  videoEl.value?.webkitExitFullscreen?.();
  videoEl.value?.pause();
  markVideoFailed();
}

function startAccess(event) {
  if (props.entering || disposed) return;
  const rect = event.currentTarget.getBoundingClientRect();
  // Keyboard activation uses the button center; a pointer opens where it lands.
  emit('enter', {
    x: event.detail ? event.clientX : rect.left + rect.width / 2,
    y: event.detail ? event.clientY : rect.top + rect.height / 2
  });
}

function entryReady() {
  window.clearTimeout(splashTimer);
  window.dispatchEvent(new Event('tsukuyomi:entry-ready'));
}

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  connection = navigator.connection;
  // Choose once so rotating or resizing never starts another clip download.
  accessVideoSrc.value = window.matchMedia('(max-width: 760px)').matches ? mobileVideo : desktopVideo;
  reducedMotionQuery.addEventListener('change', syncMotionPreference);
  connection?.addEventListener?.('change', syncMotionPreference);
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pageshow', restoreEntry);
  syncMotionPreference();
  // The poster may be slow or unavailable; optional media never blocks entry.
  splashTimer = window.setTimeout(entryReady, 1200);
});

onBeforeUnmount(() => {
  disposed = true;
  playVersion++;
  window.clearTimeout(splashTimer);
  window.dispatchEvent(new Event('tsukuyomi:entry-ready'));
  reducedMotionQuery?.removeEventListener('change', syncMotionPreference);
  connection?.removeEventListener?.('change', syncMotionPreference);
  document.removeEventListener('visibilitychange', syncVisibility);
  window.removeEventListener('pageshow', restoreEntry);
  const video = videoEl.value;
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
});
</script>

<template>
  <main class="page center-page access-page"
    :class="{ 'video-ready': videoState.ready, 'video-failed': videoState.failed }"
    :aria-busy="entering">
    <div class="access-media" aria-hidden="true">
    <img class="access-poster" :src="accessPosterSrc" alt="" fetchpriority="high" decoding="async" aria-hidden="true" @load="entryReady" @error="entryReady">
    <video v-if="motionAllowed" ref="videoEl" class="access-video" :src="accessVideoSrc"
      autoplay muted loop playsinline webkit-playsinline disablepictureinpicture disableremoteplayback
      controlslist="nodownload noplaybackrate noremoteplayback" x-webkit-airplay="deny" tabindex="-1"
      preload="metadata" :poster="accessPosterSrc" aria-hidden="true"
      @playing="markVideoReady" @canplay="tryPlayAccessVideo" @error="markVideoFailed" @webkitbeginfullscreen="preventVideoFullscreen"></video>
    <div class="access-overlay" aria-hidden="true"></div>
    </div>
    <div class="access-content">
    <header class="access-brand">
      <img :src="brandLogo" alt="" width="64" height="64" decoding="async">
      <span>{{ t.brand }}</span>
    </header>
    <button v-if="motionAllowed && !videoState.failed" class="access-motion-control" type="button"
      :aria-label="userPaused ? t.accessPlay : t.accessPause" :title="userPaused ? t.accessPlay : t.accessPause"
      :aria-pressed="userPaused" @click="toggleMotion">
      <TsIcon :name="userPaused ? 'play' : 'pause'" :size="18" />
    </button>
    <section class="access-hero" aria-labelledby="access-title">
      <p class="access-kicker">TSUKUYOMI SPACE</p>
      <h1 id="access-title" class="access-title">{{ t.title }}</h1>
      <div class="access-divider" aria-hidden="true"><TsIcon name="flower" :size="26" :stroke-width="1.25" /></div>
      <p class="access-subtitle">{{ t.subtitle }}</p>
      <p class="access-invitation">{{ t.accessInvitation }}</p>
      <button class="primary-btn access-enter" type="button" :disabled="entering"
        :aria-busy="entering" @pointerenter="emit('warm')" @focus="emit('warm')" @click="startAccess">
        <span v-if="entering" class="access-enter-spinner" aria-hidden="true"></span>
        <TsIcon v-else class="access-enter-moon" name="moon" :size="25" />
        <span>{{ entering ? t.accessOpening : entryFailed ? t.accessReload : t.accessEnter }}</span>
        <TsIcon name="arrowRight" :size="24" :stroke-width="1.65" />
      </button>
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
