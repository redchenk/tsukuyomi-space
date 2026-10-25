<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import TsIcon from '../components/TsIcon.vue';
import { gameCopy } from '../data/gameCopy';
import { BOARD_SIZE, BLACK, WHITE, coordinate, createGame, playMove, undoHumanTurn, restoreGame, saveGame, chooseMove } from '../services/games/gomoku.mjs';
import { createGomokuCompanion } from '../services/games/gomokuCompanion.mjs';
import { readJson } from '../services/room/roomStorage';
import { getSession } from '../api/client';

const props = defineProps({ lang: { type: String, default: 'zh' }, user: { type: Object, default: null } });
const emit = defineEmits(['go']);
const STORAGE_KEY = 'tsukuyomi.gomoku.v1';
const copy = computed(() => gameCopy(props.lang));
const game = ref(createGame());
const thinking = ref(false);
const hint = ref(null);
const focusIndex = ref(112);
const boardElement = ref(null);
const restartDialog = ref(null);
const nextHuman = ref(BLACK);
const nextDifficulty = ref('casual');
const storageAvailable = ref(true);
const resumed = ref(false);
const chat = shallowRef({ messages: [], status: 'idle', configured: false });
const autoTalk = ref(true);
const petInteraction = inject('sitePetInteraction', null);
const companion = createGomokuCompanion({
  readConnection() {
    const session = getSession();
    return { settings: readJson('roomLLMSettings', {}), identity: `${session?.admin ? 'admin' : 'user'}:${session?.user?.id || 'guest'}:${props.lang}` };
  },
  onChange: value => { chat.value = value; }
});
const chatting = computed(() => ['pending', 'streaming'].includes(chat.value.status));
const petSession = computed(() => ({ kind: 'gomoku', copy: copy.value, state: chat.value, busy: thinking.value,
  autoTalk: autoTalk.value, send: sendChat, setAutoTalk: value => { autoTalk.value = value; },
  refresh: companion.refresh, stop: companion.stop, retry: companion.retry }));
let timer = 0;
let generation = 0;
let disposed = false;
const finished = computed(() => Boolean(game.value.winner || game.value.draw));
const canPlay = computed(() => !finished.value && !thinking.value && game.value.turn === game.value.human);
const canUndo = computed(() => game.value.moves.some((_, i) => (i % 2 === 0 ? BLACK : WHITE) === game.value.human));
const status = computed(() => game.value.winner ? (game.value.winner === game.value.human ? copy.value.win : copy.value.lose)
  : game.value.draw ? copy.value.draw : thinking.value ? copy.value.thinking : copy.value.yourTurn);
const lastMove = computed(() => game.value.moves.at(-1));

