<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  lang: {
    type: String,
    default: 'zh'
  },
  routeName: {
    type: String,
    default: ''
  },
  spriteSrc: {
    type: String,
    default: '/assets/pets/yachiyo/spritesheet.webp'
  }
});

const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 9;

function rowFrames(row, count) {
  return Array.from({ length: count }, (_, index) => row * SPRITE_COLUMNS + index);
}

function rowDurations(values) {
  return values;
}

const SEQUENCES = {
  idle: {
    frames: rowFrames(0, 6),
    durations: rowDurations([280, 110, 110, 140, 140, 320]),
    loops: Number.POSITIVE_INFINITY
  },
  runningRight: {
    frames: rowFrames(1, 8),
    durations: rowDurations([120, 120, 120, 120, 120, 120, 120, 220]),
    loops: 4
  },
  runningLeft: {
    frames: rowFrames(2, 8),
    durations: rowDurations([120, 120, 120, 120, 120, 120, 120, 220]),
    loops: 4
  },
  waving: {
    frames: rowFrames(3, 4),
    durations: rowDurations([140, 140, 140, 280]),
    loops: 3
  },
  jumping: {
    frames: rowFrames(4, 5),
    durations: rowDurations([140, 140, 140, 140, 280]),
    loops: 3
  },
  failed: {
    frames: rowFrames(5, 8),
    durations: rowDurations([140, 140, 140, 140, 140, 140, 140, 240]),
    loops: 2
  },
  waiting: {
    frames: rowFrames(6, 6),
    durations: rowDurations([150, 150, 150, 150, 150, 260]),
    loops: 3
  },
  running: {
    frames: rowFrames(7, 6),
    durations: rowDurations([120, 120, 120, 120, 120, 220]),
    loops: 5
  },
  review: {
    frames: rowFrames(8, 6),
    durations: rowDurations([150, 150, 150, 150, 150, 280]),
    loops: 4
  }
};

const IDLE_SEQUENCE = {
  ...SEQUENCES.idle,
  loops: Number.POSITIVE_INFINITY
};
const ACTION_SEQUENCES = [
  SEQUENCES.runningRight,
  SEQUENCES.runningLeft,
  SEQUENCES.waving,
  SEQUENCES.jumping,
  SEQUENCES.failed,
  SEQUENCES.waiting,
  SEQUENCES.running,
  SEQUENCES.review
];

const FEATURE_TIPS = {
  zh: [
    { key: 'hub', routeName: 'hub', title: '中枢大厅', body: '从大厅可以快速进入文章、广场、竞技场和现实回廊。' },
    { key: 'room', routeName: 'room', title: '私人居所', body: '房间里有 Live2D 聊天、语音和记忆设置，适合慢慢调教你的角色。' },
    { key: 'plaza', routeName: 'plaza', title: '月读广场', body: '广场可以留言、回复和点赞，反馈、友链和问候都可以放在那里。' },
    { key: 'stage', routeName: 'stage', title: '主舞台', body: '主舞台收纳文章和内容展示，可以搜索、筛选和继续阅读。' },
    { key: 'gallery', routeName: 'gallery', title: '图库', body: '图库集中整理图片素材，登录后还能进入管理页面维护内容。' },
    { key: 'arena', routeName: 'arena', title: '竞技场', body: '竞技场放项目和小游戏原型，适合试运行新的交互点子。' },
    { key: 'reality', routeName: 'reality', title: '现实回廊', body: '现实回廊写着联系方式、隐私说明，也记录了这只宠物的来源。' },
    { key: 'account', routeName: 'userCenter', title: '用户中心', body: '登录后可以查看个人资料、文章、图库和站内互动记录。' }
  ],
  ja: [
    { key: 'hub', routeName: 'hub', title: '中枢ホール', body: 'ホールから記事、広場、アリーナ、リアル回廊へすぐ移動できます。' },
    { key: 'room', routeName: 'room', title: 'プライベートルーム', body: 'Live2D チャット、音声、記憶設定でキャラクター体験を調整できます。' },
    { key: 'plaza', routeName: 'plaza', title: '月読広場', body: '広場ではメッセージ、返信、いいねで気軽に交流できます。' },
    { key: 'stage', routeName: 'stage', title: 'メインステージ', body: '記事やコンテンツを検索、絞り込み、読み進められる場所です。' },
    { key: 'gallery', routeName: 'gallery', title: 'ギャラリー', body: '画像素材をまとめて確認し、ログイン後は管理ページも使えます。' },
    { key: 'arena', routeName: 'arena', title: 'アリーナ', body: 'プロジェクトや小さなゲーム試作を試せる実験スペースです。' },
    { key: 'reality', routeName: 'reality', title: 'リアル回廊', body: '連絡先、プライバシー説明、このペットの出典を確認できます。' },
    { key: 'account', routeName: 'userCenter', title: 'ユーザーセンター', body: 'ログイン後、プロフィール、記事、ギャラリー、サイト内交流を確認できます。' }
  ]
};

