<script setup>
import { computed } from 'vue';
import deepseek from '../../../../shared/deepseek-chat.cjs';
const props = defineProps({ message: { type: Object, required: true } });
const progress = computed(() => props.message.deepseekProgress || {});
const sources = computed(() => props.message.deepseek ? deepseek.sources(props.message.deepseek) : progress.value.sources || []);
const activity = computed(() => (progress.value.events || props.message.deepseek?.server_tool_calls?.flatMap(step => step.calls || []) || []).map(call => ({
  id: call.id,
  text: call.action?.type === 'search' ? `搜索：${(call.action.queries || []).join('、')}` : `阅读：${call.action?.url || '网页'}`,
  done: call.status === 'completed', failed: call.status === 'failed'
})));
</script>

<template>
  <div v-if="message.deepseek || message.deepseekProgress" class="room-deepseek-details">
    <details v-if="progress.reasoning" class="room-deepseek-thinking">
      <summary>{{ message.pending ? '正在思考' : '思考过程' }}</summary>
      <p>{{ progress.reasoning }}</p>
    </details>
    <details v-if="activity.length" :open="message.pending || undefined" class="room-deepseek-activity">
      <summary>{{ message.pending ? '正在查阅资料' : `已查阅 ${activity.length} 项资料` }}</summary>
      <ul><li v-for="item in activity" :key="item.id">{{ item.text }}<span v-if="item.failed"> · 未成功</span><span v-else-if="item.done"> · 完成</span></li></ul>
    </details>
    <nav v-if="sources.length" class="room-deepseek-sources" aria-label="回答来源">
      <a v-for="(source, index) in sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ index + 1 }}. {{ source.title }}</a>
    </nav>
    <p v-if="message.deepseek?.truncated || progress.truncated" role="status">本轮达到输出上限，已保留收到的内容。可继续追问。</p>
  </div>
</template>

<style scoped>
.room-deepseek-details { min-width: 0; font-size: .8rem; color: var(--ts-muted); line-height: 1.65; }
summary { cursor: pointer; padding: .35rem 0; }
p { white-space: pre-wrap; overflow-wrap: anywhere; margin: .4rem 0; }
ul { padding-left: 1.2em; margin: .25rem 0; overflow-wrap: anywhere; }
.room-deepseek-sources { display: flex; flex-wrap: wrap; gap: .3rem 1rem; margin-top: .6rem; }
a { color: var(--ts-accent); text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
</style>
