<script setup>
import { computed } from 'vue';
import TsIcon from '../TsIcon.vue';
const props = defineProps({ relationship: { type: Object, required: true }, lang: { type: String, default: 'zh' }, expanded: Boolean });
const state = computed(() => props.relationship.state.value);
const status = computed(() => props.relationship.status.value);
const feedback = computed(() => props.relationship.feedback.value);
const copy = computed(() => ({
  zh: { title: '好感度', guest: '登录后记录好感度', loading: '正在读取好感度…', error: '暂未同步，点击重试', today: '今日', last: '本次', rules: '完成并保存一轮新对话 +1，每天最多 +10，最高 1000。重复内容、重新生成和要求加分不重复计分。无需开启长期记忆或写日记。共同约定、表达信任经确认后，本轮最多 +2；不会重复累加。', saved: '已保存到账户', next: '下一阶段', pending: '正在确认额外互动奖励，基础分已记录。', failed: '额外互动分析暂未完成，不影响基础加分。', history: '最近互动', empty: '聊完第一轮，看看这里的变化。', unchanged: '未增加', legacy: '日记存档中的数值仅是历史记录，不影响这里的进度。' },
  en: { title: 'Affinity', guest: 'Sign in to save affinity', loading: 'Loading affinity…', error: 'Sync unavailable · Retry', today: 'Today', last: 'This turn', rules: 'Complete and save a new conversation turn for +1. Maximum +10 per day and 1000 total. Repeated text, regenerated replies and requests for points do not earn extra points. Memory and diary generation are optional. Confirmed shared plans or trust can raise a turn to +2 total.', saved: 'Saved to your account', next: 'Next stage', pending: 'Checking bonus interactions. Basic points are saved.', failed: 'Bonus analysis is unavailable. Basic points still count.', history: 'Recent interactions', empty: 'Complete your first turn to see progress here.', unchanged: 'No increase', legacy: 'Diary archive values are historical snapshots and do not change this progress.' },
  ja: { title: '好感度', guest: 'ログインして好感度を保存', loading: '好感度を読み込み中…', error: '同期できません · 再試行', today: '今日', last: '今回', rules: '新しい会話を1往復完了して保存すると +1。1日最大 +10、合計最大 1000。同じ内容、再生成、加点の要求では増えません。長期記憶や日記は任意です。約束や信頼が確認されると、その会話は合計最大 +2 になります。', saved: 'アカウントに保存済み', next: '次の段階', pending: '追加の交流を確認中。基本ポイントは保存済みです。', failed: '追加分析は未完了ですが、基本ポイントは記録されます。', history: '最近の交流', empty: '最初の会話を終えると、ここに進捗が表示されます。', unchanged: '増加なし', legacy: '日記の数値は過去の記録で、この進捗には影響しません。' }
}[props.lang] || {}) );
const labels = {
  '初次相识': ['First meeting', '初めての出会い'], '渐渐熟悉': ['Getting familiar', '少しずつ親しく'], '月下同行': ['Moonlit companions', '月下の仲間'], '相知相伴': ['Close companions', '心を通わせる仲間'], '月之眷属': ['Kindred under the moon', '月の眷属'],
  '日常交流': ['Conversation', '日々の会話'], '日常分享': ['Sharing your day', '日常の共有'], '真诚感谢': ['Gratitude', '感謝'], '主动关心': ['Care', '気遣い'], '共同约定': ['Shared plans', '一緒の約束'], '表达信任': ['Trust', '信頼'], '重复互动': ['Repeated interaction', '同じ内容の交流'], '今日已达加分上限': ['Daily limit reached', '本日の上限に到達'], '今日分享已达上限': ['Daily sharing limit reached', '本日の共有上限に到達'], '本轮未计分': ['This turn did not qualify', '今回は加点対象外'], '好感度已满': ['Maximum affinity reached', '好感度が上限に到達'], '本轮已记录，不重复加分': ['Already recorded; no extra points', '記録済みのため追加加点なし'], '未发现可计分互动': ['No qualifying interaction', '加点対象の交流なし'], '互动记录已更新': ['Interaction progress updated', '交流の記録を更新']
};
function label(value) { return props.lang === 'zh' ? value : labels[value]?.[props.lang === 'ja' ? 1 : 0] || value; }
</script>

