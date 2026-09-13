const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const code = fs.readFileSync('src/frontend/composables/room/useRoomChat.js', 'utf8')
  .replace(/^import [\s\S]*?from '[^']*';$/gm, '')
  .replace(/^export /gm, '');
const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function setup(overrides = {}) {
  let onUpdate;
  let clearCount = 0;
  const saved = [];
  const requests = [];
  const context = {
    console, Date, URL, AbortController,
    ref: (value) => ({ value }), nextTick: (fn) => Promise.resolve().then(fn),
    isEnglishSite: () => false,
    window: { addEventListener() {}, removeEventListener() {}, confirm: () => true },
    startRoomMemorySync: () => () => {},
    startRoomConversationUpdates: (fn) => { onUpdate = fn; return () => {}; },
    getCachedGrowth: () => null, loadGrowth: async () => null, GROWTH_UPDATED_EVENT: 'growth',
    DIARY_ARCHIVE_UPDATED_EVENT: 'diary', DEFAULT_PERSONA_PROMPT_ID: 'yachiyo-default',
    readDiaryArchive: () => ({}), activePersonaPrompt: () => ({ data: { name: 'Aoi' } }),
    diaryArchiveKey: () => 'guest',
    readRoomConversation: () => [{ role: 'user', content: 'old' }],
    loadRoomConversation: async () => [{ role: 'user', content: 'old' }],
    writeRoomConversation() {}, saveRoomConversationTurn: async () => {}, clearLocalRoomConversation() {},
    clearRoomConversation: async () => { clearCount++; },
    readJson: (key, fallback) => key === 'roomMemorySettings' ? { enabled: false } : fallback,
    releaseAsyncAudioPlayback() {}, dispatchRoomLive2D() {},
    compileBehaviorIntent: () => null, inferLive2DIntentFromText: () => null,
    generateDiaryEntry: async (turns) => {
      requests.push(turns);
      return { body: 'A diary about our chat.', conversationLength: turns.length, personaName: 'Aoi' };
    },
    appendDiaryEntry: (entry) => { saved.push(entry); return { entry }; },
    diaryTimestampLabel: () => 'today',
    ...overrides
  };
  vm.runInNewContext(code + '\nbuildRoomContext = async () => ""; globalThis.chat = useRoomChat({}); globalThis.tts = cleanTtsText;', context);
  await tick();
  return { chat: context.chat, context, saved, requests, sync: () => onUpdate({}), clearCount: () => clearCount };
}
async function send(chat, text) { chat.input.value = text; await chat.send(); await tick(); }

test('opener preserves the draft, saves only the assistant and enters the diary once', async () => {
  const turns = [];
  const h = await setup({
    readRoomConversation: () => [], loadRoomConversation: async () => [],
    saveRoomConversationTurn: async (turn) => turns.push(turn)
  });
  h.chat.input.value = 'unsent draft';
  assert.equal(h.chat.canStartConversation(), true);
  await h.chat.startConversation();
  await h.chat.startConversation();
  assert.equal(h.chat.input.value, 'unsent draft');
  assert.equal(turns.length, 1);
  assert.equal(turns[0].opener, true);
  assert.equal(turns[0].userMessage, '');
  assert.equal(h.chat.messages.value.filter(item => item.role === 'user').length, 0);
  assert.equal(h.chat.sessionTurnCount(), 1);
  await h.chat.confirmEndChat();
  assert.equal(h.requests[0].length, 1);
  assert.equal(h.requests[0][0].role, 'assistant');
  h.chat.destroy();
});

test('a late opener cannot revive a cleared conversation', async () => {
  const d = deferred();
  const turns = [];
  const h = await setup({
    readRoomConversation: () => [], loadRoomConversation: async () => [],
    readJson: (key, fallback) => key === 'roomLLMSettings' ? { useProxy: true } : fallback,
    saveRoomConversationTurn: async (turn) => turns.push(turn)
  });
  h.context.postJson = () => d.promise;
  const pending = h.chat.startConversation();
  await tick();
  await h.chat.startNewSession();
  d.resolve({ reply: 'late opener' });
  await pending;
  assert.equal(turns.length, 0);
  assert.equal(h.chat.messages.value.some(item => item.content === 'late opener'), false);
  h.chat.destroy();
});

test('diary keeps only completed session turns across server refreshes and history truncation', async () => {
  const h = await setup();
  for (let i = 0; i < 15; i++) { await send(h.chat, `new-${i}`); h.sync(); await tick(); }
  assert.equal(h.chat.sessionTurnCount(), 30);
  h.chat.openEndChatDialog();
  await h.chat.confirmEndChat();
  assert.equal(h.requests[0].length, 30);
  assert.equal(h.requests[0][0].content, 'new-0');
  assert.equal(h.clearCount(), 1);
  assert.equal(h.chat.sessionTurnCount(), 0);
  h.chat.destroy();
});

test('generation locks sends and resets; navigating away prevents saving a late result', async () => {
  const d = deferred();
  const h = await setup({ generateDiaryEntry: () => d.promise });
  await send(h.chat, 'hello');
  const pending = h.chat.confirmEndChat();
  await send(h.chat, 'must not send');
  await h.chat.startNewSession();
  assert.equal(h.chat.sessionTurnCount(), 2);
  assert.equal(h.clearCount(), 0);
  h.chat.destroy();
  d.resolve({ body: 'late diary' });
  await pending;
  assert.equal(h.saved.length, 0);
});

test('end without diary clears synced chat but never deletes existing memory', async () => {
  const h = await setup({ authFetch: () => { throw new Error('unexpected memory deletion'); } });
  await send(h.chat, 'hello');
  await h.chat.confirmEndChatWithoutDiary();
  assert.equal(h.clearCount(), 1);
  assert.equal(h.saved.length, 0);
  assert.equal(h.chat.sessionTurnCount(), 0);
  h.chat.destroy();
});

test('a failed clear after saving preserves the diary without offering duplicate generation', async () => {
  const h = await setup({ clearRoomConversation: async () => { throw new Error('offline'); } });
  await send(h.chat, 'hello');
  await h.chat.confirmEndChat();
  assert.equal(h.saved.length, 1);
  assert.equal(h.chat.endChatState.value.status, 'done');
  assert.match(h.chat.endChatState.value.message, /已保存/);
  h.chat.destroy();
});

test('speech strips nested brackets, long stage directions and bracket-only replies', async () => {
  const h = await setup();
  assert.equal(h.context.tts('你好（微笑[挥手]）！'), '你好！');
  assert.equal(h.context.tts(`你好（${'动作'.repeat(100)}）再见`), '你好再见');
  assert.equal(h.context.tts('（挥手）'), '');
  h.chat.destroy();
});


test('switching accounts while generating cannot save a diary to the new account', async () => {
  const d = deferred();
  let key = 'account-a';
  const h = await setup({ diaryArchiveKey: () => key, generateDiaryEntry: () => d.promise });
  await send(h.chat, 'private conversation');
  const pending = h.chat.confirmEndChat();
  key = 'account-b';
  d.resolve({ body: 'private diary' });
  await pending;
  assert.equal(h.saved.length, 0);
  assert.equal(h.clearCount(), 0);
  assert.equal(h.chat.endChatState.value.status, 'idle');
  h.chat.destroy();
});
