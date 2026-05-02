<script setup>
import { reactive } from 'vue';

defineProps({
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);
const accessVideoSrc = '/assets/video/\u30104K\u29f8\u4e2d\u65e5\u53cc\u8bed\u3011\u8d85\u65f6\u7a7a\u8f89\u591c\u59ec\u300cray \u300d\u5b98\u65b9MV.mp4';
const loading = reactive({
  active: false,
  progress: 0,
  text: ''
});

function startAccess(t) {
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
      loading.active = false;
      emit('go', '/hub');
      return;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}
</script>

<template>
  <main class="page center-page access-page">
    <video class="access-video" autoplay muted loop playsinline aria-hidden="true">
      <source :src="accessVideoSrc" type="video/mp4">
    </video>
    <div class="access-overlay" aria-hidden="true"></div>
    <section class="hero">
      <h1 class="hero-title">{{ t.title }}</h1>
      <p class="hero-kicker">TSUKUYOMI SPACE</p>
      <p class="hero-copy">{{ t.heroCopy }}</p>
      <button class="primary-btn" type="button" @click="startAccess(t)">{{ t.access }}</button>
    </section>
    <div v-if="loading.active" class="loading-layer">
      <div class="loading-box">
        <div class="loading-text">{{ loading.text }}</div>
        <div class="loading-bar">
          <div class="loading-progress" :style="{ width: loading.progress + '%' }"></div>
        </div>
      </div>
    </div>
  </main>
</template>
