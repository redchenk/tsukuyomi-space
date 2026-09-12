<script setup>
import { computed } from 'vue';
import { BUILT_IN_CHARACTER_NAME } from '../../composables/room/useRoomChat';

const props = defineProps({
  live2d: { type: Object, required: true },
  characterName: { type: String, default: '' }
});

// Falls back to the built-in full name so the stage always greets someone.
const stageName = computed(() => String(props.characterName || '').trim() || BUILT_IN_CHARACTER_NAME);
</script>

<template>
  <section class="room-stage" aria-label="Live2D stage">
    <div class="room-stage-copy">
      <p>Live2D Room</p>
      <h1>{{ stageName }}正在房间里等你</h1>
    </div>
    <div id="live2d-container" class="room-live2d-container"></div>
    <div v-if="live2d.error.value" class="room-stage-error">{{ live2d.error.value }}</div>
  </section>
</template>
