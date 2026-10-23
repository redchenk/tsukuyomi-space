<script setup>
import { computed } from 'vue';
import policy from '../../../shared/privacy-policy.json';
const props = defineProps({ lang: { type: String, default: 'zh' } });
const copy = computed(() => policy[props.lang === 'zh' ? 'zh' : 'en']);
</script>
<template>
  <main class="page privacy-page">
    <header class="privacy-heading"><span class="eyebrow">TSUKUYOMI · YOUR PRIVACY</span><h1>{{ copy.title }}</h1><p>{{ copy.intro }}</p><p class="privacy-meta">{{ policy.app }} · {{ policy.updatedAt }}</p>
      <nav class="privacy-actions" aria-label="Privacy"><RouterLink class="ghost-btn" to="/delete-account">{{ lang === 'zh' ? '申请注销账号' : 'Request account deletion' }}</RouterLink><a class="ghost-btn" :href="`mailto:${policy.contact}`">{{ policy.contact }}</a></nav>
    </header>
    <section v-for="(section, i) in copy.sections" :key="section.title" class="panel privacy-section" :id="`privacy-${i + 1}`"><h2>{{ i + 1 }}. {{ section.title }}</h2><p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p></section>
  </main>
</template>
