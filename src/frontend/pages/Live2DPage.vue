<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import TsIcon from '../components/TsIcon.vue';
import { useLive2D } from '../composables/room/useLive2D';
import {
  clearLive2DLLMHistory,
  requestLive2DControl,
  requestLive2DControlStream
} from '../services/room/live2dLlmControl';
import { dispatchRoomLive2D } from '../services/room/live2dControl';
import { shouldDisableLive2DPointer } from '../services/room/live2dBridge';
import { createLive2DSpeechPlayer } from '../services/room/live2dSpeech';
import {
  alignLive2DIntentToStreamingSpeech,
  createLive2DStreamingSpeechSession,
  streamingSpeechHoldMs
} from '../services/room/live2dStreamingSpeechSession';

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
let streamingSpeechSession = null;

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

function dispatchCharacterState(mode, detail = {}) {
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-character-state', {
    detail: { mode, ...detail }
  }));
}

function dispatchStreamingSpeechStart(durationMs = 0, detail = {}) {
  if (streamingSpeechSession) {
    streamingSpeechSession.lineStarted({ durationMs, ...detail });
    return;
  }
  dispatchCharacterState('speaking', {
    holdMs: streamingSpeechHoldMs(durationMs),
    emotion: detail.emotion,
    emotionHoldMs: Math.max(Number(durationMs) || 0, 1800),
    attention: detail.attention ?? 0.88,
    arousal: detail.arousal ?? (detail.emotion === 'sad' || detail.emotion === 'crying' ? 0.5 : 0.72)
  });
}

