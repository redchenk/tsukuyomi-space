<script setup>
import { ref } from 'vue';

const props = defineProps({
  msgId: { type: [Number, String], required: true },
  onSubmit: { type: Function, required: true },
  t: { type: Object, required: true }
});

const emit = defineEmits(['cancel']);
const text = ref('');
const submitting = ref(false);

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
  <div :aria-busy="submitting">
    <textarea v-model="text" class="plaza-textarea plaza-reply-textarea" maxlength="220" :placeholder="t.replyContentRequired"></textarea>
    <div class="plaza-msg-footer">
      <button class="primary-btn" type="button" :disabled="submitting" :aria-busy="submitting" @click="submit">{{ t.publishReply }}</button>
      <button class="ghost-btn" type="button" :disabled="submitting" @click="emit('cancel')">{{ t.cancel }}</button>
    </div>
    <StatusLoader v-if="submitting" :label="t.syncing" compact />
  </div>
</template>
