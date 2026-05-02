<script setup>
import { ref } from 'vue';

const props = defineProps({
  msgId: { type: [Number, String], required: true },
  onSubmit: { type: Function, required: true },
  t: { type: Object, required: true }
});

const emit = defineEmits(['cancel']);
const text = ref('');

async function submit() {
  const ok = await props.onSubmit(props.msgId, text.value);
  if (ok) text.value = '';
}
</script>

<template>
  <div>
    <textarea v-model="text" class="plaza-textarea plaza-reply-textarea" maxlength="220" :placeholder="t.replyContentRequired"></textarea>
    <div class="plaza-msg-footer">
      <button class="primary-btn" type="button" @click="submit">{{ t.publishReply }}</button>
      <button class="ghost-btn" type="button" @click="emit('cancel')">{{ t.cancel }}</button>
    </div>
  </div>
</template>
