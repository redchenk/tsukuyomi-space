<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { askSiteGuide, readSiteGuideLlmStatus } from '../services/siteGuideLlm';
import TsIcon from './TsIcon.vue';

const props = defineProps({
  lang: { type: String, default: 'zh' },
  routeName: { type: String, default: '' },
  reduced: { type: Boolean, default: false },
  spriteSrc: { type: String, default: '/assets/pets/yachiyo/spritesheet-perf-r2.webp' }
});
const emit = defineEmits(['go']);

const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 9;
const rowFrames = (row, count) => Array.from({ length: count }, (_, index) => row * SPRITE_COLUMNS + index);
const SEQUENCES = {
  idle: { frames: rowFrames(0, 6), durations: [280, 110, 110, 140, 140, 320], loops: Infinity },
  runningRight: { frames: rowFrames(1, 8), durations: [120, 120, 120, 120, 120, 120, 120, 220], loops: 4 },
  runningLeft: { frames: rowFrames(2, 8), durations: [120, 120, 120, 120, 120, 120, 120, 220], loops: 4 },
  waving: { frames: rowFrames(3, 4), durations: [140, 140, 140, 280], loops: 3 },
  jumping: { frames: rowFrames(4, 5), durations: [140, 140, 140, 140, 280], loops: 3 },
  failed: { frames: rowFrames(5, 8), durations: [140, 140, 140, 140, 140, 140, 140, 240], loops: 2 },
  waiting: { frames: rowFrames(6, 6), durations: [150, 150, 150, 150, 150, 260], loops: 3 },
  running: { frames: rowFrames(7, 6), durations: [120, 120, 120, 120, 120, 220], loops: 5 },
  review: { frames: rowFrames(8, 6), durations: [150, 150, 150, 150, 150, 280], loops: 4 }
};
const IDLE_SEQUENCE = SEQUENCES.idle;
const ACTION_SEQUENCES = Object.values(SEQUENCES).filter((sequence) => sequence !== IDLE_SEQUENCE);

const COPY = Object.freeze({
  zh: {
    petLabel: '打开八千代 AI 使用向导', title: '八千代向导', subtitle: '询问月读空间的功能与使用方法',
    connected: '已连接 Room 模型', local: '本机模型', cloud: '云端模型', fixed: '快捷帮助',
    noModel: '尚未接入聊天模型', noModelBody: '先在 Room 设置中接入 LLM，之后就能在这里直接询问网站用法。下面的固定帮助仍可使用。',
    setup: '前往 Room 设置', currentPage: '当前页面', ask: '向八千代提问', placeholder: '例如：如何发布文章？',
    send: '发送', sending: '正在回答', close: '关闭向导', open: '打开', empty: '选择一个常见问题，或直接输入你的问题。',
    suggestions: ['如何发布文章？', '怎么上传图库图片？', '每日等级任务在哪里？', 'Room 的模型和记忆怎么设置？']
  },
  ja: {
    petLabel: 'ヤチヨ AI ガイドを開く', title: 'ヤチヨガイド', subtitle: '月読空間の機能と使い方を質問できます',
    connected: 'Room のモデルに接続済み', local: 'ローカルモデル', cloud: 'クラウドモデル', fixed: 'クイックヘルプ',
    noModel: 'チャットモデルが未設定です', noModelBody: '先に Room 設定で LLM を接続すると、ここからサイトの使い方を質問できます。固定ヘルプは今すぐ利用できます。',
    setup: 'Room 設定へ', currentPage: '現在のページ', ask: 'ヤチヨに質問', placeholder: '例：記事を投稿するには？',
    send: '送信', sending: '回答中', close: 'ガイドを閉じる', open: '開く', empty: 'よくある質問を選ぶか、質問を入力してください。',
    suggestions: ['記事を投稿するには？', 'ギャラリーへ画像を追加するには？', '毎日のレベル課題はどこ？', 'Room のモデルと記憶を設定するには？']
  },
  en: {
    petLabel: 'Open Yachiyo AI guide', title: 'Yachiyo Guide', subtitle: 'Ask how to use any part of Tsukuyomi Space',
    connected: 'Connected to your Room model', local: 'Local model', cloud: 'Cloud model', fixed: 'Quick help',
    noModel: 'No chat model connected', noModelBody: 'Connect an LLM in Room Settings to ask questions here. The fixed help below is available now.',
    setup: 'Open Room Settings', currentPage: 'Current page', ask: 'Ask Yachiyo', placeholder: 'For example: How do I publish an article?',
    send: 'Send', sending: 'Answering', close: 'Close guide', open: 'Open', empty: 'Choose a common question or enter your own.',
    suggestions: ['How do I publish an article?', 'How do I upload a gallery image?', 'Where are the daily level tasks?', 'How do I configure the Room model and memory?']
  }
});

