<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import TsIcon from '../components/TsIcon.vue';
import { useLive2D } from '../composables/room/useLive2D';
import {
  clearLive2DLLMHistory,
  requestLive2DControl
} from '../services/room/live2dLlmControl';
import { dispatchRoomLive2D } from '../services/room/live2dControl';
import { createLive2DSpeechPlayer } from '../services/room/live2dSpeech';

const live2d = useLive2D();
const booted = ref(false);
const prompt = ref('Say hello to the audience and choose a bright expression.');
const liveTopic = ref('late-night AI VTuber test stream');
const audienceInput = ref('');
const audienceQueue = ref([]);
const showLog = ref([]);
const stagePose = ref('');
const llmState = ref({
  loading: false,
  error: '',
  reply: '',
  raw: null,
  live2d: null
});
const liveDirector = reactive({
  running: false,
  status: 'idle',
  error: '',
  turn: 0,
  autoVoice: true
});
const speechState = ref({
  status: 'idle',
  error: ''
});

let stagePoseTimer = 0;
let liveTimer = 0;
let liveTurnInFlight = false;
let speechPlayer = null;

const statusLabel = computed(() => {
  if (live2d.error.value) return 'ERROR';
  if (live2d.ready.value) return 'READY';
  if (live2d.loading.value) return 'LOADING';
  return 'STANDBY';
});

const liveStateLabel = computed(() => {
  if (liveDirector.error) return 'ERROR';
  if (liveDirector.running && liveDirector.status === 'speaking') return 'SPEAKING';
  if (liveDirector.running && liveDirector.status === 'thinking') return 'THINKING';
  if (liveDirector.running) return 'ON AIR';
  return 'OFF AIR';
});

const latestCaption = computed(() => {
  const line = [...showLog.value].reverse().find((item) => item.role === 'yachiyo');
  return line?.text || llmState.value.reply || '';
});

const testActions = [
  { label: 'Neutral', expression: 'neutral' },
  { label: 'Smile', expression: 'smile' },
  { label: 'Shy', expression: 'bsmile' },
  { label: 'Tears', expression: 'tears' }
];

const bodyActions = [
  { label: 'Nod', bodyPose: 'nod' },
  { label: 'Shake', bodyPose: 'shake_head' },
  { label: 'Lean', bodyPose: 'lean_in' },
  { label: 'Sway', bodyPose: 'sway' },
  { label: 'Left', bodyPose: 'lean_left' },
  { label: 'Right', bodyPose: 'lean_right' },
  { label: 'Bounce', bodyPose: 'bounce' },
  { label: 'Hit', bodyPose: 'emphasis' }
];

function uid(prefix = 'line') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampDuration(value, fallback = 2400) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.round(numeric), 900), 12000);
}

function normalizeStagePose(value) {
  const pose = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!pose || pose === 'none' || pose === 'null') return '';
  if (['tap_body', 'body_tap', 'tapbody'].includes(pose)) return 'emphasis';
  return [
    'nod',
    'shake_head',
    'lean_in',
    'lean_left',
    'lean_right',
    'sway',
    'bounce',
    'emphasis'
  ].includes(pose) ? pose : '';
}

function pushLog(role, text, meta = {}) {
  const value = String(text || '').trim();
  if (!value) return;
  showLog.value = [
    ...showLog.value,
    {
      id: uid(role),
      role,
      text: value,
      meta,
      createdAt: Date.now()
    }
  ].slice(-10);
}

function onRoomAct(event) {
  const detail = event.detail || {};
  const pose = normalizeStagePose(detail.bodyPose || detail.motion);
  if (!pose) return;
  window.clearTimeout(stagePoseTimer);
  stagePose.value = '';
  window.requestAnimationFrame(() => {
    stagePose.value = pose;
  });
  stagePoseTimer = window.setTimeout(() => {
    stagePose.value = '';
  }, clampDuration(detail.durationMs));
}

