<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { apiFetch } from '../../api/client';
const emit = defineEmits(['status']);
const state = ref(null), checking = ref(false);
let timer, disposed = false;
async function refresh() {
  if (checking.value) return;
  checking.value = true;
  try {
    const response = await apiFetch('/api/tts/official/status', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error();
    if (!disposed) state.value = result.data;
  } catch (_) { if (!disposed) state.value = { online: false, reason: 'offline' }; }
  finally {
    if (!disposed) { checking.value = false; emit('status', state.value); }
  }
}
function visible() { if (!document.hidden) void refresh(); }
onMounted(() => { void refresh(); timer = setInterval(visible, 15000); document.addEventListener('visibilitychange', visible); });
onBeforeUnmount(() => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible); });
</script>
<template>
  <div class="official-tts-status" aria-live="polite">
    <div class="official-tts-heading">
      <strong>官方直供 · 八千代语音</strong>
      <span :class="['official-tts-badge', { online: state?.online }]">{{ state?.online ? '算力在线' : !state ? '检测中' : '算力离线' }}</span>
    </div>
    <p>¥0.05 / 条 · 使用网站余额，无需填写 API 密钥。成功合成后扣费，失败不收费。超级管理员沿用无限额度。</p>
    <p class="field-hint">{{ state?.online ? '可选用官方直供。离线时自动暂停，恢复在线后即可继续使用。' : '当前暂不可用，算力恢复后会自动开放。你也可以使用自己配置的语音服务。' }} 每条最多 1,000 字，同一页面会话内缓存有效时重播不重复扣费；缓存最长保留 24 小时。</p>
    <div class="button-row">
      <button class="ghost-btn" type="button" :disabled="checking" @click="refresh">{{ checking ? '正在检测…' : '检测算力' }}</button>
      <a class="text-btn" href="/payments">余额与充值</a>
    </div>
  </div>
</template>
<style scoped>
.official-tts-status { padding: 18px; border: 1px solid var(--ts-border, #ddd); border-radius: 16px; background: var(--ts-surface-soft, rgba(255,255,255,.35)); margin: 16px 0; }
.official-tts-heading { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.official-tts-badge { font-size: 12px; border: 1px solid currentColor; border-radius: 999px; padding: 3px 10px; color: var(--ts-text-muted); white-space: nowrap; }
.official-tts-badge.online { color: var(--ts-accent); }
.official-tts-status p { line-height: 1.8; overflow-wrap: anywhere; margin: 10px 0; }
.official-tts-status .button-row { flex-wrap: wrap; align-items: center; gap: 16px; }
.official-tts-status a { color: var(--ts-accent); text-underline-offset: 4px; }
</style>
