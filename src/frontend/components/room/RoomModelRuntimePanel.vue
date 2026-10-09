<script setup>
import { computed, ref } from 'vue';
import runtime from '../../../../shared/model-runtime.cjs';
import RoomModelDiagnostics from './RoomModelDiagnostics.vue';

const props = defineProps({ settings: { type: Object, required: true }, modelValue: { type: Object, default: () => ({}) }, declaration: { type: Object, default: undefined } });
const emit = defineEmits(['update:modelValue']);
const level = ref('model');
const ids = computed(() => runtime.scopes(props.settings));
const group = computed(() => level.value === 'provider' ? 'providers' : 'models');
const layer = computed(() => props.modelValue?.[group.value]?.[ids.value[level.value]] || {});
const resolved = computed(() => {
  try { return { parameters: runtime.resolveParameters(props.settings), capabilities: runtime.resolveCapabilities(props.settings, props.declaration), error: '' }; }
  catch (error) { return { parameters: {}, capabilities: {}, error: error.message }; }
});
const capabilities = computed(() => {
  try { return runtime.resolveCapabilities({ ...props.settings, runtimeConfig: { ...props.modelValue, providers: {}, models: {} } }, props.declaration); }
  catch (_) { return {}; }
});
function update(kind, key, value) {
  const id = ids.value[level.value];
  if (!id) return;
  const config = JSON.parse(JSON.stringify(props.modelValue || {}));
  config.version = 1;
  config[group.value] ||= {};
  const item = config[group.value][id] ||= { parameters: {}, mappings: {}, capabilities: {} };
  item[kind] ||= {};
  if (value === '' || value === 'inherit') delete item[kind][key];
  else item[kind][key] = kind === 'capabilities' ? value === 'true' : kind === 'parameters' && !runtime.PARAMS[key].values ? Number(value)
    : kind === 'parameters' && key === 'reasoningEnabled' ? value === 'true' : value;
  emit('update:modelValue', config);
}
function reset() {
  const config = JSON.parse(JSON.stringify(props.modelValue || {}));
  if (config[group.value]) delete config[group.value][ids.value[level.value]];
  emit('update:modelValue', config);
}
const valueText = value => value === true ? '支持' : value === false ? '不支持' : '未知';
const parameterSource = source => ({ builtin: '请求默认值', provider: '供应商', model: '当前模型' })[source] || '待修正';
</script>

<template>
  <details class="settings-disclosure runtime-panel">
    <summary><span><strong>模型参数与能力</strong><small>参数继承 · 能力来源 · 人工覆盖</small></span></summary>
    <div class="settings-disclosure-body">
      <p class="field-hint">参数按内置、供应商、当前模型依次覆盖；留空沿用上一级。修改后使用页面上的保存按钮。</p>
      <div class="runtime-level-row">
        <label>编辑范围<select v-model="level" name="room-runtime-level"><option value="model">当前模型</option><option value="provider">当前供应商端点</option></select></label>
        <button type="button" class="ghost-btn compact" @click="reset">恢复此范围的默认设置</button>
      </div>
      <p class="field-hint">当前协议：{{ runtime.protocolFor(settings.apiUrl) }}。供应商配置适用于同一端点下的模型。</p>
      <p v-if="resolved.error" class="field-hint error" role="alert">{{ resolved.error }}</p>
      <div class="runtime-parameter-list">
        <div v-for="(spec, key) in runtime.PARAMS" :key="key" class="runtime-parameter-row">
          <label>{{ $ui(spec.label) }}
            <select v-if="spec.values" :name="`room-runtime-${key}`" :value="String(layer.parameters?.[key] ?? '')" @change="update('parameters', key, $event.target.value)">
              <option value="">继承默认值</option>
              <option v-for="value in spec.values" :key="String(value)" :value="String(value)">{{ value === true ? '开启' : value === false ? '关闭' : value }}</option>
            </select>
            <input v-else :name="`room-runtime-${key}`" type="number" :min="spec.min" :max="spec.max" :step="spec.integer ? 1 : 0.1" :value="layer.parameters?.[key] ?? ''" placeholder="继承默认值" @input="update('parameters', key, $event.target.value)" />
          </label>
          <label>{{ $ui('{0}映射', [$ui(spec.label)]) }}<select :name="`room-runtime-mapping-${key}`" :value="layer.mappings?.[key] || 'inherit'" @change="update('mappings', key, $event.target.value)">
            <option v-for="field in runtime.allowedMappings(settings, key)" :key="field" :value="field">{{ field === 'inherit' ? '继承上一级映射' : field === 'omit' ? '不发送此参数' : field }}</option>
          </select></label>
          <small class="field-hint">生效：{{ resolved.parameters[key]?.field || '待修正' }} · 值：{{ resolved.parameters[key]?.value ?? '沿用请求默认值' }} · 值来源：{{ $ui(parameterSource(resolved.parameters[key]?.valueSource)) }} · 映射来源：{{ ({ builtin: '内置', provider: '供应商', model: '当前模型' })[resolved.parameters[key]?.mappingSource] || '待修正' }}</small>
        </div>
      </div>
      <p class="field-hint">推理模型通常不接受温度与 Top P；关闭的映射不会发送参数。Token 留空不会新增回复长度限制。</p>
      <div v-if="level === 'model'" class="runtime-capability-list">
        <h3>当前模型能力</h3>
        <p class="field-hint">声明不等于实测。“未知”允许保留原有调用方式；人工覆盖仅作用于当前端点与模型，不会被目录刷新覆盖。</p>
        <div v-for="(label, key) in runtime.CAPABILITIES" :key="key" class="runtime-capability-row">
          <div><strong>{{ $ui(label) }}</strong><small>生效：{{ valueText(resolved.capabilities[key]?.value) }} · {{ $ui(runtime.SOURCE_LABELS[resolved.capabilities[key]?.source] || '未声明') }}</small><small>原始：{{ valueText(capabilities[key]?.declared) }}（供应商） · {{ valueText(capabilities[key]?.builtin) }}（内置）</small></div>
          <label>{{ $ui('{0}人工覆盖', [$ui(label)]) }}<select :name="`room-runtime-capability-${key}`" :value="String(layer.capabilities?.[key] ?? 'inherit')" @change="update('capabilities', key, $event.target.value)">
            <option value="inherit">使用能力声明</option><option value="true">声明支持</option><option value="false">声明不支持</option>
          </select></label>
        </div>
      </div>
    </div>
  </details>
  <RoomModelDiagnostics :settings="settings" :declaration="declaration" />
</template>
