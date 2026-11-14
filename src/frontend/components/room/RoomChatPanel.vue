<script setup>
import { splitKnowledgeReply } from '../../services/siteKnowledge.mjs';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TsIcon from '../TsIcon.vue';
import RoomDraggablePanel from './RoomDraggablePanel.vue';
import RoomChatImage from './RoomChatImage.vue';
import RoomDeepseekDetails from './RoomDeepseekDetails.vue';
import NoticeMarkdown from '../NoticeMarkdown.vue';
import UploadProgress from '../UploadProgress.vue';
import { getSession } from '../../api/client';
import { isEnglishSite } from '../../utils/siteVariant';
import { formatTimeMinute as messageTime, parseAppDate } from '../../utils/time';
import { splitRoomReply } from '../../services/room/roomReplyPresentation.mjs';
import { memoryRetrievalNotice } from '../../services/room/roomMemoryRetrieval.mjs';
import { DOCUMENT_ACCEPT, composeDocumentMessage, formatFileSize, isDocumentFile, readDocumentFile, splitDocumentMessage } from '../../services/room/roomDocumentAttachment.mjs';
import { useSpeechInput } from '../../composables/room/useSpeechInput';

const props = defineProps({
  chat: { type: Object, required: true },
  mobile: { type: Boolean, default: false },
  panelStyle: { type: Object, required: true }
});

const emit = defineEmits(['close', 'focus', 'drag-start', 'share', 'growth', 'open-diary', 'help']);
const imageInputRef = ref(null);
const documentInputRef = ref(null);
const ocrInputRef = ref(null);
const deepseekInput = computed(() => props.chat.deepseekInput);
const deepseekBusy = computed(() => deepseekInput.value?.working.value || deepseekInput.value?.recording.value);
const recordingVoice = computed(() => deepseekInput.value?.supported() ? deepseekInput.value.recording.value : voice.listening.value);
const attachMenuRef = ref(null);
const documentAttachment = ref(null);
let attachmentRevision = 0;
let voiceOwner = '';
const inputOwner = () => String(getSession()?.user?.id || 'guest');
const composerNotice = ref('');
const transcriptRef = ref(null);
const composerRef = ref(null);
const editingMessageId = ref('');
const editDraft = ref('');
const editSubmitting = ref(false);
const editError = ref('');
const copiedMessageId = ref('');
const readingHistory = ref(false);
const selectedMessageId = ref('');
let copiedTimer;
async function copyMessage(message) {
  try {
    await navigator.clipboard.writeText(message.role === 'user' ? userContent(message).text : message.content || '');
    copiedMessageId.value = message.id;
  } catch (_) { copiedMessageId.value = `failed:${message.id}`; }
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copiedMessageId.value = ''; }, 1800);
}
function copyLabel(message, idleLabel) {
  if (copiedMessageId.value === message.id) return '已复制';
  if (copiedMessageId.value === `failed:${message.id}`) return '请选中文字复制';
  return idleLabel;
}
// Phone bubbles keep their time and actions folded away; a tap opens them, like
// a messaging app, so the scene is not covered by a toolbar under every line.
function selectMessage(event, message) {
  if (!props.mobile || message.role === 'system' || message.pending) return;
  if (event.target.closest?.('button, a, summary, textarea, input, .chat-message-actions')) return;
  if (window.getSelection?.()?.toString()) return;
  selectedMessageId.value = selectedMessageId.value === message.id ? '' : message.id;
}
function readEarlierMessages() {
  followingLatestMessage = false;
  readingHistory.value = true;
  transcriptRef.value?.scrollTo({ top: 0, behavior: 'instant' });
}
function returnToLatest() {
  followingLatestMessage = true;
  readingHistory.value = false;
  transcriptRef.value?.scrollTo({ top: transcriptRef.value.scrollHeight, behavior: 'instant' });
}
defineExpose({ readEarlierMessages });
let transcriptObserver;
let followingLatestMessage = true;

function closeMessageMenus(event) {
  if (!props.mobile || (event.type === 'keydown' && event.key !== 'Escape')) return;
  const attachMenu = attachMenuRef.value;
  if (attachMenu?.open && !(event.type === 'pointerdown' && attachMenu.contains(event.target))) attachMenu.open = false;
  for (const menu of transcriptRef.value?.querySelectorAll('.room-message-options[open]') || []) {
    if (event.type === 'pointerdown' && menu.contains(event.target)) continue;
    menu.open = false;
    if (event.type === 'keydown') menu.querySelector('summary')?.focus();
  }
}

