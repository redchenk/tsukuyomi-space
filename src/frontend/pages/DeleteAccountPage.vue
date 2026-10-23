<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import policy from '../../../shared/privacy-policy.json';
import { deletionRequest } from '../services/account-deletion';
const props = defineProps({ user: { type: Object, default: null }, lang: { type: String, default: 'zh' } });
const english = computed(() => props.lang !== 'zh');
const tr = (zh, en) => english.value ? en : zh;
const request = ref(null), loading = ref(true), busy = ref(false), authed = ref(false), error = ref(''), confirmed = ref(false);
let revision = 0;
const sections = computed(() => policy[english.value ? 'en' : 'zh'].sections.slice(7, 10));
const active = computed(() => ['pending', 'processing'].includes(request.value?.status));
const status = computed(() => ({ pending: tr('等待站长核验', 'Awaiting verification'), processing: tr('站长处理中', 'Being processed'), cancelled: tr('已撤回申请', 'Request cancelled'), completed: tr('已完成处理', 'Completed') })[request.value?.status]);
const mail = computed(() => `mailto:${policy.contact}?subject=${encodeURIComponent('月读空间 / Tsukuyomi Space 账号注销申请')}`);
async function run(action) {
  const current = ++revision;
  busy.value = true; error.value = '';
  try {
    const result = await action();
    if (current !== revision) return;
    request.value = result; authed.value = true; confirmed.value = false;
  } catch (cause) {
    if (current !== revision) return;
    if ([401, 403].includes(cause.status)) { authed.value = false; request.value = null; }
    else error.value = cause.message;
  } finally { if (current === revision) { loading.value = false; busy.value = false; } }
}
function load() { return run(() => deletionRequest('/api/account-deletion/me')); }
function submit() { if (!confirmed.value || busy.value || active.value) return; return run(() => deletionRequest('/api/account-deletion', { confirmation: 'DELETE_ACCOUNT', policyVersion: policy.version })); }
function cancel() { if (busy.value || request.value?.status !== 'pending') return; const id = request.value.id; return run(() => deletionRequest(`/api/account-deletion/${encodeURIComponent(id)}/cancel`, {})); }
watch(() => props.user?.id, () => { request.value = null; authed.value = false; confirmed.value = false; loading.value = true; load(); }, { immediate: true });
onUnmounted(() => { revision++; });
</script>
<template>
  <main class="page privacy-page">
    <header class="privacy-heading"><span class="eyebrow">TSUKUYOMI · ACCOUNT & DATA</span><h1>{{ tr('申请注销账号', 'Request account deletion') }}</h1><p class="privacy-meta">{{ policy.app }}</p><p>{{ tr('由站长核验身份并处理，通常在收到申请后 30 日内完成。提交申请不会立即删除账号或扣除余额。', 'The administrator verifies and handles your request, normally within 30 days of receipt. Submitting does not immediately delete your account or deduct your balance.') }}</p></header>
    <section class="panel privacy-section privacy-request-layout" aria-labelledby="request-heading">
      <div class="privacy-request-main">
        <h2 id="request-heading">{{ tr('提交与进度', 'Request and status') }}</h2>
        <p v-if="loading" role="status">{{ tr('正在读取申请状态…', 'Loading request status…') }}</p>
        <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
        <template v-if="!loading">
          <div v-if="request" class="privacy-receipt" role="status"><strong>{{ status }}</strong><p>{{ tr('申请编号', 'Reference') }}：<code>{{ request.id }}</code></p><p>{{ tr('预计处理日期', 'Expected handling date') }}：{{ request.due_at.slice(0, 10) }}</p><p v-if="request.resolution">{{ request.resolution }}</p><p>{{ tr('完成后会通过核验后的邮箱通知。请保存申请编号。', 'Completion will be sent to your verified email. Please keep your reference number.') }}</p></div>
          <form v-if="authed && !active && !error" @submit.prevent="submit">
            <label class="privacy-confirm"><input v-model="confirmed" type="checkbox" :disabled="busy"><span>{{ tr('我已阅读下方的数据范围与余额处理说明，申请注销当前登录的月读空间账号及其关联数据。', 'I have read the data and balance information below and request deletion of my signed-in Tsukuyomi Space account and associated data.') }}</span></label>
            <button class="primary-btn" :disabled="!confirmed || busy" type="submit">{{ busy ? tr('正在提交…', 'Submitting…') : tr('提交注销申请', 'Submit deletion request') }}</button>
          </form>
          <div class="privacy-actions"><button v-if="request?.status === 'pending'" class="ghost-btn" :disabled="busy" @click="cancel">{{ tr('撤回申请', 'Cancel request') }}</button><button class="ghost-btn" :disabled="busy" @click="load">{{ tr('刷新状态', 'Refresh status') }}</button><RouterLink v-if="!authed" class="primary-btn" to="/login?redirect=/delete-account">{{ tr('登录后在线提交', 'Sign in to submit') }}</RouterLink></div>
        </template>
      </div>
      <aside class="privacy-request-help" aria-labelledby="request-help-heading">
        <h3 id="request-help-heading">{{ tr('无法登录或已卸载 App？', 'Cannot sign in or already uninstalled?') }}</h3><p>{{ tr('无需重新安装。请从绑定邮箱发送邮件，说明用户名和注销或部分数据删除请求；不要提供密码、验证码或 API 密钥。', 'No reinstall is required. Email us from your linked address with your username and account or selected-data deletion request. Do not send passwords, verification codes or API keys.') }}</p><a :href="mail">{{ policy.contact }}</a>
      </aside>
    </section>
    <section v-for="section in sections" :key="section.title" class="panel privacy-section"><h2>{{ section.title }}</h2><p v-for="p in section.paragraphs" :key="p">{{ p }}</p></section>
    <RouterLink class="ghost-btn" to="/privacy">{{ tr('阅读完整隐私政策', 'Read the full privacy policy') }}</RouterLink>
  </main>
</template>
