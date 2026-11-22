<script setup>
import TsIcon from './TsIcon.vue';

defineProps({
  active: Boolean,
  stopAfterThree: Boolean
});
</script>

<template>
  <span class="notification-icon" aria-hidden="true">
    <slot><TsIcon name="bell" :size="18" /></slot>
    <i v-if="active" class="notification-dot" :class="{ 'three-beats': stopAfterThree }"></i>
  </span>
</template>

<style scoped>
.notification-icon {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  line-height: 0;
}
.notification-dot {
  position: absolute;
  inset-block-start: -2px;
  inset-inline-end: -3px;
  box-sizing: border-box;
  inline-size: 9px;
  block-size: 9px;
  border: 1.5px solid var(--badge-edge, var(--surface));
  border-radius: var(--r-pill);
  background-color: var(--notification-red);
  pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
  .notification-dot { animation: notification-grow 1.8s ease-in-out infinite; }
  .notification-dot.three-beats { animation-iteration-count: 3; }
  @keyframes notification-grow {
    0%, 68%, 100% { transform: scale(1); }
    28% { transform: scale(1.28); }
  }
}
@media (forced-colors: active) {
  .notification-dot { forced-color-adjust: none; background: Highlight; border-color: Canvas; }
}
</style>
