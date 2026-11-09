<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import paperLantern from '../assets/drift/lantern/paper-lantern.webp';
import moonCloseup from '../assets/drift/lantern/moon-closeup.webp';
import { lockPageScroll } from '../utils/pageScrollLock';
import { FILM, lakeCamera, lakeIgnition, lakeLightPoint, lakeWaterPoint } from '../services/driftLanternMotion';
import { paintLakeLight } from '../services/driftLanternLight';

const props = defineProps({
  shot: { type: Object, required: true }
});
const emit = defineEmits(['cover', 'finish']);
const layer = ref(null);
const world = ref(null);
const backdrop = ref(null);
const moonDisk = ref(null);
const lunarDetail = ref(null);
const canvas = ref(null);
const lamp = ref(null);
const reflection = ref(null);
const veil = ref(null);
const skip = ref(null);
const replyVisible = ref(false);
const { geometry: g, src, copy } = props.shot;
const { draw, moon, image, viewport } = g;
const lunarBox = moon.radius * 2 + 1;
const worldStyle = {
  width: `${draw.width}px`, height: `${draw.height}px`,
  left: `${draw.x}px`, top: `${draw.y}px`
};
const moonStyle = {
  width: `${lunarBox}px`, height: `${lunarBox}px`,
  backgroundImage: `url("${src}")`,
  backgroundSize: `${draw.width}px ${draw.height}px`,
  backgroundPosition: `${draw.x - moon.x + lunarBox / 2}px ${draw.y - moon.y + lunarBox / 2}px`
};
const lampStyle = { width: `${g.lanternWidth}px` };
const captionBottom = Math.max(0, viewport.height - image.bottom) + image.height * .067;

let frame, context, unlock, root, reduced;
let cleared = false;
let wasInert = false;
let covered = false;
let done = false;
let startedAt;
let coveredAt;
let previousStage = '';
const cap = n => Math.max(0, Math.min(1, n));
const lerp = (a, b, t) => a + (b - a) * t;

function stage(value) {
  if (previousStage === value) return;
  previousStage = value;
  layer.value.dataset.act = value;
}

function switchView() {
  if (covered) return;
  covered = true;
  emit('cover');
}

function finish() {
  if (done) return;
  done = true;
  switchView();
  emit('finish');
}

function drawFrame(time) {
  if (time >= FILM.cover) {
    // Commit the next DOM while the cover is solid. It gets a paint before the
    // color starts to dissolve, so the underlying layout never visibly jumps.
    stage('reveal');
    veil.value.style.setProperty('--film-glare-edge', '165%');
    veil.value.style.opacity = lakeCamera(time, g).veil;
    switchView();
    return;
  }

  stage(time < FILM.ignite ? 'ignite' : time < FILM.shore ? 'drift' : time < FILM.zoom ? 'ascend' : 'zoom');
  const caption = time >= 1320 && time < 3040;
  if (replyVisible.value !== caption) replyVisible.value = caption;

  const p = lakeWaterPoint(time, g);
  const light = lakeLightPoint(time, g);
  const fade = 1 - cap((time - FILM.shore) / 210);
  const ignition = lakeIgnition(time);
  const pulse = Math.sin(cap((time - 3790) / 510) * Math.PI);
  const camera = lakeCamera(time, g);

  if (time < 4250) {
    lamp.value.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-100%) rotate(${p.rotation}deg) scale(${p.size})`;
    lamp.value.style.opacity = fade;
    lamp.value.style.filter = `brightness(${.91 + ignition * .73}) drop-shadow(0 0 ${19 + 14 * ignition}px #f6aa6c7a)`;
    reflection.value.style.transform = `translate3d(${p.x}px,${p.y}px,0) translateX(-50%) scale(${p.size * .94},${p.size * -.6}) translateY(-100%)`;
    reflection.value.style.opacity = fade * (.57 + ignition * .24);
    if (context) paintLakeLight(context, g, time, p, light, fade, pulse);
  } else if (!cleared && context) {
    context.clearRect(0, 0, viewport.width, viewport.height);
    cleared = true;
  }

  if (time >= 3790) {
    const lunarScale = camera.scale * (1 + pulse * .08);
    moonDisk.value.style.transform = `translate3d(${camera.x}px,${camera.y}px,0) translate(-50%,-50%) scale(${lunarScale})`;
    const amount = cap((time - 4290) / 250);
    const detail = lunarDetail.value.naturalWidth ? amount * amount * (3 - 2 * amount) : 0;
    moonDisk.value.style.opacity = Math.max(pulse * .91, camera.reveal * .99) * (1 - detail * .85);
    if (detail > 0) {
      // The image is rendered at native size and scaled down for most of the
      // push. Scaling up a 150px compositor layer would blur the new texture.
      const diameterScale = lunarBox * lunarScale / 1192;
      lunarDetail.value.style.transform = `translate3d(${camera.x}px,${camera.y}px,0) translate(-50%,-50%) scale(${diameterScale})`;
      lunarDetail.value.style.opacity = detail;
    }
  }

  if (time >= FILM.zoom) {
    backdrop.value.style.opacity = camera.reveal;
    const slide = cap((time - FILM.zoom) / 360);
    backdrop.value.style.clipPath = `inset(${lerp(Math.max(0, image.top), 0, slide)}px 0 ${lerp(Math.max(0, viewport.height - image.bottom), 0, slide)}px)`;
    backdrop.value.style.filter = `blur(${camera.blur}px)`;
    const x = camera.x - draw.x - (moon.x - draw.x) * camera.scale;
    const y = camera.y - draw.y - (moon.y - draw.y) * camera.scale;
    world.value.style.transform = `translate3d(${x}px,${y}px,0) scale(${camera.scale})`;
    veil.value.style.setProperty('--film-glare-edge', `${40 + 125 * camera.veil}%`);
    veil.value.style.opacity = camera.veil;
  }
}

