<script setup>
import { nameInitial } from '../utils/userName.mjs';
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TsIcon from '../components/TsIcon.vue';
import { getSession } from '../api/client';
import { loadKaguyaLeaderboard, submitKaguyaScore } from '../services/userGrowth';

const props = defineProps({
  lang: { type: String, default: 'zh' },
  t: { type: Object, required: true },
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);
const defaultGameUrl = '/game-runtime/kaguya-run-ef04c26b4900-r8.html';
const GAME_URL = String(import.meta.env.VITE_KAGUYA_GAME_URL || defaultGameUrl).trim();
const ORIGINAL_AUTHOR_URL = 'https://www.bilibili.com/video/BV1Bmgx6aEvJ/';
const LOAD_TIMEOUT_MS = 120000;
const SCORE_SAVE_INTERVAL_MS = 15000;
const SCORE_SAVE_STEP = 250;
const LEADERBOARD_PAGE_SIZE = 50;
const frame = ref(null);
const stage = ref(null);
const loading = ref(true);
const loadError = ref(false);
const leaderboardLoading = ref(true);
const leaderboardError = ref(false);
const leaderboard = ref([]);
const currentScore = ref(0);
const bestScore = ref(0);
const currentRank = ref(0);
const siteMusic = inject('siteMusic', null);
let loadTimer = 0;
let scoreSaveTimer = 0;
let pendingScore = 0;
let lastSubmittedScore = 0;
let lastScoreSaveAt = 0;
let scoreSaving = false;
let resumeSiteMusic = false;
let leaderboardRefreshId = 0;
let leaderboardController = null;
let disposed = false;
let accountGeneration = 0;
const leaderboardPage = ref(1);
const leaderboardTotalPages = ref(1);

const sessionUser = computed(() => props.user || getSession()?.user || null);
const currentUserId = computed(() => String(sessionUser.value?.id || ''));
const copy = computed(() => ({
  title: props.t.game || (props.lang === 'ja' ? 'かぐやラン' : props.lang === 'en' ? 'Kaguya Run' : '辉夜快跑'),
  loading: props.t.gameLoading || (props.lang === 'ja' ? 'ゲームを読み込み中' : props.lang === 'en' ? 'Loading game' : '正在加载游戏'),
  unavailable: props.t.gameUnavailable || (props.lang === 'ja' ? 'ゲームを読み込めませんでした' : props.lang === 'en' ? 'Unable to load the game' : '游戏加载失败'),
  retry: props.t.retry || (props.lang === 'ja' ? '再試行' : props.lang === 'en' ? 'Retry' : '重试'),
  fullscreen: props.t.gameFullscreen || (props.lang === 'ja' ? 'フルスクリーン' : props.lang === 'en' ? 'Fullscreen' : '全屏'),
  standalone: props.t.gameStandalone || (props.lang === 'ja' ? '別ウィンドウで開く' : props.lang === 'en' ? 'Open separately' : '独立打开'),
  originalAuthor: props.t.gameOriginalAuthor || (props.lang === 'ja' ? '原作者' : props.lang === 'en' ? 'Original creator' : '原作者'),
  leaderboard: props.t.gameLeaderboard || (props.lang === 'ja' ? 'スコアランキング' : props.lang === 'en' ? 'Leaderboard' : '积分榜'),
  currentScore: props.t.gameCurrentScore || (props.lang === 'ja' ? '今回' : props.lang === 'en' ? 'Run' : '本局'),
  bestScore: props.t.gameBestScore || (props.lang === 'ja' ? 'ベスト' : props.lang === 'en' ? 'Best' : '最高'),
  empty: props.t.gameLeaderboardEmpty || (props.lang === 'ja' ? 'まだ記録がありません' : props.lang === 'en' ? 'No scores yet' : '还没有上榜记录'),
  leaderboardUnavailable: props.t.gameLeaderboardUnavailable || (props.lang === 'ja' ? 'ランキングを読み込めません' : props.lang === 'en' ? 'Unable to load the leaderboard' : '积分榜暂时无法加载'),
  loginToRank: props.t.gameLoginToRank || (props.lang === 'ja' ? 'ログインして記録を保存' : props.lang === 'en' ? 'Sign in to save your best score' : '登录后自动记录最高分'),
  previous: props.lang === 'ja' ? '前へ' : props.lang === 'en' ? 'Previous' : '上一页',
  next: props.lang === 'ja' ? '次へ' : props.lang === 'en' ? 'Next' : '下一页',
  rank: props.t.gameRank || (props.lang === 'ja' ? '順位' : props.lang === 'en' ? 'Rank' : '排名')
}));

function formatScore(value) {
  return new Intl.NumberFormat(props.lang === 'ja' ? 'ja-JP' : props.lang === 'en' ? 'en-US' : 'zh-CN')
    .format(Math.max(0, Number(value) || 0));
}

function playerInitial(player) {
  return nameInitial(player?.nickname || player?.username);
}

function applyLeaderboard(data) {
  leaderboard.value = Array.isArray(data?.entries) ? data.entries : [];
  bestScore.value = Math.max(bestScore.value, Number(data?.current?.score) || 0);
  currentRank.value = Number(data?.current?.rank) || 0;
}

async function refreshLeaderboard(page = leaderboardPage.value) {
  const targetPage = Number.isSafeInteger(page) ? Math.max(1, page) : leaderboardPage.value;
  const refreshId = ++leaderboardRefreshId;
  leaderboardController?.abort();
  const controller = new AbortController();
  leaderboardController = controller;
  leaderboardLoading.value = true;
  leaderboardError.value = false;
  try {
    const data = await loadKaguyaLeaderboard({ page: targetPage, limit: LEADERBOARD_PAGE_SIZE, signal: controller.signal });
    if (disposed || refreshId !== leaderboardRefreshId) return;
    applyLeaderboard(data);
    leaderboardPage.value = Number(data.page) || targetPage;
    leaderboardTotalPages.value = Math.max(1, Number(data.totalPages) || 1);
  } catch (error) {
    if (!disposed && refreshId === leaderboardRefreshId && error.name !== 'AbortError') leaderboardError.value = true;
  } finally {
    if (!disposed && refreshId === leaderboardRefreshId) leaderboardLoading.value = false;
  }
}

function scheduleScoreSave(delay = SCORE_SAVE_INTERVAL_MS) {
  if (!currentUserId.value || scoreSaveTimer || scoreSaving || pendingScore <= lastSubmittedScore) return;
  scoreSaveTimer = window.setTimeout(() => {
    scoreSaveTimer = 0;
    flushScore();
  }, delay);
}

async function flushScore() {
  if (!currentUserId.value || scoreSaving || pendingScore <= lastSubmittedScore) return;
  const score = pendingScore;
  const generation = accountGeneration;
  scoreSaving = true;
  lastScoreSaveAt = Date.now();
  try {
    const result = await submitKaguyaScore(score);
    if (disposed || generation !== accountGeneration) return;
    if (result?.current) {
      bestScore.value = Math.max(bestScore.value, Number(result.current.score) || 0);
      currentRank.value = Number(result.current.rank) || 0;
    }
    lastSubmittedScore = Math.max(lastSubmittedScore, score);
    // Score acknowledgements update the summary without downloading the entire board.
  } catch (_) {
    // Keep the best pending score; retry at the normal bounded save interval.
  } finally {
    scoreSaving = false;
    if (!disposed && pendingScore > lastSubmittedScore) scheduleScoreSave();
  }
}

function handleGameScore(event) {
  if (event.source !== frame.value?.contentWindow || event.data?.type !== 'tsukuyomi:kaguya-score') return;
  const score = Number(event.data.score);
  if (!Number.isSafeInteger(score) || score < 0) return;
  currentScore.value = score;
  bestScore.value = Math.max(bestScore.value, score);
  pendingScore = Math.max(pendingScore, score);
  if (!currentUserId.value) return;
  const reachedTaskThreshold = lastSubmittedScore < 100 && score >= 100;
  const scoreStepReached = score - lastSubmittedScore >= SCORE_SAVE_STEP;
  const saveDelay = Math.max(0, lastScoreSaveAt + SCORE_SAVE_INTERVAL_MS - Date.now());
  if ((reachedTaskThreshold || scoreStepReached) && saveDelay === 0) {
    window.clearTimeout(scoreSaveTimer);
    scoreSaveTimer = 0;
    flushScore();
    return;
  }
  scheduleScoreSave(saveDelay || SCORE_SAVE_INTERVAL_MS);
}

function beginLoadTimeout() {
  window.clearTimeout(loadTimer);
  loadTimer = window.setTimeout(() => {
    if (!loading.value) return;
    loading.value = false;
    loadError.value = true;
  }, LOAD_TIMEOUT_MS);
}

function handleLoad() {
  // HTML load is not engine readiness: the archive and audio may still be loading.
}

function handleGameStatus(event) {
  if (event.source !== frame.value?.contentWindow || event.data?.type !== 'tsukuyomi:kaguya-status') return;
  if (event.data.status === 'ready') {
    window.clearTimeout(loadTimer);
    loading.value = false;
    loadError.value = false;
  } else if (event.data.status === 'error') handleError();
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
  window.addEventListener('message', handleGameScore);
  window.addEventListener('message', handleGameStatus);
  beginLoadTimeout();
  refreshLeaderboard();
});