const frame = ref(IDLE_SEQUENCE.frames[0]);
const activeTip = ref(null);
let currentSequence = IDLE_SEQUENCE;
let sequenceIndex = 1;
let loopsRemaining = Number.POSITIVE_INFINITY;
let frameTimerId = 0;
let actionTimerId = 0;
let tipTimerId = 0;
let tipHideTimerId = 0;
let lastTipKey = '';

const petStyle = computed(() => {
  const col = frame.value % SPRITE_COLUMNS;
  const row = Math.floor(frame.value / SPRITE_COLUMNS);
  const x = (col / (SPRITE_COLUMNS - 1)) * 100;
  const y = (row / (SPRITE_ROWS - 1)) * 100;

  return {
    backgroundImage: `url("${props.spriteSrc}")`,
    backgroundPosition: `${x}% ${y}%`
  };
});

function advanceFrame() {
  if (sequenceIndex >= currentSequence.frames.length) {
    if (currentSequence === IDLE_SEQUENCE) {
      sequenceIndex = 0;
    } else if (loopsRemaining > 1) {
      loopsRemaining -= 1;
      sequenceIndex = 0;
    } else {
      setIdleSequence();
      return;
    }
  }

  frame.value = currentSequence.frames[sequenceIndex % currentSequence.frames.length];
  sequenceIndex += 1;
}

function setIdleSequence() {
  currentSequence = IDLE_SEQUENCE;
  loopsRemaining = Number.POSITIVE_INFINITY;
  frame.value = currentSequence.frames[0];
  sequenceIndex = 1;
  scheduleRandomAction();
}

function queueNextFrame() {
  const frameIndex = currentSequence.frames.indexOf(frame.value);
  const duration = currentSequence.durations[frameIndex] || 160;
  frameTimerId = window.setTimeout(() => {
    advanceFrame();
    queueNextFrame();
  }, duration);
}

function randomActionDelay() {
  return 4600 + Math.floor(Math.random() * 6200);
}

function randomTipDelay() {
  return 14000 + Math.floor(Math.random() * 10000);
}

function scheduleRandomAction() {
  if (actionTimerId) window.clearTimeout(actionTimerId);
  actionTimerId = window.setTimeout(() => {
    playRandomAction();
  }, randomActionDelay());
}

function currentTipPool() {
  const tips = FEATURE_TIPS[props.lang] || FEATURE_TIPS.zh;
  const filtered = tips.filter((tip) => tip.routeName !== props.routeName);
  return filtered.length ? filtered : tips;
}

function pickTip() {
  const tips = currentTipPool();
  const choices = tips.length > 1 ? tips.filter((tip) => tip.key !== lastTipKey) : tips;
  const tip = choices[Math.floor(Math.random() * choices.length)] || tips[0];
  lastTipKey = tip?.key || '';
  return tip;
}

function scheduleNextTip(delay = randomTipDelay()) {
  if (tipTimerId) window.clearTimeout(tipTimerId);
  tipTimerId = window.setTimeout(() => {
    tryShowTip();
  }, delay);
}

function hideTip() {
  activeTip.value = null;
  if (tipHideTimerId) window.clearTimeout(tipHideTimerId);
  tipHideTimerId = 0;
}

function showIdleTip() {
  const tip = pickTip();
  if (!tip) {
    scheduleNextTip();
    return;
  }

  activeTip.value = tip;
  if (tipHideTimerId) window.clearTimeout(tipHideTimerId);
  tipHideTimerId = window.setTimeout(() => {
    hideTip();
    scheduleNextTip();
  }, 6200);
}

