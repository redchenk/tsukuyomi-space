<script setup>
import { ref, watch } from 'vue';
import { apiUrl } from '../../api/client';
import { readLocalRoomImage } from '../../services/room/roomChatImages';
const props = defineProps({ image: { type: Object, required: true } });
const source = ref('');
const failed = ref(false);
let revision = 0;
async function load() {
  const current = ++revision;
  failed.value = false;
  source.value = '';
  try {
    const image = props.image;
    const url = image.dataUrl || (image.url ? apiUrl(image.url) : await readLocalRoomImage(image.localId));
    if (current !== revision) return;
    source.value = url || '';
    failed.value = !url;
  } catch (_) { if (current === revision) failed.value = true; }
}
watch(() => props.image, load, { immediate: true });
</script>

<template>
  <div class="room-chat-image">
    <img v-if="source && !failed" class="chat-image-thumb" :src="source" :alt="image.name || '图片'" decoding="async" @error="failed = true">
    <button v-else-if="failed" class="panel-btn" type="button" @click="load">图片暂时无法预览 · 点击重试</button>
    <span v-else role="status">正在加载图片…</span>
  </div>
</template>
