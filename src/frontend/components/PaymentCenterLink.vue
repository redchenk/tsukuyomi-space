<script setup>
import { computed } from 'vue';
import { navigationCopy } from '../services/siteNavigation';
import TsIcon from './TsIcon.vue';

const props = defineProps({ lang: { type: String, required: true } });
const copy = computed(() => navigationCopy(props.lang));
</script>

<template>
  <RouterLink data-ui="accent" class="payment-center-link" to="/payments" :aria-label="copy.payments + ' · ' + copy.topUp" :title="copy.descriptions.payments">
    <TsIcon name="creditCard" :size="17" />
    <span class="payment-full-label">{{ copy.payments }}</span>
    <span class="payment-short-label">{{ copy.topUp }}</span>
  </RouterLink>
</template>

<style scoped>
.payment-center-link { flex: none; --ui-action-height: 2.5rem; --ui-action-inset: .75rem; }
.payment-center-link[aria-current="page"] { text-decoration: underline; text-underline-offset: 3px; }
.payment-short-label { display: none; }
@media (max-width: 680px) {
  .payment-center-link { --ui-action-height: var(--ui-touch); --ui-action-inset: .5rem; }
}
@media (max-width: 380px), (min-width: 1081px) and (max-width: 1220px) {
  .payment-full-label { display: none; }
  .payment-short-label { display: inline; }
}
</style>
