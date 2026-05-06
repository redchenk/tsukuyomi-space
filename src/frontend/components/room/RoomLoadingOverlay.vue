<script setup>
defineProps({
  active: { type: Boolean, default: false },
  title: { type: String, default: 'SYNCHRONIZING...' },
  detail: { type: String, default: 'Loading room assets...' }
});
</script>

<template>
  <div v-if="active" id="loadingOverlay" class="status-layer active" role="status" aria-live="polite">
    <div class="status-box">
      <div class="status-spinner"></div>
      <div class="status-progress" aria-hidden="true"><span></span></div>
      <div id="loadingTitle" class="status-title">{{ title }}</div>
      <div id="loadingDetail" class="status-detail">{{ detail }}</div>
    </div>
  </div>
</template>
