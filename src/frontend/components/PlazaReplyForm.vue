<script setup>
import { computed, onMounted, ref } from 'vue';
import { replyCopy } from '../services/messageThreads.mjs';

const props = defineProps({
  msgId: { type: [Number, String], required: true },
  onSubmit: { type: Function, required: true },
  t: { type: Object, required: true },
  target: { type: Object, default: () => ({}) },
  lang: { type: String, default: 'zh' },
  variant: { type: String, default: 'plaza' }
});

const emit = defineEmits(['cancel']);
const text = ref('');
const submitting = ref(false);
const input = ref(null);
const copy = computed(() => replyCopy(props.lang));
const label = computed(() => `${copy.value.to} ${props.target.author || copy.value.unknown}`);
onMounted(() => input.value?.focus({ preventScroll: true }));

async function submit() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const ok = await props.onSubmit(props.msgId, text.value);
    if (ok) text.value = '';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="message-reply-form" :aria-busy="submitting">
    <p class="message-reply-heading">{{ label }}</p>
    <blockquote v-if="target.content" class="message-reply-quote">{{ target.content.slice(0, 100) }}{{ target.content.length > 100 ? '…' : '' }}</blockquote>
    <textarea ref="input" v-model="text" :class="variant === 'article' ? 'comment-input' : 'plaza-textarea plaza-reply-textarea'" maxlength="220" :aria-label="label" :placeholder="t.replyContentRequired"></textarea>
    <div :class="variant === 'article' ? 'comment-actions' : 'plaza-msg-footer'">
      <button class="primary-btn" type="button" :disabled="submitting" :aria-busy="submitting" @click="submit">{{ t.publishReply }}</button>
      <button class="ghost-btn" type="button" :disabled="submitting" @click="emit('cancel')">{{ copy.cancel }}</button>
    </div>
    <StatusLoader v-if="submitting" :label="t.syncing" compact />
  </div>
</template>
