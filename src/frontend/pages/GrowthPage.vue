<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import TsIcon from '../components/TsIcon.vue';
import {
  GROWTH_UPDATED_EVENT,
  captureReferralCode,
  checkInGrowth,
  claimPendingReferral,
  loadGrowth,
  recordShareGrowth
} from '../services/userGrowth';

const props = defineProps({
  lang: { type: String, default: 'zh' }
});

const emit = defineEmits(['go']);
const state = ref(null);
const page = reactive({ loading: true, working: false, message: '', type: 'success' });

const copy = computed(() => props.lang === 'ja' ? {
  kicker: 'Moon Bond', title: '月契成長', subtitle: '毎日の小さな交流が、八千代との記録になります。',
  today: '今日', checkin: 'サインイン', checked: '受取済み', streak: '連続日数', best: '最長', days: '日',
  tasks: '今日の約束', path: '成長の軌跡', invite: '友達を招待', inviteHint: '友達が初めて八千代と会話すると、二人に経験値が入ります。',
  copyLink: '招待リンクをコピー', share: 'シェア', copied: '招待リンクをコピーしました', pending: '会話待ち', qualified: '完了', rewarded: '付与済み',
  recent: '最近の記録', noEvents: '最初の記録は今日から始まります。', loading: '成長記録を読み込み中',
  retry: '再読込', done: '完了', go: '進む', max: '最高レベル', xp: 'EXP', rotating: '毎日更新', streakReward: '7日連続ごとに +20 EXP'
} : props.lang === 'en' ? {
  kicker: 'Moon Bond', title: 'Bond growth', subtitle: 'Small daily moments become part of your history with Yachiyo.',
  today: 'Today', checkin: 'Check in', checked: 'Claimed', streak: 'Streak', best: 'Best', days: 'days',
  tasks: 'Today\'s bond', path: 'Growth path', invite: 'Invite a friend', inviteHint: 'You both earn XP after your friend completes their first chat with Yachiyo.',
  copyLink: 'Copy invite link', share: 'Share', copied: 'Invite link copied', pending: 'Awaiting chat', qualified: 'Completed', rewarded: 'Rewarded',
  recent: 'Recent activity', noEvents: 'Your first entry starts today.', loading: 'Loading growth',
  retry: 'Retry', done: 'Done', go: 'Open', max: 'Max level', xp: 'XP', rotating: 'Rotates daily', streakReward: '+20 XP every 7-day streak'
} : {
  kicker: 'Moon Bond', title: '月契成长', subtitle: '每天一点自然互动，都会成为你与八千代的共同记录。',
  today: '今日', checkin: '签到', checked: '已领取', streak: '连续相伴', best: '最长记录', days: '天',
  tasks: '今日约定', path: '成长路径', invite: '邀请同行者', inviteHint: '好友首次和八千代完成一轮聊天后，双方获得成长经验。',
  copyLink: '复制邀请链接', share: '直接分享', copied: '邀请链接已复制', pending: '待首次聊天', qualified: '已完成', rewarded: '已发奖励',
  recent: '最近记录', noEvents: '第一条共同记录，就从今天开始。', loading: '正在读取成长记录',
  retry: '重新加载', done: '已完成', go: '去完成', max: '已到最高等级', xp: '经验', rotating: '每日轮换', streakReward: '每连续 7 天额外 +20 经验'
});

const localizedLevelTitles = {
  zh: ['初次连接', '微光相识', '月下同行', '心声共鸣', '记忆同调', '星海相伴', '月之眷属', '永恒月契', '八千代之约'],
  ja: ['初めての接続', '微光の出会い', '月下の同行', '心の共鳴', '記憶の同調', '星海の絆', '月の眷属', '永遠の月契', '八千代の契り'],
  en: ['First connection', 'First light', 'Under the moon', 'Heart resonance', 'Memory sync', 'Across the stars', 'Moonbound', 'Eternal bond', "Yachiyo's Covenant"]
};

