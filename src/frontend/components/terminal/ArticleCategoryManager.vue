<script setup>
import { ref, watch } from 'vue';
import { apiFetch } from '../../api/client';
import { applyArticleCategories, useArticleCategories } from '../../composables/useArticleCategories';
import TsIcon from '../TsIcon.vue';

const emit = defineEmits(['changed']);
const props = defineProps({ managementBase: { type: String, default: '/api/admin' } });
const { categories, revision, error, loading, refresh } = useArticleCategories();
const name = ref('');
const busy = ref(false);
const message = ref('');
const failed = ref(false);

watch(revision, (next, previous) => { if (previous && next !== previous) emit('changed'); });

async function mutate(path, options) {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  failed.value = false;
  try {
    const response = await apiFetch(`${props.managementBase}/article-categories${path}`, {
      ...options, credentials: 'include', headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    applyArticleCategories(result);
    message.value = options.method === 'POST' ? '分类已添加' : `分类已删除，${result.moved} 篇文章已转入“其他”`;
    if (options.method === 'POST') name.value = '';
  } catch (cause) {
    failed.value = true;
    message.value = cause.message || '操作失败，请重试';
  } finally {
    busy.value = false;
  }
}

function remove(category) {
  if (busy.value || category.protected) return;
  if (!window.confirm(`删除“${category.name}”分类？所属文章将转入“其他”，不会删除文章。`)) return;
  void mutate(`/${category.id}`, { method: 'DELETE' });
}

async function retry() {
  try { await refresh(); } catch (cause) { failed.value = true; message.value = cause.message; }
}
</script>

<template>
  <details class="terminal-category-manager">
    <summary><TsIcon name="layers" :size="16" />分类管理 <span>{{ categories.length }}</span><TsIcon class="category-chevron" name="chevronDown" :size="16" /></summary>
    <div class="terminal-category-body" :aria-busy="loading || busy">
      <form class="terminal-category-form" @submit.prevent="mutate('', { method: 'POST', body: JSON.stringify({ name }) })">
        <label for="articleCategoryName">分类名称</label>
        <input id="articleCategoryName" v-model="name" type="text" maxlength="32" required autocomplete="off" placeholder="新分类" :disabled="busy">
        <button class="primary-btn" type="submit" :disabled="busy || !name.trim()"><TsIcon name="plus" :size="16" />添加</button>
      </form>
      <StatusLoader v-if="loading && !categories.length" label="正在读取分类" compact />
      <p v-if="error" role="status">分类同步暂时中断 <button class="ghost-btn" type="button" @click="retry">重试</button></p>
      <ul class="terminal-category-list" aria-label="文章分类">
        <li v-for="category in categories" :key="category.id">
          <span>{{ category.name }}</span>
          <small v-if="category.protected">默认</small>
          <button v-else class="ghost-btn" type="button" :disabled="busy" :aria-label="`删除分类 ${category.name}`" :title="`删除分类 ${category.name}`" @click="remove(category)"><TsIcon name="trash" :size="16" /></button>
        </li>
      </ul>
      <p v-if="message" :role="failed ? 'alert' : 'status'">{{ message }}</p>
    </div>
  </details>
</template>

<style scoped>
.terminal-category-manager { margin-bottom: 16px; border-block: 1px solid var(--terminal-border, #80808040); }
.terminal-category-manager summary { display: flex; align-items: center; gap: 8px; min-height: 44px; cursor: pointer; font-weight: 600; }
.terminal-category-manager summary span { margin-left: auto; font-variant-numeric: tabular-nums; }
.terminal-category-manager[open] .category-chevron { transform: rotate(180deg); }
.terminal-category-body { padding: 8px 0 16px; }
.terminal-category-form { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; max-width: 560px; }
.terminal-category-form input { min-width: 0; width: 100%; font-size: 16px; }
.terminal-category-manager .terminal-category-body .terminal-category-form input,
.terminal-category-manager .terminal-category-body .terminal-category-form button,
.terminal-category-manager .terminal-category-body button { min-height: 44px; }
.terminal-category-form button { white-space: nowrap; }
.terminal-category-list { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; margin: 12px 0 0; max-height: 240px; overflow-y: auto; overscroll-behavior: contain; }
.terminal-category-list li { display: flex; align-items: center; gap: 8px; min-height: 44px; max-width: 100%; border: 1px solid var(--terminal-border, #80808040); border-radius: 8px; padding: 0 8px 0 12px; }
.terminal-category-list li > span { min-width: 0; overflow-wrap: anywhere; }
.terminal-category-list small { white-space: nowrap; opacity: .7; }
.terminal-category-manager .terminal-category-body .terminal-category-list button { flex: 0 0 44px; width: 44px; min-height: 44px; padding: 0; }
.terminal-category-body p { font-size: 13px; overflow-wrap: anywhere; }
@media (max-width: 480px) { .terminal-category-form { grid-template-columns: minmax(0, 1fr) auto; } .terminal-category-form label { grid-column: 1 / -1; } }
</style>
