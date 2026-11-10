<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import poster from '../assets/access/water-mirror/water-mirror-poster.webp';
import standby from '../assets/access/water-mirror/water-mirror-standby.mp4';
import entrance from '../assets/access/water-mirror/water-mirror-enter.mp4';

const props = defineProps({ allowMotion: Boolean, allowIntro: Boolean, moving: Boolean });
defineEmits(['ready']);
const idle = ref(null);
const painted = ref(false);
const preload = ref('metadata');
let mounted = false;
let primeTimer;
let firstVideoFrame;
let firstPaint;

function cancelIdleFrame() {
  if (firstVideoFrame !== undefined) idle.value?.cancelVideoFrameCallback?.(firstVideoFrame);
  if (firstPaint !== undefined) cancelAnimationFrame(firstPaint);
  firstVideoFrame = firstPaint = undefined;
}

function onPlaying() {
  const video = idle.value;
  if (!video || painted.value || firstVideoFrame !== undefined || firstPaint !== undefined) return;
  const mark = () => {
    firstVideoFrame = firstPaint = undefined;
    if (mounted && idle.value === video && !video.error) painted.value = true;
  };
  if (typeof video.requestVideoFrameCallback === 'function') firstVideoFrame = video.requestVideoFrameCallback(mark);
  else firstPaint = requestAnimationFrame(() => { firstPaint = requestAnimationFrame(mark); });
}

function syncIdle() {
  const video = idle.value;
  if (!mounted || !video) return;
  if (!props.moving || document.hidden || video.error) video.pause();
  else video.play()?.catch(() => {});
}

function warm() {
  if (!document.hidden && props.allowIntro) preload.value = 'auto';
}

function scheduleWarm() {
  clearTimeout(primeTimer);
  if (props.allowIntro && preload.value !== 'auto') primeTimer = setTimeout(warm, 500);
}

function onError() {
  cancelIdleFrame();
  painted.value = false;
}

watch(() => [props.moving, props.allowMotion], syncIdle, { flush: 'post' });
watch(() => props.allowMotion, allowed => { if (!allowed) onError(); });
watch(() => props.allowIntro, scheduleWarm);
onMounted(() => {
  mounted = true;
  document.addEventListener('visibilitychange', syncIdle);
  window.addEventListener('pageshow', syncIdle);
  syncIdle();
  scheduleWarm();
});
onBeforeUnmount(() => {
  mounted = false;
  clearTimeout(primeTimer);
  document.removeEventListener('visibilitychange', syncIdle);
  window.removeEventListener('pageshow', syncIdle);
  cancelIdleFrame();
  idle.value?.pause();
});
defineExpose({ warm });
</script>

<template>
  <div class="water-mirror-scene" aria-hidden="true">
    <div class="access-film-frame">
      <img class="access-film-poster" :src="poster" alt="" width="1600" height="900" fetchpriority="high"
        decoding="async" data-image-bloom="off" @load="$emit('ready')" @error="$emit('ready')">
      <video v-if="allowMotion" ref="idle" class="access-film-idle" :class="{ 'is-painted': painted }"
        :src="standby" muted loop playsinline preload="metadata" disablepictureinpicture
        disableremoteplayback tabindex="-1" @playing="onPlaying" @error="onError"></video>
      <video v-if="allowIntro" class="access-film-intro" :src="entrance" :preload="preload"
        muted playsinline disablepictureinpicture disableremoteplayback tabindex="-1"></video>
    </div>
    <div class="access-film-shade"></div>
    <div class="access-film-mist"></div>
  </div>
</template>
