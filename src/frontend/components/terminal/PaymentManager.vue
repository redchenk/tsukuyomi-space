<script setup>
import { computed, onMounted, ref } from 'vue';
import TerminalPagination from './TerminalPagination.vue';
import { paymentRequest, paymentStatus } from '../../services/payments';
import { formatDateTime } from '../../utils/time';

const settings = ref(null);
const tab = ref('orders'), productPage = ref(1), selectedIndex = ref(-1);
const pageSize = 5;
const totalPages = computed(() => Math.max(1, Math.ceil((settings.value?.products.length || 0) / pageSize)));
const visibleProducts = computed(() => {
  const start = (productPage.value - 1) * pageSize;
  return (settings.value?.products || []).slice(start, start + pageSize);
});
const product = computed(() => settings.value?.products[selectedIndex.value]);
function selectProduct(index) {
  selectedIndex.value = index;
  productPage.value = Math.floor(index / pageSize) + 1;
}
function removeProduct() {
  settings.value.products.splice(selectedIndex.value, 1);
  selectedIndex.value = -1;
  productPage.value = Math.min(productPage.value, totalPages.value);
}
function setPage(page) {
  productPage.value = page;
  selectedIndex.value = -1;
}
const orders = ref({ items: [], page: 1, totalPages: 1, total: 0 });
const filter = ref('');
const loading = ref(true), saving = ref(false), querying = ref(''), message = ref(''), error = ref('');
let sequence = 0;
const request = (path, options) => paymentRequest(`/api/admin/payments${path}`, options);
async function loadOrders(page = 1) {
  const current = ++sequence;
  try {
    const result = await request(`/orders?page=${page}&status=${encodeURIComponent(filter.value)}`);
    if (current === sequence) orders.value = result;
  } catch (cause) { if (current === sequence) error.value = cause.message; }
}
async function save() {
  saving.value = true; error.value = ''; message.value = '';
  try {
    const { enabled, products } = settings.value;
    const ids = new Set();
    const invalid = products.findIndex(item => {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(item.id) || ids.has(item.id) || !item.title.trim()
          || !/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(item.price) || Number(item.price) <= 0 || Number(item.price) > 1000000) return true;
      ids.add(item.id);
      return false;
    });
    if (invalid !== -1) {
      selectProduct(invalid); error.value = '请检查选中商品的编号、名称和价格'; return;
    }
    settings.value = await request('/settings', { method: 'PUT', body: JSON.stringify({ enabled, products }) });
    message.value = '支付配置已保存';
  } catch (cause) { error.value = cause.message; }
  finally { saving.value = false; }
}
async function query(order) {
  querying.value = order.id; error.value = '';
  try { await request(`/orders/${order.id}/refresh`, { method: 'POST' }); await loadOrders(orders.value.page); }
  catch (cause) { error.value = cause.message; }
  finally { querying.value = ''; }
}
function addProduct() {
  settings.value.products.push({ id: `item-${crypto.randomUUID().slice(0, 8)}`, title: '', description: '', price: '', enabled: false, walletCredit: false });
  selectProduct(settings.value.products.length - 1);
}
onMounted(async () => {
  void loadOrders();
  try { settings.value = await request('/settings'); }
  catch (cause) { error.value = cause.message; }
  finally { loading.value = false; }
});
</script>

