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
    { key: 'hub-routes', routeName: 'hub', title: '中枢大厅', body: '大厅卡片是主要路线入口，可以从这里去文章、广场、房间、图库和像素工坊。' },
    { key: 'hub-pixel', routeName: 'hub', title: '最新像素画', body: '中枢大厅下方会展示用户最近发布的像素画，点卡片可以去工坊看完整作品。' },
    { key: 'room-chat', routeName: 'room', title: '私人居所', body: '房间里可以和 Live2D 角色聊天；模型、语音、记忆都在房间设置里调整。' },
    { key: 'room-memory', routeName: 'room', title: '长期记忆', body: '登录后对话会按用户隔离写入长期记忆，角色会在后续聊天里检索相关片段。' },
    { key: 'room-settings', routeName: 'roomSettings', title: '房间设置', body: '这里配置 LLM、TTS、知识库、MCP 和长期记忆；API Key 只保存在当前浏览器。' },
    { key: 'plaza-compose', routeName: 'plaza', title: '月读广场', body: '广场可以留言、回复和点赞，反馈、友链、问候都可以放在那里。' },
    { key: 'plaza-social', routeName: 'plaza', title: '互动提示', body: '留言里使用 @昵称 或 #话题 可以形成更清晰的互动线索。' },
    { key: 'stage-read', routeName: 'stage', title: '主舞台', body: '主舞台收纳文章和内容展示，可以搜索、筛选和继续阅读。' },
    { key: 'stage-follow', routeName: 'stage', title: '阅读路径', body: '进入文章后可以收藏；收藏内容会在个人中心形成你的阅读清单。' },
    { key: 'article-bookmark', routeNames: ['article', 'articleDetail'], title: '文章页面', body: '喜欢的文章可以收藏，后续在个人中心的收藏页继续阅读。' },
    { key: 'editor-media', routeName: 'editor', title: '文章编辑', body: '编辑器支持图片、媒体和嵌入内容；素材可以先上传到图库或附件库。' },
    { key: 'gallery-view', routeName: 'gallery', title: '图库', body: '图库集中整理图片素材，登录后还能进入管理页面维护内容。' },
    { key: 'gallery-manage', routeName: 'galleryManage', title: '图库管理', body: '这里可以管理自己上传的图片；管理员可以看到并维护全站素材。' },
    { key: 'attachments', routeName: 'attachments', title: '附件库', body: '附件库适合存放文章会用到的图片和文件，上传后可以复制链接复用。' },
    { key: 'arena-draw', routeName: 'arena', title: '像素工坊', body: '这里可以画像素画、上传图片转换像素画，完成后发布到公开作品区。' },
    { key: 'arena-manage', routeName: 'arena', title: '作品管理', body: '已发布的像素画可以从个人中心再次编辑或删除；管理员可以管理全站作品。' },
    { key: 'user-profile', routeName: 'userCenter', title: '用户中心', body: '这里可以管理资料、文章、收藏、像素画和账号安全。' },
    { key: 'user-pixel', routeName: 'userCenter', title: '我的像素画', body: '像素画标签里能新建、编辑、删除自己的作品；管理员会看到全站列表。' },
    { key: 'notifications', routeName: 'notifications', title: '站内信', body: '回复、点赞和互动通知都会汇总到这里，读完可以一键标记。' },
    { key: 'profile-public', routeName: 'userProfile', title: '个人主页', body: '个人主页会展示公开文章和互动入口，适合查看某位作者的内容。' },
    { key: 'reality', routeName: 'reality', title: '现实回廊', body: '现实回廊写着联系方式、隐私说明，也记录了这只宠物的来源。' },
    { key: 'terminal', routeName: 'terminal', title: '终端管理', body: '管理员可以在终端里维护文章、留言、用户、友链和站点配置。' },
    { key: 'login', routeNames: ['login', 'register'], title: '账号提示', body: '登录后可以发布内容、收藏文章、管理素材，并获得按用户隔离的记忆和作品。' },
    { key: 'global-nav', title: '导航提示', body: '左侧导航适合快速换区；移动端可以从顶部菜单展开所有入口。' },
    { key: 'global-theme', title: '显示偏好', body: '导航上的月亮/太阳按钮可以切换明暗主题，语言按钮可以切换中文和日文。' }
  ],
  ja: [
    { key: 'hub-routes', routeName: 'hub', title: '中枢ホール', body: 'ホールのカードから記事、広場、部屋、ギャラリー、ピクセル工房へ移動できます。' },
    { key: 'hub-pixel', routeName: 'hub', title: '最新ピクセルアート', body: '下のカードには最近公開された作品が表示されます。クリックで工房へ移動できます。' },
    { key: 'room-chat', routeName: 'room', title: 'プライベートルーム', body: 'Live2D キャラクターと会話できます。モデル、音声、記憶は設定で調整します。' },
    { key: 'room-memory', routeName: 'room', title: '長期記憶', body: 'ログイン中の会話はユーザーごとに分離され、関連する記憶が後から検索されます。' },
    { key: 'room-settings', routeName: 'roomSettings', title: 'ルーム設定', body: 'LLM、TTS、知識ベース、MCP、長期記憶を設定できます。API Key はブラウザ内に保存されます。' },
    { key: 'plaza-compose', routeName: 'plaza', title: '月読広場', body: 'メッセージ、返信、いいねで気軽に交流できます。感想や連絡もここへどうぞ。' },
    { key: 'plaza-social', routeName: 'plaza', title: '交流のヒント', body: '@名前 や #トピック を使うと、会話の流れが見つけやすくなります。' },
    { key: 'stage-read', routeName: 'stage', title: 'メインステージ', body: '記事やコンテンツを検索、絞り込み、読み進められる場所です。' },
    { key: 'stage-follow', routeName: 'stage', title: '読書ルート', body: '記事はブックマークできます。保存したものはユーザーセンターで確認できます。' },
    { key: 'article-bookmark', routeNames: ['article', 'articleDetail'], title: '記事ページ', body: '気に入った記事は保存して、あとでユーザーセンターから読み返せます。' },
    { key: 'editor-media', routeName: 'editor', title: '記事編集', body: '画像、メディア、埋め込みを扱えます。素材は先にギャラリーや添付庫へ置けます。' },
    { key: 'gallery-view', routeName: 'gallery', title: 'ギャラリー', body: '画像素材をまとめて確認し、ログイン後は管理ページも使えます。' },
    { key: 'gallery-manage', routeName: 'galleryManage', title: 'ギャラリー管理', body: '自分の画像を管理できます。管理者はサイト全体の素材も扱えます。' },
    { key: 'attachments', routeName: 'attachments', title: '添付庫', body: '記事に使う画像やファイルを保存し、アップロード後にリンクを再利用できます。' },
    { key: 'arena-draw', routeName: 'arena', title: 'ピクセル工房', body: 'ピクセルアートを描いたり、画像をピクセル化して公開できます。' },
    { key: 'arena-manage', routeName: 'arena', title: '作品管理', body: '公開済みの作品はユーザーセンターで再編集や削除ができます。管理者は全作品を管理できます。' },
    { key: 'user-profile', routeName: 'userCenter', title: 'ユーザーセンター', body: 'プロフィール、記事、ブックマーク、ピクセルアート、セキュリティを管理できます。' },
    { key: 'user-pixel', routeName: 'userCenter', title: '自分のピクセルアート', body: 'ピクセルアートタブで作品の新規作成、編集、削除ができます。' },
    { key: 'notifications', routeName: 'notifications', title: '通知', body: '返信、いいね、サイト内の反応がここに集まります。読了にもできます。' },
    { key: 'profile-public', routeName: 'userProfile', title: '公開プロフィール', body: '作者の公開記事や交流入口を確認できます。' },
    { key: 'reality', routeName: 'reality', title: 'リアル回廊', body: '連絡先、プライバシー説明、このペットの出典を確認できます。' },
    { key: 'terminal', routeName: 'terminal', title: '管理端末', body: '管理者は記事、メッセージ、ユーザー、リンク、サイト設定を管理できます。' },
    { key: 'login', routeNames: ['login', 'register'], title: 'アカウント', body: 'ログインすると投稿、保存、素材管理、ユーザー別の記憶や作品管理が使えます。' },
    { key: 'global-nav', title: 'ナビゲーション', body: '左のナビで素早く移動できます。モバイルでは上部メニューから開けます。' },
    { key: 'global-theme', title: '表示設定', body: '月/太陽ボタンでテーマを切り替え、言語ボタンで中文と日本語を切り替えられます。' }
  ]
};

