<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import BeianLink from '../components/BeianLink.vue';
import TsIcon from '../components/TsIcon.vue';
import AccessShrine from '../components/AccessShrine.vue';
import brandLogo from '../assets/sakura/sakura-moon-logo.webp';
import desktopVideo from '../assets/access/shrine/shrine-standby.mp4';
import mobileVideo from '../assets/access/shrine/shrine-standby-mobile.mp4';
import nightfallVideo from '../assets/access/shrine/shrine-nightfall.mp4';
import mobileNightfall from '../assets/access/shrine/shrine-nightfall-mobile.mp4';
import desktopPoster from '../assets/access/shrine/shrine-poster.webp';
import mobilePoster from '../assets/access/shrine/shrine-poster-mobile.webp';

const props = defineProps({
  t: { type: Object, required: true },
  entering: { type: Boolean, default: false },
  entryFailed: { type: Boolean, default: false }
});
const emit = defineEmits(['enter', 'warm']);
const videoEl = ref(null);
const nightfallEl = ref(null);
const shrine = ref(null);
const liveAvailable = ref(false);
const liveEntering = ref(false);
const nightfall = ref('');
// Keep the opening's playback position when the device rotates. Prepare the
// matching ending for the current orientation while the visitor is waiting.
const orientation = window.matchMedia('(orientation: portrait)');
const accessVideoSrc = orientation.matches ? mobileVideo : desktopVideo;
const endingPortrait = ref(orientation.matches);
const accessNightfallSrc = computed(() => endingPortrait.value ? mobileNightfall : nightfallVideo);

function syncEndingOrientation() {
  if (!nightfall.value && !finishNightfall) endingPortrait.value = orientation.matches;
}
const motionAllowed = ref(false);
const bootDismissed = ref(!document.getElementById('boot-splash'));
const userPaused = ref(false);
const standbyEnded = ref(false);
const holdPainted = ref(false);
const posterReady = ref(false);
const videoState = reactive({ ready: false, failed: false });
const isMotionPaused = computed(() => userPaused.value || !motionAllowed.value);
let splashTimer = 0;
let disposed = false;
let playVersion = 0;
let reducedMotionQuery;
let connection;
let finishNightfall;

function markVideoFailed() {
  videoState.ready = false;
  videoState.failed = true;
}

function tryPlayAccessVideo() {
  const video = videoEl.value;
  if (!video || !bootDismissed.value || standbyEnded.value || nightfall.value || isMotionPaused.value || videoState.failed || document.hidden || disposed) return;
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
    liveAvailable.value = false;
    finishNightfall?.();
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
  if (document.hidden) { finishNightfall?.(); playVersion++; videoEl.value?.pause(); }
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

// A warm scene inherits the displayed camera. While it is loading, the native
// film can start immediately inside the same pointer or keyboard activation.
function playNightfall(signal) {
  if (!motionAllowed.value || document.hidden) return;
  const live = shrine.value?.enter(signal);
  if (live) {
    liveEntering.value = true;
    nightfall.value = 'playing';
    playVersion++;
    videoEl.value?.pause();
    signal.addEventListener('abort', () => {
      liveEntering.value = false;
      nightfall.value = '';
      syncEndingOrientation();
      nextTick(tryPlayAccessVideo);
    }, { once: true });
    return live.then(completed => {
      if (!signal.aborted) nightfall.value = 'finished';
      return completed;
    });
  }
  const video = nightfallEl.value;
  if (!video || video.error) return;
  return new Promise(resolve => {
    let timer;
    function renewDeadline() {
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, 3000);
    }
    function show() {
      nightfall.value = 'playing';
      playVersion++;
      videoEl.value?.pause();
      renewDeadline();
    }
    function finish() {
      if (finishNightfall !== finish) return;
      finishNightfall = undefined;
      window.clearTimeout(timer);
      video.removeEventListener('playing', show);
      video.removeEventListener('timeupdate', renewDeadline);
      video.removeEventListener('ended', finish);
      video.removeEventListener('error', finish);
      video.pause();
      if (nightfall.value) nightfall.value = 'finished';
      resolve(video.ended);
    }
    // Keep the last frame through the Hub reveal. An aborted navigation or
    // restored history entry instead gives the controls and standby shot back.
    signal.addEventListener('abort', () => {
      finish();
      nightfall.value = '';
      syncEndingOrientation();
      if (!disposed) nextTick(tryPlayAccessVideo);
    }, { once: true });
    finishNightfall = finish;
    video.addEventListener('playing', show);
    video.addEventListener('timeupdate', renewDeadline);
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    renewDeadline();
    try {
      video.currentTime = 0;
      video.muted = true;
      video.play()?.catch(finish);
    } catch (_) { finish(); }
  });
}

function startAccess() {
  if (!props.entering && !disposed) emit('enter', playNightfall);
}

function entryReady() {
  window.clearTimeout(splashTimer);
  window.dispatchEvent(new Event('tsukuyomi:entry-ready'));
}

function beginOpening() {
  bootDismissed.value = true;
  tryPlayAccessVideo();
}