// Phone menus open towards whichever side of the transcript has more room, so
// they never slide under the faded top edge or the composer.
function placeMessageMenu(event) {
  const menu = event.currentTarget;
  if (!props.mobile || !menu?.open) return;
  const viewport = transcriptRef.value?.getBoundingClientRect();
  const anchor = menu.querySelector('summary')?.getBoundingClientRect();
  const sheet = menu.querySelector('.chat-message-actions');
  if (!viewport || !anchor || !sheet) return;
  const fadedEdge = 56;
  const above = anchor.top - viewport.top - fadedEdge;
  const below = viewport.bottom - anchor.bottom;
  menu.dataset.placement = above >= sheet.offsetHeight + 8 || above >= below ? 'up' : 'down';
}

function bindTranscript(node) {
  transcriptRef.value = node;
  props.chat.messageListRef.value = node;
}

function followTranscript() {
  const node = transcriptRef.value;
  if (node && followingLatestMessage) node.scrollTop = node.scrollHeight;
  rememberTranscriptPosition();
}

function rememberTranscriptPosition() {
  const node = transcriptRef.value;
  if (node) {
    followingLatestMessage = node.scrollHeight - node.scrollTop - node.clientHeight <= 80;
    readingHistory.value = !followingLatestMessage;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', closeMessageMenus);
  document.addEventListener('keydown', closeMessageMenus);
  // Keep the bottom anchored only while the reader is following the conversation.
  if (typeof ResizeObserver === 'undefined') return;
  transcriptObserver = new ResizeObserver(followTranscript);
  if (transcriptRef.value) transcriptObserver.observe(transcriptRef.value);
});
onBeforeUnmount(() => {
  attachmentRevision++;
  clearTimeout(copiedTimer);
  clearTimeout(noticeTimer);
  transcriptObserver?.disconnect();
  document.removeEventListener('pointerdown', closeMessageMenus);
  document.removeEventListener('keydown', closeMessageMenus);
});

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
  // Only the words are edited; an attached file rides along unchanged.
  editDraft.value = userContent(message).text;
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
  const attached = userContent(message).attachment;
  if ((!nextText && !attached) || editSubmitting.value || generationBusy.value) return;
  editSubmitting.value = true;
  editError.value = '';
  try {
    const result = await props.chat.editAndResend(message.id, attached ? composeDocumentMessage(nextText, attached) : nextText);
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
  // The stylesheet owns the cap: taller on desktop, shorter over the phone scene.
  const cap = Number.parseFloat(getComputedStyle(node).maxHeight) || 112;
  node.style.height = `${Math.min(node.scrollHeight, cap)}px`;
}

function handleComposerKeydown(event) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.shiftKey) return;
  event.preventDefault();
  if (!generationBusy.value && !generationInterrupted.value && !props.chat.resetting.value && !endChatBusy.value) sendMessage();
}

// A text file is folded into the message at the moment of sending. send()
// reads and clears the draft synchronously, so an unchanged draft afterwards
// means the turn was refused (busy, not configured) and the file stays put.
function sendMessage() {
  if (deepseekBusy.value) return;
  if (voice.listening.value) voice.cancel();
  const attached = documentAttachment.value;
  if (attached && attached.owner !== inputOwner()) { documentAttachment.value = null; return; }
  if (!attached) return props.chat.send();
  const draft = props.chat.input.value;
  props.chat.input.value = composeDocumentMessage(draft, attached);
  const result = props.chat.send();
  if (props.chat.input.value) props.chat.input.value = draft;
  else documentAttachment.value = null;
  return result;
}

const canSend = computed(() => Boolean(props.chat.input.value.trim() || props.chat.imageAttachment.value || documentAttachment.value || deepseekInput.value?.files.value.length));

let noticeTimer;
function notify(text) {
  composerNotice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { composerNotice.value = ''; }, 5200);
}

async function attachDocument(file) {
  closeAttachMenu();
  if (!file) return;
  if (deepseekInput.value?.supported()) return deepseekInput.value.attach(file);
  const revision = ++attachmentRevision, owner = inputOwner();
  try {
    const attachment = await readDocumentFile(file);
    if (revision !== attachmentRevision || owner !== inputOwner()) return;
    documentAttachment.value = { ...attachment, owner };
    nextTick(() => composerRef.value?.focus());
  } catch (error) {
    if (revision !== attachmentRevision || owner !== inputOwner()) return;
    notify(error?.message || '文件读取失败，请换一个文件再试');
  }
}

