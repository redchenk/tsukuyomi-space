<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { hexToHsv, hsvToHex } from '../utils/pixelColor.mjs';

const props = defineProps({ modelValue: { type: String, required: true }, label: { type: String, required: true } });
const emit = defineEmits(['update:modelValue']);
const hsv = reactive(hexToHsv(props.modelValue));
const hexText = ref(props.modelValue.slice(1));
const plane = ref(null);
let pointerId = null;
const hueColor = computed(() => hsvToHex(hsv.h, 1, 1));
watch(() => props.modelValue, color => {
  const next = hexToHsv(color);
  // A gray or black selection has no hue; keep the last hue usable.
  if (next.s && next.v) hsv.h = next.h;
  hsv.s = next.s; hsv.v = next.v;
  hexText.value = color.slice(1).toUpperCase();
});
function update() { emit('update:modelValue', hsvToHex(hsv.h, hsv.s, hsv.v)); }
function commitHex() {
  const normalized = hexText.value.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(normalized)) emit('update:modelValue', '#' + normalized.toLowerCase());
  else hexText.value = props.modelValue.slice(1).toUpperCase();
}
function pick(event) {
  const rect = plane.value.getBoundingClientRect();
  hsv.s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  hsv.v = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  update();
}
function start(event) {
  if (event.button !== 0) return;
  pointerId = event.pointerId; plane.value.setPointerCapture(pointerId); pick(event);
}
function end(event) {
  if (event.pointerId !== pointerId) return;
  if (plane.value.hasPointerCapture(pointerId)) plane.value.releasePointerCapture(pointerId);
  pointerId = null;
}
function key(event) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? .1 : .01;
  if (event.key === 'ArrowLeft') hsv.s = Math.max(0, hsv.s - step);
  if (event.key === 'ArrowRight') hsv.s = Math.min(1, hsv.s + step);
  if (event.key === 'ArrowUp') hsv.v = Math.min(1, hsv.v + step);
  if (event.key === 'ArrowDown') hsv.v = Math.max(0, hsv.v - step);
  update();
}
</script>

<template>
  <div class="pw-color-picker">
    <div class="pw-color-row">
      <label class="pw-native-color" :style="{ backgroundColor: modelValue }">
        <input type="color" :value="modelValue" :aria-label="label" @input="emit('update:modelValue', $event.target.value)">
      </label>
      <label class="pw-hex-field"><span>#</span><input v-model="hexText" maxlength="7" autocomplete="off" spellcheck="false" :aria-label="`${label} HEX`" @change="commitHex" @keydown.enter="commitHex"><small>HEX</small></label>
    </div>
    <div ref="plane" class="pw-color-plane" :style="{ backgroundColor: hueColor }" tabindex="0" role="group" :aria-label="label" :aria-description="modelValue" @pointerdown.prevent="start" @pointermove="pointerId === $event.pointerId && pick($event)" @pointerup="end" @pointercancel="end" @keydown="key">
      <span class="pw-color-cursor" :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }"></span>
    </div>
    <div class="pw-hue-track">
      <span :style="{ left: `${hsv.h / 359 * 100}%` }" aria-hidden="true"></span>
      <input v-model.number="hsv.h" class="pw-hue" type="range" min="0" max="359" step="1" :aria-label="`${label} Hue`" @input="update">
    </div>
  </div>
</template>