onMounted(() => {
  orientation.addEventListener?.('change', syncEndingOrientation);
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  connection = navigator.connection;
  reducedMotionQuery.addEventListener('change', syncMotionPreference);
  connection?.addEventListener?.('change', syncMotionPreference);
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pageshow', restoreEntry);
  window.addEventListener('tsukuyomi:boot-dismissed', beginOpening, { once: true });
  syncMotionPreference();
  // The poster may be slow or unavailable; optional media never blocks entry.
  splashTimer = window.setTimeout(entryReady, 1200);
});

onBeforeUnmount(() => {
  disposed = true;
  finishNightfall?.();
  playVersion++;
  window.clearTimeout(splashTimer);
  window.dispatchEvent(new Event('tsukuyomi:entry-ready'));
  orientation.removeEventListener?.('change', syncEndingOrientation);
  reducedMotionQuery?.removeEventListener('change', syncMotionPreference);
  connection?.removeEventListener?.('change', syncMotionPreference);
  document.removeEventListener('visibilitychange', syncVisibility);
  window.removeEventListener('pageshow', restoreEntry);
  window.removeEventListener('tsukuyomi:boot-dismissed', beginOpening);
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
    :class="{ 'video-ready': videoState.ready, 'video-failed': videoState.failed, 'uses-live-shrine': liveEntering }"
    :data-nightfall="nightfall || undefined" :aria-busy="entering">
    <div class="access-media" aria-hidden="true">
      <picture>
        <source media="(orientation: portrait)" :srcset="mobilePoster">
        <img class="access-poster" :src="desktopPoster" alt="" fetchpriority="high" decoding="async" data-image-bloom="off"
          @load="posterReady = true; entryReady()" @error="entryReady">
      </picture>
      <video v-if="motionAllowed && !(standbyEnded && (posterReady || holdPainted))" ref="videoEl" class="access-video" :src="accessVideoSrc"
        :autoplay="bootDismissed && !standbyEnded && !userPaused" muted playsinline webkit-playsinline disablepictureinpicture disableremoteplayback
        controlslist="nodownload noplaybackrate noremoteplayback" x-webkit-airplay="deny" tabindex="-1"
        preload="auto" aria-hidden="true" @loadeddata="!bootDismissed && !videoState.failed && markVideoReady()"
        @playing="markVideoReady" @canplay="tryPlayAccessVideo" @ended="standbyEnded = true"
        @error="markVideoFailed" @webkitbeginfullscreen="preventVideoFullscreen"></video>
      <AccessShrine v-if="motionAllowed && (videoState.ready || videoState.failed || standbyEnded)"
        ref="shrine" :holding="(standbyEnded || videoState.failed) && !nightfall"
        :paused="userPaused" @available="liveAvailable = $event" @hold-painted="holdPainted = true" />
      <video v-if="motionAllowed" ref="nightfallEl" class="access-nightfall" :src="accessNightfallSrc"
        preload="metadata" muted playsinline webkit-playsinline disablepictureinpicture disableremoteplayback
        tabindex="-1" @webkitbeginfullscreen="nightfallEl?.webkitExitFullscreen?.(); finishNightfall?.()"></video>
      <div class="access-overlay" aria-hidden="true"></div>
    </div>
    <div class="access-content" :inert="Boolean(nightfall)">
      <header class="access-brand">
        <img :src="brandLogo" alt="" width="64" height="64" decoding="async">
        <span>{{ t.brand }}</span>
      </header>
      <button v-if="motionAllowed && (liveAvailable || (!standbyEnded && !videoState.failed))" class="access-motion-control" type="button"
        :aria-label="userPaused ? t.accessPlay : t.accessPause" :title="userPaused ? t.accessPlay : t.accessPause"
        :aria-pressed="userPaused" @click="toggleMotion">
        <TsIcon :name="userPaused ? 'play' : 'pause'" :size="18" />
      </button>
      <section class="access-hero" aria-labelledby="access-title">
        <p class="access-kicker">TSUKUYOMI SPACE</p>
        <h1 id="access-title" class="access-title">{{ t.title }}</h1>
        <p class="access-subtitle">{{ t.subtitle }}</p>
        <button class="primary-btn access-enter" type="button" :disabled="entering"
          :aria-busy="entering" @pointerenter="emit('warm')" @focus="emit('warm')" @click="startAccess">
          <span v-if="entering" class="access-enter-spinner" aria-hidden="true"></span>
          <TsIcon v-else class="access-enter-moon" name="moon" :size="25" />
          <span>{{ entering ? t.accessOpening : entryFailed ? t.accessReload : t.accessEnter }}</span>
          <TsIcon name="arrowRight" :size="24" :stroke-width="1.65" />
        </button>
        <p v-if="entryFailed" class="access-entry-error" role="alert">{{ t.accessRetry }}</p>
      </section>
      <footer class="access-beian">
        <p class="access-copyright">{{ t.accessCopyright }}</p>
        <BeianLink />
      </footer>
    </div>
    <span class="access-entry-status" :class="{ 'is-waiting': nightfall === 'finished' }"
      role="status" aria-live="polite">{{ entering ? t.accessOpening : '' }}</span>
  </main>
</template>