function fileSummary(attachment) {
  return attachment.truncated ? `${attachment.content.length} 字 · 只发送前段` : `${attachment.chars} 字`;
}

function pickImage() {
  closeAttachMenu();
  imageInputRef.value?.click();
}

function pickDocument() {
  closeAttachMenu();
  documentInputRef.value?.click();
}

function closeAttachMenu() {
  if (attachMenuRef.value && props.mobile) attachMenuRef.value.open = false;
}

function handleDrop(event) {
  const files = [...event.dataTransfer?.files || []];
  if (deepseekInput.value?.supported() && files.some(file => !/^image\//.test(file.type))) {
    event.preventDefault();
    deepseekInput.value.attach(files.find(file => !/^image\//.test(file.type)));
    return;
  }
  const textFile = files.find(isDocumentFile);
  if (textFile && !files.some(file => /^image\//.test(file.type))) {
    event.preventDefault();
    attachDocument(textFile);
    return;
  }
  props.chat.onDrop(event);
}

function voiceErrorMessage(code) {
  if (code === 'unsupported') return '这个浏览器不支持语音输入，可以用输入法自带的语音键';
  if (code === 'not-allowed' || code === 'service-not-allowed') return '没有麦克风权限，请在浏览器设置里允许后再试';
  if (code === 'audio-capture') return '没有找到可用的麦克风';
  if (code === 'no-speech') return '没有听到声音，再试一次吧';
  if (code === 'network') return '语音识别服务暂时连不上，可以用输入法自带的语音键';
  return '语音输入没有成功，请再试一次';
}

const voice = useSpeechInput({
  getText: () => props.chat.input.value,
  setText: (text) => { if (voiceOwner === inputOwner()) props.chat.input.value = text; else voice.cancel(); },
  lang: englishRoomLanguage(),
  onError: (code) => notify(voiceErrorMessage(code))
});

function englishRoomLanguage() {
  return isEnglishSite() ? 'en-US' : 'zh-CN';
}

function toggleVoice() {
  if (deepseekInput.value?.supported()) return deepseekInput.value.voice();
  if (!voice.listening.value) { voiceOwner = inputOwner(); composerRef.value?.focus(); }
  voice.toggle();
}

watch(() => props.chat.resetting.value, resetting => { if (resetting) { attachmentRevision++; documentAttachment.value = null; voice.cancel(); } }, { flush: 'sync' });
watch(() => props.chat.input.value, () => nextTick(resizeComposer));
watch(() => props.chat.messages.value.map((message) => message.id), (ids) => {
  if (editingMessageId.value && !ids.includes(editingMessageId.value)) cancelEdit();
});
watch(() => props.chat.messages.value.map(message => `${message.id}:${message.content.length}`), () => {
  // Appending stream chunks follows the bottom, never the reader scrolling history.
  followTranscript();
}, { flush: 'post' });
onMounted(() => nextTick(() => {
  resizeComposer();
  // Initial restored history opens at the latest turn once.
  const node = transcriptRef.value;
  if (node && hasConversation.value) node.scrollTop = node.scrollHeight;
  rememberTranscriptPosition();
}));

const userContentCache = new WeakMap();
function userContent(message) {
  const cached = userContentCache.get(message);
  if (cached?.content === message.content) return cached.value;
  const value = splitDocumentMessage(message.content);
  userContentCache.set(message, { content: message.content, value });
  return value;
}

const knowledgeReplyCache = new WeakMap();
function knowledgeReply(message) {
  const cached = knowledgeReplyCache.get(message);
  if (cached?.content === message.content) return cached.value;
  const value = splitKnowledgeReply(message.content);
  knowledgeReplyCache.set(message, { content: message.content, value });
  return value;
}
function replyParts(message) {
  return message.pending && Array.isArray(message.parts) ? message.parts : splitRoomReply(knowledgeReply(message).text);
}

const endChat = computed(() => props.chat.endChatState?.value || { status: 'idle', visible: false });
const endChatBusy = computed(() => endChat.value.status === 'generating');
const sessionTurns = computed(() => (typeof props.chat.sessionTurnCount === 'function' ? props.chat.sessionTurnCount() : 0));
// The composable owns the fallback name; the panel only renders what it gets.
const characterName = computed(() => String(props.chat.characterName?.value || '').trim() || '角色');
const panelTitle = computed(() => `与${characterName.value}聊天`);
const hasConversation = computed(() => props.chat.messages.value.some((message) => message.role !== 'system'));
const displayedMessages = computed(() => props.chat.messages.value.filter(message => !props.mobile || message.role !== 'system' || !['Live2D 已就绪', 'Live2D is ready'].includes(message.content)));
// The latest reply keeps its actions in view; older turns reveal them on hover,
// focus or (on phones) a tap.
const latestReplyId = computed(() => displayedMessages.value
  .findLast(message => message.role === 'assistant' && !message.pending)?.id || '');
// Only turns written in this visit rise in; restored history renders in place.
// The class is harmless once its one-shot animation has finished.
function isFreshMessage(message) {
  if (message.pending) return true;
  const sentAt = parseAppDate(message.createdAt)?.getTime();
  return Boolean(sentAt) && Date.now() - sentAt < 6000;
}
const englishRoom = isEnglishSite();
const quickMessages = englishRoom
  ? ['How was your day?', 'Let’s talk', 'A little encouragement']
  : ['今天过得怎么样？', '想和你聊聊天', '给我一点鼓励'];

function useQuickMessage(message) {
  props.chat.input.value = message;
  document.getElementById('chatInput')?.focus();
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
  if (status === 'loading') return '正在准备语音';
  if (status === 'playing') return '停止播放';
  return '播放语音';
}

// The play control is a toggle: a second press stops this reply's voice.
function toggleSpeech(message) {
  if (ttsStatus(props.chat, message.id) !== 'idle' && typeof props.chat.stopTTS === 'function') {
    props.chat.stopTTS();
    return;
  }
  props.chat.playTTS(message.speechText || knowledgeReply(message).text, message.id, message.live2d);
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
    <div class="panel-content chat-body" @dragover.prevent @drop="handleDrop">
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
          <button class="room-desktop-history" type="button" :disabled="!hasConversation" aria-label="查看本次对话开头" title="查看本次对话开头" @click="readEarlierMessages"><TsIcon name="history" :size="18" /></button>
          <button
            class="chat-session-new-btn"
            type="button"
            :disabled="generationBusy || chat.resetting.value || endChatBusy"
            :aria-busy="chat.resetting.value"
            title="新建会话"
            aria-label="新建会话"
            @click="chat.startNewSession"
          >
            <TsIcon :class="{ 'ts-status-loader-icon': chat.resetting.value }" :name="chat.resetting.value ? 'loader' : 'squarePen'" :size="16" />
            <span :role="chat.resetting.value ? 'status' : undefined">{{ chat.resetting.value ? '正在新建' : '新建会话' }}</span>
          </button>
        </div>
      </div>
      <div class="room-transcript-viewport">
        <div id="chatMessages" :ref="bindTranscript" class="room-chat-messages" style="overflow-anchor: none" tabindex="0" aria-label="聊天记录" :aria-busy="generationBusy" @scroll.passive="rememberTranscriptPosition">
          <div v-if="!hasConversation" class="room-chat-welcome">
            <span class="room-chat-welcome-avatar" aria-hidden="true"></span>
            <strong>这一刻，慢慢聊</strong>
            <p>今天的小事、想说的话，都可以留在这里。</p>
            <p class="field-hint">先完成聊天设置，再在下方发一句话。收到回复后，就可以继续聊了；语音可以稍后开启。</p>
            <div class="room-chat-welcome-actions">
              <button v-if="chat.canStartConversation()" class="chat-session-new-btn chat-opener-btn" type="button"
                :disabled="chat.sending.value || chat.resetting.value || endChatBusy" :title="`让${characterName}先开口`"
                @click="chat.startConversation()"><TsIcon name="sparkles" :size="16" /><span>我先说</span></button>
              <button v-if="!chat.sharedConversation.value" class="ghost-btn room-chat-guide-btn" type="button" @click="emit('help')">第一次使用 / 发现功能</button>
            </div>
          </div>
          <div
            v-for="message in displayedMessages"
            :key="message.id"
            class="chat-message"
            :class="[message.role, { 'is-failed': message.failed, 'is-streaming': message.pending, 'is-latest': latestReplyId === message.id, 'is-selected': selectedMessageId === message.id, 'is-fresh': isFreshMessage(message) }]"
            :aria-busy="message.pending || undefined"
            @click="selectMessage($event, message)"
          >
            <span v-if="message.role === 'assistant'" class="room-message-avatar" aria-hidden="true"></span>
            <span class="chat-role">{{ message.role === 'assistant' ? characterName : message.role === 'user' ? '你' : '系统' }}</span>
            <span v-if="message.role === 'assistant'" class="room-message-ai">AI</span>
            <RoomChatImage v-if="message.image" :image="message.image" />
            <ul v-if="message.deepseek?.files?.length" class="room-file-list"><li v-for="file in message.deepseek.files" :key="file.id">{{ file.name }}</li></ul>
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
                <button class="chat-tts-btn" type="button" :disabled="editSubmitting" @click="cancelEdit">取消</button>
                <button class="chat-tts-btn chat-edit-submit" type="button" :disabled="editSubmitting || (!editDraft.trim() && !userContent(message).attachment)" @click="submitEdit(message)">保存并重发</button>
              </div>
            </template>
            <template v-else>
              <RoomDeepseekDetails v-if="message.pending && !message.content" :message="message" />
              <span v-if="message.pending && !message.content" class="chat-typing" role="status" :aria-label="`${characterName}正在输入…`"><i></i><i></i><i></i></span>
              <div v-else-if="message.role === 'assistant'" class="chat-reply">
                <NoticeMarkdown v-if="message.deepseek || message.deepseekProgress" class="chat-content chat-reply-part" :content="knowledgeReply(message).text" />
                <div v-else v-for="(part, index) in replyParts(message)" :key="index" class="chat-content chat-reply-part">{{ part }}<span v-if="message.pending && index === replyParts(message).length - 1" class="chat-stream-marker" role="status" aria-label="正在生成回复"></span></div>
              <RoomDeepseekDetails :message="message" />
              </div>
              <template v-else-if="message.role === 'user'">
                <details v-if="userContent(message).attachment" class="chat-file-card">
                  <summary>
                    <span class="chat-file-icon" aria-hidden="true"><TsIcon name="fileText" :size="18" /></span>
                    <span class="chat-file-copy"><strong>{{ userContent(message).attachment.name }}</strong><small>{{ fileSummary(userContent(message).attachment) }}</small></span>
                    <TsIcon class="chat-file-chevron" name="chevronDown" :size="16" />
                  </summary>
                  <pre>{{ userContent(message).attachment.content.slice(0, 6000) }}</pre>
                </details>
                <div v-if="userContent(message).text" class="chat-content">{{ userContent(message).text }}</div>
              </template>
              <div v-else class="chat-content">{{ $ui(message.content) }}</div>
              <div v-if="message.role === 'assistant' && !message.pending && knowledgeReply(message).sources.length" class="chat-knowledge-sources">
                <span>{{ knowledgeReply(message).label }}：</span>
                <a v-for="source in knowledgeReply(message).sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
              </div>
            </template>
            <div v-if="message.role !== 'system'" class="chat-message-footer">
              <button
                v-if="message.role === 'assistant' && !message.pending"
                class="chat-voice-play"
                :class="`is-${ttsStatus(chat, message.id)}`"
                type="button"
                :aria-pressed="ttsStatus(chat, message.id) !== 'idle'"
                :aria-busy="ttsStatus(chat, message.id) === 'loading'"
                @click="toggleSpeech(message)"
              >
                <span class="chat-voice-glyph" aria-hidden="true">
                  <TsIcon v-if="ttsStatus(chat, message.id) === 'loading'" class="ts-status-loader-icon" name="loader" :size="14" />
                  <span v-else-if="ttsStatus(chat, message.id) === 'playing'" class="chat-voice-bars"><i></i><i></i><i></i><i></i></span>
                  <TsIcon v-else name="play" :size="13" :stroke-width="2.4" />
                </span>
                <span>{{ ttsLabel(chat, message.id) }}</span>
              </button>
              <time v-if="!message.pending && messageTime(message.createdAt)" class="chat-message-time" title="UTC+8">{{ messageTime(message.createdAt) }}</time>
              <span v-if="message.failed" class="chat-message-failed">未送达</span>
              <details v-if="!message.pending && editingMessageId !== message.id" class="room-message-options" :open="!mobile" @toggle="placeMessageMenu">
                <summary :aria-label="message.role === 'user' ? '这条消息的操作' : '这条回复的操作'"><TsIcon name="ellipsis" :size="18" /></summary>
                <div v-if="message.role === 'user'" class="chat-message-actions">
                  <button v-if="message.failed && !generationBusy" class="chat-tts-btn chat-action-text" type="button" @click="chat.retryLastTurn()"><TsIcon name="refresh" :size="15" /><span>重试</span></button>
                  <button class="chat-tts-btn room-copy-message" type="button" :aria-label="copyLabel(message, '复制这条消息')" @click="copyMessage(message)"><TsIcon :name="copiedMessageId === message.id ? 'check' : 'copy'" :size="16" /><span class="chat-action-label" aria-hidden="true">{{ copyLabel(message, '复制') }}</span></button>
                  <button v-if="canEditMessage(message)" class="chat-tts-btn" type="button" aria-label="编辑并重发这条消息" @click="beginEdit(message)"><TsIcon name="penLine" :size="16" /><span class="chat-action-label" aria-hidden="true">编辑重发</span></button>
                </div>
                <div v-else class="chat-message-actions">
                  <button class="chat-tts-btn room-copy-message" type="button" :aria-label="copyLabel(message, '复制这条回复')" @click="copyMessage(message)"><TsIcon :name="copiedMessageId === message.id ? 'check' : 'copy'" :size="16" /><span class="chat-action-label" aria-hidden="true">{{ copyLabel(message, '复制') }}</span></button>
                  <button v-if="canRegenerateMessage(message)" class="chat-tts-btn" type="button" aria-label="重新生成" @click="chat.regenerateReply(message.id)"><TsIcon name="refresh" :size="16" /><span class="chat-action-label" aria-hidden="true">重新生成</span></button>
                  <button v-if="chat.getShareTurn(message)" class="chat-tts-btn chat-share-btn" type="button" aria-label="分享这轮对话" @click="emit('share', message)">
                    <TsIcon name="external" :size="16" />
                    <span class="chat-action-label" aria-hidden="true">分享</span>
                  </button>
                </div>
              </details>
            </div>
          </div>
          <div v-if="generationInterrupted" class="chat-generation-notice" :class="generationState.status" :role="generationState.status === 'error' ? 'alert' : 'status'">
            <span>{{ generationMessage }} 请重试或放弃后再发送新消息。</span>
            <span class="chat-generation-actions">
              <button class="chat-tts-btn" type="button" :disabled="generationBusy" @click="chat.discardFailedTurn()">放弃这轮</button>
              <button class="chat-tts-btn chat-generation-retry" type="button" :disabled="generationBusy" @click="chat.retryLastTurn()">重试这轮</button>
            </span>
          </div>
          <div v-else-if="generationState.status === 'preparing' && !chat.messages.value.some((message) => message.pending)" class="chat-generation-notice preparing" role="status">{{ generationMessage }}</div>
        </div>
        <div class="room-transcript-fade" aria-hidden="true"></div>
        <button v-if="readingHistory && hasConversation" class="room-return-latest" type="button" @click="returnToLatest"><TsIcon name="arrowDown" :size="16" /><span>回到最新消息</span></button>
      </div>
      <div v-if="!hasConversation" class="room-chat-suggestions" aria-label="聊天开场建议">
        <button v-for="message in quickMessages" :key="message" type="button" @click="useQuickMessage(message)">{{ message }}</button>
      </div>
      <div v-if="memoryRetrievalNotice(chat.memoryTrace?.value, englishRoom)" class="chat-generation-notice room-memory-trace" role="status"
        :title="[chat.memoryTrace?.value.reason, chat.memoryTrace?.value.fallbackReason].filter(Boolean).join(' / ')">
        {{ memoryRetrievalNotice(chat.memoryTrace?.value, englishRoom) }}
      </div>
      <div v-if="chat.diaryRecordingError?.value" class="chat-generation-notice" role="alert">{{ chat.diaryRecordingError.value }}</div>
      <div v-if="chat.memorySaveError?.value" class="chat-generation-notice" role="status">{{ chat.memorySaveError.value }}</div>
      <UploadProgress v-if="chat.imageUploadState" class="room-image-upload" :state="chat.imageUploadState" @dismiss="chat.dismissImageUpload()" />
      <div v-if="deepseekInput?.supported()" class="room-deepseek-toolbar" aria-label="对话能力">
        <button type="button" :aria-pressed="deepseekInput.features.value.thinking" :disabled="generationBusy" @click="deepseekInput.toggle('thinking')">深度思考</button>
        <button type="button" :aria-pressed="deepseekInput.features.value.search" :disabled="generationBusy" @click="deepseekInput.toggle('search')">联网搜索</button>
        <button type="button" :aria-pressed="deepseekInput.features.value.readUrl" :disabled="generationBusy" @click="deepseekInput.toggle('readUrl')">阅读链接</button>
        <button type="button" :disabled="generationBusy || deepseekBusy" @click="ocrInputRef?.click()">提取文字</button>
        <input ref="ocrInputRef" type="file" hidden accept="image/*,.pdf,.doc,.docx,.ppt,.pptx" aria-label="OCR 提取文字" @change="deepseekInput.attach($event.target.files?.[0], true); $event.target.value = ''">
      </div>
      <p v-if="deepseekInput?.recording.value || deepseekInput?.status.value" class="room-deepseek-notice" role="status">{{ deepseekInput.recording.value ? '正在录音，点击「结束录音」转成文字（最长 2 分钟）' : deepseekInput.status.value }}</p>
      <p v-if="deepseekInput?.error.value" class="room-deepseek-notice" role="alert">{{ deepseekInput.error.value }}</p>
      <ul v-if="deepseekInput?.files.value.length" class="room-file-list"><li v-for="file in deepseekInput.files.value" :key="file.id">{{ file.name }} <button type="button" :aria-label="`移除 ${file.name}`" @click="deepseekInput.remove(file.id)">移除</button></li></ul>
      <p v-if="composerNotice" class="chat-composer-notice" role="status">{{ composerNotice }}</p>
      <div v-if="chat.imageAttachment.value || documentAttachment" class="chat-attachment-tray">
        <div v-if="chat.imageAttachment.value" id="chatImagePreview" class="chat-image-preview">
          <img :src="chat.imageAttachment.value.dataUrl" :alt="chat.imageAttachment.value.name">
          <button class="panel-btn" type="button" aria-label="&#31227;&#38500;" @click="chat.clearImage"><TsIcon name="x" :size="14" /></button>
        </div>
        <div v-if="documentAttachment" class="chat-file-preview">
          <span class="chat-file-icon" aria-hidden="true"><TsIcon name="fileText" :size="20" /></span>
          <span class="chat-file-copy"><strong>{{ documentAttachment.name }}</strong><small>{{ formatFileSize(documentAttachment.size) }} · {{ fileSummary(documentAttachment) }}</small></span>
          <button class="panel-btn" type="button" aria-label="移除文件" @click="attachmentRevision++; documentAttachment = null"><TsIcon name="x" :size="14" /></button>
        </div>
      </div>
      <div class="chat-input-row" :class="{ 'is-busy': generationBusy, 'is-listening': recordingVoice }">
        <input ref="imageInputRef" id="chatImageInput" type="file" accept="image/*" hidden @change="chat.attachImage($event.target.files?.[0]); $event.target.value = ''">
        <input ref="documentInputRef" id="chatFileInput" aria-label="添加对话文件" type="file" :accept="deepseekInput?.supported() ? '*/*' : DOCUMENT_ACCEPT" hidden @change="attachDocument($event.target.files?.[0]); $event.target.value = ''">
        <textarea id="chatInput" ref="composerRef" v-model="chat.input.value" rows="1" :aria-label="englishRoom ? 'Message' : '输入消息'" enterkeyhint="send" :placeholder="recordingVoice ? '正在听，请说话…' : englishRoom ? 'Message, Enter to send' : `和${characterName}说点什么…`" @keydown="handleComposerKeydown"></textarea>
        <details ref="attachMenuRef" class="chat-attach-menu" :open="!mobile">
          <summary aria-label="添加图片或文件"><TsIcon name="plus" :size="22" :stroke-width="2" /></summary>
          <div class="chat-attach-options">
            <button id="attachImageBtn" class="panel-btn chat-attach-btn" type="button" :disabled="generationBusy || chat.imageUploadState?.active" title="&#19978;&#20256;&#22270;&#29255;" aria-label="&#19978;&#20256;&#22270;&#29255;" @click="pickImage">
              <TsIcon name="image" :size="20" :stroke-width="1.9" />
              <span>&#22270;&#29255;</span>
            </button>
            <button id="attachFileBtn" class="panel-btn chat-attach-btn" type="button" :disabled="generationBusy" title="上传文件" aria-label="上传文件" @click="pickDocument">
              <TsIcon name="paperclip" :size="20" :stroke-width="1.9" />
              <span>文件</span>
            </button>
          </div>
        </details>
        <button id="voiceInputBtn" class="panel-btn chat-voice-input" type="button" :class="{ 'is-listening': recordingVoice }" :aria-pressed="recordingVoice" :disabled="(generationBusy || deepseekInput?.working.value) && !recordingVoice" :title="recordingVoice ? '结束录音' : '语音输入'" :aria-label="recordingVoice ? '结束录音' : '语音输入'" @click="toggleVoice">
          <span v-if="recordingVoice" class="chat-voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <TsIcon v-else name="mic" :size="20" :stroke-width="1.9" />
          <span>{{ recordingVoice ? '停止' : '语音' }}</span>
        </button>
        <span class="room-composer-keyhint">Enter 发送 · Shift + Enter 换行</span>
        <button v-if="generationStoppable" id="stopChatBtn" class="panel-btn chat-stop-btn" type="button" aria-label="停止生成" title="停止生成" @click="chat.stopGeneration()">
          <span class="chat-stop-icon" aria-hidden="true"></span>
          <span>停止</span>
        </button>
        <button v-else-if="generationBusy" class="panel-btn chat-stop-btn" type="button" disabled aria-label="正在保存回复"><TsIcon name="loader" :size="18" class="ts-status-loader-icon" /><span>保存中</span></button>
        <button v-else id="sendChatBtn" class="panel-btn" type="button" :disabled="generationInterrupted || chat.resetting.value || chat.imageUploadState?.active || endChatBusy || deepseekBusy || !canSend" aria-label="发送" @click="sendMessage">
          <TsIcon name="arrowUp" :size="19" :stroke-width="2.3" />
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
          <TsIcon v-if="endChatBusy" class="ts-status-loader-icon" name="loader" :size="15" aria-hidden="true" />
          <TsIcon v-else name="book" :size="15" aria-hidden="true" />
          <span class="chat-end-full-label">{{ endChatBusy ? endChatStatusLabel() : englishRoom ? 'End & journal' : '结束聊天并写日记' }}</span>
          <span class="chat-end-short-label" aria-hidden="true">{{ endChatBusy ? (englishRoom ? 'Writing…' : '生成中') : (englishRoom ? 'Journal' : '写日记') }}</span>
        </button>
        <span class="chat-end-hint">
          {{ sessionTurns ? (englishRoom ? `${sessionTurns} messages saved` : `本次已记录 ${sessionTurns} 条对话`) : (englishRoom ? 'Start a conversation' : '先说几句，再结束聊天') }}
        </span>
        <span class="room-ai-disclaimer">AI 角色对话 · 请理性判断生成内容</span>
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

<style scoped>
.chat-knowledge-sources { display: flex; flex-wrap: wrap; gap: 0.4em; width: fit-content; max-width: 100%; margin-top: 0.5em; padding: 0.35em 0.7em; border: 1px solid var(--ts-border); border-radius: 12px; color: var(--ts-text); background: var(--ts-surface-strong); font-size: 0.85em; line-height: 1.6; }
.chat-knowledge-sources a { color: inherit; text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
.room-image-upload.upload-progress-card {
  --panel: var(--ts-surface-strong);
  --text: var(--ts-text);
  --line: var(--ts-border);
  --muted: var(--ts-muted);
  flex: 0 0 auto;
  max-height: min(36dvh, 280px);
  overflow: auto;
  pointer-events: auto;
}
@media (max-width: 860px) {
  .room-image-upload.upload-progress-card { width: calc(100% - 24px); margin: 4px 12px; padding: 10px; gap: 6px; }
}
</style>

<style scoped>
.chat-content.notice-markdown { white-space: normal; }
.room-deepseek-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:.25rem .8rem; padding:.35rem 20px; }
.room-deepseek-toolbar button, .room-file-list button { appearance:none; border:0; background:transparent; color:var(--ts-muted); font:inherit; font-size:.76rem; padding:.5rem 0; cursor:pointer; }
.room-deepseek-toolbar button[aria-pressed="true"] { color:var(--ts-accent); text-decoration:underline; text-underline-offset:5px; }
.room-deepseek-toolbar button:disabled { opacity:.45; cursor:default; }
.room-deepseek-notice { font-size:.78rem; color:var(--ts-muted); margin:.25rem 0; }
.room-file-list { list-style:none; margin:.25rem 0; padding:0; font-size:.8rem; overflow-wrap:anywhere; }
@media(max-width:720px) { .room-deepseek-toolbar { gap:0 .85rem; } .room-deepseek-toolbar button { min-height:44px; } .chat-reply-part :deep(pre), .chat-reply-part :deep(code) { background:transparent; border:0; } }
</style>
