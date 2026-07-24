<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import TsIcon from '../components/TsIcon.vue';

const props = defineProps({
  lang: { type: String, default: 'zh' },
  t: { type: Object, required: true }
});

const GAME_URL = String(import.meta.env.VITE_KAGUYA_GAME_URL || '/game-runtime/kaguya-run-ef04c26b4900-r2.html').trim();
const LOAD_TIMEOUT_MS = 120000;
const frame = ref(null);
const stage = ref(null);
const loading = ref(true);
const loadError = ref(false);
const siteMusic = inject('siteMusic', null);
let loadTimer = 0;
let resumeSiteMusic = false;

const copy = computed(() => ({
  title: props.t.game || (props.lang === 'ja' ? 'かぐやラン' : props.lang === 'en' ? 'Kaguya Run' : '辉夜快跑'),
  loading: props.t.gameLoading || (props.lang === 'ja' ? 'ゲームを読み込み中' : props.lang === 'en' ? 'Loading game' : '正在加载游戏'),
  unavailable: props.t.gameUnavailable || (props.lang === 'ja' ? 'ゲームを読み込めませんでした' : props.lang === 'en' ? 'Unable to load the game' : '游戏加载失败'),
  retry: props.t.retry || (props.lang === 'ja' ? '再試行' : props.lang === 'en' ? 'Retry' : '重试'),
  fullscreen: props.t.gameFullscreen || (props.lang === 'ja' ? 'フルスクリーン' : props.lang === 'en' ? 'Fullscreen' : '全屏'),
  standalone: props.t.gameStandalone || (props.lang === 'ja' ? '別ウィンドウで開く' : props.lang === 'en' ? 'Open separately' : '独立打开')
}));

function beginLoadTimeout() {
  window.clearTimeout(loadTimer);
  loadTimer = window.setTimeout(() => {
    if (!loading.value) return;
    loading.value = false;
    loadError.value = true;
  }, LOAD_TIMEOUT_MS);
}

function handleLoad() {
  window.clearTimeout(loadTimer);
  loading.value = false;
  loadError.value = false;
}

function handleError() {
  window.clearTimeout(loadTimer);
  loading.value = false;
  loadError.value = true;
}

function retry() {
  loadError.value = false;
  loading.value = true;
  beginLoadTimeout();
  if (frame.value) frame.value.src = GAME_URL;
}

async function enterFullscreen() {
  try {
    await stage.value?.requestFullscreen?.();
    frame.value?.focus();
  } catch (_) {
    frame.value?.focus();
  }
}

onMounted(() => {
  resumeSiteMusic = Boolean(siteMusic?.playing?.value);
  if (resumeSiteMusic) siteMusic.togglePlay?.();
  beginLoadTimeout();
});

onBeforeUnmount(() => {
  window.clearTimeout(loadTimer);
  if (resumeSiteMusic && !siteMusic?.playing?.value) siteMusic?.togglePlay?.();
});
</script>

<template>
  <main class="page game-page">
    <section class="game-shell" :aria-label="copy.title">
      <header class="game-toolbar">
        <div class="game-heading">
          <TsIcon name="gamepad" :size="22" />
          <h1>{{ copy.title }}</h1>
        </div>
        <div class="game-actions">
          <button class="game-icon-button" type="button" :title="copy.fullscreen" :aria-label="copy.fullscreen" @click="enterFullscreen">
            <TsIcon name="maximize" :size="19" />
          </button>
        </div>
      </header>

      <div ref="stage" class="game-stage" :aria-busy="loading">
        <div v-if="loading" class="game-loading" role="status" :aria-label="copy.loading">
          <span aria-hidden="true"></span>
        </div>
        <iframe
          ref="frame"
          class="game-frame"
          :src="GAME_URL"
          :title="copy.title"
          allow="autoplay; fullscreen; gamepad"
          allowfullscreen
          fetchpriority="high"
          referrerpolicy="no-referrer"
          sandbox="allow-scripts allow-pointer-lock allow-downloads"
          @load="handleLoad"
          @error="handleError"
        ></iframe>
        <div v-if="loadError" class="game-error" role="alert">
          <span>{{ copy.unavailable }}</span>
          <button type="button" @click="retry">{{ copy.retry }}</button>
        </div>
      </div>
    </section>
  </main>
</template>