const levelTitle = computed(() => localizedLevelTitles[props.lang]?.[Math.max(0, (state.value?.level?.level || 1) - 1)] || state.value?.level?.title || '');
const nextLevelTitle = computed(() => {
  const next = state.value?.level?.nextLevel;
  return next ? localizedLevelTitles[props.lang]?.[next.level - 1] || next.title : '';
});
const inviteUrl = computed(() => state.value?.referral?.inviteCode
  ? `${window.location.origin}/register?invite=${encodeURIComponent(state.value.referral.inviteCode)}&redirect=${encodeURIComponent('/growth')}`
  : '');

function taskText(task) {
  const labels = props.lang === 'ja'
    ? { checkin: '毎日のサインイン', daily_share: '月読空間を共有', daily_article_publish: 'ステージに記事を投稿', daily_plaza_engage: 'プラザに投稿またはいいね', daily_pixel_engage: 'ピクセル絵を投稿またはいいね', daily_gallery_upload: 'ギャラリーに画像を追加' }
    : props.lang === 'en'
      ? { checkin: 'Daily check-in', daily_share: 'Share Tsukuyomi Space', daily_article_publish: 'Publish a Stage article', daily_plaza_engage: 'Post or like in Plaza', daily_pixel_engage: 'Create or like pixel art', daily_gallery_upload: 'Upload a gallery image' }
      : { checkin: '每日签到', daily_share: '分享月读空间', daily_article_publish: '主舞台发布文章', daily_plaza_engage: '月读广场留言或点赞', daily_pixel_engage: '像素画绘画或点赞', daily_gallery_upload: '图库上传图片' };
  return labels[task.key] || task.label;
}

function taskIcon(key) {
  return { checkin: 'calendar', daily_share: 'send', daily_article_publish: 'fileText', daily_plaza_engage: 'message', daily_pixel_engage: 'palette', daily_gallery_upload: 'image' }[key] || 'sparkles';
}

function eventText(item) {
  const labels = props.lang === 'ja'
    ? { checkin: '毎日のサインイン', daily_chat: '八千代との会話', daily_share: '月読空間を共有', daily_article_publish: 'ステージに記事を投稿', daily_plaza_engage: 'プラザで交流', daily_pixel_engage: 'ピクセル絵で交流', daily_gallery_upload: 'ギャラリーに画像を追加', referral_joined: '招待を受け取りました', referral_invite: '友達が初回会話を完了' }
    : props.lang === 'en'
      ? { checkin: 'Daily check-in', daily_chat: 'Chat with Yachiyo', daily_share: 'Shared Tsukuyomi Space', daily_article_publish: 'Published a Stage article', daily_plaza_engage: 'Engaged in Plaza', daily_pixel_engage: 'Engaged with pixel art', daily_gallery_upload: 'Uploaded a gallery image', referral_joined: 'Accepted an invitation', referral_invite: 'Friend completed first chat' }
      : { checkin: '每日签到', daily_chat: '与八千代聊天', daily_share: '分享月读空间', daily_article_publish: '主舞台发布文章', daily_plaza_engage: '月读广场互动', daily_pixel_engage: '像素画互动', daily_gallery_upload: '图库上传图片', referral_joined: '接受好友邀请', referral_invite: '好友完成首次聊天' };
  return labels[item.key] || item.label;
}

function setState(nextState) {
  if (nextState) state.value = nextState;
}

async function load() {
  page.loading = true;
  page.message = '';
  try {
    const params = new URLSearchParams(window.location.search || '');
    const code = captureReferralCode(params.get('invite'));
    let nextState = await loadGrowth({ force: true });
    if (!nextState) {
      emit('go', '/login?redirect=%2Fgrowth');
      return;
    }
    if (code) {
      const result = await claimPendingReferral(code);
      nextState = result?.state || nextState;
    } else {
      const claimed = await claimPendingReferral().catch(() => null);
      nextState = claimed?.state || nextState;
    }
    setState(nextState);
  } catch (error) {
    page.type = 'error';
    page.message = error.message || '无法加载成长记录';
  } finally {
    page.loading = false;
  }
}

