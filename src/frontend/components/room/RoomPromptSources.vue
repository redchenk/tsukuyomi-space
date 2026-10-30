<script setup>
defineProps({ trace: { type: Object, required: true } });
</script>

<template>
  <div class="room-prompt-sources">
    <p data-prompt-source="card">角色卡参考：<span v-if="!trace.cardReference?.available">未载入</span><span v-else-if="!trace.cardReference.enabled">已关闭</span><span v-else-if="trace.cardReference.included">已带入</span><span v-else>因篇幅限制未带入</span></p>
    <p data-prompt-source="world">世界书：<span v-if="!trace.worldBook.available">未载入</span><span v-else-if="!trace.worldBook.enabled">已关闭</span><span v-else-if="trace.worldBook.selected.length">已带入 {{ trace.worldBook.selected.length }} 条</span><span v-else-if="trace.worldBook.omitted.length">因篇幅限制未带入</span><span v-else>已开启，本轮未命中</span></p>
  </div>
</template>

<style scoped>
.room-prompt-sources { display: grid; gap: 4px; }
.room-prompt-sources p { margin: 0; font-size: inherit; line-height: 1.6; }
</style>
