<script setup>
import { ref, watch } from 'vue';
import { apiFetch } from '../api/client';
import { moneyAtoms } from '../services/official-service.mjs';
const props = defineProps({ account: { type: String, required: true } });
const rows = ref([]), error = ref(''), loading = ref(false);
let version = 0;
async function refresh() {
  const current = ++version; loading.value = true; error.value = '';
  try {
    const response = await apiFetch('/api/tts/official/jobs', { headers: { 'X-TTS-Account': props.account }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || '暂时无法读取语音账单');
    if (current === version) rows.value = result.data;
  } catch (cause) { if (current === version) error.value = cause.message; }
  finally { if (current === version) loading.value = false; }
}
watch(() => props.account, () => { rows.value = []; void refresh(); }, { immediate: true });
const labels = { processing: '合成中，金额预留', ready: '已合成', failed: '失败，未扣费', expired: '已合成，缓存过期' };
</script>
<template>
  <section class="panel payment-history" aria-label="官方语音账单">
    <div class="payment-actions"><h2>官方语音账单</h2><button class="ghost-btn" type="button" :disabled="loading" @click="refresh">刷新语音记录</button></div>
    <p>¥0.05 / 条 · 与聊天共用网站余额。显示最近 30 条合成记录。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!rows.length">{{ loading ? '正在读取…' : '暂无语音记录。' }}</p>
    <article v-for="row in rows" :key="row.id" class="payment-history-row">
      <div><h3>八千代语音</h3><p>{{ new Date(row.createdAt).toLocaleString() }}</p></div>
      <div><strong>¥{{ moneyAtoms(row.chargedAtoms) }}</strong><p>{{ $ui(labels[row.state]) }}</p></div>
    </article>
  </section>
</template>
