<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { uiText } from '../../i18n/runtime';

const props = defineProps({ request: { type: Function, required: true }, revision: { type: Number, default: 0 } });
const days = ref('30'), end = ref(''), data = ref(null), loading = ref(false), error = ref('');
let controller, sequence = 0;
async function load() {
  controller?.abort();
  controller = new AbortController();
  const current = ++sequence;
  loading.value = true; error.value = '';
  try {
    const query = new URLSearchParams({ days: days.value, ...(end.value ? { end: end.value } : {}) });
    const result = await props.request(`/official-usage?${query}`, { signal: controller.signal });
    if (current !== sequence) return;
    data.value = result;
    end.value = result.to;
  } catch (cause) {
    if (current !== sequence) return;
    data.value = null; error.value = cause.message || '无法读取官方服务调用统计';
  } finally { if (current === sequence) loading.value = false; }
}
watch(() => props.revision, load);
onMounted(load);
onUnmounted(() => { sequence++; controller?.abort(); });
</script>

<template>
  <section class="official-usage" aria-labelledby="official-usage-title" :aria-busy="loading">
    <div class="usage-heading">
      <div><h3 id="official-usage-title">官方服务每日调用</h3><p>全站汇总 · 北京时间（UTC+8）</p></div>
      <form class="usage-filters" @submit.prevent="load">
        <label>统计天数<select v-model="days"><option value="7">7 天</option><option value="30">30 天</option><option value="90">90 天</option></select></label>
        <label>截至日期<input v-model="end" type="date" min="2000-01-01" :max="data?.today.date" /></label>
        <button class="ghost-btn" type="submit" :disabled="loading">{{ loading ? '读取中…' : '查询' }}</button>
      </form>
    </div>
    <p v-if="error" class="usage-error" role="alert">{{ error }}</p>
    <p v-else-if="!data" role="status">正在读取官方服务调用记录…</p>
    <template v-else>
      <div class="usage-cards">
        <article class="terminal-card usage-card" data-usage-kind="llm"><h4>官方 LLM</h4><p><strong>{{ data.today.llm.total }}</strong><span>今日请求</span></p><small>{{ uiText('所选时段 {0} 次', [data.total.llm.total]) }}</small></article>
        <article class="terminal-card usage-card" data-usage-kind="tts"><h4>官方 TTS</h4><p><strong>{{ data.today.tts.total }}</strong><span>今日合成</span></p><small>{{ uiText('所选时段 {0} 次', [data.total.tts.total]) }}</small></article>
      </div>
      <p class="usage-range">{{ data.from }} — {{ data.to }}<span v-if="data.firstRecordedDate"> · 最早记录 {{ data.firstRecordedDate }}</span></p>
      <div class="terminal-table-wrap usage-table" tabindex="0" role="region" aria-label="官方服务每日调用明细">
        <table><thead><tr><th scope="col">日期</th><th scope="col">LLM 请求</th><th scope="col">TTS 合成</th></tr></thead>
          <tbody><tr v-for="row in data.rows" :key="row.date" :data-usage-day="row.date">
            <th scope="row">{{ row.date }}</th>
            <td v-for="kind in ['llm', 'tts']" :key="kind"><strong>{{ row[kind].total }}</strong><small>完成 {{ row[kind].completed }} · 未完成 {{ row[kind].incomplete }} · 待确认 {{ row[kind].pending }}</small></td>
          </tr></tbody>
        </table>
      </div>
      <details class="usage-notes"><summary>统计口径</summary>
        <p>按服务已接纳的唯一请求计数，包含免扣费调用。同一请求重试、语音缓存回放不重复计数；自带 API、健康探测和接纳前被拒绝的请求不计入。</p>
        <p>完成表示已有最终用量记录；未完成表示失败或取消并已释放预留；处理中或结果尚未核实的请求列为待确认。跨日请求归入发起日期，状态会随处理结果更新。</p>
        <p>只汇总已有服务记录，不读取对话或语音内容；历史未记录的调用无法补算。</p>
      </details>
    </template>
  </section>
</template>

<style scoped>
.official-usage { display: grid; gap: 16px; margin-top: 24px; min-width: 0; }
.usage-heading, .usage-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.usage-heading { justify-content: space-between; }
.usage-heading h3, .usage-card h4, .usage-card p { margin: 0; }
.usage-heading p, .usage-range { margin: 6px 0 0; font-size: .82rem; opacity: .75; }
.usage-filters label { display: grid; gap: 5px; font-size: .8rem; }
.usage-filters input, .usage-filters select { min-height: 40px; width: auto; max-width: 100%; padding: 7px 10px; border: 1px solid var(--ts-border); border-radius: 8px; color: inherit; background: var(--ts-surface); font: inherit; box-sizing: border-box; }
.usage-filters button { min-height: 40px; }
.usage-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.usage-card { display: grid; gap: 12px; padding: 18px; }
.usage-card h4 { font-size: .9rem; }
.usage-card p { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.usage-card strong { font-size: 1.8rem; font-variant-numeric: tabular-nums; }
.official-usage .terminal-card.usage-card span { color: inherit; font-weight: 400; }
.usage-card span, .usage-card small { font-size: .8rem; opacity: .75; }
.usage-table { max-height: 440px; overflow: auto; }
.official-usage .terminal-table-wrap.usage-table table { min-width: 0; width: 100%; table-layout: fixed; }
.official-usage .terminal-table-wrap.usage-table th, .official-usage .terminal-table-wrap.usage-table td { white-space: normal; }
.usage-table th[scope=row] { font-size: .8rem; font-weight: 500; width: 100px; }
.usage-table td strong { font-variant-numeric: tabular-nums; }
.official-usage .terminal-table-wrap.usage-table td small { display: block; margin-top: 4px; font-size: .75rem; opacity: .75; line-height: 1.6; }
.usage-notes { font-size: .8rem; line-height: 1.7; opacity: .8; }
.usage-notes summary { cursor: pointer; min-height: 36px; display: list-item; }
.usage-notes p { margin: 6px 0; }
.usage-error { color: var(--ts-danger, #b64237); }
@media (max-width: 600px) {
  .usage-filters { width: 100%; }
  .usage-filters label { flex: 1; min-width: 0; }
  .usage-filters input, .usage-filters select { width: 100%; }
  .usage-card { padding: 14px; }
  .official-usage .terminal-table-wrap.usage-table th, .official-usage .terminal-table-wrap.usage-table td { padding: 10px 8px; }
  .usage-table th[scope=row] { width: 80px; }
}
</style>
