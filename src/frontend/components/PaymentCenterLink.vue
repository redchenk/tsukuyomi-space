<script setup>
import { computed } from 'vue';
import { navigationCopy } from '../services/siteNavigation';
import TsIcon from './TsIcon.vue';

const props = defineProps({ lang: { type: String, required: true } });
const copy = computed(() => navigationCopy(props.lang));
</script>

<template>
  <RouterLink class="payment-center-link" to="/payments" :aria-label="copy.payments + ' · ' + copy.topUp" :title="copy.descriptions.payments">
    <TsIcon name="creditCard" :size="17" />
    <span class="payment-full-label">{{ copy.payments }}</span>
    <span class="payment-short-label">{{ copy.topUp }}</span>
  </RouterLink>
</template>

<style scoped>
.payment-center-link { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 12px; border: 1px solid currentColor; border-radius: var(--r-control, 10px); color: var(--accent); background: var(--surface); font: 650 14px/1.2 var(--sans, system-ui); text-decoration: none; white-space: nowrap; }
.payment-center-link:hover, .payment-center-link[aria-current="page"] { text-decoration: underline; text-underline-offset: 3px; }
.payment-center-link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.payment-short-label { display: none; }
@media (max-width: 680px) {
  .payment-center-link { min-height: 44px; padding-inline: 8px; }
}
@media (max-width: 380px), (min-width: 1081px) and (max-width: 1220px) {
  .payment-full-label { display: none; }
  .payment-short-label { display: inline; }
}
</style>