onBeforeUnmount(() => {
  // The authenticated request keeps its CSRF headers and can finish while navigating away.
  flushScore();
  disposed = true;
  accountGeneration += 1;
  leaderboardRefreshId += 1;
  leaderboardController?.abort();
  window.clearTimeout(loadTimer);
  window.clearTimeout(scoreSaveTimer);
  window.removeEventListener('message', handleGameScore);
  window.removeEventListener('message', handleGameStatus);
  if (resumeSiteMusic && !siteMusic?.playing?.value) siteMusic?.togglePlay?.();
});

watch(currentUserId, (nextUserId, previousUserId) => {
  if (nextUserId === previousUserId) return;
  accountGeneration += 1;
  window.clearTimeout(scoreSaveTimer);
  scoreSaveTimer = 0;
  pendingScore = 0;
  lastSubmittedScore = 0;
  lastScoreSaveAt = 0;
  bestScore.value = currentScore.value;
  currentRank.value = 0;
  refreshLeaderboard(1);
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
          <a
            class="game-author-link"
            :href="ORIGINAL_AUTHOR_URL"
            :title="copy.originalAuthor"
            :aria-label="copy.originalAuthor"
            target="_blank"
            rel="noopener noreferrer"
          >
            <TsIcon name="external" :size="16" />
            <span>{{ copy.originalAuthor }}</span>
          </a>
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

      <section class="game-leaderboard" :aria-busy="leaderboardLoading" :aria-label="copy.leaderboard">
        <header class="game-leaderboard-header">
          <div class="game-leaderboard-title">
            <TsIcon name="crown" :size="19" />
            <h2>{{ copy.leaderboard }}</h2>
          </div>
          <div class="game-score-summary" aria-live="polite">
            <span>{{ copy.currentScore }} <strong>{{ formatScore(currentScore) }}</strong></span>
            <span>{{ copy.bestScore }} <strong>{{ formatScore(bestScore) }}</strong></span>
            <span v-if="currentRank">#{{ currentRank }}</span>
            <button class="game-rank-refresh" type="button" :title="copy.retry" :aria-label="copy.retry" :disabled="leaderboardLoading" @click="refreshLeaderboard()">
              <TsIcon name="refresh" :size="16" />
            </button>
          </div>
        </header>

        <div v-if="leaderboardLoading && !leaderboard.length" class="game-rank-loading" role="status" :aria-label="copy.loading">
          <span aria-hidden="true"></span>
        </div>
        <p v-else-if="leaderboardError && !leaderboard.length" class="game-rank-state" role="alert">{{ copy.leaderboardUnavailable }}</p>
        <p v-else-if="!leaderboard.length" class="game-rank-state">{{ copy.empty }}</p>
        <ol v-else class="game-rank-list" :aria-label="copy.leaderboard" tabindex="0">
          <li
            v-for="player in leaderboard"
            :key="player.userId"
            :class="{ 'is-current': player.userId === currentUserId }"
          >
            <span class="game-rank-position" :aria-label="`${copy.rank} ${player.rank}`">{{ player.rank }}</span>
            <span class="game-rank-avatar">
              <img v-if="player.avatar" :src="player.avatar" :alt="player.nickname || player.username" loading="lazy">
              <span v-else aria-hidden="true">{{ playerInitial(player) }}</span>
            </span>
            <span class="game-rank-name">{{ player.nickname || player.username }}</span>
            <strong class="game-rank-score">{{ formatScore(player.score) }}</strong>
          </li>
        </ol>
        <div v-if="leaderboard.length" class="game-rank-pagination">
          <button type="button" :disabled="leaderboardLoading || leaderboardPage <= 1" @click="refreshLeaderboard(leaderboardPage - 1)">{{ copy.previous }}</button>
          <span>{{ leaderboardPage }} / {{ leaderboardTotalPages }}</span>
          <button type="button" :disabled="leaderboardLoading || leaderboardPage >= leaderboardTotalPages" @click="refreshLeaderboard(leaderboardPage + 1)">{{ copy.next }}</button>
        </div>
        <p v-if="leaderboardError && leaderboard.length" class="game-rank-state" role="alert">{{ copy.leaderboardUnavailable }}</p>
        <a
          v-if="!currentUserId"
          class="game-rank-login"
          href="/login?redirect=%2Fgame"
          @click.prevent="emit('go', '/login?redirect=%2Fgame')"
        >{{ copy.loginToRank }}</a>
      </section>
    </section>
  </main>
</template>
