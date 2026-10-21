<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { loadCurrentSession } from '../api/client';
import { paymentRequest, checkoutDestination, paymentStatus } from '../services/payments';
import { formatDateTime } from '../utils/time';
import { moneyAtoms } from '../services/official-service.mjs';
import OfficialServicePanel from '../components/OfficialServicePanel.vue';
import TsIcon from '../components/TsIcon.vue';

const route = useRoute();
const catalog = ref({ enabled: false, products: [] }), orders = ref({ items: [], page: 1, totalPages: 1 });
const current = ref(null), authed = ref(false), loading = ref(true), busy = ref(''), error = ref('');
const wallet = ref(null), siteUserId = ref('');
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
  if (disposed) return;
  busy.value = order.id; error.value = '';
  try {
    const checkout = await paymentRequest(`/api/payments/orders/${order.id}/checkout`, { method: 'POST' });
    window.location.assign(checkoutDestination(checkout.url));
  } catch (cause) { error.value = cause.message; }
  finally { busy.value = ''; }
}
async function purchase(product) {
  if (busy.value) return;
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
    const [products, identity] = await Promise.allSettled([paymentRequest('/api/payments/catalog'), loadCurrentSession()]);
    if (disposed) return;
    if (products.status === 'fulfilled') catalog.value = products.value;
    else error.value = products.reason.message;
    if (identity.status !== 'fulfilled') throw identity.reason;
    const session = identity.value;
    authed.value = Boolean(session && !session.admin);
    siteUserId.value = session?.user?.id || '';
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
    <header class="payments-heading"><div><span class="eyebrow">TSUKUYOMI · YOUR BALANCE & USAGE</span><h1>支付中心</h1><p>充值、订单与聊天用量，在这里一起查看。</p></div><span class="payment-heading-mark" aria-hidden="true"><TsIcon name="moonStar" :size="42" :stroke-width="1.25" /></span></header>
    <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取支付中心…</p>
    <template v-else>
      <section v-if="!authed" class="panel payments-notice"><h2>登录后查看支付中心</h2><p>充值、余额和用量均关联到你的月读空间账号。</p><RouterLink class="primary-btn" to="/login?redirect=/payments">登录</RouterLink></section>
      <template v-else>
        <nav class="payment-section-nav" aria-label="支付中心导航"><a href="#topup">充值</a><a href="#orders">我的订单</a><a href="#models">直供模型</a><a href="#usage">用量账单</a></nav>
        <section v-if="wallet" class="panel payment-wallet" aria-label="网站统一余额">
          <div class="payment-wallet-main"><span class="eyebrow">网站可用余额</span><strong class="payment-balance">{{ wallet.unlimited ? '不限额度' : `¥${moneyAtoms(wallet.available_atoms)}` }}</strong><p v-if="wallet.unlimited" class="payment-muted">超级管理员免扣余额，用量照常记录。</p><p v-else class="payment-muted">充值到账后，可直接在 Room 使用站内直供。</p><a class="primary-btn" href="#topup">查看充值选项<TsIcon name="chevronRight" :size="16" /></a></div>
          <dl class="payment-wallet-detail"><div><dt>账面余额</dt><dd>¥{{ moneyAtoms(wallet.balance_atoms) }}</dd></div><div><dt>待结算冻结</dt><dd>¥{{ moneyAtoms(wallet.held_atoms) }}</dd></div></dl>
          <p class="payment-wallet-note">全站共用一份余额，冻结金额尚未扣费。</p>
        </section>
        <section v-if="current" class="panel payment-receipt" aria-live="polite">
          <h2>{{ paymentStatus(current) }}</h2><p>{{ current.title }} · ¥{{ current.amount }}</p><p class="payment-order-id">{{ current.id }}</p>
          <p v-if="current.status === 'pending'">付款后会自动核对结果。若状态未更新，可点击“核对支付结果”。</p>
          <p v-if="current.status === 'paid'">{{ current.walletCredited ? `已充值 ¥${current.walletCreditAmount} 到网站余额。` : '已收到支付结果，服务交付请以商品说明为准。' }}</p>
          <div class="payment-actions"><button v-if="canPay" class="primary-btn" type="button" :disabled="Boolean(busy)" @click="pay(current)">前往支付宝付款</button><button v-if="current.status !== 'paid'" class="ghost-btn" type="button" :disabled="Boolean(busy)" @click="refresh()">{{ busy === current.id ? '核对中…' : '核对支付结果' }}</button></div>
        </section>
        <section id="topup" aria-labelledby="payment-topup-title"><div class="payment-section-heading"><div><span class="eyebrow">TOP UP & SERVICES</span><h2 id="payment-topup-title">充值与服务</h2></div><span class="payment-fine">支付宝安全支付</span></div>
          <p v-if="!catalog.enabled" class="panel payments-notice">在线收款暂未开放，已有订单仍可在下方查看。</p>
          <div v-else class="payment-products"><article v-for="product in catalog.products" :key="product.id" class="panel payment-product"><h3>{{ product.title }}</h3><p>{{ product.description }}</p><p v-if="product.walletCredit">支付成功后充值 ¥{{ product.price }} 到网站余额。</p><strong class="payment-price">¥{{ product.price }}</strong><button class="primary-btn" type="button" :disabled="Boolean(busy)" @click="purchase(product)">{{ busy === product.id ? '创建订单中…' : '使用支付宝支付' }}</button></article></div>
        </section>
        <section id="orders" class="panel payment-history"><div class="payment-actions"><h2>我的订单</h2><button class="ghost-btn" type="button" :disabled="Boolean(busy)" @click="history().catch(cause => error = cause.message)">刷新列表</button></div>
          <p v-if="!orders.items.length">暂无订单。</p>
          <article v-for="order in orders.items" :key="order.id" class="payment-history-row"><div><h3>{{ order.title }}</h3><p>{{ formatDateTime(order.createdAt, 'zh-CN') }}</p><code class="payment-order-id">{{ order.id }}</code></div><div><strong>¥{{ order.amount }}</strong><p>{{ paymentStatus(order) }}</p><button class="ghost-btn" type="button" :disabled="Boolean(busy)" @click="current = order; refresh(order)">查看并核对</button></div></article>
          <div v-if="orders.totalPages > 1" class="payment-actions"><button class="ghost-btn" type="button" :disabled="orders.page <= 1" @click="history(orders.page - 1).catch(cause => error = cause.message)">上一页</button><span>{{ orders.page }} / {{ orders.totalPages }}</span><button class="ghost-btn" type="button" :disabled="orders.page >= orders.totalPages" @click="history(orders.page + 1).catch(cause => error = cause.message)">下一页</button></div>
        </section>
        <OfficialServicePanel v-if="siteUserId" :site-user-id="siteUserId" @wallet-updated="wallet = $event" />
      </template>
    </template>
  </main>
</template>
