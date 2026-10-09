<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import runtime from '../../../../shared/model-runtime.cjs';
import { runModelDiagnostic, exportDiagnosticReport } from '../../services/room/roomModelDiagnostics.mjs';
import { requestRoomReply } from '../../composables/room/useRoomChat';
import { prepareRoomImage } from '../../services/room/roomChatImages';

const props = defineProps({ settings: { type: Object, required: true }, declaration: { type: Object, default: undefined } });
const mode = ref('stream');
const prompt = ref('请用一句话回复连接测试。');
const image = ref(null);
const imageError = ref('');
const report = ref(null);
const running = ref(false);
let controller = null, imageRevision = 0, disposed = false;
const labels = { running: '测试中', success: '测试完成', warning: '部分能力未验证', error: '测试失败', cancelled: '已取消' };
const usage = computed(() => Object.entries(report.value?.usage || {}).map(([key, value]) => `${key}: ${value}`).join(' · ') || '供应商未提供');
function cancel() { controller?.abort(Object.assign(new Error('测试已取消'), { code: 'CANCELLED' })); }
function invalidate() { cancel(); controller = null; running.value = false; report.value = null; }
watch(() => JSON.stringify([props.settings, props.declaration, mode.value]), invalidate);
watch(prompt, invalidate);
async function selectImage(event) {
  const revision = ++imageRevision;
  invalidate(); image.value = null; imageError.value = '';
  const file = event.target.files?.[0];
  if (!file) return;
  try { const prepared = await prepareRoomImage(file); if (!disposed && revision === imageRevision) image.value = prepared; }
  catch (error) { if (!disposed && revision === imageRevision) imageError.value = error.message; }
}
async function run() {
  if (running.value) return;
  const current = new AbortController(); controller = current;
  running.value = true; report.value = null;
  const timer = setTimeout(() => current.abort(Object.assign(new Error('模型测试超时'), { code: 'TIMEOUT' })), 45000);
  try {
    const settings = JSON.parse(JSON.stringify(props.settings));
    settings.runtimeConfig = runtime.normalizeRuntime(settings.runtimeConfig);
    const id = runtime.scopes(settings).model;
    if (id && props.declaration) settings.runtimeConfig.declarations[id] = runtime.normalizeCapabilities(props.declaration);
    const result = await runModelDiagnostic({ settings, mode: mode.value, prompt: prompt.value, image: image.value, signal: current.signal,
      request: requestRoomReply, onProgress: state => { if (controller === current && !disposed) report.value = state; } });
    if (controller === current && !disposed) report.value = result;
  } catch (_) {
    if (controller === current && !disposed) report.value = { status: 'error', error: { message: '参数配置无效，请先修正模型参数' }, warnings: [], events: [] };
  } finally {
    clearTimeout(timer);
    if (controller === current) { running.value = false; controller = null; }
  }
}
function download() {
  if (!report.value?.version) return;
  const url = URL.createObjectURL(new Blob([exportDiagnosticReport(report.value)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'room-model-diagnostic.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
onBeforeUnmount(() => { disposed = true; imageRevision++; cancel(); });
</script>

<template>
  <details class="settings-disclosure runtime-workbench">
    <summary><span><strong>模型诊断工作台</strong><small>文本 · 流式 · 图片 · 工具协议</small></span></summary>
    <div class="settings-disclosure-body">
      <p class="field-hint">使用当前表单与参数，不必先保存。每次点击会请求当前模型；测试不写入聊天、日记或长期记忆。</p>
      <div class="form-grid">
        <label>测试项目<select v-model="mode" name="room-diagnostic-mode"><option value="text">文本回复</option><option value="stream">流式回复</option><option value="image">图片输入</option><option value="tools">工具调用与续轮</option></select></label>
        <label v-if="mode !== 'tools'">测试消息<textarea v-model="prompt" name="room-diagnostic-prompt" maxlength="2000" /></label>
        <label v-if="mode === 'image'">测试图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" name="room-diagnostic-image" @change="selectImage" /></label>
      </div>
      <p v-if="imageError" class="field-hint error" role="alert">{{ imageError }}</p>
      <img v-if="mode === 'image' && image" :src="image.dataUrl" alt="测试图片预览" class="diagnostic-image" />
      <p v-if="mode === 'tools'" class="field-hint">只测试模型生成工具参数与接续回复，工具结果由浏览器固定提供。</p>
      <div class="runtime-workbench-actions"><button type="button" class="ghost-btn" :disabled="running" @click="run">{{ running ? '测试中…' : '开始模型测试' }}</button><button v-if="running" type="button" class="ghost-btn" @click="cancel">取消测试</button></div>
      <section v-if="report" class="diagnostic-result" aria-label="模型诊断结果" aria-live="polite">
        <strong>{{ $ui(labels[report.status]) }}</strong>
        <p v-if="report.error" class="field-hint error">{{ $ui(report.error.message) }}</p>
        <dl class="diagnostic-metrics"><div><dt>协议 / 请求</dt><dd>{{ report.protocol || '—' }} / {{ report.transport === 'proxy' ? '受限代理' : '浏览器直连' }}</dd></div><div><dt>HTTP</dt><dd>{{ report.httpStatus ?? '—' }}</dd></div><div><dt>首段文字</dt><dd>{{ report.firstTokenMs === null || report.firstTokenMs === undefined ? '—' : `${report.firstTokenMs} ms` }}</dd></div><div><dt>总耗时</dt><dd>{{ report.durationMs ?? 0 }} ms</dd></div><div><dt>流事件</dt><dd>{{ report.eventCount ?? 0 }}</dd></div><div><dt>响应格式</dt><dd>{{ report.contentType || '—' }}</dd></div></dl>
        <p class="field-hint">用量：{{ $ui(usage) }}</p>
        <p v-for="warning in report.warnings" :key="warning" class="field-hint">{{ $ui(warning) }}</p>
        <pre v-if="report.preview" class="diagnostic-preview">{{ report.preview }}</pre>
        <details v-if="report.events?.length"><summary>查看测试阶段</summary><ol class="diagnostic-events"><li v-for="(event, index) in report.events" :key="index">{{ event.elapsedMs }} ms · {{ ({ request: '发送请求', response: '接收响应', fallback: '降级为一次性响应', tool: '本地测试工具', model: '模型生成' })[event.type] || event.type }}</li></ol></details>
        <button v-if="report.version && !running" type="button" class="ghost-btn compact" @click="download">下载脱敏诊断报告</button>
        <p class="field-hint">报告只包含协议、参数、阶段与用量，不包含密钥、测试消息、回复正文或图片；测试结果不自动更改能力声明。</p>
      </section>
    </div>
  </details>
</template>
