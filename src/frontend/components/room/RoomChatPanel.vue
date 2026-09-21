<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import TsIcon from '../TsIcon.vue';
import RoomDraggablePanel from './RoomDraggablePanel.vue';
import { isEnglishSite } from '../../utils/siteVariant';

const props = defineProps({
  chat: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start', 'share', 'growth', 'open-diary']);
const imageInputRef = ref(null);
const transcriptRef = ref(null);
let transcriptObserver;
let followingLatestMessage = true;

function bindTranscript(node) {
  transcriptRef.value = node;
  props.chat.messageListRef.value = node;
}

function rememberTranscriptPosition() {
  const node = transcriptRef.value;
  if (node) followingLatestMessage = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
}

onMounted(() => {
  // Keep the newest reply in view when the keyboard or stage changes height,
  // while preserving the position of someone reading earlier messages.
  transcriptObserver = new ResizeObserver(() => {
    const node = transcriptRef.value;
    if (node && followingLatestMessage && hasConversation.value) node.scrollTop = node.scrollHeight;
  });
  if (transcriptRef.value) transcriptObserver.observe(transcriptRef.value);
});
onBeforeUnmount(() => transcriptObserver?.disconnect());

const endChat = computed(() => props.chat.endChatState?.value || { status: 'idle', visible: false });
const endChatBusy = computed(() => endChat.value.status === 'generating');
const sessionTurns = computed(() => (typeof props.chat.sessionTurnCount === 'function' ? props.chat.sessionTurnCount() : 0));
// The composable owns the fallback name; the panel only renders what it gets.
const characterName = computed(() => String(props.chat.characterName?.value || '').trim() || '角色');
const panelTitle = computed(() => `与${characterName.value}聊天`);
const hasConversation = computed(() => props.chat.messages.value.some((message) => message.role !== 'system'));
const quickMessages = isEnglishSite()
  ? ['How was your day?', 'Let’s talk', 'A little encouragement']
  : ['今天过得怎么样？', '想和你聊聊天', '给我一点鼓励'];

function useQuickMessage(message) {
  props.chat.input.value = message;
  document.getElementById('chatInput')?.focus();
}

function messageTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

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
  if (event.key !== 'Escape' || !endChat.value.visible) return;
  onEndChatBackdrop();
}

/**
 * Backdrop click: dismisses the diary text, or cancels the confirm step. The
 * generating step is deliberately not cancellable from the backdrop.
 */
function onEndChatBackdrop() {
  if (endChat.value.status === 'generating') return;
  if (diaryPreviewOpen.value) {
    props.chat.dismissDiaryText();
    return;
  }
  props.chat.closeEndChatDialog();
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

function showDailyGrowthPrompt(chat) {
  const growth = chat.growth.value;
  if (!growth) return false;
  return !growth.today?.roomChatCompleted;
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
      <div class="chat-session-header">
        <button v-if="showDailyGrowthPrompt(chat)" class="room-growth-strip" type="button" aria-label="查看月契成长" @click="emit('growth')">
          <span class="room-growth-mobile-label">Lv.{{ chat.growth.value.level.level }}</span>
          <span class="room-growth-icon"><TsIcon name="sparkles" :size="16" /></span>
          <span class="room-growth-copy">
            <strong>Lv.{{ chat.growth.value.level.level }} {{ chat.growth.value.level.title }}</strong>
            <small>{{ chat.growth.value.today.completed }}/{{ chat.growth.value.today.total }} 今日约定</small>
          </span>
          <span class="room-growth-progress" aria-hidden="true"><i :style="{ width: `${chat.growth.value.level.progressPercent}%` }"></i></span>
          <TsIcon name="arrowRight" :size="16" />
        </button>
        <div class="chat-session-toolbar">
          <span class="chat-session-label">当前会话</span>
          <button v-if="chat.canStartConversation()" class="chat-session-new-btn chat-opener-btn" type="button"
            :disabled="chat.sending.value || chat.resetting.value || endChatBusy" :title="`让${characterName}先开口`"
            @click="chat.startConversation()"><TsIcon name="sparkles" :size="15" /><span>我先说</span></button>
          <button
            class="chat-session-new-btn"
            type="button"
            :disabled="chat.resetting.value || endChatBusy"
            :aria-busy="chat.resetting.value"
            title="新建会话"
            aria-label="新建会话"
            @click="chat.startNewSession"
          >
            <TsIcon :class="{ 'ts-status-loader-icon': chat.resetting.value }" :name="chat.resetting.value ? 'loader' : 'plus'" :size="15" />
            <span :role="chat.resetting.value ? 'status' : undefined">{{ chat.resetting.value ? '正在新建' : '新建会话' }}</span>
          </button>
        </div>
      </div>
      <div id="chatMessages" :ref="bindTranscript" class="room-chat-messages" :aria-busy="chat.sending.value" @scroll.passive="rememberTranscriptPosition">
        <div v-if="!hasConversation" class="room-chat-welcome">
          <TsIcon name="message" :size="23" />
          <strong>这一刻，慢慢聊</strong>
          <p>今天的小事、想说的话，都可以留在这里。</p>
        </div>
        <div v-for="message in chat.messages.value" :key="message.id" class="chat-message" :class="message.role" :aria-busy="message.pending || undefined">
          <span class="chat-role">{{ message.role === 'assistant' ? characterName : message.role === 'user' ? '你' : '系统' }}</span>
          <img v-if="message.image?.dataUrl" class="chat-image-thumb" :src="message.image.dataUrl" :alt="message.image.name || 'image'">
          <StatusLoader v-if="message.pending" :label="message.content" compact />
          <div v-else class="chat-content">{{ message.content }}</div>
          <time v-if="message.role !== 'system' && !message.pending && messageTime(message.createdAt)" class="chat-message-time">{{ messageTime(message.createdAt) }}</time>
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
            <button
              v-if="chat.getShareTurn(message)"
              class="chat-tts-btn chat-share-btn"
              type="button"
              aria-label="分享这轮对话"
              @click="emit('share', message)"
            >
              <TsIcon name="external" :size="15" />
              <span>分享</span>
            </button>
          </div>
        </div>
      </div>
      <div v-if="!hasConversation" class="room-chat-suggestions" aria-label="聊天开场建议">
        <button v-for="message in quickMessages" :key="message" type="button" @click="useQuickMessage(message)">{{ message }}</button>
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
        <input id="chatInput" v-model="chat.input.value" type="text" aria-label="输入消息" enterkeyhint="send" placeholder="&#36755;&#20837;&#28040;&#24687;&#65292;Enter &#21457;&#36865;" @keydown.enter="!$event.isComposing && $event.keyCode !== 229 && chat.send()">
        <button id="sendChatBtn" class="panel-btn" type="button" :disabled="chat.sending.value || chat.resetting.value || endChatBusy" :aria-busy="chat.sending.value" aria-label="&#21457;&#36865;" @click="chat.send">
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

  </RoomDraggablePanel>

  <!-- Every end-chat state renders as a centred overlay. Placed inside the chat
       panel it could be pushed off-screen on short phones and collide with the
       bottom dock, so it is teleported to the body and centred instead. -->
  <Teleport to="body">
    <div
      v-if="endChat.visible"
      class="endchat-backdrop"
      role="presentation"
      @click.self="onEndChatBackdrop()"
    >
      <!-- Confirm / progress / failure -->
      <section
        v-if="!diaryPreviewOpen"
        class="endchat-card"
        data-material="popover"
        role="dialog"
        aria-modal="true"
        aria-label="结束聊天"
      >
        <p class="endchat-title">{{ endChat.message }}</p>
        <p v-if="endChat.detail" class="endchat-detail">{{ endChat.detail }}</p>
        <div class="endchat-actions">
          <template v-if="endChat.status === 'confirm'">
            <button class="primary-btn" type="button" @click="chat.confirmEndChat()">确认结束并写日记</button>
            <button class="ghost-btn" type="button" @click="chat.confirmEndChatWithoutDiary()">结束但不写日记</button>
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
      </section>

      <!-- The freshly written diary, at a comfortable reading width -->
      <section
        v-else
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