async function checkIn() {
  page.working = true;
  page.message = '';
  try {
    const result = await checkInGrowth();
    setState(result.state);
    page.type = 'success';
    page.message = result.award.awarded
      ? `+${result.award.xp} ${copy.value.xp}${result.award.bonusXp ? `，连续七日 +${result.award.bonusXp}` : ''}`
      : copy.value.checked;
  } catch (error) {
    page.type = 'error';
    page.message = error.message || '签到失败';
  } finally {
    page.working = false;
  }
}

async function copyInvite() {
  if (!inviteUrl.value) return;
  try {
    await navigator.clipboard.writeText(inviteUrl.value);
  } catch (_) {
    const input = document.createElement('textarea');
    input.value = inviteUrl.value;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }
  const result = await recordShareGrowth('copy').catch(() => null);
  setState(result?.state);
  page.type = 'success';
  page.message = copy.value.copied;
}

async function shareInvite() {
  if (!inviteUrl.value) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: copy.value.invite, text: copy.value.inviteHint, url: inviteUrl.value });
      const result = await recordShareGrowth('native').catch(() => null);
      setState(result?.state);
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  await copyInvite();
}

function openTask(task) {
  if (task.completed) return;
  if (task.key === 'checkin') checkIn();
  else if (task.key === 'daily_share') shareInvite();
  else emit('go', task.path || '/hub');
}

function handleGrowthUpdate(event) {
  setState(event.detail?.state);
}

onMounted(() => {
  window.addEventListener(GROWTH_UPDATED_EVENT, handleGrowthUpdate);
  load();
});
onUnmounted(() => window.removeEventListener(GROWTH_UPDATED_EVENT, handleGrowthUpdate));
</script>

