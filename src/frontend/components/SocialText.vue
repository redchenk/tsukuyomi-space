<script setup>
import { computed } from 'vue';

const props = defineProps({
  content: { type: String, default: '' }
});

const emit = defineEmits(['mention', 'topic']);

const TOKEN_PATTERN = /(@([A-Za-z0-9_\-\u4e00-\u9fff\u3040-\u30ff]{2,32}))|(#([A-Za-z0-9_\-\u4e00-\u9fff\u3040-\u30ff]{2,28})#?)/gu;

const parts = computed(() => {
  const text = String(props.content || '');
  const tokens = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, index) });
    }

    if (match[2]) {
      tokens.push({ type: 'mention', text: match[1], value: match[2] });
    } else if (match[4]) {
      tokens.push({ type: 'topic', text: match[3], value: match[4] });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return tokens.map((token, index) => ({ ...token, key: `${token.type}-${index}-${token.value || token.text}` }));
});

function mentionHref(username) {
  return `/users/${encodeURIComponent(username)}`;
}

function topicHref(topic) {
  return `/plaza?topic=${encodeURIComponent(topic)}`;
}
</script>

<template>
  <span class="social-text">
    <template v-for="part in parts" :key="part.key">
      <a
        v-if="part.type === 'mention'"
        class="social-token mention-token"
        :href="mentionHref(part.value)"
        @click.prevent="emit('mention', part.value)"
      >{{ part.text }}</a>
      <a
        v-else-if="part.type === 'topic'"
        class="social-token topic-token"
        :href="topicHref(part.value)"
        @click.prevent="emit('topic', part.value)"
      >{{ part.text }}</a>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
