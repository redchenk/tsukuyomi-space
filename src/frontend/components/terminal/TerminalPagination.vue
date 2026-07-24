<script setup>
import { computed } from 'vue';
import TsIcon from '../TsIcon.vue';

const props = defineProps({
  current: { type: Number, default: 1 },
  totalPages: { type: Number, default: 1 },
  totalItems: { type: Number, default: 0 },
  pageSize: { type: Number, default: 10 },
  itemLabel: { type: String, default: '条记录' },
  ariaLabel: { type: String, default: '分页' }
});

const emit = defineEmits(['change']);

const currentPage = computed(() => Math.min(Math.max(props.current || 1, 1), Math.max(props.totalPages || 1, 1)));
const rangeStart = computed(() => props.totalItems ? (currentPage.value - 1) * props.pageSize + 1 : 0);
const rangeEnd = computed(() => Math.min(currentPage.value * props.pageSize, props.totalItems));
const pageItems = computed(() => {
  const total = Math.max(props.totalPages || 1, 1);
  const current = currentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('gap-left');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push('gap-right');
  pages.push(total);
  return pages;
});

function go(page) {
  const next = Math.min(Math.max(Number(page) || 1, 1), Math.max(props.totalPages || 1, 1));
  if (next !== currentPage.value) emit('change', next);
}
</script>

<template>
  <nav v-if="totalItems" class="terminal-pagination" :aria-label="ariaLabel">
    <div class="terminal-pagination-info">
      {{ rangeStart }}-{{ rangeEnd }} / {{ totalItems }} {{ itemLabel }}
    </div>
    <div class="terminal-pagination-controls">
      <button
        class="terminal-page-btn terminal-page-nav"
        type="button"
        :disabled="currentPage <= 1"
        aria-label="上一页"
        title="上一页"
        @click="go(currentPage - 1)"
      >
        <TsIcon name="arrowLeft" :size="15" />
        <span>上一页</span>
      </button>
      <template v-for="item in pageItems" :key="item">
        <span v-if="typeof item === 'string'" class="terminal-page-gap" aria-hidden="true">...</span>
        <button
          v-else
          class="terminal-page-btn"
          :class="{ active: item === currentPage }"
          type="button"
          :aria-label="`第 ${item} 页`"
          :aria-current="item === currentPage ? 'page' : undefined"
          @click="go(item)"
        >
          {{ item }}
        </button>
      </template>
      <button
        class="terminal-page-btn terminal-page-nav"
        type="button"
        :disabled="currentPage >= totalPages"
        aria-label="下一页"
        title="下一页"
        @click="go(currentPage + 1)"
      >
        <span>下一页</span>
        <TsIcon name="arrowRight" :size="15" />
      </button>
    </div>
  </nav>
</template>
