<script setup>
import { ref } from 'vue';
import OfficialServiceSettings from '../OfficialServiceSettings.vue';
import OfficialSpeechSettings from './OfficialSpeechSettings.vue';
import OfficialUsagePanel from './OfficialUsagePanel.vue';
defineProps({ request: { type: Function, required: true }, revision: { type: Number, required: true } });
const tab = ref('llm');
const sections = [{ id:'llm', label:'语言模型' }, { id:'tts', label:'语音合成' }, { id:'usage', label:'调用统计' }];
</script>
<template>
  <div class="services-manager">
    <nav class="manager-tabs" aria-label="官方服务视图">
      <button v-for="item in sections" :key="item.id" type="button" :aria-pressed="tab === item.id" @click="tab = item.id">{{ $ui(item.label) }}</button>
    </nav>
    <KeepAlive>
      <OfficialServiceSettings v-if="tab === 'llm'" :key="'llm' + revision" :request="request" />
      <OfficialSpeechSettings v-else-if="tab === 'tts'" :key="'tts' + revision" :request="request" />
      <OfficialUsagePanel v-else :request="request" :revision="revision" />
    </KeepAlive>
  </div>
</template>