const frame = ref(IDLE_SEQUENCE.frames[0]);
const activeTip = ref(null);
let currentSequence = IDLE_SEQUENCE;
let sequenceIndex = 1;
let loopsRemaining = Number.POSITIVE_INFINITY;
let frameTimerId = 0;
let actionTimerId = 0;
let tipHideTimerId = 0;
let lastTipKey = '';
let motionReduced = false;

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
const petButtonLabel = computed(() => props.lang === 'ja' ? '八千代の案内を見る' : '查看八千代的引导');

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
  return 12000 + Math.floor(Math.random() * 10000);
}

function scheduleRandomAction() {
  if (actionTimerId) window.clearTimeout(actionTimerId);
  actionTimerId = window.setTimeout(() => {
    playRandomAction();
  }, randomActionDelay());
}

function tipMatchesRoute(tip) {
  if (!props.routeName) return false;
  if (Array.isArray(tip.routeNames)) return tip.routeNames.includes(props.routeName);
  return tip.routeName === props.routeName;
}

function currentTipPool() {
  const tips = FEATURE_TIPS[props.lang] || FEATURE_TIPS.zh;
  const routeTips = tips.filter(tipMatchesRoute);
  if (routeTips.length) return routeTips;
  return tips.filter((tip) => !tip.routeName && !tip.routeNames);
}

