<script setup>
import RoomDraggablePanel from './RoomDraggablePanel.vue';

defineProps({
  profile: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start', 'save']);
</script>

<template>
  <RoomDraggablePanel
    panel-id="profilePanel"
    :panel-style="panelStyle"
    title="&#20010;&#20154;&#36164;&#26009;"
    @close="emit('close')"
    @focus="emit('focus')"
    @drag-start="emit('drag-start', $event)"
  >
    <div class="panel-content">
      <div class="field">
        <label for="nicknameInput">&#26165;&#31216;</label>
        <input id="nicknameInput" v-model="profile.nickname" type="text" placeholder="&#32473;&#33258;&#24049;&#36215;&#19968;&#20010;&#21517;&#23383;">
      </div>
      <div class="field">
        <label for="signatureInput">&#31614;&#21517;</label>
        <textarea id="signatureInput" v-model="profile.signature" placeholder="&#20889;&#19968;&#21477;&#20170;&#22825;&#24819;&#30041;&#19979;&#30340;&#35805;"></textarea>
      </div>
      <button id="saveProfileBtn" class="panel-btn" type="button" @click="emit('save')">&#20445;&#23384;&#36164;&#26009;</button>
      <div id="profileDisplay" class="panel-section">
        <div><strong>{{ profile.nickname || '未命名访客' }}</strong></div>
        <div>{{ profile.signature || '今夜也在月光里慢慢整理思绪。' }}</div>
      </div>
    </div>
  </RoomDraggablePanel>
</template>
