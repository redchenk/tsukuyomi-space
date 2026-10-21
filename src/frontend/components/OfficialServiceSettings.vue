<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { moneyAtoms, officialRequest, rateAtoms, usageStatus } from '../services/official-service.mjs';
const props = defineProps({ account: { type: String, required: true } });
const emit = defineEmits(['updated']);
const opened = ref(false), settings = ref(null), draft = ref(null), key = ref(''), removeKey = ref(false);
const busy = ref(false), error = ref(''), notice = ref(''), reviews = ref([]), proofs = ref({});
const provider = computed(() => settings.value?.providers.find(item => item.id === draft.value?.provider));
const controller = new AbortController();
onUnmounted(() => { controller.abort(); key.value = ''; });
const api = (path, options = {}) => officialRequest(path, { account: props.account, ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
function apply(data) {
  settings.value = data; draft.value = { ...data, rates: Object.fromEntries(Object.entries(data.rates).map(([name, value]) => [name, moneyAtoms(value)])) };
  key.value = ''; removeKey.value = false;
}
async function run(action) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await action(); } catch (cause) { if (!controller.signal.aborted) error.value = cause.message; }
  finally { busy.value = false; }
}
async function load() {
  await run(async () => {
    const [data, records] = await Promise.all([api('/api/admin/settings'), api('/api/admin/reconciliation')]);
    apply(data); reviews.value = records.items; proofs.value = {};
  });
}
watch(opened, value => { if (value && !settings.value) load(); });
function changeProvider() { key.value = ''; removeKey.value = false; if (draft.value.provider !== settings.value.provider) draft.value.model = ''; }
async function save() {
  await run(async () => {
    const value = draft.value;
    const body = Object.fromEntries(['revision', 'enabled', 'provider', 'model', 'maxInputTokens', 'maxOutputTokens', 'perUserConcurrent', 'requestsPerMinute', 'published', 'usageVerified', 'boundVerified'].map(name => [name, value[name]]));
    // Payment products and amounts remain solely in the existing site manager.
    body.paymentsEnabled = false;
    body.rates = Object.fromEntries(Object.entries(value.rates).map(([name, price]) => [name, rateAtoms(price)]));
    if (key.value) body.apiKey = key.value;
    if (removeKey.value) body.removeKey = true;
    apply(await api('/api/admin/settings', { method: 'POST', body }));
    notice.value = '服务配置已保存，新请求采用新设置。';
  });
}
async function reconcile(item, action) {
  await run(async () => {
    const result = await api('/api/admin/reconcile', { method: 'POST', body: { request_id: item.request_id, action, proof_ref: proofs.value[item.request_id] || '' } });
    const records = await api('/api/admin/reconciliation'); reviews.value = records.items;
    notice.value = result.status === 'settled' ? '核对完成，最终用量已结算。' : result.status === 'released' ? '冻结已释放，核对凭据已留档。' : '核对证据已记录，冻结仍保留，请继续核查。';
  });
}
</script>

<template>
  <details id="service-settings" class="panel payment-service-settings" @toggle="opened = $event.target.open">
    <summary><span>直供服务管理</span><span class="payment-fine">仅维护者可见</span></summary>
    <p v-if="error" class="form-message error" role="alert">{{ error }}</p><p v-if="notice" class="form-message success" role="status">{{ notice }}</p>
    <div class="payment-actions"><button type="button" class="ghost-btn" :disabled="busy" @click="load">重新读取配置</button><button type="button" class="ghost-btn" :disabled="busy" @click="emit('updated')">更新页面用量</button><RouterLink class="ghost-btn" to="/terminal">管理充值商品</RouterLink></div>
    <form v-if="draft" class="payment-settings-form" @submit.prevent="save">
      <fieldset :disabled="busy"><legend>供应商与模型</legend><div class="payment-form-grid"><label>供应商<select v-model="draft.provider" @change="changeProvider"><option v-for="item in settings.providers" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label>模型 ID<input v-model="draft.model" required maxlength="128" pattern="[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}" /></label></div>
        <p class="payment-fine">{{ provider?.host }} · {{ provider?.hasKey ? '已加密保存密钥' : '尚未配置密钥' }}</p>
        <label>更换供应商密钥<input v-model="key" type="password" autocomplete="new-password" placeholder="留空保留已保存的密钥" :disabled="settings.simulation" /></label><label class="payment-check"><input v-model="removeKey" type="checkbox" />删除所选供应商密钥</label>
      </fieldset>
      <fieldset :disabled="busy"><legend>每百万 Token 售价（元）</legend><div class="payment-form-grid payment-form-three"><label>未缓存输入<input v-model="draft.rates.input_uncached" inputmode="decimal" required /></label><label>缓存输入<input v-model="draft.rates.input_cached" inputmode="decimal" required /></label><label>输出<input v-model="draft.rates.output" inputmode="decimal" required /></label></div></fieldset>
      <fieldset :disabled="busy"><legend>请求限制</legend><div class="payment-form-grid"><label>输入 Token 上限<input v-model.number="draft.maxInputTokens" type="number" min="4096" max="262144" required /></label><label>输出 Token 上限<input v-model.number="draft.maxOutputTokens" type="number" min="16" max="16384" required /></label><label>每人并发数<input v-model.number="draft.perUserConcurrent" type="number" min="1" max="4" required /></label><label>每分钟请求数<input v-model.number="draft.requestsPerMinute" type="number" min="1" max="60" required /></label></div></fieldset>
      <fieldset :disabled="busy"><legend>服务状态</legend><label class="payment-check"><input v-model="draft.published" type="checkbox" />公布售价</label><label class="payment-check"><input v-model="draft.usageVerified" type="checkbox" />已核验供应商最终用量协议</label><label class="payment-check"><input v-model="draft.boundVerified" type="checkbox" />已核验请求费用上限</label><label class="payment-check"><input v-model="draft.enabled" type="checkbox" />启用站内直供</label></fieldset>
      <p class="payment-fine">保存后仅影响新请求。充值金额、商品和支付开关沿用网站支付管理。</p>
      <button class="primary-btn" type="submit" :disabled="busy">{{ busy ? '处理中…' : '保存服务配置' }}</button>
    </form>
    <section class="payment-reconciliation"><h3>待核对请求</h3><p v-if="!reviews.length" class="payment-muted">目前没有待核对的请求。</p>
      <article v-for="item in reviews" :key="item.request_id" class="payment-review-row"><h4>{{ item.model }} · {{ usageStatus(item.state) }}</h4><code>{{ item.request_id }}</code><p>冻结 ¥{{ moneyAtoms(item.hold_atoms) }} · {{ item.error_code }}</p><p v-if="item.final_usage || item.observed_usage" class="payment-fine">{{ JSON.stringify(item.final_usage || item.observed_usage) }}</p><label>供应商核对凭据编号<input v-model="proofs[item.request_id]" required minlength="8" maxlength="200" /></label><button class="ghost-btn" type="button" :disabled="busy" @click="reconcile(item, item.final_usage || item.observed_usage ? 'settle' : 'release')">{{ item.final_usage || item.observed_usage ? '按凭据结算' : '凭未消费证明释放' }}</button></article>
    </section>
  </details>
</template>