function tryShowTip() {
  tipTimerId = 0;
  if (activeTip.value) {
    scheduleNextTip();
    return;
  }

  if (currentSequence !== IDLE_SEQUENCE) {
    scheduleNextTip(1200);
    return;
  }

  showIdleTip();
}

function playRandomAction() {
  if (currentSequence !== IDLE_SEQUENCE) return;
  if (activeTip.value) {
    scheduleRandomAction();
    return;
  }

  const index = Math.floor(Math.random() * ACTION_SEQUENCES.length);
  currentSequence = ACTION_SEQUENCES[index];
  frame.value = currentSequence.frames[0];
  sequenceIndex = 1;
  loopsRemaining = currentSequence.loops;
}

onMounted(() => {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    queueNextFrame();
    scheduleRandomAction();
  }
  scheduleNextTip(5600);
});

onBeforeUnmount(() => {
  if (frameTimerId) window.clearTimeout(frameTimerId);
  if (actionTimerId) window.clearTimeout(actionTimerId);
  if (tipTimerId) window.clearTimeout(tipTimerId);
  if (tipHideTimerId) window.clearTimeout(tipHideTimerId);
});
</script>

<template>
  <div class="site-pet-wrap" aria-live="polite">
    <Transition name="site-pet-tip">
      <aside v-if="activeTip" class="site-pet-bubble">
        <strong>{{ activeTip.title }}</strong>
        <p>{{ activeTip.body }}</p>
      </aside>
    </Transition>

    <div
      class="site-pet"
      role="img"
      aria-label="Yachiyo"
      :style="petStyle"
    />
  </div>
</template>

<style scoped>
.site-pet-wrap {
  --site-pet-width: clamp(6.5rem, 9vw, 9.5rem);
  --site-pet-bubble-width: min(17.5rem, calc(100vw - 2rem));
  position: fixed;
  right: max(0.9rem, env(safe-area-inset-right));
  bottom: max(0.75rem, env(safe-area-inset-bottom));
  z-index: 83;
  width: var(--site-pet-width);
  pointer-events: none;
}

.site-pet {
  width: 100%;
  aspect-ratio: 192 / 208;
  padding: 0;
  border: 0;
  background-color: transparent;
  background-repeat: no-repeat;
  background-size: 800% 900%;
  filter: drop-shadow(0 16px 28px rgba(12, 16, 32, 0.28));
  transform-origin: 50% 100%;
}

.site-pet-bubble {
  position: absolute;
  right: calc(100% - 0.75rem);
  bottom: 72%;
  width: var(--site-pet-bubble-width);
  box-sizing: border-box;
  padding: 0.78rem 0.9rem 0.82rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.94);
  background: linear-gradient(145deg, rgba(25, 30, 48, 0.9), rgba(50, 44, 78, 0.84));
  box-shadow: 0 18px 48px rgba(5, 8, 18, 0.34), inset 0 1px rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(18px) saturate(1.18);
}

.site-pet-bubble::after {
  content: "";
  position: absolute;
  right: -0.42rem;
  bottom: 1.05rem;
  width: 0.75rem;
  height: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.22);
  border-right: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(36, 34, 56, 0.9);
  transform: rotate(45deg);
}

.site-pet-bubble strong {
  display: block;
  margin-bottom: 0.32rem;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1.25;
}

.site-pet-bubble p {
  margin: 0;
  color: rgba(238, 244, 255, 0.84);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.55;
}

.site-pet-tip-enter-active,
.site-pet-tip-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.site-pet-tip-enter-from,
.site-pet-tip-leave-to {
  opacity: 0;
  transform: translate(0.4rem, 0.3rem) scale(0.98);
}

@media (max-width: 860px) {
  .site-pet-wrap {
    --site-pet-width: clamp(5.15rem, 24vw, 6.35rem);
    --site-pet-bubble-width: min(16rem, calc(100vw - 5.6rem));
    right: max(0.45rem, env(safe-area-inset-right));
    bottom: max(5.65rem, calc(env(safe-area-inset-bottom) + 5.65rem));
  }

  .site-pet-bubble {
    right: calc(100% - 0.55rem);
    bottom: 82%;
    padding: 0.62rem 0.7rem 0.66rem;
  }

  .site-pet-bubble strong {
    margin-bottom: 0.22rem;
    font-size: 0.76rem;
  }

  .site-pet-bubble p {
    font-size: 0.72rem;
    line-height: 1.45;
  }
}
</style>