async function init() {
  if (booted.value) return;
  booted.value = true;
  window.TSUKUYOMI_LIVE2D_DISABLE_POINTER = true;
  speechPlayer = createLive2DSpeechPlayer({
    onState: (patch) => {
      speechState.value = { ...speechState.value, ...patch };
    }
  });
  await live2d.init();
}

function runExpression(expression) {
  dispatchRoomLive2D({
    expression,
    expressionMix: [{ expression, weight: 1 }],
    durationMs: 4200
  });
}

function runBodyPose(bodyPose) {
  dispatchRoomLive2D({
    bodyPose,
    intensity: 0.85,
    durationMs: 2600
  });
}

function runGreeting() {
  dispatchRoomLive2D({
    sequence: [
      {
        expression: 'smile',
        expressionMix: [{ expression: 'smile', weight: 1 }],
        bodyPose: 'bounce',
        durationMs: 2300
      },
      {
        expression: 'bsmile',
        expressionMix: [{ expression: 'bsmile', weight: 1 }],
        bodyPose: 'lean_in',
        delayMs: 180,
        durationMs: 2600
      },
      {
        expression: 'neutral',
        expressionMix: [{ expression: 'neutral', weight: 1 }],
        bodyPose: 'sway',
        delayMs: 180,
        durationMs: 2200
      }
    ]
  });
}

function speak() {
  if (latestCaption.value && speechPlayer) {
    speechPlayer.play(latestCaption.value).catch(() => {});
    return;
  }
  live2d.speak();
}

async function performLLMAct(message, source = 'manual') {
  const value = String(message || '').trim();
  if (!value || llmState.value.loading) return null;
  llmState.value = {
    ...llmState.value,
    loading: true,
    error: ''
  };
  try {
    const result = await requestLive2DControl(value);
    if (result.live2d) dispatchRoomLive2D(result.live2d);
    llmState.value = {
      loading: false,
      error: '',
      reply: result.reply,
      raw: result.raw,
      live2d: result.live2d
    };
    if (source === 'live') {
      pushLog('yachiyo', result.reply, { live2d: result.live2d });
    }
    return result;
  } catch (error) {
    llmState.value = {
      ...llmState.value,
      loading: false,
      error: error.message || 'LLM control failed'
    };
    throw error;
  }
}

async function runLLMControl() {
  const message = prompt.value.trim();
  if (!message || llmState.value.loading) return;
  const result = await performLLMAct(message, 'manual').catch(() => null);
  if (result?.reply) pushLog('yachiyo', result.reply, { live2d: result.live2d });
}

function resetLLMHistory() {
  clearLive2DLLMHistory();
  showLog.value = [];
  audienceQueue.value = [];
  llmState.value = {
    loading: false,
    error: '',
    reply: '',
    raw: null,
    live2d: null
  };
}

function buildLiveDirectorPrompt(audienceLines) {
  const chat = audienceLines.length
    ? audienceLines.map((line, index) => `${index + 1}. ${line}`).join('\n')
    : 'No new audience messages. Continue the show with a short autonomous streamer thought.';
  return [
    'LIVE_DIRECTOR_TICK',
    `Stream topic: ${liveTopic.value || 'free talk'}`,
    'Recent audience messages:',
    chat,
    'Act like an autonomous AI VTuber streamer. Reply with 1-2 short spoken sentences.',
    'Do not wait passively for instructions. React, tease gently, ask a tiny hook, or continue the topic.',
    'Choose a visible bodyPose every turn unless the moment is intentionally calm.',
    'Prefer nod, lean_in, sway, bounce, shake_head, or emphasis. Use expression and expressionMix too.',
    'Return the required JSON object only.'
  ].join('\n');
}

function scheduleLiveTurn(delayMs = 7800) {
  window.clearTimeout(liveTimer);
  if (!liveDirector.running) return;
  liveTimer = window.setTimeout(() => {
    runLiveTurn();
  }, delayMs);
}