function tick(now) {
  if (done) return;
  if (startedAt === undefined) startedAt = now;
  const elapsed = now - startedAt;
  if (elapsed >= FILM.cover && coveredAt === undefined) coveredAt = elapsed;
  const time = coveredAt === undefined ? elapsed : FILM.cover + (elapsed - coveredAt);
  if (time >= FILM.end) return finish();
  drawFrame(time);
  frame = requestAnimationFrame(tick);
}

function viewportChanged() {
  if (Math.abs(window.innerWidth - viewport.width) > 36 || Math.abs(window.innerHeight - viewport.height) > 125) finish();
}

onMounted(() => {
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return finish();
  reduced.addEventListener('change', finish, { once: true });
  unlock = lockPageScroll(() => false);
  root = document.getElementById('app');
  if (root) {
    wasInert = root.inert;
    root.inert = true;
  }
  const reducedPerformance = document.documentElement.dataset.performance === 'reduced';
  const dpr = Math.min(devicePixelRatio || 1, reducedPerformance ? 1 : g.portrait ? 1.25 : 1.5);
  canvas.value.width = Math.round(viewport.width * dpr);
  canvas.value.height = Math.round(viewport.height * dpr);
  context = canvas.value.getContext('2d');
  context?.scale(dpr, dpr);
  drawFrame(0);
  skip.value?.focus({ preventScroll: true });
  window.addEventListener('resize', viewportChanged);
  frame = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  reduced?.removeEventListener('change', finish);
  window.removeEventListener('resize', viewportChanged);
  if (root) root.inert = wasInert;
  unlock?.();
});
</script>

<template>
  <Teleport to="body">
    <div ref="layer" class="drift-film" :style="{ '--film-caption-bottom': `${captionBottom}px` }" role="dialog" aria-modal="true" :aria-label="copy.film" @keydown.esc.prevent.stop="finish" @keydown.tab.prevent>
      <!-- Film layers have their own fades; the site-wide image reveal would expose them at load. -->
      <div ref="backdrop" class="drift-film-backdrop" aria-hidden="true">
        <img ref="world" :src="src" :style="worldStyle" alt="" class="drift-film-world" data-image-bloom="off">
      </div>
      <div ref="moonDisk" class="drift-film-moon" :style="moonStyle" aria-hidden="true"></div>
      <img ref="lunarDetail" class="drift-film-moon-detail" :src="moonCloseup" width="1254" height="1254" alt="" aria-hidden="true" data-image-bloom="off">
      <canvas ref="canvas" class="drift-film-light" aria-hidden="true"></canvas>
      <img ref="reflection" :src="paperLantern" :style="lampStyle" alt="" class="drift-film-reflection" data-image-bloom="off">
      <img ref="lamp" :src="paperLantern" :style="lampStyle" alt="" class="drift-film-lamp" data-image-bloom="off">
      <div ref="veil" class="drift-film-veil" aria-hidden="true"></div>
      <div role="status" aria-live="polite" class="drift-film-status">
        <Transition name="drift-film-caption">
          <p v-if="replyVisible" class="drift-film-reply"><span>{{ copy.speaker }}</span>{{ copy.reply }}</p>
        </Transition>
      </div>
      <button ref="skip" class="drift-film-skip" type="button" @click="finish">{{ copy.skip }}</button>
    </div>
  </Teleport>
</template>
