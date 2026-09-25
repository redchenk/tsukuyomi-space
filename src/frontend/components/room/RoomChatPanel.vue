<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TsIcon from '../TsIcon.vue';
import RoomDraggablePanel from './RoomDraggablePanel.vue';
import { isEnglishSite } from '../../utils/siteVariant';
import { splitRoomReply } from '../../services/room/roomReplyPresentation.mjs';

const props = defineProps({
  chat: { type: Object, required: true },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start', 'share', 'growth', 'open-diary']);
const imageInputRef = ref(null);
const transcriptRef = ref(null);
const composerRef = ref(null);
const editingMessageId = ref('');
const editDraft = ref('');
const editSubmitting = ref(false);
const editError = ref('');
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
  if (typeof ResizeObserver === 'undefined') return;
  transcriptObserver = new ResizeObserver(() => {
    const node = transcriptRef.value;
    if (node && followingLatestMessage && hasConversation.value) node.scrollTop = node.scrollHeight;
  });
  if (transcriptRef.value) transcriptObserver.observe(transcriptRef.value);
});
onBeforeUnmount(() => transcriptObserver?.disconnect());

const generationState = computed(() => props.chat.generationState?.value || { status: 'idle', error: '' });
const generationBusy = computed(() => ['preparing', 'streaming', 'saving'].includes(generationState.value.status) || props.chat.sending.value);
const generationStoppable = computed(() => generationBusy.value && generationState.value.status !== 'saving');
const generationInterrupted = computed(() => ['error', 'stopped'].includes(generationState.value.status));
const generationMessage = computed(() => {
  if (generationState.value.status === 'error') return generationState.value.error || '回复未能完成，请重试。';
  if (generationState.value.status === 'stopped') return '已停止生成。你可以重试这轮对话。';
  if (generationState.value.status === 'preparing') return '正在准备回复…';
  if (generationState.value.status === 'saving') return '正在保存回复…';
  return '';
});

function canEditMessage(message) {
  return !generationBusy.value && typeof props.chat.canEditAndResend === 'function' && props.chat.canEditAndResend(message);
}

function canRegenerateMessage(message) {
  return !generationBusy.value && typeof props.chat.canRegenerateReply === 'function' && props.chat.canRegenerateReply(message);
}

function beginEdit(message) {
  if (!canEditMessage(message)) return;
  editingMessageId.value = message.id;
  editDraft.value = message.content || '';
  editError.value = '';
  nextTick(() => document.getElementById(`chat-edit-${message.id}`)?.focus());
}

function cancelEdit() {
  if (editSubmitting.value) return;
  editingMessageId.value = '';
  editDraft.value = '';
  editError.value = '';
}

async function submitEdit(message) {
  const nextText = editDraft.value.trim();
  if (!nextText || editSubmitting.value || generationBusy.value) return;
  editSubmitting.value = true;
  editError.value = '';
  try {
    const result = await props.chat.editAndResend(message.id, nextText);
    if (result !== false) {
      editingMessageId.value = '';
      editDraft.value = '';
    } else {
      editError.value = '未能重发，请检查连接后再试。';
    }
  } catch (error) {
    editError.value = error?.message || '未能重发，请检查连接后再试。';
  } finally {
    editSubmitting.value = false;
  }
}

function handleEditKeydown(event, message) {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelEdit();
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
    event.preventDefault();
    submitEdit(message);
  }
}

function resizeComposer() {
  const node = composerRef.value;
  if (!node) return;
  node.style.height = 'auto';
  node.style.height = `${Math.min(node.scrollHeight, 112)}px`;
}

function handleComposerKeydown(event) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.shiftKey) return;
  event.preventDefault();
  if (!generationBusy.value && !generationInterrupted.value && !props.chat.resetting.value && !endChatBusy.value) props.chat.send();
}

watch(() => props.chat.input.value, () => nextTick(resizeComposer));
watch(() => props.chat.messages.value.map((message) => message.id), (ids) => {
  if (editingMessageId.value && !ids.includes(editingMessageId.value)) cancelEdit();
});
watch(() => props.chat.messages.value.map(message => `${message.id}:${message.content.length}`), () => {
  const node = transcriptRef.value;
  if (node && followingLatestMessage) node.scrollTop = node.scrollHeight;
}, { flush: 'post' });
onMounted(() => nextTick(resizeComposer));

function replyParts(message) {
  return message.pending && Array.isArray(message.parts) ? message.parts : splitRoomReply(message.content);
}

