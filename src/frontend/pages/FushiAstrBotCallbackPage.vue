<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const params = new URLSearchParams(window.location.search);
const valid = !params.has('error')
  && ['code', 'state', 'iss'].every(key => params.getAll(key).length === 1)
  && params.get('iss') === window.location.origin
  && /^[A-Za-z0-9_-]{43}$/.test(params.get('code') || '')
  && /^[A-Za-z0-9_-]{43}$/.test(params.get('state') || '');
const command = valid ? `/Fushi确认 ${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({
  code: params.get('code'), state: params.get('state'), iss: params.get('iss')
})))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}` : '';
const denied = params.get('error') === 'access_denied';
const copied = ref(false);
// The one-use code stays in memory, never localStorage or subsequent navigation.
window.history.replaceState(window.history.state, '', window.location.pathname);
useRouter().replace({ path: window.location.pathname });
async function copy() {
  try { await navigator.clipboard.writeText(command); copied.value = true; }
  catch (_) { copied.value = false; }
}
</script>

<template>
  <main class="fushi-callback" data-material="content">
    <p class="eyebrow">FUSHI × ASTRBOT</p>
    <h1>{{ command ? '最后一步，回到机器人私聊' : denied ? '已取消连接' : '授权链接已失效' }}</h1>
    <template v-if="command">
      <p>复制下方指令，在发起登录的机器人私聊中发送。请在 90 秒内完成，超时后重新发送 /Fushi登录。</p>
      <textarea aria-label="一次性授权确认指令" readonly :value="command" rows="5"></textarea>
      <button class="primary-btn" type="button" @click="copy">{{ copied ? '已复制' : '复制确认指令' }}</button>
      <p class="hint">指令只包含一次性授权码；网站密码和访问令牌不会显示在这里。请使用自己的机器人私聊完成连接。</p>
    </template>
    <p v-else>返回机器人私聊，发送 /Fushi登录 后重新打开授权页面。</p>
  </main>
</template>

<style scoped>
.fushi-callback { width: min(680px, calc(100% - 32px)); margin: 112px auto 48px; padding: clamp(24px, 5vw, 44px); border: 1px solid var(--ts-border); border-radius: var(--ts-radius-card); }
.eyebrow { font-size: .75rem; letter-spacing: .15em; opacity: .7; }
p { line-height: 1.8; }
textarea { box-sizing: border-box; width: 100%; resize: vertical; padding: 16px; border: 1px solid var(--ts-border); border-radius: var(--ts-radius-control); background: var(--ts-editorial-low); color: inherit; overflow-wrap: anywhere; font: inherit; }
button { margin-top: 16px; padding: 12px 24px; border-radius: var(--ts-radius-button); }
.hint { font-size: .85rem; opacity: .7; }
</style>