const GUIDES = Object.freeze([
  {
    key: 'room', icon: 'message', path: '/room/settings', routes: ['room', 'roomSettings'],
    zh: ['Room 与记忆', '在 Room 设置中接入模型、语音、知识库和长期记忆。'],
    ja: ['Room と記憶', 'Room 設定でモデル、音声、知識、長期記憶を接続します。'],
    en: ['Room and memory', 'Connect your model, voice, knowledge and long-term memory in Room Settings.']
  },
  {
    key: 'stage', icon: 'fileText', path: '/editor', routes: ['stage', 'article', 'articleDetail', 'editor'],
    zh: ['文章发布', '登录后从编辑器发布文章，封面和正文素材可从附件库选择。'],
    ja: ['記事の投稿', 'ログイン後にエディターから投稿し、添付庫の素材を利用できます。'],
    en: ['Publish articles', 'Sign in, open the editor, and use assets from your attachment library.']
  },
  {
    key: 'plaza', icon: 'plaza', path: '/plaza', routes: ['plaza'],
    zh: ['留言互动', '广场支持留言、回复和点赞，公开内容会先经过安全审核。'],
    ja: ['メッセージ', '広場では投稿、返信、いいねができ、公開前に安全審査があります。'],
    en: ['Community messages', 'Post, reply and like in the Plaza. Public content is moderated for safety.']
  },
  {
    key: 'gallery', icon: 'image', path: '/gallery/manage', routes: ['gallery', 'galleryManage', 'attachments'],
    zh: ['图库与附件', '图库管理用于公开图片，附件库用于文章素材和个人文件。'],
    ja: ['ギャラリーと添付', '公開画像はギャラリー管理、記事素材は添付庫を使います。'],
    en: ['Gallery and files', 'Use Gallery Management for public images and Attachments for article assets.']
  },
  {
    key: 'pixel', icon: 'grid', path: '/pixel', routes: ['pixel'],
    zh: ['像素工坊', '绘制 192×108 像素画，发布后可以点赞、分享和导出 PNG。'],
    ja: ['ピクセル工房', '192×108 の作品を描き、公開後にいいね、共有、PNG 出力ができます。'],
    en: ['Pixel workshop', 'Draw 192×108 art, then publish, like, share or export it as PNG.']
  },
  {
    key: 'growth', icon: 'sparkles', path: '/growth', routes: ['growth', 'userCenter', 'userProfile'],
    zh: ['等级成长', '签到和分享是固定任务，第三项会在文章、广场、像素画和图库中每日轮换。'],
    ja: ['レベル成長', 'チェックインと共有は固定任務で、3つ目は記事・プラザ・ピクセル・ギャラリーから毎日更新されます。'],
    en: ['Level growth', 'Check-in and sharing are fixed tasks. A third creation task rotates daily across Stage, Plaza, Pixel and Gallery.']
  }
]);

const frame = ref(IDLE_SEQUENCE.frames[0]);
const dialogOpen = ref(false);
const question = ref('');
const messages = ref([]);
const asking = ref(false);
const error = ref('');
const llmStatus = ref(readSiteGuideLlmStatus());
const inputElement = ref(null);
const dialogElement = ref(null);
const messageElement = ref(null);
let currentSequence = IDLE_SEQUENCE;
let sequenceIndex = 1;
let loopsRemaining = Infinity;
let frameTimerId = 0;
let actionTimerId = 0;
let motionReduced = false;
let previousBodyOverflow = '';

