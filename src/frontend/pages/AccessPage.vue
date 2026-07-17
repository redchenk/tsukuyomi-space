<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import BeianLink from '../components/BeianLink.vue';

defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const accessVideoSrc = '/assets/video/【4K⧸中日双语】超时空辉夜姬「ray 」官方MV.mp4';
const accessPosterSrc = '/assets/images/tsukuyomi-bg.webp';
const videoEl = ref(null);
const isLeaving = ref(false);
const videoState = reactive({
  ready: false,
  failed: false
});
const loading = reactive({
  active: false,
  progress: 0,
  text: ''
});
let navigationTimer = 0;

function markVideoReady() {
  videoState.ready = true;
  videoState.failed = false;
}

function markVideoFailed() {
  videoState.ready = false;
  videoState.failed = true;
}

function tryPlayAccessVideo() {
  const video = videoEl.value;
  if (!video || videoState.failed) return;
  video.muted = true;
  video.playsInline = true;
  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      markVideoFailed();
    });
  }
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAccessLoadDuration() {
  return prefersReducedMotion() ? 100 : 300;
}

function getExitDelay() {
  return prefersReducedMotion() ? 24 : 70;
}

function startAccess(t) {
  if (loading.active || isLeaving.value) return;
  loading.active = true;
  loading.progress = 0;
  const labels = [t.connecting, t.loading, t.sync, t.welcome];
  let index = 0;
  loading.text = labels[index];
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const duration = getAccessLoadDuration();

  const tick = () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = Math.max(0, now - startedAt);
    const linearProgress = Math.min(1, elapsed / duration);
    const easedProgress = 1 - Math.pow(1 - linearProgress, 3);
    loading.progress = Math.min(100, easedProgress * 100);
    const nextIndex = Math.min(labels.length - 1, Math.floor(loading.progress / 25));
    if (nextIndex !== index) {
      index = nextIndex;
      loading.text = labels[index];
    }
    if (linearProgress >= 1) {
      loading.progress = 100;
      loading.text = labels[labels.length - 1];
      isLeaving.value = true;
      navigationTimer = window.setTimeout(() => {
        loading.active = false;
        emit('go', '/hub');
      }, getExitDelay());
      return;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

onMounted(() => {
  requestAnimationFrame(tryPlayAccessVideo);
});

onBeforeUnmount(() => {
  if (navigationTimer) window.clearTimeout(navigationTimer);
});
</script>

<template>
  <main
    class="page center-page access-page"
    :class="{ 'video-ready': videoState.ready, 'video-failed': videoState.failed, 'is-leaving': isLeaving }"
    :aria-busy="loading.active"
  >
    <video
      ref="videoEl"
      class="access-video"
      autoplay
      muted
      loop
      playsinline
      preload="metadata"
      :poster="accessPosterSrc"
      aria-hidden="true"
      @canplay="markVideoReady"
      @loadeddata="markVideoReady"
      @error="markVideoFailed"
    >
      <source :src="accessVideoSrc" type="video/mp4">
    </video>
    <div class="access-overlay" aria-hidden="true"></div>
    <section class="hero">
      <h1 class="hero-title">{{ t.title }}</h1>
      <p class="hero-kicker">TSUKUYOMI SPACE</p>
      <p class="hero-copy">{{ t.heroCopy }}</p>
      <button class="primary-btn" type="button" :disabled="loading.active || isLeaving" :aria-busy="loading.active" @click="startAccess(t)">{{ t.access }}</button>
    </section>
    <footer class="access-beian">
      <p class="access-copyright">本站使用《超时空辉夜姬》相关素材版权归原著所有，本站为非盈利性质。</p>
      <BeianLink />
    </footer>
    <div v-if="loading.active" class="loading-layer" :class="{ 'is-completing': isLeaving }" aria-busy="true">
      <div class="loading-box ts-loader-region">
        <StatusLoader :label="loading.text" :progress="loading.progress" />
      </div>
    </div>
  </main>
</template>
