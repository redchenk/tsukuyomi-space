<script setup>
defineProps({
  buttons: { type: Array, required: true },
  activePanels: { type: Object, required: true }
});

const emit = defineEmits(['toggle', 'settings']);
</script>

<template>
  <div class="panel-controls room-dock" aria-label="Room tools">
    <button
      v-for="button in buttons"
      :key="button.id"
      class="panel-toggle-btn"
      :class="{ 'is-active': activePanels[button.id] }"
      type="button"
      :aria-pressed="activePanels[button.id] ? 'true' : 'false'"
      @click="emit('toggle', button.id)"
    >
      <span class="dock-icon" aria-hidden="true">{{ button.icon || button.label.slice(0, 1) }}</span>
      <span class="dock-label">{{ button.label }}</span>
    </button>
    <button class="panel-toggle-btn" type="button" aria-label="设置" @click="emit('settings')">
      <span class="dock-icon" aria-hidden="true">&#9881;</span>
      <span class="dock-label">&#35774;&#32622;</span>
    </button>
  </div>
</template>