const copy = computed(() => COPY[props.lang] || COPY.zh);
const petStyle = computed(() => {
  if (props.reduced) return { backgroundImage: 'url("/assets/pets/yachiyo/idle.webp")', backgroundPosition: '0 0', backgroundSize: '100% 100%' };
  const col = frame.value % SPRITE_COLUMNS;
  const row = Math.floor(frame.value / SPRITE_COLUMNS);
  return {
    backgroundImage: `url("${props.spriteSrc}")`,
    backgroundPosition: `${(col / (SPRITE_COLUMNS - 1)) * 100}% ${(row / (SPRITE_ROWS - 1)) * 100}%`
  };
});
const sortedGuides = computed(() => [...GUIDES].sort((left, right) => {
  const leftMatch = left.routes.includes(props.routeName) ? 1 : 0;
  const rightMatch = right.routes.includes(props.routeName) ? 1 : 0;
  return rightMatch - leftMatch;
}));
const modelLabel = computed(() => llmStatus.value.configured
  ? `${llmStatus.value.local ? copy.value.local : copy.value.cloud} · ${llmStatus.value.model}`
  : '');

function guideText(guide) {
  return guide[props.lang] || guide.zh;
}

function setIdleSequence() {
  currentSequence = IDLE_SEQUENCE;
  loopsRemaining = Infinity;
  frame.value = currentSequence.frames[0];
  sequenceIndex = 1;
  scheduleRandomAction();
}

