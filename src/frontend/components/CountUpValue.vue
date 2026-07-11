<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';

// Animates numeric strings (e.g. "1,234") from the previous value to the new
// one; anything non-numeric ("--", "3天4时") renders as-is.
const props = defineProps({
  value: { type: [String, Number], default: '' },
  duration: { type: Number, default: 900 }
});

const display = ref(String(props.value ?? ''));
let frame = 0;
let currentNumber = null;

function parseNumeric(value) {
  const raw = String(value ?? '').trim();
  if (!/^[\d,]+$/.test(raw)) return null;
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function reduceMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateTo(target) {
  const from = currentNumber ?? 0;
  cancelAnimationFrame(frame);

  if (reduceMotion() || from === target) {
    currentNumber = target;
    display.value = target.toLocaleString('zh-CN');
    return;
  }

  const start = performance.now();
  const total = Math.max(160, props.duration);

  const tick = (now) => {
    const progress = Math.min(1, (now - start) / total);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(from + (target - from) * eased);
    display.value = value.toLocaleString('zh-CN');
    if (progress < 1) {
      frame = requestAnimationFrame(tick);
    } else {
      currentNumber = target;
    }
  };

  frame = requestAnimationFrame(tick);
}

watch(() => props.value, (next) => {
  const numeric = parseNumeric(next);
  if (numeric === null) {
    cancelAnimationFrame(frame);
    currentNumber = null;
    display.value = String(next ?? '');
    return;
  }
  animateTo(numeric);
}, { immediate: true });

onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <span>{{ display }}</span>
</template>
