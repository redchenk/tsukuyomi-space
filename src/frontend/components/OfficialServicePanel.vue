<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { assertDashboardAccount, moneyAtoms, officialRequest, usageStatus } from '../services/official-service.mjs';
import { formatDateTime } from '../utils/time';
import OfficialServiceSettings from './OfficialServiceSettings.vue';

const props = defineProps({ siteUserId: { type: String, required: true } });
const emit = defineEmits(['wallet-updated']);
const dashboard = ref(null), loading = ref(false), error = ref(''), usage = ref(null), statement = ref(null);
const usageError = ref('');
const month = ref(new Date().toISOString().slice(0, 7)), moreBusy = ref(false), monthBusy = ref(false);
const maxMonth = new Date().toISOString().slice(0, 7);
const account = computed(() => dashboard.value?.me.account_id);
let disposed = false, generation = 0;
const controllers = new Set();
function cancel() { for (const controller of controllers) controller.abort(); controllers.clear(); }
async function request(path, options = {}) {
  const controller = new AbortController(); controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await officialRequest(path, { account: account.value, ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); controllers.delete(controller); }
}
async function load() {
  const revision = ++generation; cancel(); loading.value = true; error.value = ''; usageError.value = '';
  // Hide account-specific records until a fresh main-site identity is verified.
  dashboard.value = null; usage.value = null; statement.value = null;
  try {
    const data = assertDashboardAccount(await request('/api/dashboard'), props.siteUserId);
    if (disposed || revision !== generation) return;
    dashboard.value = data; usage.value = data.usage; statement.value = data.statement;
    if (data.wallet_backend === 'site' && data.wallet) emit('wallet-updated', data.wallet);
    month.value = data.statement.month;
  } catch (cause) { if (!disposed && revision === generation) error.value = cause.message; }
  finally { if (!disposed && revision === generation) loading.value = false; }
}
async function loadMonth() {
  if (monthBusy.value || !account.value) return;
  monthBusy.value = true; usageError.value = ''; statement.value = null;
  const revision = generation;
  try {
    const data = await request(`/api/statements/monthly?month=${encodeURIComponent(month.value)}`);
    if (!disposed && revision === generation) statement.value = data;
  } catch (cause) { if (!disposed && revision === generation) usageError.value = cause.message; }
  finally { monthBusy.value = false; }
}
async function more() {
  if (!usage.value?.next_cursor || moreBusy.value) return;
  const revision = generation; moreBusy.value = true; usageError.value = '';
  try {
    const data = await request(`/api/usage?cursor=${encodeURIComponent(usage.value.next_cursor)}`);
    if (!disposed && revision === generation) usage.value = { ...data, items: [...usage.value.items, ...data.items] };
  } catch (cause) { if (!disposed && revision === generation) usageError.value = cause.message; }
  finally { moreBusy.value = false; }
}
onMounted(load);
onUnmounted(() => { disposed = true; generation++; cancel(); });
defineExpose({ reload: load });
</script>

