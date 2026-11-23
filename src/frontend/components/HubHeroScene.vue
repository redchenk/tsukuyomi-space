<script setup>
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';

defineProps({ art: String, alt: String, season: String });
const track = ref(null);
const panel = ref(null);
let motion, visibility, sizes, frame = 0, pinTop = 0, distance = 0, lastProgress;
let nativeTimeline = false, layers = [];

function paintFallback() {
  frame = 0;
  if (!track.value?.isConnected) return;
  const progress = distance > 0
    ? Math.max(0, Math.min(1, (pinTop - track.value.getBoundingClientRect().top) / distance))
    : 0;
  if (progress === lastProgress) return;
  lastProgress = progress;
  for (const layer of layers) layer.style.setProperty('--scene-progress', progress.toFixed(5));
}
function scheduleFallback() {
  if (!frame) frame = requestAnimationFrame(paintFallback);
}
function measure() {
  const height = panel.value.offsetHeight;
  const clearance = window.innerHeight - height;
  // The timeline covers exactly the sticky interval, including an oversized panel.
  pinTop = Math.min(0, clearance);
  track.value.style.setProperty('--scene-pin-top', pinTop + 'px');
  track.value.style.setProperty('--scene-pin-bottom', Math.max(0, clearance) + 'px');
  if (!nativeTimeline) {
    distance = track.value.offsetHeight - height;
    scheduleFallback();
  }
}
function stopTracking() {
  visibility?.disconnect();
  sizes?.disconnect();
  window.removeEventListener('scroll', scheduleFallback);
  window.removeEventListener('resize', measure);
  window.removeEventListener('pageshow', measure);
  cancelAnimationFrame(frame);
  frame = 0;
  lastProgress = undefined;
  for (const layer of layers) layer.style.removeProperty('--scene-progress');
  track.value?.style.removeProperty('--scene-pin-top');
  track.value?.style.removeProperty('--scene-pin-bottom');
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
  if (nativeTimeline) return;
  visibility = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) window.addEventListener('scroll', scheduleFallback, { passive: true });
    else window.removeEventListener('scroll', scheduleFallback);
    scheduleFallback();
  });
  visibility.observe(track.value);
}
function connect() {
  if (motion) return;
  nativeTimeline = CSS.supports('animation-timeline: --hub-scene') &&
    CSS.supports('animation-range: contain 0% contain 100%') && CSS.supports('view-timeline-inset: 0px 0px');
  track.value.toggleAttribute('data-scroll-timeline', nativeTimeline);
  layers = nativeTimeline ? [] : Array.from(panel.value.querySelectorAll('.hub-scene-layer'));
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
          <div v-for="plane in ['shore', 'near']" :key="plane" class="hub-scene-layer" :class="'scene-' + plane" aria-hidden="true">
            <img :src="art" alt="" width="1672" height="941">
          </div>
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
.hub-scene-layer > img { display: block; width: 100%; height: 100%; }
.scene-shore, .scene-near { display: none; }

@media (prefers-reduced-motion: no-preference) {
  .hub-scene-track::after { content: ""; display: block; height: clamp(180px, 52svh, 490px); }
  .hub-scene-track .home-hero { position: sticky; top: var(--scene-pin-top, 0px); min-height: 100svh; }
  .hub-scene-window { bottom: calc(0px - var(--travel)); }
  .hub-scene-layer { transform: translate3d(0, calc(-1 * var(--scene-progress, 0) * var(--travel) * var(--depth)), 0); }
  [data-scroll-timeline] {
    view-timeline: --hub-scene block;
    view-timeline-inset: var(--scene-pin-top, 0px) var(--scene-pin-bottom, 0px);
  }
  [data-scroll-timeline] .hub-scene-layer {
    animation: hub-plane-travel linear both;
    animation-timeline: --hub-scene;
    animation-range: contain 0% contain 100%;
  }
  @keyframes hub-plane-travel {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(0, calc(-1 * var(--travel) * var(--depth)), 0); }
  }
  .scene-sky { --depth: .08; }
  .scene-shore, .scene-near { display: block; }
  .scene-shore { --depth: .38; --plane-mask: var(--shore-mask); }
  .scene-near { --depth: 1; --plane-mask: var(--near-mask); }
  .hub-scene-layer > img {
    -webkit-mask: var(--plane-mask) center / 100% 100% no-repeat;
    mask: var(--plane-mask) center / 100% 100% no-repeat;
  }
  [data-art-season="spring"] {
    --shore-mask: url("../assets/hub-depth/spring-shore.png");
    --near-mask: url("../assets/hub-depth/spring-near.png");
  }
  [data-art-season="summer"] {
    --shore-mask: url("../assets/hub-depth/summer-shore.png");
    --near-mask: url("../assets/hub-depth/summer-near.png");
  }
  [data-art-season="autumn"] {
    --shore-mask: url("../assets/hub-depth/autumn-shore.png");
    --near-mask: url("../assets/hub-depth/autumn-near.png");
  }
  [data-art-season="winter"] {
    --shore-mask: url("../assets/hub-depth/winter-shore.png");
    --near-mask: url("../assets/hub-depth/winter-near.png");
  }
}
@media (max-width: 860px) { .hub-scene-artboard { --art-x: 60%; --art-y: 50%; } }
@media (max-width: 600px) {
  .hub-scene-artboard { --art-x: 67%; --art-y: 0%; }
  [data-art-season="autumn"] .hub-scene-artboard { --art-x: 77%; }
}
</style>
