<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import TsIcon from '../TsIcon.vue';
import RoomDraggablePanel from './RoomDraggablePanel.vue';

const props = defineProps({
  chat: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start', 'open-diary']);
const imageInputRef = ref(null);

const endChat = computed(() => props.chat.endChatState?.value || { status: 'idle', visible: false });
const endChatBusy = computed(() => endChat.value.status === 'generating');
const sessionTurns = computed(() => (typeof props.chat.sessionTurnCount === 'function' ? props.chat.sessionTurnCount() : 0));
// The composable owns the fallback name; the panel only renders what it gets.
const characterName = computed(() => String(props.chat.characterName?.value || '').trim() || '角色');
const panelTitle = computed(() => `与${characterName.value}聊天`);

// Only a finished entry opens the centred overlay; confirm/progress/error stay
// inside the chat panel so they never cover the room.
const diaryPreviewOpen = computed(() => Boolean(endChat.value.entry) && endChat.value.status === 'done');

// The stored body already carries the 【日记】 wrapper and the timestamp line,
// which the overlay header now shows, so only the prose is rendered.
const diaryPreviewText = computed(() => {
  const content = String(endChat.value.entry?.content || '');
  return content
    .replace(/^\s*【日记】\s*/u, '')
    .replace(/\s*【日记书写时间为[^】]*】\s*$/u, '')
    .trim();
});

function closePreviewOnEscape(event) {
  if (event.key !== 'Escape' || !diaryPreviewOpen.value) return;
  props.chat.dismissDiaryText();
}

function openDiaryPanel() {
  props.chat.dismissDiaryText();
  emit('open-diary');
}

onMounted(() => window.addEventListener('keydown', closePreviewOnEscape));
onBeforeUnmount(() => window.removeEventListener('keydown', closePreviewOnEscape));

function ttsStatus(chat, messageId) {
  return chat.ttsState.value.messageId === messageId ? chat.ttsState.value.status : 'idle';
}

function ttsLabel(chat, messageId) {
  const status = ttsStatus(chat, messageId);
  if (status === 'loading') return '加载中';
  if (status === 'playing') return '播放中';
  return '播放语音';
}

function endChatStatusLabel() {
  if (endChat.value.status === 'generating') return '正在生成…';
  if (endChat.value.status === 'done') return '已完成';
  if (endChat.value.status === 'error') return '失败';
  return '结束聊天';
}
</script>

<template>
  <RoomDraggablePanel
    panel-id="chatPanel"
    panel-class="room-chat-panel"
    :panel-style="panelStyle"
    :title="panelTitle"
    @close="emit('close')"
    @focus="emit('focus')"
    @drag-start="emit('drag-start', $event)"
  >
    <div class="panel-content chat-body" @dragover.prevent @drop="chat.onDrop">
      <div id="chatMessages" :ref="(node) => { chat.messageListRef.value = node; }" class="room-chat-messages" :aria-busy="chat.sending.value">
        <div v-for="message in chat.messages.value" :key="message.id" class="chat-message" :class="message.role" :aria-busy="message.pending || undefined">
          <span class="chat-role">{{ message.role === 'assistant' ? characterName : message.role === 'user' ? '你' : '系统' }}</span>
          <img v-if="message.image?.dataUrl" class="chat-image-thumb" :src="message.image.dataUrl" :alt="message.image.name || 'image'">
          <StatusLoader v-if="message.pending" :label="message.content" compact />
          <div v-else class="chat-content">{{ message.content }}</div>
          <div v-if="message.role === 'assistant' && !message.pending" class="chat-message-actions">
            <button
              class="chat-tts-btn"
              :class="{ loading: ttsStatus(chat, message.id) === 'loading', playing: ttsStatus(chat, message.id) === 'playing' }"
              type="button"
              :disabled="ttsStatus(chat, message.id) === 'loading'"
              :aria-busy="ttsStatus(chat, message.id) === 'loading'"
              @click="chat.playTTS(message.speechText || message.content, message.id, message.live2d)"
            >
              <TsIcon v-if="ttsStatus(chat, message.id) === 'loading'" class="ts-status-loader-icon" name="loader" :size="15" aria-hidden="true" />
              <span :role="ttsStatus(chat, message.id) === 'loading' ? 'status' : undefined">{{ ttsLabel(chat, message.id) }}</span>
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
        <button id="sendChatBtn" class="panel-btn" type="button" :disabled="chat.sending.value" :aria-busy="chat.sending.value" aria-label="&#21457;&#36865;" @click="chat.send">
          <TsIcon name="send" :size="22" :stroke-width="2.1" />
          <span>&#21457;&#36865;</span>
        </button>
      </div>
      <div class="chat-end-row">
        <button
          id="endChatBtn"
          class="panel-btn chat-end-btn"
          type="button"
          :class="{ 'is-busy': endChatBusy }"
          :disabled="endChatBusy || chat.sending.value"
          :aria-busy="endChatBusy"
          :aria-label="endChatStatusLabel()"
          @click="chat.openEndChatDialog()"
        >
          <TsIcon v-if="endChatBusy" class="ts-status-loader-icon" name="loader" :size="16" aria-hidden="true" />
          <TsIcon v-else name="book" :size="16" aria-hidden="true" />
          <span>{{ endChatBusy ? endChatStatusLabel() : '结束聊天并写日记' }}</span>
        </button>
        <span class="chat-end-hint">
          {{ sessionTurns ? `本次已记录 ${sessionTurns} 条对话` : '先说几句，再结束聊天' }}
        </span>
      </div>
    </div>

    <!-- Confirm / progress / failure stay inside the chat panel: they are
         process feedback and must not cover the room. -->
    <div
      v-if="endChat.visible && !diaryPreviewOpen"
      class="chat-end-dialog"
      role="dialog"
      aria-modal="false"
      aria-label="结束聊天"
    >
      <p class="chat-end-dialog-title">{{ endChat.message }}</p>
      <p v-if="endChat.detail" class="chat-end-dialog-detail">{{ endChat.detail }}</p>
      <div class="chat-end-dialog-actions">
        <template v-if="endChat.status === 'confirm'">
          <button class="primary-btn" type="button" @click="chat.confirmEndChat()">确认结束并写日记</button>
          <button class="ghost-btn" type="button" @click="chat.confirmEndChatWithoutDiary()">结束但不保存</button>
          <button class="ghost-btn" type="button" @click="chat.closeEndChatDialog()">继续聊天</button>
        </template>
        <template v-else-if="endChat.status === 'generating'">
          <button class="primary-btn" type="button" disabled aria-busy="true">正在生成日记…</button>
        </template>
        <template v-else>
          <button class="primary-btn" type="button" @click="chat.exportDiaryArchive()">导出存档</button>
          <button v-if="endChat.status === 'error'" class="ghost-btn" type="button" @click="chat.confirmEndChat()">重试</button>
          <button class="ghost-btn" type="button" @click="chat.closeEndChatDialog()">关闭</button>
        </template>
      </div>
    </div>
  </RoomDraggablePanel>

  <!-- A freshly written diary opens centred above everything so it can be read
       at a comfortable width. Closing reveals the room again. -->
  <Teleport to="body">
    <div
      v-if="diaryPreviewOpen"
      class="diary-preview-backdrop"
      role="presentation"
      @click.self="chat.dismissDiaryText()"
    >
      <section
        class="diary-preview-card"
        data-material="popover"
        role="dialog"
        aria-modal="true"
        :aria-label="`${characterName}的日记`"
      >
        <header class="diary-preview-head">
          <div class="diary-preview-heading">
            <span class="diary-preview-kicker">{{ characterName }} · 日记</span>
            <strong>{{ endChat.entry.date }} {{ endChat.entry.time }}</strong>
          </div>
          <button
            class="diary-preview-close"
            type="button"
            aria-label="关闭日记"
            title="关闭日记"
            @click="chat.dismissDiaryText()"
          >×</button>
        </header>
        <div class="diary-preview-body">
          <pre>{{ diaryPreviewText }}</pre>
        </div>
        <footer class="diary-preview-actions">
          <button class="primary-btn" type="button" @click="chat.exportDiaryArchive()">导出存档</button>
          <button class="ghost-btn" type="button" @click="openDiaryPanel()">打开日记本</button>
          <button class="ghost-btn" type="button" @click="chat.closeEndChatDialog()">继续聊天</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