async function runLiveTurn() {
  if (!liveDirector.running || liveTurnInFlight || llmState.value.loading) return;
  liveTurnInFlight = true;
  liveDirector.status = 'thinking';
  liveDirector.error = '';
  const audienceLines = audienceQueue.value.splice(0, 3);
  try {
    const result = await performLLMAct(buildLiveDirectorPrompt(audienceLines), 'live');
    liveDirector.turn += 1;
    if (result?.reply && liveDirector.autoVoice && speechPlayer) {
      liveDirector.status = 'speaking';
      await speechPlayer.play(result.reply).catch((error) => {
        speechState.value = { status: 'error', error: error.message || 'TTS failed' };
      });
    }
    liveDirector.status = 'idle';
  } catch (error) {
    liveDirector.error = error.message || 'Live director failed';
    liveDirector.status = 'idle';
  } finally {
    liveTurnInFlight = false;
    if (liveDirector.running) {
      scheduleLiveTurn(audienceQueue.value.length ? 900 : 7800 + Math.round(Math.random() * 4200));
    }
  }
}

function startLiveDirector() {
  if (liveDirector.running) return;
  liveDirector.running = true;
  liveDirector.status = 'starting';
  liveDirector.error = '';
  pushLog('system', 'Live director started.');
  runLiveTurn();
}

function stopLiveDirector() {
  liveDirector.running = false;
  liveDirector.status = 'idle';
  window.clearTimeout(liveTimer);
  liveTimer = 0;
  speechPlayer?.stop();
  pushLog('system', 'Live director stopped.');
}

function sendAudienceLine() {
  const value = audienceInput.value.trim();
  if (!value) return;
  audienceInput.value = '';
  audienceQueue.value.push(value);
  pushLog('audience', value);
  if (liveDirector.running && !liveTurnInFlight) scheduleLiveTurn(450);
}

onMounted(() => {
  window.addEventListener('tsukuyomi:room-act', onRoomAct);
  init();
});

onUnmounted(() => {
  stopLiveDirector();
  window.clearTimeout(stagePoseTimer);
  window.removeEventListener('tsukuyomi:room-act', onRoomAct);
  speechPlayer?.destroy();
  speechPlayer = null;
  delete window.TSUKUYOMI_LIVE2D_DISABLE_POINTER;
});
</script>

