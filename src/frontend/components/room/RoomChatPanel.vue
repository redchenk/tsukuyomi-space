<script setup>
import { ref } from 'vue';
import TsIcon from '../TsIcon.vue';
import RoomDraggablePanel from './RoomDraggablePanel.vue';

defineProps({
  chat: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start']);
const imageInputRef = ref(null);

function ttsStatus(chat, messageId) {
  return chat.ttsState.value.messageId === messageId ? chat.ttsState.value.status : 'idle';
}

function ttsLabel(chat, messageId) {
  const status = ttsStatus(chat, messageId);
  if (status === 'loading') return '加载中';
  if (status === 'playing') return '播放中';
  return '播放语音';
}
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
            <button
              class="chat-tts-btn"
              :class="{ loading: ttsStatus(chat, message.id) === 'loading', playing: ttsStatus(chat, message.id) === 'playing' }"
              type="button"
              :disabled="ttsStatus(chat, message.id) === 'loading'"
              @click="chat.playTTS(message.speechText || message.content, message.id)"
            >
              <span v-if="ttsStatus(chat, message.id) === 'loading'" class="chat-tts-spinner" aria-hidden="true"></span>
              <span>{{ ttsLabel(chat, message.id) }}</span>
            </button>
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
        <button id="attachImageBtn" class="panel-btn chat-attach-btn" type="button" title="&#19978;&#20256;&#22270;&#29255;" aria-label="&#19978;&#20256;&#22270;&#29255;" @click="imageInputRef?.click()">
          <TsIcon name="image" :size="22" :stroke-width="2" />
          <span>&#22270;&#29255;</span>
        </button>
        <input id="chatInput" v-model="chat.input.value" type="text" placeholder="&#36755;&#20837;&#28040;&#24687;&#65292;Enter &#21457;&#36865;" @keydown.enter="chat.send">
        <button id="sendChatBtn" class="panel-btn" type="button" :disabled="chat.sending.value" aria-label="&#21457;&#36865;" @click="chat.send">
          <TsIcon name="send" :size="22" :stroke-width="2.1" />
          <span>&#21457;&#36865;</span>
        </button>
      </div>
    </div>
  </RoomDraggablePanel>
</template>
