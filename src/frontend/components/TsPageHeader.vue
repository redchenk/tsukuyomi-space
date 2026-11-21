<script setup>
defineProps({ title: { type: String, required: true }, description: String, art: String });
</script>

<template>
  <header class="ui-page-header" :class="{ 'ui-page-header-art': art }">
    <img v-if="art" :src="art" alt="" aria-hidden="true" class="ui-header-art" decoding="async">
    <div class="ui-heading">
      <h1 class="ui-page-title">{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="ui-actions"><slot name="actions" /></div>
  </header>
</template>