<template>
  <div class="payment-manager" :aria-busy="loading">
    <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
    <p v-if="message" class="form-message success" role="status">{{ message }}</p>
    <nav class="manager-tabs" aria-label="支付管理视图">
      <button type="button" :aria-pressed="tab === 'orders'" @click="tab = 'orders'">支付订单</button>
      <button type="button" :aria-pressed="tab === 'products'" @click="tab = 'products'">商品与收款<span v-if="settings">{{ settings.products.length }}</span></button>
    </nav>
    <p v-if="loading && tab === 'products'" role="status">正在读取支付配置…</p>
    <template v-if="!loading || tab === 'orders'">
      <form v-if="settings && tab === 'products'" class="terminal-settings-block" @submit.prevent="save">
        <div class="terminal-settings-title"><h2>支付宝收款</h2><span>仅超级管理员可配置</span></div>
        <p>{{ settings.readiness.configured ? '服务器支付配置已就绪' : '服务器支付配置未就绪' }} · {{ settings.readiness.environment === 'production' ? '正式环境' : '沙箱环境' }}</p>
        <details class="payment-connection"><summary>收款连接详情</summary>
        <p v-if="settings.readiness.missing.length">需在服务器配置：<code>{{ settings.readiness.missing.join('、') }}</code></p>
        <p>密钥与收款账号信息仅从服务器环境变量或私有文件读取，此处不会返回或保存密钥。</p>
        <p v-if="settings.readiness.notifyUrl">异步通知地址：<code class="payment-wrap">{{ settings.readiness.notifyUrl }}</code></p>
        <p>单笔上限：¥{{ (settings.readiness.maxAmountCents / 100).toFixed(2) }}</p>
        </details>
        <label class="terminal-check"><input v-model="settings.enabled" type="checkbox" :disabled="saving || (!settings.enabled && !settings.readiness.configured)"> 开启在线收款</label>
        <p>关闭后停止创建新订单和打开收银台，已有订单仍可验签入账与查单。</p>
        <div class="payment-actions">
          <button class="ghost-btn" type="button" :disabled="saving || settings.products.length >= 20" @click="addProduct">添加商品</button>
          <button class="primary-btn" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存支付配置' }}</button>
        </div>
        <ul class="product-list" aria-label="商品列表">
          <li v-for="(item, offset) in visibleProducts" :key="offset">
            <button type="button" :aria-pressed="selectedIndex === (productPage - 1) * pageSize + offset" @click="selectProduct((productPage - 1) * pageSize + offset)">
              <span><strong>{{ item.title || '未命名商品' }}</strong><small>{{ item.id }}</small></span>
              <span class="product-price">¥{{ item.price || '0.00' }}<small>{{ item.enabled ? '已上架' : '未上架' }}</small></span>
            </button>
          </li>
        </ul>
        <TerminalPagination v-if="totalPages > 1" :current="productPage" :total-pages="totalPages" :total-items="settings.products.length" :page-size="pageSize" item-label="件商品" aria-label="商品分页" @change="setPage" />
        <div class="payment-manager-products">
          <fieldset v-if="product" class="payment-product-editor" :disabled="saving">
            <legend>商品 {{ selectedIndex + 1 }}</legend>
            <label>商品编号<input v-model="product.id" required pattern="[A-Za-z0-9_\-]{1,40}" maxlength="40"></label>
            <label>商品名称<input v-model="product.title" required maxlength="60"></label>
            <label>价格（元）<input v-model="product.price" required inputmode="decimal" pattern="(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?" placeholder="0.00"></label>
            <label class="payment-editor-description">商品说明<textarea v-model="product.description" maxlength="500" rows="3" /></label>
            <label class="terminal-check"><input v-model="product.enabled" type="checkbox"> 上架此商品</label>
            <label class="terminal-check"><input v-model="product.walletCredit" type="checkbox"> 支付成功后按实付金额充值到网站余额</label>
            <button class="danger-btn" type="button" @click="removeProduct">移除此商品配置</button>
          </fieldset>
          <p v-if="!settings.products.length">尚未配置商品。添加名称、价格和交付说明后再开启收款。</p>
        </div>
      </form>
      <section v-if="tab === 'orders'" class="terminal-settings-block">
        <div class="terminal-settings-title"><h2>支付订单</h2><span>充值商品验签后自动入账，其他服务按商品说明交付</span></div>
        <div class="payment-actions">
          <label>订单状态<select v-model="filter" @change="loadOrders(1)"><option value="">全部</option><option value="pending">待支付</option><option value="paid">已支付</option><option value="closed">已关闭</option></select></label>
          <button class="ghost-btn" type="button" @click="loadOrders(orders.page)">刷新订单列表</button>
        </div>
        <div class="terminal-table-wrap" tabindex="0" role="region" aria-label="支付订单列表，可横向滚动">
          <table><thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>账号 ID</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody><tr v-for="order in orders.items" :key="order.id">
              <td><code>{{ order.id }}</code></td><td>{{ order.title }}</td><td>¥{{ order.amount }}</td><td>{{ order.userId || '已注销' }}</td>
              <td>{{ paymentStatus(order) }}</td><td>{{ formatDateTime(order.createdAt, 'zh-CN') }}</td>
              <td><button class="ghost-btn" type="button" :disabled="Boolean(querying) || order.status === 'paid' || !settings?.readiness.configured" @click="query(order)">{{ querying === order.id ? '核对中…' : '支付宝查单' }}</button></td>
            </tr><tr v-if="!orders.items.length"><td colspan="7">暂无支付订单</td></tr></tbody>
          </table>
        </div>
        <div class="payment-actions">
          <button class="ghost-btn" type="button" :disabled="orders.page <= 1" @click="loadOrders(orders.page - 1)">上一页</button>
          <span>{{ orders.page }} / {{ orders.totalPages }} · 共 {{ orders.total }} 笔</span>
          <button class="ghost-btn" type="button" :disabled="orders.page >= orders.totalPages" @click="loadOrders(orders.page + 1)">下一页</button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.payment-manager { display: grid; gap: 1rem; min-width: 0; }
.product-list { list-style: none; padding: 0; margin: 0; }
.product-list button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .65rem .85rem; background: transparent; border: 0; border-bottom: 1px solid var(--ts-border); color: inherit; text-align: left; cursor: pointer; }
.product-list button[aria-pressed="true"] { background: var(--ts-surface-soft); box-shadow: inset 3px 0 var(--ts-accent); }
.product-list strong,.product-list small { display: block; overflow-wrap:anywhere; }
.product-list small { color:var(--ts-muted); font-size:.78rem; }
.product-price { flex-shrink:0; text-align:right; font-variant-numeric:tabular-nums; }
.payment-connection summary { cursor:pointer; color:var(--ts-muted); }
.payment-manager p { line-height: 1.7; overflow-wrap: anywhere; }
.payment-wrap, .payment-manager code { overflow-wrap: anywhere; }
.payment-manager-products { display: grid; gap: 1rem; margin: 1.25rem 0; }
.payment-product-editor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; min-width: 0; border: 1px solid var(--line, #ddd); border-radius: 14px; padding: 1rem; }
.payment-product-editor label { display: grid; gap: .4rem; min-width: 0; }
.payment-product-editor .terminal-check { display: flex; }
.payment-editor-description { grid-column: 1 / -1; }
.payment-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; margin: 1rem 0; }
@media (max-width: 640px) { .payment-product-editor { grid-template-columns: 1fr; } }
</style>