<template>
  <main class="live2d-page" :data-live-state="liveDirector.running ? 'on' : 'off'" aria-label="Live2D preview">
    <div class="live2d-backdrop" aria-hidden="true"></div>
    <section class="live2d-stage" aria-label="Yachiyo Live2D stage">
      <div
        id="live2d-container"
        class="live2d-model"
        :data-pose="stagePose || undefined"
        :data-speaking="speechState.status === 'playing' ? 'true' : undefined"
      ></div>
      <div v-if="live2d.error.value" class="live2d-error" role="alert">{{ live2d.error.value }}</div>
    </section>

    <section class="live2d-broadcast-hud" aria-label="Live broadcast state">
      <div class="live2d-on-air" :class="{ active: liveDirector.running }">
        <span></span>
        <strong>{{ liveStateLabel }}</strong>
        <small>#{{ liveDirector.turn }}</small>
      </div>
      <div v-if="latestCaption" class="live2d-caption">
        {{ latestCaption }}
      </div>
      <div v-if="showLog.length" class="live2d-feed" aria-live="polite">
        <article v-for="line in showLog" :key="line.id" class="live2d-feed-line" :class="line.role">
          <strong>{{ line.role === 'yachiyo' ? 'Yachiyo' : line.role === 'audience' ? 'Chat' : 'System' }}</strong>
          <span>{{ line.text }}</span>
        </article>
      </div>
    </section>

    <aside class="live2d-control-panel" aria-label="Live2D test controls">
      <div class="live2d-status-row">
        <span class="live2d-status-dot" :class="{ ready: live2d.ready.value, error: live2d.error.value }"></span>
        <strong>{{ statusLabel }}</strong>
      </div>

      <section class="live2d-live-director" aria-label="Live director">
        <input v-model="liveTopic" type="text" spellcheck="false" placeholder="Stream topic">
        <div class="live2d-live-actions">
          <button
            class="live2d-action-btn live2d-run-btn"
            type="button"
            :disabled="!live2d.ready.value || (!liveDirector.running && llmState.loading)"
            @click="liveDirector.running ? stopLiveDirector() : startLiveDirector()"
          >
            <TsIcon :name="liveDirector.running ? 'pause' : 'play'" :size="16" />
            <span>{{ liveDirector.running ? 'Stop' : 'Start' }}</span>
          </button>
          <label class="live2d-toggle">
            <input v-model="liveDirector.autoVoice" type="checkbox">
            <span>Voice</span>
          </label>
        </div>
        <div class="live2d-audience-row">
          <input v-model="audienceInput" type="text" spellcheck="false" placeholder="Audience line" @keydown.enter="sendAudienceLine">
          <button class="live2d-icon-btn" type="button" title="Send audience line" aria-label="Send audience line" @click="sendAudienceLine">
            <TsIcon name="send" :size="17" />
          </button>
        </div>
        <p v-if="liveDirector.error || speechState.error" class="live2d-inline-error">
          {{ liveDirector.error || speechState.error }}
        </p>
      </section>

      <div class="live2d-actions">
        <button
          v-for="action in testActions"
          :key="action.expression"
          class="live2d-action-btn"
          type="button"
          :disabled="!live2d.ready.value"
          @click="runExpression(action.expression)"
        >
          {{ action.label }}
        </button>
      </div>
      <div class="live2d-actions live2d-body-actions">
        <button
          v-for="action in bodyActions"
          :key="action.bodyPose"
          class="live2d-action-btn"
          type="button"
          :disabled="!live2d.ready.value"
          @click="runBodyPose(action.bodyPose)"
        >
          {{ action.label }}
        </button>
      </div>
      <div class="live2d-icon-actions">
        <button class="live2d-icon-btn" type="button" :disabled="!live2d.ready.value" title="Greeting" aria-label="Greeting" @click="runGreeting">
          <TsIcon name="star" :size="20" />
        </button>
        <button class="live2d-icon-btn" type="button" :disabled="!live2d.ready.value" title="Speak caption" aria-label="Speak caption" @click="speak">
          <TsIcon name="audioLines" :size="20" />
        </button>
      </div>
      <form class="live2d-llm-form" @submit.prevent="runLLMControl">
        <textarea v-model="prompt" rows="3" spellcheck="false" placeholder="Ask LLM to control Live2D"></textarea>
        <div class="live2d-llm-actions">
          <button class="live2d-action-btn live2d-run-btn" type="submit" :disabled="!live2d.ready.value || llmState.loading">
            {{ llmState.loading ? 'Thinking' : 'LLM Act' }}
          </button>
          <button class="live2d-icon-btn" type="button" title="Clear history" aria-label="Clear history" @click="resetLLMHistory">
            <TsIcon name="trash" :size="18" />
          </button>
        </div>
      </form>
      <div v-if="llmState.error || llmState.live2d" class="live2d-llm-result" :class="{ error: llmState.error }">
        <strong>{{ llmState.error ? 'ERROR' : 'ACT' }}</strong>
        <p v-if="llmState.error">{{ llmState.error }}</p>
        <pre v-if="llmState.live2d">{{ JSON.stringify(llmState.live2d, null, 2) }}</pre>
      </div>
    </aside>

    <div v-if="live2d.loading.value" class="live2d-loading" role="status">
      <TsIcon name="loader" :size="28" />
      <span>Loading Live2D</span>
    </div>
  </main>
</template>
