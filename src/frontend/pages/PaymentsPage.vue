<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { loadCurrentSession } from '../api/client';
import { paymentRequest, checkoutDestination, paymentStatus } from '../services/payments';
import { formatDateTime } from '../utils/time';

const route = useRoute();
const catalog = ref({ enabled: false, products: [] }), orders = ref({ items: [], page: 1, totalPages: 1 });
const current = ref(null), authed = ref(false), loading = ref(true), busy = ref(''), error = ref('');
const wallet = ref(null);
function moneyAtoms(value) {
  const n = BigInt(value || '0');
  return `${n / 1000000000n}.${String(n % 1000000000n).padStart(9, '0').replace(/0+$/, '').padEnd(2, '0')}`;
}
const requestKeys = new Map();
let timer, disposed = false, polls = 0;
const canPay = computed(() => current.value && current.value.status === 'pending' && !current.value.expired && catalog.value.enabled);
async function history(page = orders.value.page) {
  const results = await Promise.all([paymentRequest(`/api/payments/orders?page=${page}`), paymentRequest('/api/payments/wallet')]);
  [orders.value, wallet.value] = results;
}
async function refresh(order = current.value) {
  if (!order || busy.value) return;
  busy.value = order.id; error.value = '';
  try {
    current.value = await paymentRequest(`/api/payments/orders/${order.id}/refresh`, { method: 'POST' });
    await history();
  } catch (cause) { error.value = cause.message; }
  finally { busy.value = ''; }
}
async function pay(order) {
  busy.value = order.id; error.value = '';
  try {
    const checkout = await paymentRequest(`/api/payments/orders/${order.id}/checkout`, { method: 'POST' });
    window.location.assign(checkoutDestination(checkout.url));
  } catch (cause) { error.value = cause.message; }
  finally { busy.value = ''; }
}
async function purchase(product) {
  busy.value = product.id; error.value = '';
  try {
    if (!requestKeys.has(product.id)) requestKeys.set(product.id, crypto.randomUUID());
    current.value = await paymentRequest('/api/payments/orders', { method: 'POST', body: JSON.stringify({ productId: product.id, requestKey: requestKeys.get(product.id) }) });
    requestKeys.delete(product.id);
    await history(1);
    await pay(current.value);
  } catch (cause) { error.value = cause.message; }
  finally { busy.value = ''; }
}
function schedule() {
  if (disposed || polls >= 6 || current.value?.status !== 'pending') return;
  timer = window.setTimeout(async () => {
    if (!document.hidden) { polls++; await refresh(); }
    schedule();
  }, 10000);
}
onMounted(async () => {
  try {
    catalog.value = await paymentRequest('/api/payments/catalog');
    const session = await loadCurrentSession();
    authed.value = Boolean(session && !session.admin);
    if (authed.value) {
      await history(1);
      const id = String(route.query.order || '');
      if (id) {
        current.value = await paymentRequest(`/api/payments/orders/${encodeURIComponent(id)}`);
        await refresh(); // The browser return URL is a hint to query, never evidence of payment.
        schedule();
      }
    }
  } catch (cause) { error.value = cause.message; }
  finally { loading.value = false; }
});
onUnmounted(() => { disposed = true; window.clearTimeout(timer); });
</script>

<template>
  <main class="page payments-page">
    <header class="payments-heading"><span class="eyebrow">TSUKUYOMI SPACE</span><h1>支付与订单</h1><p>使用支付宝购买服务，随时核对订单状态。</p></header>
    <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取订单…</p>
    <template v-else>
      <section v-if="!authed" class="panel payments-notice"><h2>登录后查看订单</h2><p>订单将关联到你的月读空间账号。</p><RouterLink class="primary-btn" to="/login?redirect=/payments">登录</RouterLink></section>
      <template v-else>
        <section v-if="wallet" class="panel payments-notice" aria-label="网站统一余额">
          <h2>网站余额</h2>
          <p v-if="wallet.unlimited">超级管理员不限余额，官方 API 用量正常记录，免扣充值余额。</p>
          <p><strong>可用 ¥{{ moneyAtoms(wallet.available_atoms) }}</strong> · 账面 ¥{{ moneyAtoms(wallet.balance_atoms) }} · 待结算冻结 ¥{{ moneyAtoms(wallet.held_atoms) }}</p>
          <p>充值到账后可直接用于官方 API，所有页面共用这份余额。冻结金额尚未扣费。</p>
          <a class="ghost-btn" href="/official-api/">官方 API 中心</a>
        </section>
        <section v-if="current" class="panel payment-receipt" aria-live="polite">
          <h2>{{ paymentStatus(current) }}</h2><p>{{ current.title }} · ¥{{ current.amount }}</p><p class="payment-order-id">{{ current.id }}</p>
          <p v-if="current.status === 'pending'">付款后会自动核对结果。若状态未更新，可点击“核对支付结果”。</p>
          <p v-if="current.status === 'paid'">{{ current.walletCredited ? `已充值 ¥${current.walletCreditAmount} 到网站余额。` : '已收到支付结果，服务交付请以商品说明为准。' }}</p>
          <div class="payment-actions"><button v-if="canPay" class="primary-btn" type="button" :disabled="Boolean(busy)" @click="pay(current)">前往支付宝付款</button><button v-if="current.status !== 'paid'" class="ghost-btn" type="button" :disabled="Boolean(busy)" @click="refresh()">{{ busy === current.id ? '核对中…' : '核对支付结果' }}</button></div>
        </section>
        <section aria-label="可购买的服务"><h2>选择服务</h2>
          <p v-if="!catalog.enabled" class="panel payments-notice">在线收款暂未开放，已有订单仍可在下方查看。</p>
          <div v-else class="payment-products"><article v-for="product in catalog.products" :key="product.id" class="panel payment-product"><h3>{{ product.title }}</h3><p>{{ product.description }}</p><p v-if="product.walletCredit">支付成功后充值 ¥{{ product.price }} 到网站余额。</p><strong class="payment-price">¥{{ product.price }}</strong><button class="primary-btn" type="button" :disabled="Boolean(busy)" @click="purchase(product)">{{ busy === product.id ? '创建订单中…' : '使用支付宝支付' }}</button></article></div>
        </section>
        <section class="panel payment-history"><div class="payment-actions"><h2>我的订单</h2><button class="ghost-btn" type="button" :disabled="Boolean(busy)" @click="history().catch(cause => error = cause.message)">刷新列表</button></div>
          <p v-if="!orders.items.length">暂无订单。</p>
          <article v-for="order in orders.items" :key="order.id" class="payment-history-row"><div><h3>{{ order.title }}</h3><p>{{ formatDateTime(order.createdAt, 'zh-CN') }}</p><code class="payment-order-id">{{ order.id }}</code></div><div><strong>¥{{ order.amount }}</strong><p>{{ paymentStatus(order) }}</p><button class="ghost-btn" type="button" :disabled="Boolean(busy)" @click="current = order; refresh(order)">查看并核对</button></div></article>
          <div v-if="orders.totalPages > 1" class="payment-actions"><button class="ghost-btn" type="button" :disabled="orders.page <= 1" @click="history(orders.page - 1).catch(cause => error = cause.message)">上一页</button><span>{{ orders.page }} / {{ orders.totalPages }}</span><button class="ghost-btn" type="button" :disabled="orders.page >= orders.totalPages" @click="history(orders.page + 1).catch(cause => error = cause.message)">下一页</button></div>
        </section>
      </template>
    </template>
  </main>
</template>