<template>
  <section class="room-relationship" :aria-label="copy.title">
    <RouterLink v-if="status === 'guest'" to="/login?redirect=%2Froom" class="relationship-guest"><TsIcon name="heart" :size="16" />{{ copy.guest }}</RouterLink>
    <p v-else-if="!state && status === 'loading'" role="status">{{ copy.loading }}</p>
    <template v-else>
      <details v-if="state" class="relationship-details" :open="expanded">
        <summary><TsIcon name="heart" :size="16" /><strong>{{ copy.title }} <span class="relationship-score">{{ state.score }}/{{ state.max }}</span></strong><span>{{ label(state.stage) }}</span><small>{{ copy.today }} +{{ state.todayDelta }}/{{ state.rules.dailyLimit }}</small></summary>
        <progress :value="state.score" :max="state.max" :aria-label="copy.title"></progress>
        <div class="relationship-info">
          <p>{{ copy.rules }}</p>
          <p v-if="state.nextStage">{{ copy.next }}: {{ label(state.nextStage.name) }} · {{ state.nextStage.score }}/{{ state.max }} (+{{ state.nextStage.remaining }})</p>
          <p v-if="state.pending">{{ copy.pending }}</p><p v-else-if="state.failed">{{ copy.failed }}</p>
          <strong>{{ copy.history }}</strong>
          <p v-for="record in state.records.slice(0, 3)" :key="record.turnId">{{ record.delta > 0 ? '+' : '' }}{{ record.delta }} · {{ label(record.reason) }} · {{ record.scoreBefore }} → {{ record.scoreAfter }}</p>
          <p>{{ copy.legacy }}</p>
        </div>
      </details>
      <button v-if="status === 'error'" class="relationship-retry" type="button" @click="relationship.refresh(4)">{{ copy.error }}</button>
      <p v-else-if="state" class="relationship-feedback" role="status" aria-live="polite" aria-atomic="true">
        <template v-if="feedback"><strong>{{ copy.last }} {{ feedback.delta > 0 ? `+${feedback.delta}` : feedback.delta < 0 ? feedback.delta : copy.unchanged }}</strong> · {{ label(feedback.reason) }}</template>
        <template v-else>{{ state.totalRecords ? copy.saved : copy.empty }}</template>
      </p>
    </template>
  </section>
</template>

<style scoped>
.room-relationship { flex: 0 0 auto; min-width: 0; margin: 0 0 8px; padding: 9px 12px; border: 1px solid var(--room-ui-line, var(--ts-border)); border-radius: var(--ts-radius-button, 14px); color: var(--room-ui-text, var(--ts-text)); background: var(--room-ui-inset, var(--ts-card)); pointer-events: auto; font-size: 11px; }
.room-relationship p { margin: 4px 0 0; line-height: 1.5; }
.relationship-details summary { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; cursor: pointer; min-height: 24px; list-style: none; }
.relationship-details summary::-webkit-details-marker { display: none; }
.relationship-details summary::after { content: '+'; margin-left: 2px; }
.relationship-details[open] summary::after { content: '−'; }
.relationship-details summary > small { margin-left: auto; }
.relationship-details summary svg, .relationship-feedback strong { color: var(--room-ui-accent, var(--ts-accent)); }
.relationship-info { max-height: min(24dvh, 200px); overflow: auto; padding: 4px 0 8px; }
.room-relationship progress { display: block; width: 100%; height: 3px; margin: 5px 0; border: none; border-radius: 4px; overflow: hidden; background: var(--room-ui-line, var(--ts-border)); accent-color: var(--room-ui-accent, var(--ts-accent)); }
.room-relationship progress::-webkit-progress-bar { background: var(--room-ui-line, var(--ts-border)); }
.room-relationship progress::-webkit-progress-value { background: var(--room-ui-accent, var(--ts-accent)); }
.relationship-guest { display: flex; gap: 8px; align-items: center; color: inherit; min-height: 24px; }
.relationship-retry { color: inherit; background: transparent; border: 0; padding: 6px 0; font: inherit; text-decoration: underline; cursor: pointer; }
@media (max-width: 860px) { .room-relationship { margin: 0 10px 6px; padding: 6px 10px; background: var(--ts-card); font-size: 10px; } .relationship-details summary { min-height: 30px; } }
</style>
