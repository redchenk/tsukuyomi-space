<script setup>
import { actionSize, actionVariant } from './uiControl';

defineProps({
  variant: actionVariant,
  size: actionSize,
  type: { type: String, default: 'button' },
  loading: Boolean,
  busy: Boolean,
  disabled: Boolean
});
</script>

<template>
  <button class="ts-button" :type="type" :data-ui="variant" :data-size="size"
    :disabled="disabled || loading || busy" :aria-busy="loading || busy || undefined"><slot /></button>
</template>
