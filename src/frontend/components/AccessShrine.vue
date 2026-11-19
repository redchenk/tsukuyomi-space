<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { nightfallDuration } from '../services/shrine/camera.js';

const props = defineProps({ holding: Boolean, paused: Boolean, portrait: Boolean });
const emit = defineEmits(['available', 'hold-painted']);
const canvas = ref(null);
const shot = ref('preparing');
const lifetime = new AbortController();
let scene, frame = 0, last = null, held = 0, travel = 0, ambient = 0;
let quality = 1, slowFrames = 0, resolveEntry, observer;

function stopClock() {
  cancelAnimationFrame(frame);
  frame = 0;
  last = null;
}
function settle(completed) {
  resolveEntry?.(completed);
  resolveEntry = null;
}
function loseScene() {
  stopClock();
  shot.value = 'unavailable';
  settle(false);
  lifetime.abort();
  scene = null;
  emit('available', false);
}
function paint() {
  try { scene.draw(held, travel, ambient, quality); }
  catch (_) { loseScene(); }
}
function tick(now) {
  frame = 0;
  if (document.hidden || !scene) return;
  const dt = last === null ? 0 : Math.max(0, now - last) / 1000;
  // Render the gentle idle at 30 fps. Let the outgoing dolly use the display clock.
  if (shot.value === 'hold' && last !== null && dt < .031) {
    frame = requestAnimationFrame(tick);
    return;
  }
  last = now;
  slowFrames = dt > .058 ? slowFrames + 1 : 0;
  if (slowFrames >= 6 && quality > .65) {
    quality = Math.max(.65, quality * .84);
    slowFrames = 0;
  }
  ambient += dt;
  if (shot.value === 'hold') held += dt;
  if (shot.value === 'entering') travel = Math.min(nightfallDuration, travel + dt);
  paint();
  if (!scene) return;
  if (shot.value === 'entering' && travel >= nightfallDuration) {
    shot.value = 'arrived';
    settle(true);
  }
  frame = requestAnimationFrame(tick);
}
function sync() {
  if (!scene) return;
  if (shot.value === 'ready' && props.holding && !document.hidden) {
    // Present the dusk pose at the current viewport size before releasing the film.
    paint();
    if (!scene) return;
    shot.value = 'hold';
    emit('hold-painted');
  }
  if (document.hidden || shot.value === 'ready' || (shot.value === 'hold' && props.paused)) {
    stopClock();
    if (document.hidden && shot.value === 'entering') settle(false);
    return;
  }
  if (!frame) frame = requestAnimationFrame(tick);
}

function enter(signal) {
  if (!scene || signal.aborted || document.hidden) return null;
  const finished = new Promise(resolve => { resolveEntry = resolve; });
  // Keep the last presented pose and clock. The following frame continues the
  // glance at its current velocity while the dolly accelerates away.
  shot.value = 'entering';
  travel = 0;
  last = performance.now();
  signal.addEventListener('abort', () => {
    settle(false);
    if (!scene) return;
    stopClock();
    travel = 0;
    ambient = held;
    shot.value = props.holding ? 'hold' : 'ready';
    paint();
    sync();
  }, { once: true });
  sync();
  return finished;
}
defineExpose({ enter });

watch(() => [props.holding, props.paused], sync, { flush: 'post' });
onMounted(async () => {
  const surface = canvas.value;
  surface.addEventListener('webglcontextlost', loseScene, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', sync, { signal: lifetime.signal });
  try {
    const { createShrineRenderer } = await import('../services/shrine/renderer.js');
    if (lifetime.signal.aborted) return;
    scene = await createShrineRenderer(surface, props.portrait, lifetime.signal);
    if (lifetime.signal.aborted) return;
    shot.value = 'ready';
    emit('available', true);
    observer = new ResizeObserver(() => { if (scene && !frame && !document.hidden) paint(); });
    observer.observe(surface);
    sync();
  } catch (_) {
    if (!lifetime.signal.aborted) loseScene();
  }
});
onBeforeUnmount(() => {
  stopClock();
  observer?.disconnect();
  settle(false);
  lifetime.abort();
  scene = null;
});
</script>

<template>
  <canvas ref="canvas" class="access-shrine" :data-shot="shot" aria-hidden="true"></canvas>
</template>
