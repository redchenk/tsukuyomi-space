<script setup>
defineProps({
  panelId: { type: String, required: true },
  title: { type: String, default: '' },
  panelClass: { type: String, default: '' },
  panelStyle: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['close', 'focus', 'drag-start']);
</script>

<template>
  <section
    :id="panelId"
    class="draggable-panel room-panel"
    :class="panelClass"
    :style="panelStyle"
    @pointerdown="emit('focus')"
  >
    <div class="panel-header" @pointerdown="emit('drag-start', $event)">
      <slot name="header">
        <span class="panel-title">{{ title }}</span>
        <button class="panel-close" type="button" aria-label="Close panel" @pointerdown.stop @click.stop="emit('close')">x</button>
      </slot>
    </div>
    <slot />
  </section>
</template>
