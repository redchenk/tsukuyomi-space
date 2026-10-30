<script setup>
import TsIcon from './TsIcon.vue';
import { contentTranslationAvailable, contentTranslationEnabled, setContentTranslationEnabled } from '../services/contentTranslation';

defineProps({ compact: { type: Boolean, default: false } });
</script>

<template>
  <div v-if="contentTranslationAvailable" class="content-translation-control" :class="{ 'is-compact': compact }">
    <template v-if="compact">
      <TsIcon name="languages" :size="16" />
      <span>{{ contentTranslationEnabled ? 'English translation' : 'Original content' }}</span>
      <span aria-hidden="true">·</span>
      <button type="button" @click="setContentTranslationEnabled(!contentTranslationEnabled)">{{ contentTranslationEnabled ? 'Show original' : 'Translate to English' }}</button>
    </template>
    <label v-else class="content-translation-preference">
      <TsIcon name="languages" :size="20" />
      <span class="content-translation-copy">
        <strong>Translate community content</strong>
        <small>Show articles and posts in English.</small>
      </span>
      <input type="checkbox" role="switch" aria-label="Translate community content" :checked="contentTranslationEnabled" @change="setContentTranslationEnabled($event.target.checked)">
    </label>
  </div>
</template>

<style scoped>
.content-translation-control { width: 100%; color: var(--ts-text); }
.content-translation-preference { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 8px 0; cursor: pointer; }
.content-translation-preference > svg { flex-shrink: 0; color: var(--ts-muted); }
.content-translation-copy { flex: 1; min-width: 0; }
.content-translation-copy strong { display: block; font-size: 13px; font-weight: 500; line-height: 1.5; }
.content-translation-copy small { display: block; margin-top: 3px; font-size: 12px; line-height: 1.5; color: var(--ts-muted); }
.content-translation-preference input { appearance: none; flex: 0 0 44px; width: 44px; height: 26px; min-height: 26px; padding: 0; margin: 0; border: 1px solid var(--ts-border-strong, var(--ts-border)); border-radius: 999px; background: var(--ts-editorial-muted); cursor: pointer; }
.content-translation-preference input::before { content: ''; display: block; width: 18px; height: 18px; margin: 3px; border-radius: 50%; background: var(--ts-editorial-surface); transition: transform 160ms ease; }
.content-translation-preference input:checked { background: var(--ts-unified-primary-bg); border-color: var(--ts-unified-primary-bg); }
.content-translation-preference input:checked::before { transform: translateX(18px); background: var(--ts-unified-primary-text); }
.content-translation-preference:has(input:focus-visible) { outline: 2px solid var(--ts-accent); outline-offset: 4px; border-radius: var(--ts-radius-button); }
.is-compact { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: auto; margin: 8px 0 20px; font-size: 13px; color: var(--ts-editorial-muted); }
.is-compact button { min-height: 44px; padding: 8px 4px; border: 0; background: transparent; color: var(--ts-editorial-ink); font: inherit; text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
.is-compact button:hover { color: var(--ts-accent); }
.is-compact button:focus-visible { outline: 2px solid var(--ts-accent); outline-offset: 3px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { .content-translation-preference input::before { transition: none; } }
</style>