<template>
  <section id="models" class="panel payment-models" aria-labelledby="payment-models-title" :aria-busy="loading">
    <div class="payment-section-heading"><div><span class="eyebrow">OFFICIAL API</span><h2 id="payment-models-title">站内直供</h2></div><button type="button" class="ghost-btn" :disabled="loading" @click="load">{{ loading ? '读取中…' : '刷新用量' }}</button></div>
    <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取模型与用量…</p>
    <p v-else-if="!dashboard">暂时无法读取直供服务。充值与订单仍可独立使用。</p>
    <template v-if="dashboard">
      <p class="payment-muted">在 Room 设置选择“站内直供”，即可使用网站余额聊天。</p>
      <article v-for="model in dashboard.models" :key="model.id" class="payment-model-card">
        <div class="payment-section-heading"><div><h3>{{ model.id }}</h3><p class="payment-muted">{{ model.provider }} · {{ model.capabilities?.vision ? '文字与图片' : '文字' }} · 最多输出 {{ model.max_output_tokens }} Token</p></div><span class="payment-badge" :class="{ 'is-muted': !model.enabled }">{{ model.enabled ? '服务已启用' : '暂未开放' }}</span></div>
        <p v-if="model.capabilities?.vision" class="payment-muted">Room 可直接发送图片，图片与文字按实际 Token 用量统一计费。</p>
        <dl v-if="model.price" class="payment-price-grid">
          <div><dt>输入 · 未命中缓存</dt><dd>¥{{ moneyAtoms(model.price.rates_per_million_money_atoms.input_uncached) }}</dd></div>
          <div><dt>输入 · 命中缓存</dt><dd>¥{{ moneyAtoms(model.price.rates_per_million_money_atoms.input_cached) }}</dd></div>
          <div><dt>输出</dt><dd>¥{{ moneyAtoms(model.price.rates_per_million_money_atoms.output) }}</dd></div>
        </dl>
        <p v-else class="payment-muted">售价尚未公布。</p>
      </article>
      <p class="payment-fine">单价为每百万 Token 的人民币金额。请求接纳时锁定售价，按最终用量结算；冻结金额尚未扣费。</p>
      <RouterLink class="ghost-btn" to="/room/settings">前往聊天模型设置</RouterLink>
    </template>
  </section>

  <section id="usage" class="panel payment-usage" aria-labelledby="payment-usage-title">
    <div class="payment-section-heading"><div><span class="eyebrow">YOUR USAGE</span><h2 id="payment-usage-title">用量账单</h2></div><label class="payment-month">账单月份<input v-model="month" type="month" min="2020-01" :max="maxMonth" :disabled="monthBusy || !dashboard" @change="loadMonth" /></label></div>
    <p v-if="usageError" class="form-message error" role="alert">{{ usageError }}</p>
    <p class="payment-fine">按 UTC 自然月统计。余额不按月清零，账单汇总不会再次扣费。</p>
    <div v-if="statement" class="payment-metrics" aria-live="polite"><div><span>已结算消费</span><strong>¥{{ moneyAtoms(statement.charged_atoms) }}</strong></div><div><span>已到账充值</span><strong>¥{{ moneyAtoms(statement.credited_atoms) }}</strong></div><div><span>待核对冻结</span><strong>¥{{ moneyAtoms(statement.pending_hold_atoms) }}</strong></div></div>
    <p v-else-if="monthBusy" role="status">正在读取月账单…</p>
    <p v-if="!dashboard" class="payment-muted">{{ loading ? '正在读取模型与用量…' : '模型用量暂不可用，请在“站内直供”刷新重试。' }}</p>
    <h3 class="payment-record-heading">最近使用记录</h3>
    <p v-if="dashboard && !usage?.items.length" class="payment-muted">暂无使用记录。开始聊天后，可在这里核对费用。</p>
    <ol v-else-if="usage?.items.length" class="payment-usage-list">
      <li v-for="item in usage.items" :key="item.request_id" class="payment-usage-row">
        <div><h4>{{ item.model }}</h4><time>{{ formatDateTime(item.created_at, 'zh-CN') }}</time><code>{{ item.request_id }}</code></div>
        <div><span class="payment-badge" :class="{ 'is-muted': item.status !== 'settled' }">{{ usageStatus(item.status) }}</span><p v-if="item.usage" class="payment-fine">输入 {{ item.usage.input_uncached }} · 缓存 {{ item.usage.input_cached }} · 输出 {{ item.usage.output }}</p><p v-else class="payment-fine">{{ item.status === 'released' ? '未产生消费，冻结已释放' : '最终用量待核对' }}</p></div>
        <strong v-if="item.status === 'released'">未扣费</strong><strong v-else-if="item.billing_mode === 'sponsored'">免扣费</strong><strong v-else-if="item.charged_atoms !== null && item.charged_atoms !== undefined">¥{{ moneyAtoms(item.charged_atoms) }}</strong><span v-else class="payment-muted">尚未结算</span>
      </li>
    </ol>
    <button v-if="usage?.next_cursor" type="button" class="ghost-btn" :disabled="moreBusy" @click="more">{{ moreBusy ? '读取中…' : '加载更多记录' }}</button>
  </section>
  <OfficialServiceSettings v-if="dashboard?.me.operator" :key="account" :account="account" @updated="load" />
</template>
