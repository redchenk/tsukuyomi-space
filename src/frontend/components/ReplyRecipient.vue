<script setup>
import { computed } from 'vue';
import { replyCopy } from '../services/messageThreads.mjs';
const props = defineProps({ target: { type: Object, required: true }, prefix: { type: String, required: true }, lang: { type: String, default: 'zh' } });
const copy = computed(() => replyCopy(props.lang));
defineEmits(['navigate']);
</script>

<template>
  <p class="message-reply-recipient"><span>{{ copy.to }}</span> <a v-if="target.id" :href="`#${prefix}-${target.id}`" @click="$emit('navigate', target.id)">{{ target.name || copy.unknown }}</a><span v-else>{{ target.name || copy.unknown }}</span></p>
</template>