function pickTip() {
  const tips = currentTipPool();
  const choices = tips.length > 1 ? tips.filter((tip) => tip.key !== lastTipKey) : tips;
  const tip = choices[Math.floor(Math.random() * choices.length)] || tips[0];
  lastTipKey = tip?.key || '';
  return tip;
}

function hideTip() {
  activeTip.value = null;
  if (tipHideTimerId) window.clearTimeout(tipHideTimerId);
  tipHideTimerId = 0;
}

function playClickAction() {
  if (motionReduced) return;
  if (currentSequence !== IDLE_SEQUENCE) return;
  if (actionTimerId) window.clearTimeout(actionTimerId);
  currentSequence = SEQUENCES.waving;
  frame.value = currentSequence.frames[0];
  sequenceIndex = 1;
  loopsRemaining = currentSequence.loops;
}

function showGuidanceTip() {
  const tip = pickTip();
  if (!tip) return;

  activeTip.value = tip;
  playClickAction();
  if (tipHideTimerId) window.clearTimeout(tipHideTimerId);
  tipHideTimerId = window.setTimeout(() => {
    hideTip();
  }, 7600);
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
  motionReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  if (!motionReduced) {
    queueNextFrame();
    scheduleRandomAction();
  }
});

onBeforeUnmount(() => {
  if (frameTimerId) window.clearTimeout(frameTimerId);
  if (actionTimerId) window.clearTimeout(actionTimerId);
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

    <button
      class="site-pet"
      type="button"
      :aria-label="petButtonLabel"
      :style="petStyle"
      @click="showGuidanceTip"
    ></button>
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
  display: block;
  width: 100%;
  aspect-ratio: 192 / 208;
  padding: 0;
  border: 0;
  appearance: none;
  background-color: transparent;
  background-repeat: no-repeat;
  background-size: 800% 900%;
  cursor: pointer;
  filter: drop-shadow(0 16px 28px rgba(12, 16, 32, 0.28));
  transform-origin: 50% 100%;
  pointer-events: auto;
  transition: filter 180ms ease, transform 180ms ease;
}

.site-pet:hover {
  filter: drop-shadow(0 18px 32px rgba(12, 16, 32, 0.32));
}

.site-pet:active {
  transform: translateY(1px) scale(0.99);
}

.site-pet:focus-visible {
  outline: 2px solid rgba(131, 216, 236, 0.8);
  outline-offset: 0.18rem;
  border-radius: 8px;
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
  pointer-events: none;
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