function react(event) {
  companion.refresh();
  if (autoTalk.value && !document.hidden) void companion.send({ game: game.value, event, hint: hint.value, lang: props.lang });
}
function sendChat(question) {
  if (thinking.value || chatting.value || !question.trim()) return;
  void companion.send({ game: game.value, event: 'chat', question, hint: hint.value, lang: props.lang });
}
function refreshConnection() { companion.refresh(); }
function onVisibility() { if (document.hidden) companion.cancel(); else refreshConnection(); }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, saveGame(game.value)); storageAvailable.value = true; }
  catch { storageAvailable.value = false; }
}
function cancelTurn() {
  generation++;
  window.clearTimeout(timer);
  thinking.value = false;
  companion.cancel();
}
function announceResult() {
  react('result');
}
function scheduleOpponent(announce = true) {
  if (finished.value || game.value.turn === game.value.human || disposed) return;
  thinking.value = true;
  const run = ++generation;
  timer = window.setTimeout(() => {
    if (run !== generation || disposed) return;
    const index = chooseMove(game.value);
    if (index === null) { thinking.value = false; return; }
    game.value = playMove(game.value, index);
    thinking.value = false;
    persist();
    if (announce) react(finished.value ? 'result' : game.value.moves.length === 1 ? 'start' : 'move');
  }, 420);
}
function place(index) {
  if (!canPlay.value) return;
  const next = playMove(game.value, index);
  if (next === game.value) return;
  companion.cancel();
  resumed.value = false;
  focusIndex.value = index;
  hint.value = null;
  game.value = next;
  persist();
  if (finished.value) announceResult();
  else scheduleOpponent();
}
function undo() {
  if (!canUndo.value) return;
  cancelTurn();
  game.value = undoHumanTurn(game.value);
  hint.value = null;
  persist();
  react('undo');
}
function showHint() {
  if (!canPlay.value) return;
  hint.value = chooseMove(game.value, game.value.human);
  if (hint.value !== null) focusIndex.value = hint.value;
  react('hint');
}
function startGame() {
  cancelTurn();
  game.value = createGame(nextHuman.value, nextDifficulty.value);
  focusIndex.value = 112;
  hint.value = null;
  restartDialog.value?.close();
  companion.reset();
  resumed.value = false;
  persist();
  if (game.value.turn !== game.value.human) scheduleOpponent();
  else react('start');
}
function requestRestart() {
  if (game.value.moves.length && !finished.value) restartDialog.value?.showModal();
  else startGame();
}
function cellLabel(index) {
  const stone = game.value.board[index];
  return [coordinate(index), stone ? (stone === BLACK ? copy.value.black : copy.value.white) : copy.value.empty,
    index === lastMove.value ? copy.value.last : '', index === hint.value ? copy.value.suggested : ''].filter(Boolean).join(' · ');
}
async function moveFocus(event, index) {
  const row = Math.floor(index / BOARD_SIZE), col = index % BOARD_SIZE;
  const destinations = { ArrowLeft: row * BOARD_SIZE + Math.max(0, col - 1), ArrowRight: row * BOARD_SIZE + Math.min(14, col + 1),
    ArrowUp: Math.max(0, row - 1) * BOARD_SIZE + col, ArrowDown: Math.min(14, row + 1) * BOARD_SIZE + col, Home: row * BOARD_SIZE, End: row * BOARD_SIZE + 14 };
  if (!(event.key in destinations)) return;
  event.preventDefault();
  focusIndex.value = destinations[event.key];
  await nextTick();
  boardElement.value?.querySelector(`[data-index="${focusIndex.value}"]`)?.focus({ preventScroll: true });
}
onMounted(() => {
  if (petInteraction) petInteraction.value = petSession;
  try {
    const restored = restoreGame(localStorage.getItem(STORAGE_KEY));
    if (restored) {
      game.value = restored;
      nextHuman.value = restored.human;
      nextDifficulty.value = restored.difficulty;
      resumed.value = restored.moves.length > 0;
      focusIndex.value = restored.moves.at(-1) ?? 112;
    }
  } catch { storageAvailable.value = false; }
  // Loading a saved board alone must not generate a paid model request.
  scheduleOpponent(false);
  window.addEventListener('storage', refreshConnection);
  window.addEventListener('focus', refreshConnection);
  document.addEventListener('visibilitychange', onVisibility);
});
watch(() => [props.user?.id, props.lang], refreshConnection);
watch(autoTalk, enabled => { if (!enabled) companion.cancel(); });
onBeforeUnmount(() => {
  disposed = true; cancelTurn();
  if (petInteraction?.value === petSession) petInteraction.value = null;
  window.removeEventListener('storage', refreshConnection);
  window.removeEventListener('focus', refreshConnection);
  document.removeEventListener('visibilitychange', onVisibility);
});
onBeforeRouteLeave(() => { cancelTurn(); });
</script>

