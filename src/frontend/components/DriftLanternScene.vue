<script setup>
import { onMounted, ref } from 'vue';
import { measureLakeFilm } from '../services/driftLanternMotion';
import lakeWide from '../assets/drift/lantern/lake-wide.webp';
import lakePortrait from '../assets/drift/lantern/lake-portrait.webp';
import paperLantern from '../assets/drift/lantern/paper-lantern.webp';
import moonCloseup from '../assets/drift/lantern/moon-closeup.webp';

defineProps({ playing: Boolean });
const painting = ref(null);
const anchor = ref(null);

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const image = new Image();
  image.fetchPriority = 'low';
  image.src = moonCloseup;
  image.decode().catch(() => {});
});

function measure() {
  const img = painting.value;
  if (!img?.naturalWidth || !anchor.value) return null;
  const { left, right, top, bottom, width, height } = img.getBoundingClientRect();
  return {
    geometry: measureLakeFilm(
      { left, right, top, bottom, width, height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight },
      anchor.value.getBoundingClientRect(), getComputedStyle(img).objectPosition,
      { width: window.innerWidth, height: window.innerHeight }
    ),
    src: img.currentSrc
  };
}
defineExpose({ measure });
</script>

<template>
  <div class="drift-lake-scene" :data-playing="playing ? 'true' : undefined" aria-hidden="true">
    <picture class="drift-lake-picture">
      <source media="(max-width: 720px), (max-width: 950px) and (max-aspect-ratio: 1/1)" :srcset="lakePortrait">
      <img ref="painting" :src="lakeWide" alt="" width="1600" height="770" decoding="async" fetchpriority="high">
    </picture>
    <div ref="anchor" class="drift-lantern-anchor">
      <div class="drift-lantern-ripples"></div>
      <div class="drift-lantern-float">
        <img :src="paperLantern" alt="" width="326" height="352" class="drift-lantern-reflection">
        <img :src="paperLantern" alt="" width="326" height="352" class="drift-lantern-art">
      </div>
    </div>
  </div>
</template>
