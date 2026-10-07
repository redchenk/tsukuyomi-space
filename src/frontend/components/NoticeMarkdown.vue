<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { renderNoticeMarkdown } from '../../../shared/notice-markdown.mjs';
import { internalRoutePath } from '../utils/routeNavigation';

const props = defineProps({ content: { type: String, default: '' }, preview: Boolean });
const emit = defineEmits(['navigate']);
const router = useRouter();
const html = computed(() => renderNoticeMarkdown(props.content, window.location.href, { preview: props.preview }));

function onClick(event) {
  const anchor = event.target.closest?.('a[href]');
  if (!anchor) return;
  if (props.preview) {
    event.preventDefault();
    return;
  }
  if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const path = internalRoutePath(anchor, router, window.location.href);
  // The existing global route-link handler navigates; a popup closes first.
  // Modifier clicks and non-Vue destinations retain normal browser behavior.
  if (path) emit('navigate', path);
}
</script>

<template>
  <div class="notice-markdown" @click="onClick" v-html="html"></div>
</template>

<style scoped>
.notice-markdown { min-width: 0; line-height: 1.85; overflow-wrap: anywhere; }
.notice-markdown :deep(p) { margin: 0.65em 0; white-space: normal; line-height: inherit; }
.notice-markdown :deep(:is(h1, h2, h3, h4, h5, h6)) { margin: 0.85em 0 0.35em; font: inherit; font-size: 1.1em; font-weight: 700; line-height: 1.5; color: var(--ts-text-strong); }
.notice-markdown :deep(:is(ul, ol)) { margin: 0.65em 0; padding-inline-start: 1.6em; }
.notice-markdown :deep(li + li) { margin-top: 0.2em; }
.notice-markdown :deep(blockquote) { margin: 0.65em 0; padding-inline-start: 1em; border-inline-start: 3px solid var(--ts-accent); color: var(--ts-muted); }
.notice-markdown :deep(:is(a, .notice-link-preview)) { color: var(--ts-accent); text-decoration: underline; text-underline-offset: 0.2em; }
.notice-markdown :deep(a:hover) { text-decoration-thickness: 2px; }
.notice-markdown :deep(a:focus-visible) { outline: 2px solid var(--ts-accent); outline-offset: 3px; border-radius: 3px; }
.notice-markdown :deep(code) { padding: 0.1em 0.3em; border-radius: var(--ts-radius-sm); background: var(--ts-card); font-size: 0.9em; }
.notice-markdown :deep(pre) { margin: 0.65em 0; padding: 0.75em; border: 1px solid var(--ts-border); border-radius: var(--ts-radius-md); background: var(--ts-card); white-space: pre-wrap; overflow-wrap: anywhere; }
.notice-markdown :deep(pre code) { padding: 0; background: none; }
.notice-markdown :deep(hr) { margin: 1em 0; border: 0; border-top: 1px solid var(--ts-border); }
.notice-markdown :deep(> :first-child) { margin-top: 0; }
.notice-markdown :deep(> :last-child) { margin-bottom: 0; }
</style>
