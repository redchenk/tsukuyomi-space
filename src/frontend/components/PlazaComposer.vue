<script setup>
import { computed, nextTick, ref } from 'vue';
import TsIcon from './TsIcon.vue';

const props = defineProps({
  onSubmit: { type: Function, required: true },
  t: { type: Object, required: true },
  lang: { type: String, default: 'zh' }
});

const text = ref('');
const submitting = ref(false);
const input = ref(null);
const charCount = computed(() => `${text.value.length} / 300`);
const copy = computed(() => props.lang === 'en'
  ? { greeting: 'Greeting', feedback: 'Feedback', idea: 'Idea', topic: 'Topic', mention: 'Mention', hint: 'Use #topic# or @username to join a conversation.' }
  : props.lang === 'ja'
  ? { greeting: '挨拶', feedback: 'フィードバック', idea: 'アイデア', topic: '話題', mention: 'メンション', hint: '#話題# や @ユーザー名 を使って会話に参加。' }
  : { greeting: '问候', feedback: '反馈', idea: '灵感', topic: '话题', mention: '提及', hint: '用 #话题# 或 @用户名，找到同频的朋友。' });
const moods = computed(() => [
  { prefix: `【${copy.value.greeting}】`, label: copy.value.greeting },
  { prefix: `【${copy.value.feedback}】`, label: copy.value.feedback },
  { prefix: `【${copy.value.idea}】`, label: copy.value.idea }
]);

async function insert(value, { prefix = false, select = 0, suffix = 0 } = {}) {
  const start = prefix ? 0 : (input.value?.selectionStart ?? text.value.length);
  const end = prefix ? 0 : (input.value?.selectionEnd ?? start);
  if (text.value.length - (end - start) + value.length > 300) return;
  text.value = text.value.slice(0, start) + value + text.value.slice(end);
  await nextTick();
  input.value?.focus({ preventScroll: true });
  input.value?.setSelectionRange(start + value.length - suffix - select, start + value.length - suffix);
}

async function submit() {
  if (submitting.value || !text.value.trim()) return;
  submitting.value = true;
  try {
    const ok = await props.onSubmit(text.value);
    if (ok) text.value = '';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div :aria-busy="submitting">
    <div class="plaza-composer-top">
      <label for="plaza-message-input">{{ t.publish }}</label>
      <span class="plaza-char-count">{{ charCount }}</span>
    </div>
    <textarea id="plaza-message-input" ref="input" v-model="text" class="plaza-textarea" maxlength="300" :placeholder="t.composerPlaceholder" @keydown.ctrl.enter.prevent="submit" @keydown.meta.enter.prevent="submit"></textarea>
    <div class="plaza-moods">
      <button v-for="mood in moods" :key="mood.prefix" class="chip" type="button" :disabled="submitting" @click="insert(mood.prefix + ' ', { prefix: true })">
        {{ mood.label }}
      </button>
      <button class="chip" type="button" :disabled="submitting" @click="insert('#' + copy.topic + '#', { select: copy.topic.length, suffix: 1 })"><TsIcon name="message" :size="15" />{{ copy.topic }}</button>
      <button class="chip" type="button" :disabled="submitting" @click="insert('@')"><TsIcon name="user" :size="15" />{{ copy.mention }}</button>
    </div>
    <div class="plaza-composer-actions">
      <span class="plaza-char-count">{{ copy.hint }}</span>
      <button class="primary-btn" type="button" :disabled="submitting || !text.trim()" :aria-busy="submitting" @click="submit"><TsIcon name="send" :size="16" />{{ t.publish }}</button>
    </div>
    <StatusLoader v-if="submitting" :label="t.syncing" compact />
  </div>
</template>
