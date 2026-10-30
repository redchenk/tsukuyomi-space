<script setup>
import { computed, ref } from 'vue';
import runtime from '../../../../shared/room-chat-runtime.cjs';
import RoomPromptSources from './RoomPromptSources.vue';
import { readRoomDialogueSettings, roomDialogueSettingsKey, saveRoomDialogueSettings } from '../../services/room/roomDialogueSettings';

const ownerKey = roomDialogueSettingsKey();
const draft = ref(readRoomDialogueSettings());
const feedback = ref('');
const error = ref('');
const warnings = ref([]);
const loading = ref(false);
const previewMessage = ref('晚上好，今天有什么想做的？');
const preview = computed(() => runtime.compile({ settings: draft.value, message: previewMessage.value }).trace);
const applied = ref(JSON.stringify(draft.value));
const dirty = computed(() => JSON.stringify(draft.value) !== applied.value);

async function importReference(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  error.value = ''; feedback.value = ''; loading.value = true;
  try {
    if (file.size > 200000) throw new Error('请选择不超过 200 KB 的 JSON 角色卡');
    const result = runtime.importCard(await file.text());
    if (ownerKey !== roomDialogueSettingsKey()) throw new Error('账号已变化，请重新打开对话设置');
    draft.value.reference = result.card;
    draft.value.referenceEnabled = true;
    draft.value.worldBookEnabled = true;
    warnings.value = result.warnings;
    feedback.value = '已载入预览并开启角色卡与世界书，保存后用于聊天。';
  } catch (cause) { error.value = cause.message; }
  finally { loading.value = false; }
}
function save() {
  if (loading.value) return false;
  try {
    draft.value = saveRoomDialogueSettings(draft.value, ownerKey);
    applied.value = JSON.stringify(draft.value);
    error.value = ''; feedback.value = '已保存，下一轮聊天生效。';
    return true;
  } catch (cause) { error.value = cause.message; return false; }
}
function cancel() { draft.value = JSON.parse(applied.value); warnings.value = []; error.value = ''; feedback.value = '已恢复到上次保存的设置。'; }
defineExpose({ dirty, loading, save, cancel });
function exportCard() {
  const blob = new Blob([JSON.stringify(runtime.exportBuiltinCard(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'yachiyo-post-film-v3.character.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<template>
<details class="room-dialogue-settings" data-testid="room-dialogue-settings">
  <summary><strong>角色与对话</strong><span>结局后的日常 · 剧透偏好 · 角色卡与世界书</span></summary>
  <div class="dialogue-body">
    <p>八千代默认生活在电影结局之后：期待日常、创作与相聚，保留原作身份和关系。你的称呼和明确约定来自当前账号的记忆。</p>
    <label>剧透偏好<select v-model="draft.spoiler" aria-label="剧透偏好"><option value="avoid">不主动剧透，问到时再聊</option><option value="allow">可以聊结局与身世</option></select></label>
    <label>希望八千代怎样认识你<textarea v-model="draft.userPersona" maxlength="800" placeholder="可选：希望使用的称呼、交流习惯；不要填写密码等敏感信息" /></label>
    <label>今天的聊天场景<textarea v-model="draft.scenario" maxlength="1200" placeholder="可选：一起讨论新作品，或只是轻松聊聊。留空使用结局后的日常。" /></label>
    <p class="hint">只保存在当前账号的这个浏览器中。长期记忆关闭后，下面“长期记忆”中的记录不会用于聊天；这里主动填写的介绍仍会使用。</p>
    <div class="actions">
      <label class="file-button">导入参考角色卡<input type="file" accept=".json,application/json" :disabled="loading" @change="importReference" /></label>
      <button type="button" @click="exportCard">导出八千代角色卡</button>
    </div>
    <p class="hint">支持 Character Card V2 JSON。借鉴表达与场景，不替换八千代身份。不会执行扩展脚本，也不会把示例当作你们经历过的对话。</p>
    <div v-if="draft.reference" class="reference-preview">
      <h3>{{ draft.reference.name }}</h3>
      <p v-if="draft.reference.creator" class="hint">作者：{{ draft.reference.creator }}</p>
      <label>参考说明<textarea v-model="draft.reference.description" maxlength="3000" /></label>
      <label>可借鉴的性格表达<textarea v-model="draft.reference.personality" maxlength="3000" /></label>
      <label>参考场景<textarea v-model="draft.reference.scenario" maxlength="2000" /></label>
      <details v-if="draft.reference.mes_example"><summary>查看示例（不会发送给模型）</summary><pre>{{ draft.reference.mes_example }}</pre></details>
      <p v-for="warning in warnings" :key="warning" class="hint">{{ warning }}</p>
      <label class="toggle"><input type="checkbox" v-model="draft.referenceEnabled" />在聊天中参考这张卡</label>
      <label class="toggle"><input type="checkbox" v-model="draft.worldBookEnabled" />启用卡片世界书（{{ draft.reference.character_book.entries.length }} 条）</label>
      <p class="hint">两个开关分别生效，保存后用于下一轮聊天。世界书按关键词匹配，“始终参考”的条目会直接带入。</p>
      <details v-if="draft.reference.character_book.entries.length"><summary>检查世界书条目</summary>
        <article v-for="(entry, index) in draft.reference.character_book.entries" :key="index">
          <label class="toggle"><input type="checkbox" v-model="entry.enabled" />{{ entry.name || `条目 ${index + 1}` }}</label>
          <small>{{ entry.constant ? '始终参考' : `关键词：${entry.keys.join('、') || '无'}` }}</small>
          <label class="toggle"><input type="checkbox" v-model="entry.spoiler" />包含结局或身世剧透</label>
          <textarea v-model="entry.content" maxlength="2000" :aria-label="`世界书内容 ${index + 1}`" />
        </article>
      </details>
      <button type="button" @click="draft.reference = null; draft.referenceEnabled = false; draft.worldBookEnabled = false">移除参考卡</button>
    </div>
    <details><summary>预览本轮会参考什么</summary>
      <label>试写一句话<input v-model="previewMessage" maxlength="1000" /></label>
      <p class="hint">仅在本机检查编排，不调用模型，不保存聊天。</p>
      <RoomPromptSources :trace="preview" />
      <p>世界书命中 {{ preview.worldBook.selected.length }} 条<span v-if="preview.worldBook.omitted.length">，{{ preview.worldBook.omitted.length }} 条因篇幅限制省略</span>。</p>
      <ol><li v-for="block in preview.blocks" :key="block.id">{{ block.title }}<span v-if="block.truncated">（已缩短）</span></li></ol>
    </details>
    <div class="actions"><button type="button" :disabled="loading || !dirty" @click="save">保存对话设置</button><button type="button" :disabled="loading || !dirty" @click="cancel">撤销未保存修改</button></div>
    <p v-if="feedback" role="status">{{ feedback }}</p><p v-if="error" role="alert" class="error">{{ error }}</p>
  </div>
</details>

</template>

<style scoped>
.room-dialogue-settings { margin: 18px 0; border: 1px solid var(--border-color, #8884); border-radius: 14px; background: var(--surface-color, transparent); }
summary { cursor: pointer; padding: 14px; line-height: 1.6; }
summary span { display: block; font-size: .85rem; opacity: .7; }
.dialogue-body { padding: 0 16px 16px; display: grid; gap: 14px; }
.dialogue-body p { margin: 0; line-height: 1.7; }
label { display: grid; gap: 8px; font-size: .9rem; }
textarea, select, input:not([type=checkbox]):not([type=file]) { font: inherit; color: inherit; background: var(--bg-color, transparent); border: 1px solid #8885; border-radius: 8px; padding: 10px; min-width: 0; width: 100%; box-sizing: border-box; }
textarea { min-height: 84px; resize: vertical; }
.toggle { display: flex; align-items: center; gap: 10px; min-height: 44px; cursor: pointer; }
.toggle input[type='checkbox'] { appearance: auto; flex: 0 0 18px; width: 18px; min-width: 18px; max-width: 18px; height: 18px; min-height: 18px; max-height: 18px; margin: 0; padding: 0; accent-color: var(--ts-accent); box-shadow: none; cursor: pointer; }
.hint, small { opacity: .7; font-size: .82rem; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
button, .file-button { min-height: 44px; padding: 10px 14px; border: 1px solid #8885; border-radius: 9px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
.file-button { position: relative; overflow: hidden; display: block; }
.file-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.reference-preview { display: grid; gap: 12px; }
article { border-top: 1px solid #8883; padding: 12px 0; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.error { color: #d64550; }
input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible, summary:focus-visible, .file-button:focus-within { outline: 2px solid var(--accent-color, #ac72bc); outline-offset: 2px; }
</style>
