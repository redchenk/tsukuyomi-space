<script setup>
import { ref } from 'vue';
import RoomDraggablePanel from './RoomDraggablePanel.vue';

defineProps({
  chat: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start']);
const imageInputRef = ref(null);
</script>

<template>
  <RoomDraggablePanel
    panel-id="chatPanel"
    panel-class="room-chat-panel"
    :panel-style="panelStyle"
    title="&#19982;&#36745;&#22812;&#23020;&#32842;&#22825;"
    @close="emit('close')"
    @focus="emit('focus')"
    @drag-start="emit('drag-start', $event)"
  >
    <div class="panel-content chat-body" @dragover.prevent @drop="chat.onDrop">
      <div id="chatMessages" :ref="(node) => { chat.messageListRef.value = node; }" class="room-chat-messages">
        <div v-for="message in chat.messages.value" :key="message.id" class="chat-message" :class="message.role">
          <span class="chat-role">{{ message.role === 'assistant' ? '八千代' : message.role === 'user' ? '你' : '系统' }}</span>
          <img v-if="message.image?.dataUrl" class="chat-image-thumb" :src="message.image.dataUrl" :alt="message.image.name || 'image'">
          <div class="chat-content">{{ message.content }}</div>
          <div v-if="message.role === 'assistant' && !message.pending" class="chat-message-actions">
            <button class="chat-tts-btn" type="button" @click="chat.playTTS(message.content)">&#25773;&#25918;&#35821;&#38899;</button>
          </div>
        </div>
      </div>
      <div v-if="chat.imageAttachment.value" id="chatImagePreview" class="chat-image-preview">
        <img :src="chat.imageAttachment.value.dataUrl" :alt="chat.imageAttachment.value.name">
        <span>{{ chat.imageAttachment.value.name }}</span>
        <button class="panel-btn" type="button" @click="chat.clearImage">&#31227;&#38500;</button>
      </div>
      <div class="chat-input-row">
        <input ref="imageInputRef" id="chatImageInput" type="file" accept="image/*" hidden @change="chat.attachImage($event.target.files?.[0]); $event.target.value = ''">
        <button id="attachImageBtn" class="panel-btn chat-attach-btn" type="button" title="&#19978;&#20256;&#22270;&#29255;" aria-label="&#19978;&#20256;&#22270;&#29255;" @click="imageInputRef?.click()"><span aria-hidden="true">+</span><span>&#22270;&#29255;</span></button>
        <input id="chatInput" v-model="chat.input.value" type="text" placeholder="&#36755;&#20837;&#28040;&#24687;&#65292;Enter &#21457;&#36865;" @keydown.enter="chat.send">
        <button id="sendChatBtn" class="panel-btn" type="button" :disabled="chat.sending.value" @click="chat.send">&#21457;&#36865;</button>
      </div>
    </div>
  </RoomDraggablePanel>
</template>
