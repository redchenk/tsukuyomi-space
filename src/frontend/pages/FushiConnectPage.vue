<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiFetch, loadCurrentSession, parseResponse } from '../api/client';

const emit = defineEmits(['go']);
const session = ref(null);
const ready = ref(false);
const busy = ref(false);
const error = ref('');
const request = Object.fromEntries(new URLSearchParams(window.location.search));
const clientLabel = computed(() => request.client_id === 'tsukuyomi-fushi-astrbot' ? 'AstrBot' : '社区助手客户端');
const loginPath = computed(() => `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
onMounted(async () => {
  try { session.value = await loadCurrentSession(); }
  catch (_) { error.value = '暂时无法确认登录状态，请稍后重试。'; }
  finally { ready.value = true; }
});
async function authorize(approve) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try {
    const response = await apiFetch('/api/fushi/oauth/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, approve })
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || '授权失败');
    // The backend validates the configured OAuth client and exact redirect URI.
    window.location.assign(result.data.redirect);
  } catch (cause) { error.value = cause.message === 'access_denied' ? '请使用 Fushi 专属普通账号登录，再确认授权。' : cause.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="fushi-connect" data-material="content">
    <p class="eyebrow">FUSHI · COMMUNITY ASSISTANT</p>
    <h1>连接社区助手</h1>
    <p>允许 {{ clientLabel }} 使用 Fushi 专属账号处理相关讨论。网页账号的管理权限不会授予插件。</p>
    <ul>
      <li>读取其他用户对 Fushi 内容的公开回复和讨论上下文。</li>
      <li>以 Fushi 提交普通回复，遵循现有内容审核。</li>
      <li v-if="(request.scope || '').split(' ').includes('fushi:events')">订阅已审核通过的回复事件。</li>
      <li>查询回复是否已保存。</li>
    </ul>
    <p>访问令牌有效 15 分钟，插件自动刷新并续期授权，持续使用无需手动更换令牌。连续 180 天未续期后需要重新连接。可撤销授权或修改账号密码以终止访问。</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="!ready">正在确认登录状态…</p>
    <div v-else-if="!session" class="actions">
      <button type="button" class="primary-btn" @click="emit('go', loginPath)">登录 Fushi 账号</button>
    </div>
    <div v-else class="actions">
      <button type="button" class="ghost-btn" :disabled="busy" @click="authorize(false)">取消授权</button>
      <button type="button" class="primary-btn" :disabled="busy" @click="authorize(true)">{{ busy ? '正在处理…' : '确认连接' }}</button>
    </div>
  </main>
</template>

<style scoped>
.fushi-connect { max-width: 720px; margin: 48px auto; padding: clamp(24px, 5vw, 48px); border: 1px solid var(--ts-border); border-radius: var(--ts-radius-card); }
.fushi-connect p, .fushi-connect li { line-height: 1.8; }
.eyebrow { font-size: .75rem; letter-spacing: .12em; opacity: .7; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
.actions button { border-radius: var(--ts-radius-button); padding: 12px 22px; }
.error { color: var(--ts-color-pink-600); }
</style>
