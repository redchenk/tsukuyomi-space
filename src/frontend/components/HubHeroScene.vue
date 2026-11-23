<script setup>
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useId } from 'vue';

// Shorelines and foreground silhouettes, in the original illustration's coordinates.
const contours = {
  spring: {
    shore: '0,58 10,54 18,58 29,50 37,54 49,49 63,54 78,42 89,51 100,43',
    near: '0,91 10,84 19,90 27,80 31,69 36,61 41,52 45,43 47,40 49,41 51,43 53,44 55,46 57,48 58,38 57,30 55,24 53,17 52.4,9 52.4,0 100,0'
  },
  summer: {
    shore: '0,42 8,36 10,31 13,37 20,40 26,37 36,40 42,38 50,33 56,27 68,28 90,38 100,32',
    near: '0,52 4,62 8,68 10,66 10,63 12,63 12,70 20,68 28,65 31,64 31,61 34,61 35,65 39,60 43,56 48,53 52,48 55,42 57,34 55,36 54,35 57,29 58,23 56,20 56,16 58,13 60,13 60,9 62,4 64,0 100,0'
  },
  autumn: {
    shore: '0,39 9,40 15,43 21,40 27,41 34,38 39,40 46,32 53,31 60,24 77,29 100,25',
    near: '0,88 10,83 20,79 30,74 34,73 34,71 38,70 39,73 42,70 45,68 46,65 50,62 54,60 57,55 60,50 62,44 63,39 61,35 59,30 57,23 56.6,16 56.7,10 57.8,3 58.3,0 100,0'
  },
  winter: {
    shore: '0,42 9,35 16,41 21,37 29,35 36,31 42,28 51,24 63,25 82,37 100,31',
    near: '0,68 4,66 6,64 9,66 10,72 15,75 17,71 20,69 24,70 25,74 31,77 34,72 37,68 40,62 44,57 47,51 48,47 45,43 42,40 41,38 44,39 47,40 50,43 54,39 57,33 59,27 57,22 56,17 55,10 55,0 100,0'
  },
};
defineProps({ art: String, alt: String, season: String });
const maskId = useId();
const track = ref(null);
const panel = ref(null);
let motion, visibility, sizes, frame = 0, pinTop = 0, distance = 0, lastProgress;

function paint() {
  frame = 0;
  const progress = distance > 0
    ? Math.max(0, Math.min(1, (pinTop - track.value.getBoundingClientRect().top) / distance))
    : 0;
  if (progress !== lastProgress) {
    panel.value.style.setProperty('--scene-progress', progress.toFixed(5));
    lastProgress = progress;
  }
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(paint);
}
function measure() {
  const height = panel.value.offsetHeight;
  // A tall panel (zoom or landscape phone) scrolls into view before it pins.
  pinTop = Math.min(0, window.innerHeight - height);
  distance = track.value.offsetHeight - height;
  panel.value.style.setProperty('--scene-pin-top', pinTop + 'px');
  schedule();
}
function stopTracking() {
  visibility?.disconnect();
  sizes?.disconnect();
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', measure);
  window.removeEventListener('pageshow', measure);
  cancelAnimationFrame(frame);
  frame = 0;
  lastProgress = undefined;
  panel.value?.style.removeProperty('--scene-progress');
  panel.value?.style.removeProperty('--scene-pin-top');
}
function syncMotion() {
  stopTracking();
  if (motion.matches) return;
  measure();
  sizes = new ResizeObserver(measure);
  sizes.observe(track.value);
  sizes.observe(panel.value);
  window.addEventListener('resize', measure);
  window.addEventListener('pageshow', measure);
  visibility = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) window.addEventListener('scroll', schedule, { passive: true });
    else window.removeEventListener('scroll', schedule);
    schedule();
  });
  visibility.observe(track.value);
}
function connect() {
  if (motion) return;
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', syncMotion);
  syncMotion();
}
function disconnect() {
  motion?.removeEventListener('change', syncMotion);
  motion = undefined;
  stopTracking();
}
onMounted(connect);
onActivated(connect);
onDeactivated(disconnect);
onBeforeUnmount(disconnect);
</script>

<template>
  <div ref="track" class="hub-scene-track">
    <section ref="panel" class="home-hero" :data-art-season="season" aria-labelledby="home-title">
      <div class="hub-scene-window">
        <div class="hub-scene-artboard">
          <img class="hub-scene-layer scene-sky" :src="art" :alt="alt" width="1672" height="941" fetchpriority="high">
          <svg v-for="plane in ['shore', 'near']" :key="plane" class="hub-scene-layer"
            :class="'scene-' + plane" aria-hidden="true" focusable="false" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <filter :id="maskId + '-feather-' + plane" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur :stdDeviation="plane === 'near' ? 1.9 : 1.2" />
              </filter>
              <mask :id="maskId + '-' + plane" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                <polygon :points="contours[season][plane] + ' 110,0 110,110 -10,110 -10,100'"
                  fill="white" stroke="white" stroke-width="7" stroke-linejoin="round" :filter="`url(#${maskId}-feather-${plane})`" />
              </mask>
            </defs>
            <image :href="art" width="100" height="100" preserveAspectRatio="none" :mask="`url(#${maskId}-${plane})`" />
          </svg>
        </div>
      </div>
      <div class="hero-shade" aria-hidden="true"></div>
      <slot />
    </section>
  </div>
</template>

<style scoped>
.hub-scene-track { --travel: clamp(40px, 7svh, 72px); }
.hub-scene-window {
  position: absolute;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  pointer-events: none;
  container-type: size;
}
.hub-scene-artboard {
  --art-x: 50%;
  --art-y: 44%;
  position: absolute;
  left: var(--art-x);
  top: var(--art-y);
  translate: calc(0% - var(--art-x)) calc(0% - var(--art-y));
  width: max(100cqw, calc(100cqh * 1672 / 941));
  aspect-ratio: 1672 / 941;
}
.hub-scene-layer { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.scene-shore, .scene-near { display: none; }

@media (prefers-reduced-motion: no-preference) {
  .hub-scene-track::after { content: ""; display: block; height: clamp(180px, 52svh, 490px); }
  .hub-scene-track .home-hero { position: sticky; top: var(--scene-pin-top, 0px); min-height: 100svh; }
  .hub-scene-window { bottom: calc(0px - var(--travel)); }
  .hub-scene-layer { transform: translateY(calc(-1 * var(--scene-progress, 0) * var(--travel) * var(--depth))); }
  .scene-sky { --depth: .08; }
  .scene-shore, .scene-near { display: block; }
  .scene-shore { --depth: .38; }
  .scene-near { --depth: 1; }
}
@media (max-width: 860px) { .hub-scene-artboard { --art-x: 60%; --art-y: 50%; } }
@media (max-width: 600px) {
  .hub-scene-artboard { --art-x: 67%; --art-y: 0%; }
  [data-art-season="autumn"] .hub-scene-artboard { --art-x: 77%; }
}
</style>