async function init() {
  if (booted.value) return;
  booted.value = true;
  window.TSUKUYOMI_LIVE2D_DISABLE_POINTER = shouldDisableLive2DPointer();
  streamingSpeechSession = createLive2DStreamingSpeechSession({
    dispatchCharacterState,
    isLiveDirectorRunning: () => liveDirector.running
  });
  speechPlayer = createLive2DSpeechPlayer({
    onState: (patch) => {
      speechState.value = { ...speechState.value, ...patch };
      streamingSpeechSession?.handleSpeechStatePatch(patch);
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

function alignLive2DToSpeech(intent, speechDurationMs = 0) {
  return alignLive2DIntentToStreamingSpeech(intent, speechDurationMs);
}

function speak() {
  if (latestCaption.value && speechPlayer) {
    const live2dIntent = llmState.value.live2d || null;
    speechPlayer.play(latestCaption.value, {
      emotion: live2dIntent?.emotion || live2dIntent?.expression || 'neutral',
      speechStyle: live2dIntent?.speechStyle || null,
      onStart: ({ durationMs }) => {
        if (live2dIntent) dispatchRoomLive2D(alignLive2DToSpeech(live2dIntent, durationMs));
        dispatchStreamingSpeechStart(durationMs, {
          emotion: live2dIntent?.emotion || live2dIntent?.expression || 'neutral'
        });
      }
    }).catch(() => {});
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

async function performStreamingLiveTurn(message) {
  const value = String(message || '').trim();
  if (!value || llmState.value.loading || !speechPlayer) return null;
  const playbackPromises = [];
  let queuedReply = '';
  let spokenReply = '';
  let finalResult = null;
  let queuedSpeechCount = 0;
  let queuedLive2DCount = 0;
  let dispatchedStreamLive2DCount = 0;

  streamingSpeechSession?.begin();
  dispatchCharacterState('thinking', { holdMs: 2400, attention: 0.82, arousal: 0.5 });
  llmState.value = {
    ...llmState.value,
    loading: true,
    error: ''
  };

  try {
    finalResult = await requestLive2DControlStream(value, {
      onSentence: (sentence) => {
        const speechSentence = String(sentence.text || '').trim();
        if (!speechSentence) return;
        queuedReply = queuedReply ? `${queuedReply}\n${speechSentence}` : speechSentence;
        if (sentence.live2d) queuedLive2DCount += 1;
        llmState.value = {
          loading: true,
          error: '',
          reply: spokenReply || llmState.value.reply,
          raw: finalResult?.raw || null,
          live2d: sentence.live2d
        };
        liveDirector.status = 'speaking';
        queuedSpeechCount += 1;
        streamingSpeechSession?.queueLine();
        playbackPromises.push(speechPlayer.enqueue(speechSentence, {
          emotion: sentence.emotion,
          speechStyle: sentence.speechStyle,
          onStart: ({ durationMs }) => {
            spokenReply = spokenReply ? `${spokenReply}\n${speechSentence}` : speechSentence;
            pushLog('yachiyo', speechSentence, { live2d: sentence.live2d, streaming: true });
            llmState.value = {
              loading: true,
              error: '',
              reply: spokenReply,
              raw: finalResult?.raw || null,
              live2d: sentence.live2d
            };
            if (sentence.live2d) {
              dispatchedStreamLive2DCount += 1;
              dispatchRoomLive2D(alignLive2DToSpeech(sentence.live2d, durationMs));
            }
            dispatchStreamingSpeechStart(durationMs, {
              emotion: sentence.emotion,
              attention: 0.88,
              arousal: sentence.emotion === 'sad' || sentence.emotion === 'crying' ? 0.5 : 0.72
            });
          }
        }).catch((error) => {
          if (error?.name === 'AbortError') return;
          speechState.value = { status: 'error', error: error.message || 'TTS failed' };
        }).finally(() => {
          streamingSpeechSession?.lineSettled();
        }));
      }
    });

    const visibleReply = queuedSpeechCount < 1 ? finalResult.reply : queuedReply;
    if (queuedSpeechCount < 1 && visibleReply) {
      streamingSpeechSession?.queueLine();
      playbackPromises.push(speechPlayer.enqueue(finalResult.reply || visibleReply, {
        emotion: finalResult.live2d?.emotion || finalResult.live2d?.expression || 'neutral',
        speechStyle: finalResult.live2d?.speechStyle || null,
        onStart: ({ durationMs }) => {
          spokenReply = visibleReply;
          pushLog('yachiyo', visibleReply, { live2d: finalResult.live2d });
          llmState.value = {
            loading: true,
            error: '',
            reply: spokenReply,
            raw: finalResult.raw,
            live2d: finalResult.live2d
          };
          if (finalResult.live2d) dispatchRoomLive2D(alignLive2DToSpeech(finalResult.live2d, durationMs));
          dispatchStreamingSpeechStart(durationMs, {
            emotion: finalResult.live2d?.emotion || finalResult.live2d?.expression || 'neutral'
          });
        }
      }).catch((error) => {
        if (error?.name === 'AbortError') return;
        speechState.value = { status: 'error', error: error.message || 'TTS failed' };
      }).finally(() => {
        streamingSpeechSession?.lineSettled();
      }));
    }

    llmState.value = {
      loading: false,
      error: '',
      reply: spokenReply || llmState.value.reply,
      raw: finalResult.raw,
      live2d: finalResult.live2d
    };
    liveDirector.turn += 1;
    await Promise.allSettled(playbackPromises);
    if (queuedSpeechCount > 0 && finalResult.live2d && queuedLive2DCount > 0 && dispatchedStreamLive2DCount < 1) {
      dispatchRoomLive2D(alignLive2DToSpeech(finalResult.live2d, Number(finalResult.live2d.durationMs) || 0));
    }
    streamingSpeechSession?.finish({ delayMs: 520 });
    return { ...finalResult, reply: visibleReply };
  } catch (error) {
    streamingSpeechSession?.cancel({ dispatchState: true });
    llmState.value = {
      ...llmState.value,
      loading: false,
      error: error.message || 'LLM control failed'
    };
    throw error;
  }
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
    if (liveDirector.autoVoice && speechPlayer) {
      await performStreamingLiveTurn(buildLiveDirectorPrompt(audienceLines));
      liveDirector.status = 'idle';
      return;
    }
    const result = await performLLMAct(buildLiveDirectorPrompt(audienceLines), 'live');
    liveDirector.turn += 1;
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
  streamingSpeechSession?.cancel();
  streamingSpeechSession = null;
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
