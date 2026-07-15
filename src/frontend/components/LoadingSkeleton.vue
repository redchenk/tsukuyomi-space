<script setup>
import { computed } from 'vue';

const props = defineProps({
  variant: { type: String, default: 'list' },
  count: { type: Number, default: 3 },
  label: { type: String, default: 'Loading content' }
});

const itemCount = computed(() => Math.min(12, Math.max(1, Math.trunc(props.count || 1))));
const lineCount = computed(() => props.variant === 'article' || props.variant === 'editor' ? 6 : 2);
const showsMedia = computed(() => ['article', 'cards', 'editor', 'gallery', 'pixel', 'profile', 'stage'].includes(props.variant));
</script>

<template>
  <div class="ts-skeleton" :data-skeleton-variant="variant" aria-hidden="true">
    <div v-for="index in itemCount" :key="index" class="ts-skeleton-item">
      <span v-if="showsMedia" class="ts-skeleton-block ts-skeleton-media"></span>
      <div class="ts-skeleton-body">
        <span class="ts-skeleton-block ts-skeleton-kicker"></span>
        <span class="ts-skeleton-block ts-skeleton-title"></span>
        <span
          v-for="line in lineCount"
          :key="line"
          class="ts-skeleton-block ts-skeleton-line"
          :class="{ short: line === lineCount }"
        ></span>
        <div class="ts-skeleton-actions">
          <span class="ts-skeleton-block"></span>
          <span class="ts-skeleton-block"></span>
        </div>
      </div>
    </div>
  </div>
  <span class="ts-visually-hidden" aria-live="polite">{{ label }}</span>
</template>
