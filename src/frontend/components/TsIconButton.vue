<script setup>
import TsButton from './TsButton.vue';
import TsIcon from './TsIcon.vue';
defineProps({ label: { type: String, required: true }, icon: { type: String, required: true } });
</script>

<template>
  <TsButton variant="icon" :aria-label="label"><TsIcon :name="icon" :size="18" /></TsButton>
</template>
