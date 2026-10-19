<script setup>
import { onMounted, ref } from 'vue';
import { paymentRequest } from '../services/payments';
const visible = ref(false);
onMounted(async () => {
  const results = await Promise.allSettled([paymentRequest('/api/payments/catalog'), paymentRequest('/api/payments/orders')]);
  visible.value = (results[0].status === 'fulfilled' && results[0].value.enabled)
    || (results[1].status === 'fulfilled' && results[1].value.total > 0);
});
</script>
<template><section v-if="visible" class="panel uc-support-card"><h2>支付与订单</h2><p>查看可购买的服务和自己的支付记录。</p><RouterLink class="ghost-btn" to="/payments">进入支付中心</RouterLink></section></template>
