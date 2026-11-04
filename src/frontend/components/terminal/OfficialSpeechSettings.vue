<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
const props = defineProps({ request: { type: Function, required: true } });
const config = ref(null), primary = ref(null), fish = ref(null), newKey = ref('');
const error = ref(''), notice = ref(''), busy = ref(false), checking = ref(false), health = ref(null);
const selected = ref('default');
const draft = computed(() => selected.value === 'fish-audio' ? fish.value : primary.value);
const controller = new AbortController();
const request = (path, options) => props.request('/official-services/tts' + path, { ...options, signal:controller.signal });
function reset(data) {
  config.value = data;
  primary.value = { enabled: data.primary.enabled, language: data.primary.language };
  fish.value = { enabled: data.fish.enabled, language: data.fish.language, voice: data.fish.voice,
    model: data.fish.model, models: [...data.fish.models] };
  newKey.value = '';
}
async function load() {
  busy.value = true; error.value = ''; notice.value = '';
  try { reset(await request('')); }
  catch (e) { if (!controller.signal.aborted) error.value = e.message; }
  finally { busy.value = false; }
}
function selectModel(model) {
  fish.value.model = model;
  if (!fish.value.models.includes(model)) fish.value.models.push(model);
}
async function check() {
  checking.value = true; error.value = ''; health.value = null;
  try { health.value = await request('/status'); }
  catch (e) { if (!controller.signal.aborted) error.value = e.message; }
  finally { checking.value = false; }
}
async function save() {
  const engine = selected.value;
  const body = { ...draft.value, revision: config.value.revision, engine };
  if (engine === 'fish-audio' && newKey.value) body.apiKey = newKey.value.trim();
  busy.value = true; error.value = ''; notice.value = '';
  try {
    config.value = await request('', { method:'PUT', body: JSON.stringify(body) });
    if (engine === 'fish-audio') newKey.value = '';
    health.value = null; notice.value = '语音配置已保存，新朗读请求使用新设置。';
  } catch (e) { if (!controller.signal.aborted) error.value = e.message; }
  finally { busy.value = false; }
}
onMounted(load);
onUnmounted(() => { controller.abort(); newKey.value = ''; });
</script>
<template>
  <section class="terminal-settings-block speech-settings" aria-labelledby="speech-heading">
    <div class="terminal-settings-title"><h2 id="speech-heading">语音合成</h2><span>TTS</span></div>
    <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
    <p v-if="notice" class="form-message success" role="status">{{ notice }}</p>
    <div class="speech-actions">
      <button class="ghost-btn" type="button" :disabled="busy || checking" @click="load">重新读取配置</button>
      <button class="ghost-btn" type="button" :disabled="busy || checking || !config" @click="check">{{ checking ? '检测中' : '检测音源' }}</button>
    </div>
    <p v-if="!config && busy" role="status">正在读取语音配置…</p>
    <template v-if="config">
      <div class="speech-sources" aria-label="官方音源">
        <button v-for="id in ['default','fish-audio']" :key="id" type="button" :aria-pressed="selected === id" :disabled="busy" @click="selected = id; notice = ''; error = ''">
          <strong>{{ id === 'default' ? config.primary.protocol : 'Fish Audio' }}</strong>
          <span>{{ (id === 'default' ? config.primary.enabled : config.fish.enabled) ? '已启用' : '已关闭' }}</span>
          <small v-if="health">{{ (id === 'default' ? health.primary.online : health.fish.online) ? '算力在线' : '算力离线' }}</small>
        </button>
      </div>
      <form @submit.prevent="save"><fieldset :disabled="busy || checking">
        <legend>{{ selected === 'default' ? '主音源' : 'Fish Audio' }}</legend>
        <label class="terminal-check"><input v-model="draft.enabled" type="checkbox" /> 启用此音源</label>
        <label>朗读语言<select v-model="draft.language"><option v-for="language in config.languages" :key="language" :value="language">{{ language }}</option></select></label>
        <template v-if="selected === 'fish-audio'">
          <label>音色 ID<input v-model.trim="fish.voice" required maxlength="32" pattern="[a-fA-F0-9]{32}" spellcheck="false" /></label>
          <label>默认模型<select :value="fish.model" @change="selectModel($event.target.value)"><option v-for="model in config.availableModels" :key="model">{{ model }}</option></select></label>
          <fieldset class="model-access"><legend>向普通用户开放的模型</legend>
            <label v-for="model in config.availableModels" :key="model" class="terminal-check"><input v-model="fish.models" type="checkbox" :value="model" :disabled="model === fish.model" /> {{ model }}</label>
          </fieldset>
          <p>默认模型始终开放。Room 根据 Fish 账户的可用额度显示模型。</p>
          <label>更换 Fish 密钥<input v-model="newKey" type="password" autocomplete="new-password" maxlength="512" placeholder="留空保留现有密钥" /></label>
          <small>{{ config.fish.hasKey ? '已配置密钥' : '尚未配置密钥' }}</small>
        </template>
        <button class="primary-btn" type="submit" :disabled="busy || checking">保存音源设置</button>
      </fieldset></form>
    </template>
  </section>
</template>
<style scoped>
.speech-settings { min-width: 0; }
.speech-actions,.speech-sources { display: flex; flex-wrap: wrap; gap: .6rem; margin-bottom: 1rem; }
.speech-sources button { display: grid; gap: .25rem; flex: 1; min-width: 8rem; text-align: left; padding: .8rem 1rem; background: var(--ts-surface); color: inherit; border-radius: 12px; border: 1px solid var(--ts-border); cursor: pointer; }
.speech-sources button[aria-pressed="true"] { border-color: var(--ts-accent); }
.speech-sources span,.speech-settings p,.speech-settings small { color: var(--ts-muted); font-size: .85rem; }
.speech-settings fieldset { display: grid; gap: .85rem; min-width: 0; padding: 1rem; border-radius: 12px; border: 1px solid var(--ts-border); }
.speech-settings legend { padding-inline: .35rem; }
.speech-settings label { display: grid; gap: .3rem; min-width: 0; }
.speech-settings .terminal-check { display: flex; align-items: center; gap: .5rem; }
.speech-settings input[type="checkbox"] { width: 1rem; height: 1rem; flex: none; }
.speech-settings .model-access { grid-template-columns: repeat(auto-fit,minmax(8.6rem,1fr)); }
.speech-settings .primary-btn { justify-self: start; }
</style>
