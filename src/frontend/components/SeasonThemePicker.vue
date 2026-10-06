<script setup>
import { computed } from 'vue';
import TsIcon from './TsIcon.vue';
import { useSeasonTheme } from '../composables/useSeasonTheme';
import { AVAILABLE_SEASONS } from '../services/seasonTheme.mjs';

const props = defineProps({ lang: { type: String, default: 'zh' } });
const { preference, selection, saved, setPreference } = useSeasonTheme();
const copy = computed(() => ({
  zh: { title: '季节主题', mode: '主题选择', auto: '自动跟随季节', spring: '春日樱花', summer: '夏夜花火', autumn: '红叶月夜', winter: '雪夜灯语', hemisphere: '所在半球', north: '北半球', south: '南半球', hint: '按设备本地日期切换，不影响浅色／暗色。', fallback: '该季节素材准备中，暂用春日樱花。', unsaved: '浏览器未允许保存，选择仅本次有效。', seasons: { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' } },
  ja: { title: '季節テーマ', mode: 'テーマを選択', auto: '季節に合わせる', spring: '春の桜', summer: '夏夜の花火', autumn: '紅葉と月夜', winter: '雪夜の灯り', hemisphere: 'お住まいの半球', north: '北半球', south: '南半球', hint: '端末の日付で切替。ライト／ダークは別設定です。', fallback: 'この季節の素材は準備中。春の桜を表示します。', unsaved: '保存が許可されていないため、今回のみ適用します。', seasons: { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } },
  en: { title: 'Seasonal theme', mode: 'Choose theme', auto: 'Follow the season', spring: 'Spring blossoms', summer: 'Summer fireworks', autumn: 'Autumn moon', winter: 'Winter lanterns', hemisphere: 'Your hemisphere', north: 'Northern hemisphere', south: 'Southern hemisphere', hint: 'Uses your device date. Light / dark stays independent.', fallback: 'Art for this season is coming later; showing spring blossoms.', unsaved: 'Browser storage is unavailable; this choice lasts for this visit.', seasons: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' } }
}[props.lang] || {}));
const currentLabel = computed(() => preference.value.mode === 'auto'
  ? `${copy.value.auto} · ${copy.value.seasons[selection.value.calendar]}`
  : copy.value[selection.value.artwork]);
</script>

<template>
  <details class="site-season-picker">
    <summary class="site-preference-button"><TsIcon name="sparkles" :size="18" /><span>{{ copy.title }}</span><TsIcon name="chevronDown" :size="12" /></summary>
    <div class="site-season-fields">
      <label for="site-season-mode">{{ copy.mode }}</label>
      <div class="site-season-select"><select id="site-season-mode" :value="preference.mode" @change="setPreference({ mode: $event.target.value })">
        <option value="auto">{{ copy.auto }}</option>
        <option v-for="season in AVAILABLE_SEASONS" :key="season" :value="season">{{ copy[season] }}</option>
      </select><TsIcon name="chevronDown" :size="14" /></div>
      <template v-if="preference.mode === 'auto'">
        <label for="site-season-hemisphere">{{ copy.hemisphere }}</label>
        <div class="site-season-select"><select id="site-season-hemisphere" :value="preference.hemisphere" @change="setPreference({ hemisphere: $event.target.value })">
          <option value="north">{{ copy.north }}</option>
          <option value="south">{{ copy.south }}</option>
        </select><TsIcon name="chevronDown" :size="14" /></div>
      </template>
      <p role="status">{{ currentLabel }}<br>{{ selection.requested !== selection.artwork ? copy.fallback : copy.hint }}</p>
      <p v-if="!saved" role="status">{{ copy.unsaved }}</p>
    </div>
  </details>
</template>

<style scoped>
.site-season-picker { flex-basis: 100%; min-width: 0; }
.site-season-picker summary { display: inline-flex; list-style: none; cursor: pointer; }
.site-season-picker summary::-webkit-details-marker { display: none; }
.site-season-picker summary:focus-visible { outline: 2px solid var(--ts-accent); outline-offset: 3px; }
.site-season-picker[open] summary > .ts-icon:last-child { transform: rotate(180deg); }
.site-season-fields { display: grid; gap: 8px; padding: 8px 12px 4px; font-size: 13px; }
.site-season-select { position: relative; min-width: 0; }
.site-season-fields select { width: 100%; min-width: 0; height: 44px; padding: 8px 40px 8px 14px; border: 1px solid var(--ts-editorial-line); border-radius: var(--ts-radius-control, 16px); color: var(--ts-text); background-color: var(--ts-editorial-low); font: inherit; font-size: 16px; appearance: none; -webkit-appearance: none; cursor: pointer; }
.site-season-select > .ts-icon { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--ts-muted); pointer-events: none; }
.site-season-fields p { margin: 2px 0; line-height: 1.7; color: var(--ts-muted); overflow-wrap: anywhere; }
</style>
