<script setup>
import { computed, ref } from 'vue';
import TsButton from '../components/TsButton.vue';
import TsIcon from '../components/TsIcon.vue';

import TsPageHeader from '../components/TsPageHeader.vue';
import TsButtonLink from '../components/TsButtonLink.vue';
import TsFilterChip from '../components/TsFilterChip.vue';
import TsToggle from '../components/TsToggle.vue';
import TsField from '../components/TsField.vue';
import { useSeasonTheme } from '../composables/useSeasonTheme';
import { siteArt } from '../data/siteArt';

defineProps({ theme: String });
const emit = defineEmits(['toggle-theme']);
const { selection, setPreference } = useSeasonTheme();
const seasons = { spring: '春樱', summer: '夏海', autumn: '秋枫', winter: '冬雪' };
const swatches = { paper: '月白纸面', surface: '卡片底色', ink: '正文', muted: '辅助文字', accent: '当季强调', danger: '危险操作' };
const favourite = ref(false);
const customLabel = ref('');

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
    <TsPageHeader title="月读设计系统" description="月白樱粉 · 四季配色与界面组件" :art="siteArt.hero">
      <template #actions><TsButtonLink to="/gallery" variant="primary">预览图库<TsIcon name="arrowRight" :size="16" /></TsButtonLink>
        <TsButtonLink to="/plaza" variant="ghost">预览广场</TsButtonLink></template>
    </TsPageHeader>
    <section class="samples-palette">
      <div class="samples-section-head"><h2>四季配色</h2><div class="ui-actions" role="group" aria-label="季节">
        <TsFilterChip v-for="(label, key) in seasons" :key="key" size="sm" :selected="selection.artwork === key" @click="setPreference({ mode: key })">{{ $ui(label) }}</TsFilterChip>
        <TsToggle :pressed="theme === 'dark'" aria-label="夜间模式" @click="emit('toggle-theme', $event)"><TsIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="17" />夜间模式</TsToggle>
      </div></div>
      <ul class="samples-swatches"><li v-for="(name, token) in swatches" :key="token">
        <span aria-hidden="true" :style="{ backgroundColor: 'var(--' + token + ')' }"></span>{{ $ui(name) }}
      </li></ul>
    </section>
    <section>
      <div class="samples-section-head"><h2>操作与表单</h2>
        <div class="ui-actions samples-controls">
          <label>示例语言 <select class="ui-field" :value="language" @change="selectLanguage"><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option></select></label>
          <label><input type="checkbox" v-model="narrow"> 窄栏预览</label>
          <label><input type="checkbox" v-model="busy"> 忙碌状态</label>
        </div>
      </div>
      <div class="ui-grid" :lang="language" :class="{ 'samples-narrow': narrow }">
        <section class="ui-panel ui-stack">
          <h3>按钮与尺寸</h3>
          <div class="ui-actions"><TsButton variant="primary" size="lg" :loading="busy" @click="feedback = t.primary">{{ t.primary }}</TsButton><TsButton @click="feedback = t.secondary">{{ t.secondary }}</TsButton><TsButton size="sm" variant="ghost" @click="feedback = t.quiet">{{ t.quiet }}</TsButton></div>
          <div class="ui-actions"><TsToggle :pressed="favourite" @click="favourite = !favourite"><TsIcon name="heart" :size="16" />{{ language === 'en' ? 'Favourite' : language === 'ja' ? 'お気に入り' : '收藏' }}</TsToggle><TsButton variant="danger" @click="feedback = t.danger">{{ t.danger }}</TsButton></div>
          <div class="ui-actions"><TsButtonLink variant="accent" to="/payments"><TsIcon name="creditCard" :size="17" />{{ language === 'en' ? 'Payments' : language === 'ja' ? 'お支払い' : '支付中心' }}</TsButtonLink><TsButton disabled>{{ t.primary }}</TsButton></div>
        </section>
        <section class="ui-panel ui-stack">
          <h3>筛选与提交</h3>
          <div class="ui-actions"><TsFilterChip v-for="(item, i) in t.filters" :key="i" :selected="choice === i" @click="choice = i">{{ item }}</TsFilterChip></div>
          <form class="ui-stack" @submit.prevent="feedback = roomName">
            <TsField v-model="roomName" :label="t.field" required maxlength="72" />
            <TsField id="test-action-label" v-model="customLabel" label="试用长按钮文字" maxlength="320" :placeholder="t.long" />
            <div class="ui-modal-footer"><TsButton variant="primary" type="submit" :loading="busy"><TsIcon name="check" :size="18" /><span>{{ customLabel || t.long }}</span></TsButton></div>
          </form>
        </section>
      </div>
    </section>
    <output class="samples-feedback" aria-live="polite">{{ feedback }}</output>
  </main>
</template>

<style scoped>
.samples-page { max-width: 72rem; gap: var(--ui-section); }
.samples-section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-stack); margin-bottom: 1.25rem; }
.samples-section-head h2, .ui-panel h3 { font: 500 clamp(1.25rem, 1rem + .8vw, 1.75rem)/1.4 var(--serif); }
.samples-palette { padding-bottom: var(--ui-stack); border-bottom: 1px solid var(--line); }
.samples-swatches { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%, 6.5rem),1fr)); gap: var(--ui-gap); padding: 0; margin: 0; list-style: none; }
.samples-swatches li { color: var(--muted); font-size: var(--ui-control-type); }
.samples-swatches span { display: block; height: 2.25rem; border-radius: var(--r-control); box-shadow: inset 0 0 0 1px var(--line); margin-bottom: .375rem; }
.samples-controls label { display: inline-flex; align-items: center; gap: var(--ui-gap); }
.samples-controls { column-gap: var(--ui-stack); }
.samples-narrow { inline-size: min(100%, 20rem); }
.samples-feedback { color: var(--muted); }
</style>
