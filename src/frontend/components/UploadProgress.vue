<script setup>
import { computed } from 'vue';
const props = defineProps({ state: { type: Object, required: true }, cancelable: Boolean });
defineEmits(['cancel', 'dismiss']);
const progress = computed(() => Number.isFinite(props.state.progress) && !['preparing', 'retrying'].includes(props.state.stage) ? props.state.progress : null);
function bytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const index = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
</script>

<template>
  <section v-if="state.stage !== 'idle'" class="upload-progress-card" :data-stage="state.stage" :aria-busy="state.active">
    <div class="upload-progress-head">
      <div class="upload-progress-file">
        <strong :title="state.fileName">{{ state.fileName || $ui('文件上传') }}</strong>
        <span v-if="state.fileSize > 0">{{ $ui('原文件') }} · {{ bytes(state.fileSize) }}</span>
      </div>
      <button v-if="cancelable && state.active" type="button" class="ghost-btn upload-progress-action" @click="$emit('cancel')">{{ $ui('暂停上传') }}</button>
      <button v-else-if="!state.active" type="button" class="ghost-btn upload-progress-action" @click="$emit('dismiss')">{{ $ui('收起') }}</button>
    </div>
    <div class="upload-progress-summary" role="status" aria-live="polite" aria-atomic="true">
      <span>{{ $ui(state.label) }}</span>
      <strong v-if="progress !== null">{{ Math.round(progress) }}%</strong>
    </div>
    <progress v-if="state.active || progress !== null || state.total > 0" :value="progress === null ? undefined : progress" max="100" :aria-label="$ui('文件传输进度')" />
    <div v-if="state.total > 0 || state.loaded > 0 || state.stage === 'processing'" class="upload-progress-bytes">
      <span v-if="state.total > 0 || state.loaded > 0">{{ $ui('已传输') }} {{ bytes(state.loaded) }}<template v-if="state.total > 0"> / {{ bytes(state.total) }}</template></span>
      <span v-if="state.stage === 'processing'">{{ $ui('传输完成，等待服务器确认') }}</span>
    </div>
  </section>
</template>

<style scoped>
.upload-progress-card{box-sizing:border-box;width:100%;min-width:0;padding:1rem;margin-block:.8rem;border:1px solid var(--line);border-radius:var(--ts-radius-card,16px);background:var(--panel);color:var(--text);display:grid;gap:.7rem;line-height:1.6}
.upload-progress-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:.75rem;min-width:0}
.upload-progress-file{min-width:0;display:grid;gap:.2rem;overflow-wrap:anywhere;white-space:normal}
.upload-progress-file strong{font-size:.92rem;line-height:1.6}.upload-progress-file>span,.upload-progress-bytes{color:var(--muted);font-size:.8rem}
.upload-progress-action{white-space:nowrap;flex-shrink:0;min-height:40px;align-self:start}
.upload-progress-summary{display:flex;align-items:start;justify-content:space-between;gap:1rem;min-width:0;font-size:.86rem}
.upload-progress-summary>span{min-width:0;overflow-wrap:anywhere}.upload-progress-summary>strong{flex:none;font-variant-numeric:tabular-nums;color:var(--primary,var(--text))}
progress{appearance:none;display:block;width:100%;height:9px;overflow:hidden;border:0;border-radius:999px;background:color-mix(in srgb,var(--text) 10%,transparent)}
progress::-webkit-progress-bar{border-radius:999px;background:color-mix(in srgb,var(--text) 10%,transparent)}
progress::-webkit-progress-value{border-radius:999px;background:linear-gradient(90deg,var(--pink,#b4527c),var(--cyan,#7edbe8))}
progress::-moz-progress-bar{border-radius:999px;background:linear-gradient(90deg,var(--pink,#b4527c),var(--cyan,#7edbe8))}
progress:indeterminate{background:linear-gradient(90deg,transparent,var(--pink,#b4527c),transparent);background-size:200% 100%;animation:upload-wait 1.8s ease-in-out infinite}
.upload-progress-bytes{display:flex;flex-wrap:wrap;gap:.3rem 1rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
[data-stage='error']{border-color:color-mix(in srgb,#ce516a 65%,var(--line))}
@keyframes upload-wait{from{background-position:100% 0}to{background-position:-100% 0}}
@media(max-width:440px){.upload-progress-head{grid-template-columns:minmax(0,1fr)}.upload-progress-action{justify-self:start}.upload-progress-card{padding:.85rem}}
@media(prefers-reduced-motion:reduce){progress:indeterminate{animation:none}}
</style>
