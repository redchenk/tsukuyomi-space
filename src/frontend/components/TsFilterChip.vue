<script setup>
import TsButton from './TsButton.vue';
defineProps({ selected: Boolean });
</script>

<template>
  <TsButton variant="choice" :aria-pressed="selected"><slot /></TsButton>
</template>
