<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import BeianLink from '../components/BeianLink.vue';

defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const accessVideoSrc = '/assets/video/【4K⧸中日双语】超时空辉夜姬「ray 」官方MV.mp4';
const accessPosterSrc = '/assets/images/tsukuyomi-bg.png';
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

function getExitDelay() {
  if (typeof window === 'undefined') return 340;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 340;
}

function startAccess(t) {
  if (loading.active || isLeaving.value) return;
  loading.active = true;
  loading.progress = 0;
  const labels = [t.connecting, t.loading, t.sync, t.welcome];
  let index = 0;
  loading.text = labels[index];

  const tick = () => {
    loading.progress = Math.min(100, loading.progress + 1.35);
    const nextIndex = Math.min(labels.length - 1, Math.floor(loading.progress / 25));
    if (nextIndex !== index) {
      index = nextIndex;
      loading.text = labels[index];
    }
    if (loading.progress >= 100) {
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
      <button class="primary-btn" type="button" :disabled="loading.active || isLeaving" @click="startAccess(t)">{{ t.access }}</button>
    </section>
    <footer class="access-beian">
      <p class="access-copyright">本站使用《超时空辉夜姬》相关素材版权归原著所有，本站为非盈利性质。</p>
      <BeianLink />
    </footer>
    <div v-if="loading.active" class="loading-layer" :class="{ 'is-completing': isLeaving }">
      <div class="loading-box">
        <div class="loading-text">{{ loading.text }}</div>
        <div class="loading-bar">
          <div class="loading-progress" :style="{ width: loading.progress + '%' }"></div>
        </div>
      </div>
    </div>
  </main>
</template>
