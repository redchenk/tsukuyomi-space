<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import desktopFilm from '../assets/access/moon-gate-desktop-v1.mp4';
import mobileFilm from '../assets/access/moon-gate-mobile-v1.mp4';
import poster from '../assets/access/moon-gate-poster-v1.webp';

const props = defineProps({ phase: String, lang: String, canEnter: Boolean });
defineEmits(['retry', 'leave', 'continue']);
const video = ref(null);
const film = ref('');
const motionAllowed = ref(false);
const painted = ref(false);
let motionQuery;
let connection;
let cancelPaint;

function resetPaint() {
  cancelPaint?.();
  cancelPaint = undefined;
  painted.value = false;
}

function syncMotion() {
  motionAllowed.value = !motionQuery.matches && !connection?.saveData;
  if (!motionAllowed.value) resetPaint();
}

function markPainted() {
  const element = video.value;
  if (!element || painted.value || cancelPaint) return;
  const show = () => {
    cancelPaint = undefined;
    if (video.value === element && motionAllowed.value && !element.error) painted.value = true;
  };
  if (typeof element.requestVideoFrameCallback === 'function') {
    const frame = element.requestVideoFrameCallback(show);
    cancelPaint = () => element.cancelVideoFrameCallback(frame);
  } else {
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(show); });
    cancelPaint = () => cancelAnimationFrame(frame);
  }
}

onMounted(() => {
  film.value = window.matchMedia('(max-width: 760px)').matches ? mobileFilm : desktopFilm;
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  connection = navigator.connection;
  motionQuery.addEventListener('change', syncMotion);
  connection?.addEventListener?.('change', syncMotion);
  syncMotion();
});

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', syncMotion);
  connection?.removeEventListener?.('change', syncMotion);
  resetPaint();
  video.value?.pause();
});

const copy = computed(() => ({
  en: ['Private Room', 'Preparing your room…', 'This is taking a little longer…', 'The room could not finish loading.', 'Reload', 'Back to Hub', 'Enter room'],
  ja: ['プライベートルーム', 'お部屋を準備しています…', '読み込みに時間がかかっています…', '読み込みを完了できませんでした。', '再読み込み', 'ハブへ戻る', '部屋に入る'],
  zh: ['私人居所', '正在为你准备房间…', '加载需要一点时间，请稍候…', '房间暂未完成加载，可重新尝试。', '重新加载', '返回大厅', '先进入房间']
}[props.lang] || ['私人居所', '正在为你准备房间…', '加载需要一点时间，请稍候…', '房间暂未完成加载，可重新尝试。', '重新加载', '返回大厅', '先进入房间']));
</script>

<template>
  <div id="loadingOverlay" class="boot-splash room-entry-splash" :data-phase="phase"
    :inert="phase === 'revealing'" :aria-busy="phase === 'loading'" :aria-label="copy[0]">
    <div class="room-entry-media" aria-hidden="true">
      <img class="room-entry-poster" :src="poster" alt="" decoding="async" data-image-bloom="off">
      <video v-if="motionAllowed" ref="video" class="room-entry-film" :class="{ 'is-painted': painted }"
        :src="film" autoplay muted playsinline disablepictureinpicture disableremoteplayback tabindex="-1"
        @playing="markPainted" @error="resetPaint"></video>
    </div>
    <div class="boot-splash-content">
      <div class="boot-splash-seal" aria-hidden="true"><img src="/assets/sakura/sakura-moon-logo.webp" width="96" height="96" alt="" data-image-bloom="off"></div>
      <p class="boot-splash-name">{{ copy[0] }}</p>
      <p class="boot-splash-caption">TSUKUYOMI SPACE</p>
      <div class="boot-splash-line" aria-hidden="true"></div>
      <p class="room-entry-detail" role="status">{{ copy[phase === 'error' ? 3 : phase === 'stalled' ? 2 : 1] }}</p>
      <div v-if="phase === 'error' || phase === 'stalled'" class="room-entry-actions">
        <button type="button" @click="$emit('retry')">{{ copy[4] }}</button>
        <button v-if="canEnter" type="button" @click="$emit('continue')">{{ copy[6] }}</button>
        <button type="button" @click="$emit('leave')">{{ copy[5] }}</button>
      </div>
    </div>
  </div>
</template>
