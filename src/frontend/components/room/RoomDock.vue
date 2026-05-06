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
    >{{ button.label }}</button>
    <button class="panel-toggle-btn" type="button" @click="emit('settings')">&#35774;&#32622;</button>
  </div>
</template>
