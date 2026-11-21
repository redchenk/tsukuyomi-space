<script setup>
const props = defineProps({
  variant: {
    type: String,
    default: 'secondary',
    validator: value => ['primary', 'secondary', 'accent', 'quiet', 'danger', 'choice', 'icon'].includes(value)
  },
  type: { type: String, default: 'button' },
  busy: Boolean,
  disabled: Boolean
});
</script>

<template>
  <button :type="props.type" :data-ui="props.variant" :disabled="disabled || busy" :aria-busy="busy || undefined">
    <slot />
  </button>
</template>
