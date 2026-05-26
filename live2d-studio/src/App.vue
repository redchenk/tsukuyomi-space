<script setup>
import { onMounted, onUnmounted } from 'vue';
import Live2DPage from '../../src/frontend/pages/Live2DPage.vue';

onMounted(() => {
  document.body.classList.add('vue-live2d-route');
});

onUnmounted(() => {
  document.body.classList.remove('vue-live2d-route');
});
</script>

<template>
  <Live2DPage />
</template>
