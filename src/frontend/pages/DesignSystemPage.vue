<script setup>
import { computed, ref } from 'vue';
import TsButton from '../components/TsButton.vue';
import TsIcon from '../components/TsIcon.vue';

const copy = {
  zh: { primary: '保存设置', secondary: '查看详情', danger: '删除草稿', quiet: '取消', filters: ['全部', '未读', '已收藏'], long: '保存当前房间的语音、字幕与对话偏好设置', field: '房间名称', value: '八千代的房间' },
  en: { primary: 'Save settings', secondary: 'View details', danger: 'Delete draft', quiet: 'Cancel', filters: ['All', 'Unread', 'Saved'], long: 'Save voice, caption and conversation preferences for this room', field: 'Room name', value: 'Yachiyo’s room' },
  ja: { primary: '設定を保存', secondary: '詳細を見る', danger: '下書きを削除', quiet: 'キャンセル', filters: ['すべて', '未読', '保存済み'], long: 'この部屋の音声・字幕・会話に関する設定をまとめて保存する', field: '部屋の名前', value: '八千代の部屋' }
};
const language = ref('zh');
const t = computed(() => copy[language.value]);
const choice = ref(0), roomName = ref(copy.zh.value), feedback = ref(''), narrow = ref(false), busy = ref(false);
function selectLanguage(event) {
  language.value = event.target.value;
  roomName.value = t.value.value;
  feedback.value = '';
}
</script>

<template>
  <main data-ui-layout="content" class="ui-page ui-stack samples-page">
    <header class="ui-heading"><h1>月读设计系统</h1><p>按钮、输入框和页面布局的实际组件。切换语言和内容宽度，可以检查长标签、选中和键盘焦点。</p></header>
    <div class="ui-actions samples-controls">
      <label>示例语言 <select class="ui-field" :value="language" @change="selectLanguage"><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option></select></label>
      <label><input type="checkbox" v-model="narrow"> 窄栏预览</label>
      <label><input type="checkbox" v-model="busy"> 忙碌状态</label>
    </div>
    <div class="ui-grid" :lang="language" :class="{ 'samples-narrow': narrow }">
      <section class="ui-panel ui-stack">
        <h2>操作层级</h2>
        <div class="ui-actions"><TsButton variant="primary" :busy="busy" @click="feedback = t.primary">{{ t.primary }}</TsButton><TsButton @click="feedback = t.secondary">{{ t.secondary }}</TsButton></div>
        <div class="ui-actions"><TsButton variant="quiet" @click="feedback = t.quiet">{{ t.quiet }}</TsButton><TsButton variant="danger" @click="feedback = t.danger">{{ t.danger }}</TsButton></div>
        <div class="ui-actions"><RouterLink data-ui="accent" to="/payments"><TsIcon name="creditCard" :size="18" />{{ language === 'en' ? 'Payments' : language === 'ja' ? 'お支払い' : '支付中心' }}</RouterLink><TsButton disabled>{{ t.primary }}</TsButton></div>
      </section>
      <section class="ui-panel ui-stack">
        <h2>筛选与表单</h2>
        <div class="ui-actions"><TsButton v-for="(item, i) in t.filters" :key="i" variant="choice" :aria-pressed="choice === i" @click="choice = i">{{ item }}</TsButton></div>
        <form class="ui-stack" @submit.prevent="feedback = roomName">
          <label class="ui-field-group">{{ t.field }}<input class="ui-field" v-model="roomName" required maxlength="72"></label>
          <div class="ui-actions"><TsButton variant="primary" type="submit" :busy="busy"><TsIcon name="check" :size="18" /><span>{{ t.long }}</span></TsButton></div>
        </form>
      </section>
    </div>
    <output class="samples-feedback" aria-live="polite">{{ feedback }}</output>
  </main>
</template>

<style scoped>
.samples-page { max-width: 65rem; padding-block: var(--ui-section); }
.samples-controls label { display: inline-flex; align-items: center; gap: var(--ui-gap); }
.samples-controls { column-gap: var(--ui-stack); }
.samples-narrow { inline-size: min(100%, 20rem); }
.samples-feedback { color: var(--muted); }
</style>
