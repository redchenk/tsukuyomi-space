<script setup>
import TsButton from './TsButton.vue';
defineProps({ pressed: Boolean });
</script>

<template>
  <TsButton variant="ghost" :aria-pressed="pressed"><slot /></TsButton>
</template>
