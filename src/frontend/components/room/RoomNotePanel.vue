<script setup>
import RoomDraggablePanel from './RoomDraggablePanel.vue';

defineProps({
  note: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start', 'save']);
</script>

<template>
  <RoomDraggablePanel
    panel-id="notePanel"
    :panel-style="panelStyle"
    title="&#20415;&#31614;"
    @close="emit('close')"
    @focus="emit('focus')"
    @drag-start="emit('drag-start', $event)"
  >
    <div class="panel-content">
      <textarea id="noteContent" v-model="note.value" placeholder="&#25226;&#28789;&#24863;&#20808;&#25918;&#22312;&#36825;&#37324;"></textarea>
      <button id="saveNoteBtn" class="panel-btn" type="button" @click="emit('save')">&#20445;&#23384;&#20415;&#31614;</button>
    </div>
  </RoomDraggablePanel>
</template>
