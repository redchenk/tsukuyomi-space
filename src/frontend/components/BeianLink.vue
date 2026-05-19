<script setup>
import { computed, onMounted, ref } from 'vue';

const beian = ref({ text: '', url: '' });
const href = computed(() => beian.value.url || 'https://beian.miit.gov.cn/');

onMounted(async () => {
  try {
    const response = await fetch('/api/settings', { headers: { Accept: 'application/json' } });
    const result = await response.json();
    const settings = result?.data || {};
    beian.value = {
      text: String(settings.beianText || '').trim(),
      url: String(settings.beianUrl || '').trim()
    };
  } catch (_) {
    beian.value = { text: '', url: '' };
  }
});
</script>

<template>
  <a v-if="beian.text" class="beian-link" :href="href" target="_blank" rel="noopener noreferrer">{{ beian.text }}</a>
</template>
