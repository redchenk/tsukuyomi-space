<script setup>
import { computed, onMounted, ref } from 'vue';
import TsIcon from '../components/TsIcon.vue';
import { useLive2D } from '../composables/room/useLive2D';
import {
  clearLive2DLLMHistory,
  requestLive2DControl
} from '../services/room/live2dLlmControl';
import { dispatchRoomLive2D } from '../services/room/live2dControl';

const live2d = useLive2D();
const booted = ref(false);
const prompt = ref('Say hello to the audience and choose a bright expression.');
const llmState = ref({
  loading: false,
  error: '',
  reply: '',
  raw: null,
  live2d: null
});

const statusLabel = computed(() => {
  if (live2d.error.value) return 'ERROR';
  if (live2d.ready.value) return 'READY';
  if (live2d.loading.value) return 'LOADING';
  return 'STANDBY';
});

const testActions = [
  { label: 'Neutral', expression: 'neutral' },
  { label: 'Smile', expression: 'smile' },
  { label: 'Shy', expression: 'bsmile' },
  { label: 'Tears', expression: 'tears' }
];

async function init() {
  if (booted.value) return;
  booted.value = true;
  await live2d.init();
}

function runExpression(expression) {
  dispatchRoomLive2D({
    expression,
    expressionMix: [{ expression, weight: 1 }],
    durationMs: 4200
  });
}

function runGreeting() {
  dispatchRoomLive2D({
    sequence: [
      {
        expression: 'smile',
        expressionMix: [{ expression: 'smile', weight: 1 }],
        motion: 'tap_body',
        durationMs: 2800
      },
      {
        expression: 'bsmile',
        expressionMix: [{ expression: 'bsmile', weight: 1 }],
        delayMs: 250,
        durationMs: 3200
      },
      {
        expression: 'neutral',
        expressionMix: [{ expression: 'neutral', weight: 1 }],
        delayMs: 250,
        durationMs: 2400
      }
    ]
  });
}

function speak() {
  live2d.speak();
}

async function runLLMControl() {
  const message = prompt.value.trim();
  if (!message || llmState.value.loading) return;
  llmState.value = {
    ...llmState.value,
    loading: true,
    error: ''
  };
  try {
    const result = await requestLive2DControl(message);
    if (result.live2d) dispatchRoomLive2D(result.live2d);
    llmState.value = {
      loading: false,
      error: '',
      reply: result.reply,
      raw: result.raw,
      live2d: result.live2d
    };
  } catch (error) {
    llmState.value = {
      ...llmState.value,
      loading: false,
      error: error.message || 'LLM control failed'
    };
  }
}

function resetLLMHistory() {
  clearLive2DLLMHistory();
  llmState.value = {
    loading: false,
    error: '',
    reply: '',
    raw: null,
    live2d: null
  };
}

onMounted(init);
</script>

<template>
  <main class="live2d-page" aria-label="Live2D preview">
    <div class="live2d-backdrop" aria-hidden="true"></div>
    <section class="live2d-stage" aria-label="Yachiyo Live2D stage">
      <div id="live2d-container" class="live2d-model"></div>
      <div v-if="live2d.error.value" class="live2d-error" role="alert">{{ live2d.error.value }}</div>
    </section>

    <aside class="live2d-control-panel" aria-label="Live2D test controls">
      <div class="live2d-status-row">
        <span class="live2d-status-dot" :class="{ ready: live2d.ready.value, error: live2d.error.value }"></span>
        <strong>{{ statusLabel }}</strong>
      </div>
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
      <div class="live2d-icon-actions">
        <button class="live2d-icon-btn" type="button" :disabled="!live2d.ready.value" title="Greeting" aria-label="Greeting" @click="runGreeting">
          <TsIcon name="star" :size="20" />
        </button>
        <button class="live2d-icon-btn" type="button" :disabled="!live2d.ready.value" title="Speak" aria-label="Speak" @click="speak">
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
      <div v-if="llmState.error || llmState.reply" class="live2d-llm-result" :class="{ error: llmState.error }">
        <strong>{{ llmState.error ? 'ERROR' : 'REPLY' }}</strong>
        <p>{{ llmState.error || llmState.reply }}</p>
        <pre v-if="llmState.live2d">{{ JSON.stringify(llmState.live2d, null, 2) }}</pre>
      </div>
    </aside>

    <div v-if="live2d.loading.value" class="live2d-loading" role="status">
      <TsIcon name="loader" :size="28" />
      <span>Loading Live2D</span>
    </div>
  </main>
</template>