function advanceFrame() {
  if (sequenceIndex >= currentSequence.frames.length) {
    if (currentSequence === IDLE_SEQUENCE) sequenceIndex = 0;
    else if (loopsRemaining > 1) {
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

function queueNextFrame() {
  if (motionReduced || props.reduced) return;
  const index = currentSequence.frames.indexOf(frame.value);
  frameTimerId = window.setTimeout(() => {
    advanceFrame();
    queueNextFrame();
  }, currentSequence.durations[index] || 160);
}

function scheduleRandomAction() {
  if (motionReduced || props.reduced) return;
  window.clearTimeout(actionTimerId);
  actionTimerId = window.setTimeout(playRandomAction, 12000 + Math.floor(Math.random() * 10000));
}

function playRandomAction() {
  if (currentSequence !== IDLE_SEQUENCE || dialogOpen.value) return scheduleRandomAction();
  currentSequence = ACTION_SEQUENCES[Math.floor(Math.random() * ACTION_SEQUENCES.length)];
  frame.value = currentSequence.frames[0];
  sequenceIndex = 1;
  loopsRemaining = currentSequence.loops;
}

function playClickAction() {
  if (motionReduced) return;
  window.clearTimeout(actionTimerId);
  currentSequence = SEQUENCES.waving;
  frame.value = currentSequence.frames[0];
  sequenceIndex = 1;
  loopsRemaining = currentSequence.loops;
}

async function openGuide() {
  llmStatus.value = readSiteGuideLlmStatus();
  error.value = '';
  dialogOpen.value = true;
  playClickAction();
  await nextTick();
  (llmStatus.value.configured ? inputElement.value : dialogElement.value)?.focus();
}

function closeGuide() {
  dialogOpen.value = false;
}

function navigate(path) {
  closeGuide();
  emit('go', path);
}

async function scrollMessages() {
  await nextTick();
  if (messageElement.value) messageElement.value.scrollTop = messageElement.value.scrollHeight;
}

async function submitQuestion(preset = '') {
  if (asking.value || !llmStatus.value.configured) return;
  const prompt = String(preset || question.value).trim().slice(0, 800);
  if (!prompt) return;

  const history = messages.value.slice(-8);
  messages.value.push({ role: 'user', content: prompt });
  question.value = '';
  error.value = '';
  asking.value = true;
  await scrollMessages();
  try {
    const reply = await askSiteGuide({ question: prompt, history, lang: props.lang, routeName: props.routeName });
    messages.value.push({ role: 'assistant', content: reply });
  } catch (requestError) {
    error.value = requestError.message || 'Unable to load the guide response.';
  } finally {
    asking.value = false;
    await scrollMessages();
    inputElement.value?.focus();
  }
}

function handleDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeGuide();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...dialogElement.value?.querySelectorAll('button:not([disabled]), a[href], textarea:not([disabled])') || []];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(dialogOpen, (open) => {
  if (open) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = previousBodyOverflow;
  }
});

watch(() => props.reduced, (reduced) => {
  motionReduced = reduced || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  window.clearTimeout(frameTimerId);
  window.clearTimeout(actionTimerId);
  frameTimerId = 0;
  actionTimerId = 0;
  setIdleSequence();
  if (!motionReduced) queueNextFrame();
});

onMounted(() => {
  motionReduced = props.reduced || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  if (!motionReduced) {
    queueNextFrame();
    scheduleRandomAction();
  }
});

onBeforeUnmount(() => {
  window.clearTimeout(frameTimerId);
  window.clearTimeout(actionTimerId);
  if (dialogOpen.value) document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <div class="site-pet-wrap" :class="routeName ? `site-pet-route-${routeName}` : ''">
    <button class="site-pet" type="button" :aria-label="copy.petLabel" :style="petStyle" @click="openGuide"></button>
  </div>

  <Teleport to="body">
    <Transition name="site-guide">
      <div v-if="dialogOpen" class="site-guide-backdrop" @mousedown.self="closeGuide">
        <section
          ref="dialogElement"
          class="site-guide-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-guide-title"
          tabindex="-1"
          @keydown="handleDialogKeydown"
        >
          <header class="site-guide-header">
            <div class="site-guide-heading">
              <span class="site-guide-mark"><TsIcon name="sparkles" :size="20" /></span>
              <div>
                <h2 id="site-guide-title">{{ copy.title }}</h2>
                <p>{{ copy.subtitle }}</p>
              </div>
            </div>
            <button class="site-guide-icon-btn" type="button" :aria-label="copy.close" @click="closeGuide">
              <TsIcon name="x" :size="20" />
            </button>
          </header>

          <div class="site-guide-status" :class="{ connected: llmStatus.configured }">
            <TsIcon :name="llmStatus.configured ? 'badge' : 'shield'" :size="16" />
            <div>
              <strong>{{ llmStatus.configured ? copy.connected : copy.noModel }}</strong>
              <span>{{ llmStatus.configured ? modelLabel : copy.noModelBody }}</span>
            </div>
            <button v-if="!llmStatus.configured" class="site-guide-setup" type="button" @click="navigate('/room/settings')">
              {{ copy.setup }}
            </button>
          </div>

          <div class="site-guide-body" :aria-busy="asking">
            <section class="site-guide-help" aria-labelledby="site-guide-help-title">
              <div class="site-guide-section-head">
                <h3 id="site-guide-help-title">{{ copy.fixed }}</h3>
                <span>{{ copy.currentPage }} · {{ routeName || 'hub' }}</span>
              </div>
              <div class="site-guide-cards">
                <article v-for="guide in sortedGuides" :key="guide.key" class="site-guide-card">
                  <span class="site-guide-card-icon"><TsIcon :name="guide.icon" :size="17" /></span>
                  <div>
                    <strong>{{ guideText(guide)[0] }}</strong>
                    <p>{{ guideText(guide)[1] }}</p>
                  </div>
                  <button type="button" :aria-label="`${copy.open} ${guideText(guide)[0]}`" @click="navigate(guide.path)">
                    <TsIcon name="arrowRight" :size="16" />
                  </button>
                </article>
              </div>
            </section>

            <section v-if="llmStatus.configured" class="site-guide-chat" aria-labelledby="site-guide-chat-title">
              <div class="site-guide-section-head">
                <h3 id="site-guide-chat-title">{{ copy.ask }}</h3>
              </div>
              <div class="site-guide-suggestions">
                <button v-for="suggestion in copy.suggestions" :key="suggestion" type="button" :disabled="asking" @click="submitQuestion(suggestion)">
                  {{ suggestion }}
                </button>
              </div>

              <div ref="messageElement" class="site-guide-messages" aria-live="polite">
                <p v-if="!messages.length && !asking" class="site-guide-empty">{{ copy.empty }}</p>
                <div v-for="(item, index) in messages" :key="`${item.role}-${index}`" class="site-guide-message" :class="item.role">
                  <span>{{ item.role === 'assistant' ? copy.title : (lang === 'en' ? 'You' : lang === 'ja' ? 'あなた' : '你') }}</span>
                  <p>{{ item.content }}</p>
                </div>
                <div v-if="asking" class="site-guide-message assistant site-guide-thinking" role="status">
                  <span>{{ copy.title }}</span>
                  <p><TsIcon class="ts-status-loader-icon" name="loader" :size="16" /> {{ copy.sending }}</p>
                </div>
              </div>

              <div v-if="error" class="site-guide-error" role="alert">{{ error }}</div>
              <form class="site-guide-form" @submit.prevent="submitQuestion()">
                <textarea
                  ref="inputElement"
                  v-model="question"
                  rows="2"
                  maxlength="800"
                  :placeholder="copy.placeholder"
                  :disabled="asking"
                  @keydown.enter.exact.prevent="submitQuestion()"
                ></textarea>
                <button type="submit" :disabled="asking || !question.trim()" :aria-busy="asking">
                  <TsIcon :class="{ 'ts-status-loader-icon': asking }" :name="asking ? 'loader' : 'send'" :size="17" />
                  <span>{{ asking ? copy.sending : copy.send }}</span>
                </button>
              </form>
            </section>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.site-pet-wrap {
  --site-pet-width: clamp(6.5rem, 9vw, 9.5rem);
  position: fixed;
  right: max(0.9rem, env(safe-area-inset-right));
  bottom: max(0.75rem, env(safe-area-inset-bottom));
  z-index: 220;
  width: var(--site-pet-width);
  pointer-events: none;
}

.site-pet {
  display: block;
  width: 100%;
  aspect-ratio: 192 / 208;
  padding: 0;
  border: 0;
  border-radius: 8px;
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

.site-pet:hover { filter: drop-shadow(0 18px 32px rgba(12, 16, 32, 0.36)); }
.site-pet:active { transform: translateY(1px) scale(0.985); }
.site-pet:focus-visible { outline: 2px solid #72d5e5; outline-offset: 0.18rem; }

.site-guide-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  background: rgba(5, 9, 18, 0.56);
  backdrop-filter: blur(10px) saturate(1.08);
}

.site-guide-dialog {
  display: flex;
  flex-direction: column;
  width: min(48rem, 100%);
  max-height: min(47rem, calc(100dvh - 2rem));
  overflow: hidden;
  border: 1px solid rgba(143, 172, 197, 0.34);
  border-radius: 8px;
  color: var(--text, #eef5ff);
  background: color-mix(in srgb, var(--surface, #151c29) 93%, transparent);
  box-shadow: 0 30px 90px rgba(2, 6, 14, 0.44);
  outline: none;
}

.site-guide-header,
.site-guide-status,
.site-guide-form,
.site-guide-section-head,
.site-guide-heading,
.site-guide-card,
.site-guide-message > span {
  display: flex;
  align-items: center;
}

.site-guide-header {
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid rgba(143, 172, 197, 0.2);
}

.site-guide-heading { min-width: 0; gap: 0.72rem; }
.site-guide-mark { display: grid; flex: 0 0 2.35rem; width: 2.35rem; aspect-ratio: 1; place-items: center; border-radius: 50%; color: #a9edf3; background: rgba(60, 171, 187, 0.18); }
.site-guide-heading div { min-width: 0; }
.site-guide-heading h2 { margin: 0; font-size: 1.02rem; line-height: 1.25; }
.site-guide-heading p { margin: 0.2rem 0 0; overflow: hidden; color: var(--muted, #aab5c4); font-size: 0.78rem; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }

.site-guide-icon-btn,
.site-guide-card button {
  display: grid;
  flex: 0 0 auto;
  width: 2.25rem;
  aspect-ratio: 1;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(143, 172, 197, 0.25);
  border-radius: 50%;
  color: inherit;
  background: rgba(255, 255, 255, 0.045);
  cursor: pointer;
}

.site-guide-status {
  gap: 0.65rem;
  margin: 0.85rem 1.1rem 0;
  padding: 0.72rem 0.8rem;
  border: 1px solid rgba(229, 178, 72, 0.35);
  border-radius: 8px;
  color: #e8c267;
  background: rgba(229, 178, 72, 0.08);
}
.site-guide-status.connected { border-color: rgba(74, 188, 154, 0.34); color: #83ddbd; background: rgba(74, 188, 154, 0.08); }
.site-guide-status > div { min-width: 0; flex: 1; }
.site-guide-status strong,
.site-guide-status span { display: block; }
.site-guide-status strong { font-size: 0.78rem; }
.site-guide-status span { margin-top: 0.15rem; overflow: hidden; color: var(--muted, #aab5c4); font-size: 0.72rem; line-height: 1.4; text-overflow: ellipsis; }
.site-guide-setup { flex: 0 0 auto; padding: 0.48rem 0.68rem; border: 0; border-radius: 999px; color: #16120a; background: #e9c56f; font-size: 0.72rem; font-weight: 850; cursor: pointer; }

.site-guide-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0.9rem 1.1rem 1.1rem; }
.site-guide-help + .site-guide-chat { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(143, 172, 197, 0.18); }
.site-guide-section-head { justify-content: space-between; gap: 0.75rem; margin-bottom: 0.62rem; }
.site-guide-section-head h3 { margin: 0; font-size: 0.82rem; }
.site-guide-section-head span { max-width: 50%; overflow: hidden; color: var(--muted, #aab5c4); font-size: 0.68rem; text-overflow: ellipsis; white-space: nowrap; }

.site-guide-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
.site-guide-card { min-width: 0; gap: 0.62rem; padding: 0.66rem; border: 1px solid rgba(143, 172, 197, 0.18); border-radius: 8px; background: rgba(255, 255, 255, 0.035); }
.site-guide-card-icon { display: grid; flex: 0 0 1.9rem; width: 1.9rem; aspect-ratio: 1; place-items: center; border-radius: 50%; color: #88dce6; background: rgba(77, 180, 193, 0.12); }
.site-guide-card > div { min-width: 0; flex: 1; }
.site-guide-card strong { display: block; overflow: hidden; font-size: 0.75rem; text-overflow: ellipsis; white-space: nowrap; }
.site-guide-card p { display: -webkit-box; margin: 0.2rem 0 0; overflow: hidden; color: var(--muted, #aab5c4); font-size: 0.68rem; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.site-guide-card button:hover,
.site-guide-icon-btn:hover { border-color: rgba(105, 211, 224, 0.52); color: #a9edf3; }

.site-guide-suggestions { display: flex; gap: 0.42rem; margin-bottom: 0.62rem; overflow-x: auto; scrollbar-width: thin; }
.site-guide-suggestions button { flex: 0 0 auto; max-width: min(19rem, 78vw); padding: 0.45rem 0.64rem; overflow: hidden; border: 1px solid rgba(105, 211, 224, 0.26); border-radius: 999px; color: inherit; background: rgba(74, 178, 191, 0.08); font-size: 0.7rem; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }

.site-guide-messages { max-height: 16rem; min-height: 4rem; overflow: auto; overscroll-behavior: contain; padding: 0.2rem; }
.site-guide-empty { margin: 1rem 0; color: var(--muted, #aab5c4); font-size: 0.74rem; text-align: center; }
.site-guide-message { width: fit-content; max-width: 88%; margin: 0 0 0.58rem; }
.site-guide-message.user { margin-left: auto; }
.site-guide-message > span { gap: 0.25rem; margin-bottom: 0.2rem; color: var(--muted, #aab5c4); font-size: 0.64rem; }
.site-guide-message.user > span { justify-content: flex-end; }
.site-guide-message p { margin: 0; padding: 0.62rem 0.72rem; overflow-wrap: anywhere; border: 1px solid rgba(143, 172, 197, 0.18); border-radius: 8px; background: rgba(255, 255, 255, 0.045); font-size: 0.76rem; line-height: 1.55; white-space: pre-wrap; }
.site-guide-message.user p { border-color: rgba(75, 185, 198, 0.3); background: rgba(75, 185, 198, 0.11); }
.site-guide-thinking p { display: inline-flex; align-items: center; gap: 0.42rem; }
.site-guide-error { margin: 0.5rem 0; padding: 0.58rem 0.68rem; border: 1px solid rgba(222, 91, 112, 0.35); border-radius: 8px; color: #ffb3bf; background: rgba(222, 91, 112, 0.08); font-size: 0.72rem; overflow-wrap: anywhere; }

.site-guide-form { gap: 0.55rem; margin-top: 0.55rem; }
.site-guide-form textarea { flex: 1; min-width: 0; min-height: 3.15rem; max-height: 8rem; resize: vertical; padding: 0.68rem 0.72rem; border: 1px solid rgba(143, 172, 197, 0.27); border-radius: 8px; color: inherit; background: rgba(4, 10, 19, 0.18); font: inherit; font-size: 0.76rem; line-height: 1.45; }
.site-guide-form textarea:focus { border-color: #62c9d7; outline: 2px solid rgba(98, 201, 215, 0.18); }
.site-guide-form button { display: inline-flex; flex: 0 0 auto; min-height: 2.65rem; align-items: center; justify-content: center; gap: 0.38rem; padding: 0.62rem 0.82rem; border: 0; border-radius: 999px; color: #071215; background: #89dce6; font-size: 0.74rem; font-weight: 900; cursor: pointer; }
.site-guide-form button:disabled { cursor: not-allowed; opacity: 0.55; }

.site-guide-enter-active,
.site-guide-leave-active { transition: opacity 180ms ease; }
.site-guide-enter-active .site-guide-dialog,
.site-guide-leave-active .site-guide-dialog { transition: transform 180ms ease, opacity 180ms ease; }
.site-guide-enter-from,
.site-guide-leave-to { opacity: 0; }
.site-guide-enter-from .site-guide-dialog,
.site-guide-leave-to .site-guide-dialog { opacity: 0; transform: translateY(0.5rem) scale(0.985); }

@media (max-width: 860px) {
  .site-pet-wrap { --site-pet-width: clamp(5.15rem, 24vw, 6.35rem); right: max(0.45rem, env(safe-area-inset-right)); bottom: max(6.5rem, calc(env(safe-area-inset-bottom) + 6.5rem)); }
  .site-pet-wrap.site-pet-route-hub { --site-pet-width: clamp(3.6rem, 16vw, 4.25rem); right: max(0.3rem, env(safe-area-inset-right)); bottom: max(6.2rem, calc(env(safe-area-inset-bottom) + 6.2rem)); }
}

@media (max-width: 640px) {
  .site-guide-backdrop { align-items: end; padding: 0; }
  .site-guide-dialog { width: 100%; max-height: calc(100dvh - env(safe-area-inset-top)); border-right: 0; border-bottom: 0; border-left: 0; border-radius: 8px 8px 0 0; }
  .site-guide-header { padding: 0.82rem 0.9rem; }
  .site-guide-status { align-items: flex-start; margin: 0.72rem 0.9rem 0; }
  .site-guide-status { flex-wrap: wrap; }
  .site-guide-setup { margin-left: 1.4rem; }
  .site-guide-body { padding: 0.78rem 0.9rem calc(0.9rem + env(safe-area-inset-bottom)); }
  .site-guide-cards { grid-template-columns: 1fr; }
  .site-guide-card p { -webkit-line-clamp: 1; }
  .site-guide-messages { max-height: 13rem; }
  .site-guide-form { align-items: stretch; }
  .site-guide-form button { min-width: 4.7rem; }
}

@media (prefers-reduced-motion: reduce) {
  .site-guide-enter-active,
  .site-guide-leave-active,
  .site-guide-enter-active .site-guide-dialog,
  .site-guide-leave-active .site-guide-dialog { transition: none; }
}
</style>
