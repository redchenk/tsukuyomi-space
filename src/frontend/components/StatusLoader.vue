<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, default: 'Loading' },
  detail: { type: String, default: '' },
  progress: { type: Number, default: null },
  compact: { type: Boolean, default: false }
});

const progressValue = computed(() => {
  if (!Number.isFinite(props.progress)) return null;
  return Math.min(100, Math.max(0, Math.round(props.progress)));
});
</script>

<template>
  <div class="ts-status-loader" :class="{ compact, 'has-progress': progressValue !== null }" role="status" aria-live="polite" :aria-label="label">
    <div
      class="ts-status-loader-progress"
      :class="{ indeterminate: progressValue === null }"
      role="progressbar"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progressValue === null ? undefined : progressValue"
    >
      <span :style="progressValue === null ? undefined : { width: `${progressValue}%` }"></span>
    </div>
    <span class="ts-visually-hidden">{{ label }}{{ detail ? `：${detail}` : '' }}{{ progressValue === null ? '' : `，${progressValue}%` }}</span>
  </div>
</template>
