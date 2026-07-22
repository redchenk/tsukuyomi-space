<script setup>
import { computed } from 'vue';
import TsIcon from './TsIcon.vue';

const props = defineProps({
  level: { type: [Number, Object], default: 1 },
  lang: { type: String, default: 'zh' },
  compact: { type: Boolean, default: false },
  showTitle: { type: Boolean, default: true }
});

const TITLES = Object.freeze({
  zh: ['初次连接', '微光相识', '月下同行', '心声共鸣', '记忆同调', '星海相伴', '月之眷属', '永恒月契', '八千代之约'],
  ja: ['初めての接続', '微光の出会い', '月下の同行', '心の共鳴', '記憶の同調', '星海の伴侶', '月の眷属', '永遠の月契', '八千代の契り'],
  en: ['First Connection', 'Glimmering Bond', 'Moonlit Journey', 'Resonant Hearts', 'Memory Sync', 'Starlit Companion', 'Moonbound', 'Eternal Moon Pact', "Yachiyo's Covenant"]
});

const value = computed(() => {
  const raw = typeof props.level === 'object' ? props.level?.level : props.level;
  return Math.max(1, Math.min(9, Number(raw) || 1));
});
const tier = computed(() => Math.ceil(value.value / 2));
const title = computed(() => (TITLES[props.lang] || TITLES.zh)[value.value - 1]);
const ariaLabel = computed(() => props.lang === 'en'
  ? `Level ${value.value}, ${title.value}`
  : props.lang === 'ja'
    ? `レベル ${value.value}、${title.value}`
    : `等级 ${value.value}，${title.value}`);
</script>

<template>
  <span
    class="user-level-badge"
    :class="[`user-level-tier-${tier}`, { 'user-level-compact': compact }]"
    :data-level="value"
    :aria-label="ariaLabel"
    :title="ariaLabel"
  >
    <TsIcon :name="value >= 7 ? 'sparkles' : 'badge'" :size="compact ? 12 : 14" aria-hidden="true" />
    <strong>Lv.{{ value }}</strong>
    <span v-if="showTitle" class="user-level-title">{{ title }}</span>
  </span>
</template>

<style scoped>
.user-level-badge {
  --level-color: #768095;
  --level-bg: rgba(118, 128, 149, 0.14);
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  max-width: 100%;
  min-height: 1.7rem;
  padding: 0.22rem 0.58rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--level-color) 62%, transparent);
  border-radius: 999px;
  color: var(--level-color);
  background: var(--level-bg);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.18);
  font-size: 0.72rem;
  line-height: 1.15;
  vertical-align: middle;
  white-space: nowrap;
}

.user-level-badge strong {
  font-size: inherit;
  font-weight: 900;
}

.user-level-title {
  overflow: hidden;
  color: inherit;
  font-weight: 750;
  text-overflow: ellipsis;
}

.user-level-tier-2 {
  --level-color: #2a9caf;
  --level-bg: rgba(42, 156, 175, 0.13);
  box-shadow: 0 0 0.75rem rgba(42, 156, 175, 0.12), inset 0 1px rgba(255, 255, 255, 0.2);
}

.user-level-tier-3 {
  --level-color: #b88720;
  --level-bg: rgba(184, 135, 32, 0.14);
  box-shadow: 0 0 0.9rem rgba(229, 179, 64, 0.16), inset 0 1px rgba(255, 255, 255, 0.24);
}

.user-level-tier-4 {
  --level-color: #d74f84;
  --level-bg: rgba(215, 79, 132, 0.13);
  box-shadow: 0 0 1.05rem rgba(215, 79, 132, 0.2), 0 0 0.35rem rgba(57, 177, 191, 0.16), inset 0 1px rgba(255, 255, 255, 0.28);
}

.user-level-tier-5 {
  --level-color: #765fc4;
  --level-bg: rgba(118, 95, 196, 0.15);
  border-color: color-mix(in srgb, #4cb5c6 45%, var(--level-color));
  box-shadow: 0 0 1.25rem rgba(118, 95, 196, 0.28), 0 0 0.55rem rgba(76, 181, 198, 0.24), inset 0 1px rgba(255, 255, 255, 0.34);
  text-shadow: 0 0 0.7rem rgba(121, 204, 216, 0.32);
}

.user-level-tier-4::after {
  content: "";
  position: absolute;
  inset: -60% auto -60% -45%;
  width: 24%;
  background: rgba(255, 255, 255, 0.48);
  transform: rotate(18deg);
  animation: level-badge-glint 5.5s ease-in-out infinite;
}

.user-level-tier-5::after {
  content: "";
  position: absolute;
  inset: -60% auto -60% -45%;
  width: 28%;
  background: rgba(255, 255, 255, 0.58);
  transform: rotate(18deg);
  animation: level-badge-glint 4.6s ease-in-out infinite;
}

.user-level-compact {
  min-height: 1.35rem;
  gap: 0.2rem;
  padding: 0.14rem 0.38rem;
  font-size: 0.64rem;
}

@keyframes level-badge-glint {
  0%, 72%, 100% { transform: translateX(0) rotate(18deg); opacity: 0; }
  78% { opacity: 0.8; }
  88% { transform: translateX(640%) rotate(18deg); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .user-level-tier-4::after,
  .user-level-tier-5::after { animation: none; display: none; }
}

html[data-performance="reduced"] .user-level-tier-4::after,
html[data-performance="reduced"] .user-level-tier-5::after {
  animation: none;
  display: none;
}
</style>
