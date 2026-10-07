<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import BeianLink from '../components/BeianLink.vue';
import TsIcon from '../components/TsIcon.vue';
import brandLogo from '../assets/sakura/sakura-moon-logo.webp';
import desktopVideo from '../assets/access/moon-gate-desktop-v1.mp4';
import mobileVideo from '../assets/access/moon-gate-mobile-v1.mp4';
import accessPosterSrc from '../assets/access/moon-gate-poster-v1.webp';

defineProps({ t: { type: Object, required: true } });
const emit = defineEmits(['go']);
const videoEl = ref(null);
const accessVideoSrc = ref('');
const motionAllowed = ref(false);
const userPaused = ref(false);
const isLeaving = ref(false);
const videoState = reactive({ ready: false, failed: false });
const loading = reactive({ active: false, progress: 0, text: '' });
const isMotionPaused = computed(() => userPaused.value || !motionAllowed.value);
let navigationTimer = 0;
let animationFrame = 0;
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

function startAccess(t) {
  if (loading.active || isLeaving.value) return;
  loading.active = true;
  loading.progress = 0;
  const labels = [t.connecting, t.loading, t.sync, t.welcome];
  loading.text = labels[0];
  const duration = reducedMotionQuery?.matches ? 100 : 300;
  const startedAt = performance.now();
  const tick = () => {
    if (disposed) return;
    const progress = Math.min(1, Math.max(0, performance.now() - startedAt) / duration);
    loading.progress = (1 - Math.pow(1 - progress, 3)) * 100;
    loading.text = labels[Math.min(labels.length - 1, Math.floor(loading.progress / 25))];
    if (progress >= 1) {
      isLeaving.value = true;
      navigationTimer = window.setTimeout(() => {
        if (!disposed) emit('go', '/hub');
      }, reducedMotionQuery?.matches ? 24 : 70);
    } else animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  connection = navigator.connection;
  // Choose once so rotating or resizing never starts another clip download.
  accessVideoSrc.value = window.matchMedia('(max-width: 760px)').matches ? mobileVideo : desktopVideo;
  reducedMotionQuery.addEventListener('change', syncMotionPreference);
  connection?.addEventListener?.('change', syncMotionPreference);
  document.addEventListener('visibilitychange', syncVisibility);
  syncMotionPreference();
});

onBeforeUnmount(() => {
  disposed = true;
  playVersion++;
  window.clearTimeout(navigationTimer);
  cancelAnimationFrame(animationFrame);
  reducedMotionQuery?.removeEventListener('change', syncMotionPreference);
  connection?.removeEventListener?.('change', syncMotionPreference);
  document.removeEventListener('visibilitychange', syncVisibility);
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
    :class="{ 'video-ready': videoState.ready, 'video-failed': videoState.failed, 'is-leaving': isLeaving }"
    :aria-busy="loading.active">
    <img class="access-poster" :src="accessPosterSrc" alt="" fetchpriority="high" decoding="async" aria-hidden="true">
    <video v-if="motionAllowed" ref="videoEl" class="access-video" :src="accessVideoSrc"
      autoplay muted loop playsinline webkit-playsinline disablepictureinpicture disableremoteplayback
      controlslist="nodownload noplaybackrate noremoteplayback" x-webkit-airplay="deny" tabindex="-1"
      preload="metadata" :poster="accessPosterSrc" aria-hidden="true"
      @playing="markVideoReady" @canplay="tryPlayAccessVideo" @error="markVideoFailed"></video>
    <div class="access-overlay" aria-hidden="true"></div>
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
      <button class="primary-btn access-enter" type="button" :disabled="loading.active || isLeaving"
        :aria-busy="loading.active" @click="startAccess(t)">
        <TsIcon class="access-enter-moon" name="moon" :size="25" />
        <span>{{ t.accessEnter }}</span>
        <TsIcon name="arrowRight" :size="24" :stroke-width="1.65" />
      </button>
    </section>
    <footer class="access-beian">
      <p class="access-copyright">{{ t.accessCopyright }}</p>
      <BeianLink />
    </footer>
    <div v-if="loading.active" class="access-loading-layer" :class="{ 'is-completing': isLeaving }" role="status" aria-live="polite">
      <div class="access-loading-box ts-loader-region"><StatusLoader :label="loading.text" :progress="loading.progress" /></div>
    </div>
  </main>
</template>
