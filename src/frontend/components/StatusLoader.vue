<script setup>
import { computed } from 'vue';
import TsIcon from './TsIcon.vue';

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
    <TsIcon class="ts-status-loader-icon" name="loader" :size="compact ? 14 : 16" aria-hidden="true" />
    <div class="ts-status-loader-copy">
      <strong>{{ label }}</strong>
      <span v-if="detail">{{ detail }}</span>
    </div>
    <strong v-if="progressValue !== null" class="ts-status-loader-value">{{ progressValue }}%</strong>
    <div
      v-if="progressValue !== null"
      class="ts-status-loader-progress"
      role="progressbar"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progressValue"
    >
      <span :style="{ width: `${progressValue}%` }"></span>
    </div>
  </div>
</template>