const endChat = computed(() => props.chat.endChatState?.value || { status: 'idle', visible: false });
const endChatBusy = computed(() => endChat.value.status === 'generating');
const sessionTurns = computed(() => (typeof props.chat.sessionTurnCount === 'function' ? props.chat.sessionTurnCount() : 0));
// The composable owns the fallback name; the panel only renders what it gets.
const characterName = computed(() => String(props.chat.characterName?.value || '').trim() || '角色');
const panelTitle = computed(() => `与${characterName.value}聊天`);
const hasConversation = computed(() => props.chat.messages.value.some((message) => message.role !== 'system'));
const englishRoom = isEnglishSite();
const quickMessages = englishRoom
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
const diaryAuthorName = computed(() => endChat.value.entry?.characterName || '角色');

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
      <div class="chat-session-header" aria-label="会话操作">
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
            :disabled="generationBusy || chat.resetting.value || endChatBusy"
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
      <div id="chatMessages" :ref="bindTranscript" class="room-chat-messages" :aria-busy="generationBusy" @scroll.passive="rememberTranscriptPosition">
        <div v-if="!hasConversation" class="room-chat-welcome">
          <TsIcon name="message" :size="23" />
          <strong>这一刻，慢慢聊</strong>
          <p>今天的小事、想说的话，都可以留在这里。</p>
        </div>
        <div v-for="message in chat.messages.value" :key="message.id" class="chat-message" :class="[message.role, { 'is-failed': message.failed, 'is-streaming': message.pending }]" :aria-busy="message.pending || undefined">
          <span class="chat-role">{{ message.role === 'assistant' ? characterName : message.role === 'user' ? '你' : '系统' }}</span>
          <img v-if="message.image?.dataUrl" class="chat-image-thumb" :src="message.image.dataUrl" :alt="message.image.name || 'image'">
          <template v-if="editingMessageId === message.id">
            <label class="chat-edit-label" :for="`chat-edit-${message.id}`">修改这条消息</label>
            <textarea
              :id="`chat-edit-${message.id}`"
              v-model="editDraft"
              class="chat-edit-input"
              rows="3"
              :disabled="editSubmitting"
              @keydown="handleEditKeydown($event, message)"
            ></textarea>
            <p v-if="editError" class="chat-edit-error" role="alert">{{ editError }}</p>
            <div class="chat-edit-actions">
              <button class="chat-tts-btn" type="button" :disabled="editSubmitting || !editDraft.trim()" @click="submitEdit(message)">保存并重发</button>
              <button class="chat-tts-btn" type="button" :disabled="editSubmitting" @click="cancelEdit">取消</button>
            </div>
          </template>
          <template v-else>
            <StatusLoader v-if="message.pending && !message.content" :label="`${characterName}正在输入…`" compact />
            <template v-else-if="message.role === 'assistant'">
              <div v-for="(part, index) in replyParts(message)" :key="index" class="chat-content chat-reply-part">{{ part }}</div>
            </template>
            <div v-else class="chat-content">{{ message.content }}</div>
            <span v-if="message.pending && message.content" class="chat-stream-marker" role="status" aria-label="正在生成回复"></span>
          </template>
          <div class="chat-message-footer">
            <time v-if="message.role !== 'system' && !message.pending && messageTime(message.createdAt)" class="chat-message-time">{{ messageTime(message.createdAt) }}</time>
            <div v-if="message.role === 'user' && !message.pending && editingMessageId !== message.id" class="chat-message-actions">
              <span v-if="message.failed" class="chat-message-failed">未送达</span>
              <button v-if="canEditMessage(message)" class="chat-tts-btn" type="button" :aria-label="'编辑并重发这条消息'" @click="beginEdit(message)">编辑重发</button>
              <button v-if="message.failed && !generationBusy" class="chat-tts-btn" type="button" @click="chat.retryLastTurn()">重试</button>
            </div>
            <div v-if="message.role === 'assistant' && !message.pending" class="chat-message-actions">
              <button v-if="canRegenerateMessage(message)" class="chat-tts-btn" type="button" @click="chat.regenerateReply(message.id)">重新生成</button>
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
        <div v-if="generationInterrupted" class="chat-generation-notice" :class="generationState.status" :role="generationState.status === 'error' ? 'alert' : 'status'">
          <span>{{ generationMessage }} 请重试或放弃后再发送新消息。</span>
          <button class="chat-tts-btn" type="button" :disabled="generationBusy" @click="chat.retryLastTurn()">重试这轮</button>
          <button class="chat-tts-btn" type="button" :disabled="generationBusy" @click="chat.discardFailedTurn()">放弃这轮</button>
        </div>
        <div v-else-if="generationState.status === 'preparing' && !chat.messages.value.some((message) => message.pending)" class="chat-generation-notice preparing" role="status">{{ generationMessage }}</div>
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
        <textarea id="chatInput" ref="composerRef" v-model="chat.input.value" rows="1" :aria-label="englishRoom ? 'Message' : '输入消息'" enterkeyhint="send" :placeholder="englishRoom ? 'Message, Enter to send' : '输入消息，Enter 发送；Shift+Enter 换行'" @keydown="handleComposerKeydown"></textarea>
        <button v-if="generationStoppable" id="stopChatBtn" class="panel-btn chat-stop-btn" type="button" aria-label="停止生成" title="停止生成" @click="chat.stopGeneration()">
          <span class="chat-stop-icon" aria-hidden="true"></span>
          <span>停止</span>
        </button>
        <button v-else-if="generationBusy" class="panel-btn chat-stop-btn" type="button" disabled aria-label="正在保存回复"><TsIcon name="loader" :size="20" class="ts-status-loader-icon" /><span>保存中</span></button>
        <button v-else id="sendChatBtn" class="panel-btn" type="button" :disabled="generationInterrupted || chat.resetting.value || endChatBusy || (!chat.input.value.trim() && !chat.imageAttachment.value)" aria-label="发送" @click="chat.send">
          <TsIcon name="send" :size="22" :stroke-width="2.1" />
          <span>发送</span>
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
          <span class="chat-end-full-label">{{ endChatBusy ? endChatStatusLabel() : englishRoom ? 'End & journal' : '结束聊天并写日记' }}</span>
          <span class="chat-end-short-label" aria-hidden="true">{{ endChatBusy ? (englishRoom ? 'Writing…' : '生成中') : (englishRoom ? 'Journal' : '写日记') }}</span>
        </button>
        <span class="chat-end-hint">
          {{ sessionTurns ? (englishRoom ? `${sessionTurns} messages saved` : `本次已记录 ${sessionTurns} 条对话`) : (englishRoom ? 'Start a conversation' : '先说几句，再结束聊天') }}
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
        :aria-label="`${diaryAuthorName}的日记`"
      >
        <header class="diary-preview-head">
          <div class="diary-preview-heading">
            <span class="diary-preview-kicker">{{ diaryAuthorName }} · 日记</span>
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