<template>
  <main class="page gomoku-page" data-scroll-reveal="off">
    <div class="gomoku-wrap">
      <a class="game-back" href="/game" @click.prevent="emit('go', '/game')"><TsIcon name="arrowLeft" :size="17" />{{ copy.back }}</a>
      <header class="gomoku-header"><div><p class="game-eyebrow">{{ copy.together }}</p><h1>{{ copy.gomoku }}</h1></div><span class="gomoku-mode">{{ game.difficulty === 'challenge' ? copy.challenge : copy.casual }}</span></header>
      <div class="gomoku-layout">
        <section class="gomoku-table panel" :aria-label="copy.gomoku">
          <div class="gomoku-players">
            <span :class="{ active: canPlay }"><i class="gomoku-player-stone" :class="game.human === BLACK ? 'black' : 'white'"></i>{{ copy.you }}<small>{{ game.human === BLACK ? copy.first : copy.second }}</small></span>
            <small>{{ game.moves.length }} {{ copy.move }}</small>
            <span :class="{ active: thinking }"><i class="gomoku-player-stone" :class="game.human === WHITE ? 'black' : 'white'"></i>{{ copy.yachiyo }}</span>
          </div>
          <div class="gomoku-status" role="status" aria-live="polite"><strong>{{ status }}</strong><span v-if="lastMove !== undefined">{{ copy.last }} {{ coordinate(lastMove) }}</span></div>
          <div class="gomoku-board-frame">
            <div class="gomoku-columns" aria-hidden="true"><span v-for="col in 'ABCDEFGHIJKLMNO'" :key="col">{{ col }}</span></div>
            <div class="gomoku-board" ref="boardElement" role="grid" :aria-label="copy.board" :aria-rowcount="15" :aria-colcount="15" :aria-busy="thinking">
              <div v-for="row in BOARD_SIZE" :key="row" class="gomoku-row" role="row" :aria-rowindex="row">
                <span class="gomoku-row-label" aria-hidden="true">{{ 16 - row }}</span>
                <div v-for="col in BOARD_SIZE" :key="col" role="gridcell" :aria-colindex="col" class="gomoku-cell-wrap">
                  <button type="button" class="gomoku-cell" :data-index="(row - 1) * BOARD_SIZE + col - 1"
                    :aria-label="cellLabel((row - 1) * BOARD_SIZE + col - 1)" :aria-disabled="!canPlay || Boolean(game.board[(row - 1) * BOARD_SIZE + col - 1])"
                    :tabindex="focusIndex === (row - 1) * BOARD_SIZE + col - 1 ? 0 : -1"
                    :class="{ 'is-last': lastMove === (row - 1) * BOARD_SIZE + col - 1, 'is-winning': game.line.includes((row - 1) * BOARD_SIZE + col - 1), 'is-hint': hint === (row - 1) * BOARD_SIZE + col - 1 }"
                    @focus="focusIndex = (row - 1) * BOARD_SIZE + col - 1" @keydown="moveFocus($event, (row - 1) * BOARD_SIZE + col - 1)" @click="place((row - 1) * BOARD_SIZE + col - 1)">
                    <span v-if="[3, 7, 11].includes(row - 1) && [3, 7, 11].includes(col - 1)" class="gomoku-star" aria-hidden="true"></span>
                    <span v-if="game.board[(row - 1) * BOARD_SIZE + col - 1]" class="gomoku-stone" :class="game.board[(row - 1) * BOARD_SIZE + col - 1] === BLACK ? 'black' : 'white'" aria-hidden="true"></span>
                    <span v-if="hint === (row - 1) * BOARD_SIZE + col - 1" class="gomoku-hint-mark" aria-hidden="true"></span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="gomoku-controls"><button class="ghost-btn" type="button" :disabled="!canUndo" @click="undo">{{ copy.undo }}</button><button class="ghost-btn" type="button" :disabled="!canPlay" @click="showHint">{{ copy.hint }}</button><button class="primary-btn" type="button" @click="requestRestart">{{ copy.newGame }}</button></div>
          <p class="gomoku-storage" :role="storageAvailable ? undefined : 'status'">{{ !storageAvailable ? copy.unsaved : resumed ? copy.resumed : copy.saved }}</p>
        </section>
        <div class="gomoku-options">
          <details class="gomoku-settings panel"><summary>{{ copy.settings }}</summary>
            <label for="gomoku-difficulty">{{ copy.difficulty }}</label><select id="gomoku-difficulty" v-model="nextDifficulty"><option value="casual">{{ copy.casual }}</option><option value="challenge">{{ copy.challenge }}</option></select>
            <label for="gomoku-order">{{ copy.order }}</label><select id="gomoku-order" v-model.number="nextHuman"><option :value="BLACK">{{ copy.humanFirst }}</option><option :value="WHITE">{{ copy.aiFirst }}</option></select>
            <button class="ghost-btn" type="button" @click="requestRestart">{{ copy.apply }}</button>
          </details>
          <details class="gomoku-rules panel"><summary>{{ copy.rules }}</summary><p>{{ copy.ruleText }}</p><p>{{ copy.keyboard }}</p></details>
        </div>
      </div>
    </div>
    <dialog ref="restartDialog" class="gomoku-restart" aria-labelledby="gomoku-restart-title"><h2 id="gomoku-restart-title">{{ copy.confirm }}</h2><p>{{ copy.confirmBody }}</p><div><button class="ghost-btn" type="button" autofocus @click="restartDialog.close()">{{ copy.cancel }}</button><button class="primary-btn" type="button" @click="startGame">{{ copy.restart }}</button></div></dialog>
  </main>
</template>