<template>
  <main class="page growth-page">
    <section class="growth-shell" :aria-busy="page.loading">
      <header class="growth-header">
        <div>
          <span class="growth-kicker"><TsIcon name="sparkles" :size="15" /> {{ copy.kicker }}</span>
          <h1>{{ copy.title }}</h1>
          <p>{{ copy.subtitle }}</p>
        </div>
        <button class="growth-room-button" type="button" @click="emit('go', '/room')">
          <TsIcon name="moon" :size="18" />
          <span>Room</span>
        </button>
      </header>

      <StatusLoader v-if="page.loading" :label="copy.loading" />
      <section v-else-if="!state" class="growth-error" role="alert">
        <p>{{ page.message }}</p>
        <button class="primary-btn" type="button" @click="load">{{ copy.retry }}</button>
      </section>

      <template v-else>
        <section class="growth-overview" data-material="content">
          <div class="growth-level-mark" aria-hidden="true"><TsIcon name="crown" :size="30" /></div>
          <div class="growth-level-main">
            <span>Lv.{{ state.level.level }}</span>
            <h2>{{ levelTitle }}</h2>
            <div class="growth-progress-line">
              <span :style="{ width: `${state.level.progressPercent}%` }"></span>
            </div>
            <small v-if="state.level.nextLevel">{{ state.level.progressXp }} / {{ state.level.requiredXp }} {{ copy.xp }} · {{ nextLevelTitle }}</small>
            <small v-else>{{ copy.max }}</small>
          </div>
          <div class="growth-streaks">
            <div><strong>{{ state.streak.current }}</strong><span>{{ copy.streak }} / {{ copy.days }}</span></div>
            <div><strong>{{ state.streak.longest }}</strong><span>{{ copy.best }} / {{ copy.days }}</span></div>
            <p class="growth-streak-reward"><TsIcon name="sparkles" :size="14" /> {{ copy.streakReward }}</p>
          </div>
          <button class="growth-checkin" type="button" :disabled="state.today.tasks[0]?.completed || page.working" :aria-busy="page.working" @click="checkIn">
            <TsIcon :name="state.today.tasks[0]?.completed ? 'check' : 'calendar'" :size="18" />
            <span>{{ state.today.tasks[0]?.completed ? copy.checked : copy.checkin }}</span>
          </button>
        </section>

        <p v-if="page.message" class="growth-message" :class="page.type" :role="page.type === 'error' ? 'alert' : 'status'">{{ page.message }}</p>

        <section class="growth-section">
          <div class="growth-section-head">
            <div><span>{{ copy.today }}</span><h2>{{ copy.tasks }}</h2></div>
            <strong>{{ state.today.completed }}/{{ state.today.total }}</strong>
          </div>
          <div class="growth-task-grid">
            <button
              v-for="task in state.today.tasks"
              :key="task.key"
              class="growth-task"
              :class="{ completed: task.completed }"
              type="button"
              :disabled="task.completed"
              @click="openTask(task)"
            >
              <span class="growth-task-icon"><TsIcon :name="task.completed ? 'check' : taskIcon(task.key)" :size="20" /></span>
              <span class="growth-task-copy"><strong>{{ taskText(task) }}</strong><small>+{{ task.xp }} {{ copy.xp }}<template v-if="task.type === 'rotating'"> · {{ copy.rotating }}</template></small></span>
              <span>{{ task.completed ? copy.done : copy.go }}</span>
            </button>
          </div>
        </section>

        <section class="growth-grid">
          <div class="growth-section growth-invite" data-material="content">
            <div class="growth-section-head">
              <div><span>Invite</span><h2>{{ copy.invite }}</h2></div>
              <TsIcon name="users" :size="21" />
            </div>
            <p>{{ copy.inviteHint }}</p>
            <div class="growth-invite-code"><span>{{ state.referral.inviteCode }}</span><strong>+60 / +30 {{ copy.xp }}</strong></div>
            <div class="growth-invite-actions">
              <button class="primary-btn" type="button" @click="shareInvite"><TsIcon name="send" :size="17" /> {{ copy.share }}</button>
              <button class="ghost-btn" type="button" @click="copyInvite"><TsIcon name="copy" :size="17" /> {{ copy.copyLink }}</button>
            </div>
            <div class="growth-referral-stats">
              <span>{{ copy.pending }} <strong>{{ state.referral.pendingCount }}</strong></span>
              <span>{{ copy.qualified }} <strong>{{ state.referral.qualifiedCount }}</strong></span>
              <span>{{ copy.rewarded }} <strong>{{ state.referral.rewardedCount || 0 }} · +{{ state.referral.rewardedXp || 0 }} {{ copy.xp }}</strong></span>
            </div>
          </div>

          <div class="growth-section growth-history">
            <div class="growth-section-head"><div><span>History</span><h2>{{ copy.recent }}</h2></div></div>
            <div v-if="state.recentEvents.length" class="growth-event-list">
              <div v-for="item in state.recentEvents" :key="item.id" class="growth-event">
                <span><TsIcon :name="taskIcon(item.key)" :size="17" /></span>
                <div><strong>{{ eventText(item) }}</strong><small>{{ item.date }}</small></div>
                <b>+{{ item.xp }}</b>
              </div>
            </div>
            <p v-else class="growth-empty">{{ copy.noEvents }}</p>
          </div>
        </section>

        <section class="growth-section growth-path">
          <div class="growth-section-head"><div><span>Journey</span><h2>{{ copy.path }}</h2></div></div>
          <div class="growth-levels">
            <div v-for="item in state.levels" :key="item.level" class="growth-level-step" :class="{ reached: item.reached, current: item.level === state.level.level }">
              <span>{{ item.level }}</span>
              <strong>{{ localizedLevelTitles[lang]?.[item.level - 1] || item.title }}</strong>
              <small>{{ item.minXp }} {{ copy.xp }}</small>
            </div>
          </div>
        </section>
      </template>
    </section>
  </main>
</template>
