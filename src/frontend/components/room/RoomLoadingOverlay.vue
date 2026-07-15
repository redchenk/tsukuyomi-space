<script setup>
defineProps({
  active: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  title: { type: String, default: 'SYNCHRONIZING...' },
  detail: { type: String, default: 'Loading room assets...' }
});
</script>

<template>
  <div v-if="active" id="loadingOverlay" class="status-layer active" aria-busy="true">
    <div class="ts-loader-region">
      <StatusLoader :label="title" :detail="detail" />
    </div>
  </div>
  <div v-else-if="error" id="loadingError" class="status-layer active">
    <div class="status-box" data-material="hud" role="alert">
      <div class="status-title">{{ title }}</div>
      <div class="status-detail">{{ detail }}</div>
    </div>
  </div>
</template>
