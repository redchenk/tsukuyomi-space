<script setup>
import { actionSize, actionVariant } from './uiControl';
defineProps({ to: [String, Object], href: String, variant: actionVariant, size: actionSize });
</script>

<template>
  <RouterLink v-if="to" :to="to" :data-ui="variant" :data-size="size"><slot /></RouterLink>
  <a v-else :href="href" :data-ui="variant" :data-size="size"><slot /></a>
</template>
