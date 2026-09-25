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
  const { createRoomReplyPresenter } = await import('../src/frontend/services/room/roomReplyPresentation.mjs');
  let onUpdate;
  let clearCount = 0;
  const saved = [];
  const requests = [];
  const context = {
    console, Date, URL, AbortController,
    ref: (value) => ({ value }), nextTick: (fn) => Promise.resolve().then(fn),
    selectRecentRoomConversation: (messages) => messages,
    createRoomReplyPresenter: options => createRoomReplyPresenter({ ...options, immediate: true }),
    isEnglishSite: () => false,
    window: { addEventListener() {}, removeEventListener() {}, confirm: () => true, setTimeout, clearTimeout },
    startRoomMemorySync: () => () => {},
    startRoomConversationUpdates: (fn) => { onUpdate = fn; return () => {}; },
    getCachedGrowth: () => null, loadGrowth: async () => null, GROWTH_UPDATED_EVENT: 'growth',
    DIARY_ARCHIVE_UPDATED_EVENT: 'diary', DEFAULT_PERSONA_PROMPT_ID: 'yachiyo-default',
    readDiaryArchive: () => ({}), activePersonaPrompt: () => ({ data: { name: 'Aoi' } }),
    diaryArchiveKey: () => 'guest',
    readRoomConversation: () => [{ role: 'user', content: 'old' }],
    readRoomGenerationDraft: () => null, writeRoomGenerationDraft() {}, clearRoomGenerationDraft() {},
    loadRoomConversation: async () => [{ role: 'user', content: 'old' }],
    writeRoomConversation() {}, saveRoomConversationTurn: async () => {}, replaceRoomConversationTurn: async () => {}, clearLocalRoomConversation() {},
    clearRoomConversation: async () => { clearCount++; },
    writeJson() {},
    readJson: (key, fallback) => key === 'roomMemorySettings' ? { enabled: false } : fallback,
    releaseAsyncAudioPlayback() {}, dispatchRoomLive2D() {}, dispatchRoomLive2DExpression() {},
    compileBehaviorIntent: () => null, inferLive2DIntentFromText: () => null,
    generateDiaryEntry: async (turns) => {
      requests.push(turns);
      return { body: 'A diary about our chat.', conversationLength: turns.length, personaName: 'Aoi' };
    },
    syncDiaryArchive: async () => ({ synced: true }),
    appendDiaryEntry: (entry) => {
      const savedEntry = { ...entry, diaryId: 'test-diary', timestamp: Date.now() };
      saved.push(savedEntry);
      return { entry: savedEntry };
    },
    diaryTimestampLabel: () => 'today',
    ...overrides
  };
  vm.runInNewContext(code + '\nbuildRoomContext = async () => ({ text: "", trace: [], retrieval: {} }); globalThis.chat = useRoomChat({}); globalThis.tts = cleanTtsText; globalThis.streamingVisible = streamingVisibleText;', context);
  await tick();
  return { chat: context.chat, context, saved, requests, sync: () => onUpdate({}), clearCount: () => clearCount };
}
async function send(chat, text) { chat.input.value = text; await chat.send(); await tick(); }

test('streaming display never exposes unfinished model reasoning or a half-written JSON wrapper', async () => {
  const h = await setup();
  assert.equal(h.context.streamingVisible('你好<think>internal reasoning'), '你好');
  assert.equal(h.context.streamingVisible('你好<think>internal</think>，我在'), '你好，我在');
  assert.equal(h.context.streamingVisible('{"reply":"你好'), '');
  h.chat.destroy();
});

test('a TTS-enabled reply shows its expression without starting a body act before playback', async () => {
  const face = [];
  const body = [];
  const intent = { emotion: 'shy', expression: 'shy', behaviorActions: [{ type: 'head_tilt' }] };
  const h = await setup({
    readJson: (key, fallback) => key === 'roomTTSSettings'
      ? { enabled: true }
      : key === 'roomMemorySettings' ? { enabled: false } : fallback,
    compileBehaviorIntent: () => intent,
    dispatchRoomLive2DExpression: value => face.push(value),
    dispatchRoomLive2D: value => body.push(value)
  });
  await send(h.chat, '你好');
  assert.deepEqual(face, [intent]);
  assert.deepEqual(body, []);
  assert.equal(h.chat.messages.value.find(item => item.role === 'assistant')?.live2d, intent);
  h.chat.destroy();
});

test('a TTS-disabled reply retains its full Live2D act', async () => {
  const face = [];
  const body = [];
  const intent = { emotion: 'shy', expression: 'shy', behaviorActions: [{ type: 'head_tilt' }] };
  const h = await setup({
    compileBehaviorIntent: () => intent,
    dispatchRoomLive2DExpression: value => face.push(value),
    dispatchRoomLive2D: value => body.push(value)
  });
  await send(h.chat, '你好');
  assert.deepEqual(face, []);
  assert.deepEqual(body, [intent]);
  h.chat.destroy();
});

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
  let fails = true;
  const h = await setup({ clearRoomConversation: async () => { if (fails) throw new Error('offline'); } });
  await send(h.chat, 'hello');
  await h.chat.confirmEndChat();
  assert.equal(h.saved.length, 1);
  assert.equal(h.chat.endChatState.value.status, 'error');
  assert.match(h.chat.endChatState.value.message, /本机/);
  fails = false;
  await h.chat.confirmEndChat();
  assert.equal(h.saved.length, 1);
  assert.equal(h.chat.endChatState.value.status, 'done');
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

test('a failed Room reply retains the original message and retry saves exactly one turn', async () => {
  let attempts = 0;
  const saved = [];
  let history = [];
  const h = await setup({
    readRoomConversation: () => history,
    loadRoomConversation: async () => history,
    writeRoomConversation: (value) => { history = value; },
    saveRoomConversationTurn: async (value) => { saved.push(value); }
  });
  h.context.requestRoomReply = async ({ onDelta }) => {
    attempts++;
    if (attempts === 1) throw new Error('offline');
    onDelta('恢复成功');
    return { reply: '恢复成功' };
  };
  h.chat.input.value = '请记住这句话';
  assert.equal(await h.chat.send(), false);
  const user = h.chat.messages.value.find(item => item.role === 'user');
  assert.equal(user.content, '请记住这句话');
  assert.equal(user.failed, true);
  assert.equal(h.chat.generationState.value.status, 'error');
  assert.equal(saved.length, 0);
  assert.equal(await h.chat.retryLastTurn(), true);
  assert.equal(h.chat.messages.value.filter(item => item.role === 'user').length, 1);
  assert.equal(h.chat.messages.value.find(item => item.role === 'assistant').content, '恢复成功');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].turnId, user.turnId);
  h.chat.destroy();
});

test('stopping generation aborts the response and never saves a late completion', async () => {
  const delayed = deferred();
  const saved = [];
  const h = await setup({
    readRoomConversation: () => [], loadRoomConversation: async () => [],
    saveRoomConversationTurn: async (turn) => saved.push(turn)
  });
  h.context.requestRoomReply = async ({ onDelta, signal }) => {
    onDelta('半句');
    await delayed.promise;
    assert.equal(signal.aborted, true);
    return { reply: '半句后继续' };
  };
  h.chat.input.value = '停止测试';
  const pending = h.chat.send();
  await tick();
  assert.equal(h.chat.generationState.value.status, 'streaming');
  assert.equal(h.chat.stopGeneration(), true);
  delayed.resolve();
  assert.equal(await pending, false);
  assert.equal(saved.length, 0);
  assert.equal(h.chat.messages.value.some(item => item.role === 'assistant'), false);
  assert.equal(h.chat.messages.value.find(item => item.role === 'user').failed, true);
  h.chat.destroy();
});

test('stopping while short messages are queued never commits an incomplete turn', async () => {
  const { createRoomReplyPresenter } = await import('../src/frontend/services/room/roomReplyPresentation.mjs');
  const scheduled = new Map();
  let id = 0;
  let saved = 0;
  const h = await setup({
    createRoomReplyPresenter: options => createRoomReplyPresenter({
      ...options,
      schedule(fn) { scheduled.set(++id, fn); return id; },
      unschedule(id) { scheduled.delete(id); }
    }),
    saveRoomConversationTurn: async () => { saved++; }
  });
  h.context.requestRoomReply = async () => ({ reply: '第一句。第二句。第三句。' });
  h.chat.input.value = '聊聊';
  const sending = h.chat.send();
  await tick();
  assert.equal(h.chat.messages.value.find(item => item.pending).content, '第一句。');
  assert.equal(scheduled.size, 1);
  h.chat.stopGeneration();
  assert.equal(await sending, false);
  assert.equal(scheduled.size, 0);
  assert.equal(saved, 0);
  assert.equal(h.chat.messages.value.filter(item => item.role === 'assistant').length, 0);
  h.chat.destroy();
});

test('editing the latest complete turn replaces it only after server confirmation', async () => {
  let history = [
    { id: 'u1', turnId: 'turn-0001', role: 'user', content: '旧问题' },
    { id: 'a1', turnId: 'turn-0001', role: 'assistant', content: '旧答案' }
  ];
  const replacements = [];
  const h = await setup({
    readRoomConversation: () => history,
    loadRoomConversation: async () => history,
    replaceRoomConversationTurn: async (replacement) => {
      replacements.push(replacement);
      history = history.map(item => item.role === 'user' ? { ...item, content: replacement.userMessage } : { ...item, content: replacement.assistantMessage });
    }
  });
  h.context.requestRoomReply = async ({ onDelta }) => { onDelta('新答案'); return { reply: '新答案' }; };
  const user = h.chat.messages.value.find(item => item.role === 'user');
  assert.equal(h.chat.canEditAndResend(user), true);
  assert.equal(await h.chat.editAndResend(user.id, '新问题'), true);
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].expectedAssistantMessage, '旧答案');
  assert.equal(h.chat.messages.value.filter(item => item.role === 'assistant').map(item => item.content).join('|'), '新答案');
  assert.equal(h.chat.messages.value.find(item => item.role === 'user').content, '新问题');
  h.chat.destroy();
});

test('refresh restores an unfinished text turn and clears its draft after retry succeeds', async () => {
  let draft = { turnId: 'draft-0001', message: '刷新前未完成', opener: false, image: null, createdAt: Date.now() };
  let history = [];
  const h = await setup({
    readRoomGenerationDraft: () => draft,
    clearRoomGenerationDraft: () => { draft = null; },
    readRoomConversation: () => history,
    loadRoomConversation: async () => history,
    writeRoomConversation: (value) => { history = value; }
  });
  const restored = h.chat.messages.value.find(item => item.role === 'user');
  assert.equal(restored.content, '刷新前未完成');
  assert.equal(restored.failed, true);
  h.context.requestRoomReply = async ({ onDelta }) => { onDelta('已经恢复'); return { reply: '已经恢复' }; };
  assert.equal(await h.chat.retryLastTurn(), true);
  assert.equal(draft, null);
  assert.equal(h.chat.messages.value.filter(item => item.role === 'user').length, 1);
  assert.equal(history.at(-1).content, '已经恢复');
  h.chat.destroy();
});

function conversationSyncHarness(authFetch) {
  const source = fs.readFileSync('src/frontend/services/room/roomConversationSync.js', 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export /gm, '');
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  let account = 'account-a';
  const context = {
    AbortController, console, localStorage, Map, Set,
    getSession: () => ({ user: { id: account } }),
    authFetch,
    authHeaders: value => value,
    noStoreUrl: value => value,
    parseResponse: async response => JSON.parse(await response.text()),
    applyGrowthResult() {},
    window: { addEventListener() {}, removeEventListener() {} }
  };
  vm.runInNewContext(source + '\nglobalThis.sync = { readRoomConversation, writeRoomConversation, saveRoomConversationTurn, loadRoomConversation };', context);
  return { sync: context.sync, storage, setAccount: value => { account = value; } };
}

function savedTurn(turnId, userText, assistantText) {
  return [
    { id: `u-${turnId}`, turnId, role: 'user', content: userText },
    { id: `a-${turnId}`, turnId, role: 'assistant', content: assistantText }
  ];
}

function successfulHistory(messages) {
  return {
    ok: true,
    status: 201,
    text: async () => JSON.stringify({ success: true, data: messages })
  };
}

test('Room turn sync serializes overlapping saves and retains a newer local turn while the first save settles', async () => {
  const firstResponse = deferred();
  const requests = [];
  const first = savedTurn('turn-0001', '第一问', '第一答');
  const second = savedTurn('turn-0002', '第二问', '第二答');
  const h = conversationSyncHarness(async (url, options) => {
    assert.equal(url, '/api/room/chat/turn');
    const turn = JSON.parse(options.body);
    requests.push(turn.turnId);
    return turn.turnId === 'turn-0001' ? firstResponse.promise : successfulHistory([...first, ...second]);
  });

  h.sync.writeRoomConversation(first);
  const savingFirst = h.sync.saveRoomConversationTurn({ turnId: 'turn-0001', userMessage: '第一问', assistantMessage: '第一答' });
  h.sync.writeRoomConversation([...first, ...second]);
  const savingSecond = h.sync.saveRoomConversationTurn({ turnId: 'turn-0002', userMessage: '第二问', assistantMessage: '第二答' });
  await tick();
  assert.deepEqual(requests, ['turn-0001']);

  firstResponse.resolve(successfulHistory(first));
  await savingFirst;
  assert.equal(h.sync.readRoomConversation().at(-1).content, '第二答');
  await savingSecond;
  assert.deepEqual(requests, ['turn-0001', 'turn-0002']);
  assert.equal(h.sync.readRoomConversation().map(item => item.turnId).join(','),
    'turn-0001,turn-0001,turn-0002,turn-0002');
});

test('a late Room save cannot write old-account messages into a newly signed-in account', async () => {
  const firstResponse = deferred();
  const requests = [];
  const first = savedTurn('turn-0003', '旧账号问题', '旧账号回答');
  const queued = savedTurn('turn-0004', '旧账号后续', '旧账号后续回答');
  const h = conversationSyncHarness(async (url, options) => {
    requests.push(JSON.parse(options.body).turnId);
    return firstResponse.promise;
  });

  h.sync.writeRoomConversation(first);
  const savingFirst = h.sync.saveRoomConversationTurn({ turnId: 'turn-0003', userMessage: '旧账号问题', assistantMessage: '旧账号回答' });
  h.sync.writeRoomConversation([...first, ...queued]);
  const savingQueued = h.sync.saveRoomConversationTurn({ turnId: 'turn-0004', userMessage: '旧账号后续', assistantMessage: '旧账号后续回答' });
  await tick();
  h.setAccount('account-b');
  h.sync.writeRoomConversation(savedTurn('turn-0005', '新账号问题', '新账号回答'));
  firstResponse.resolve(successfulHistory(first));
  await assert.rejects(savingFirst, /登录账号已切换/);
  await assert.rejects(savingQueued, /登录账号已切换/);
  assert.deepEqual(requests, ['turn-0003']);
  assert.equal(h.sync.readRoomConversation().at(-1).content, '新账号回答');
  assert.equal(JSON.parse(h.storage.get('roomChatHistory:account-a')).at(-1).content, '旧账号后续回答');
});

test('a stale Room history GET does not erase a turn saved while that GET was in flight', async () => {
  const delayedGet = deferred();
  const first = savedTurn('turn-0006', '原有问题', '原有回答');
  const next = savedTurn('turn-0007', '新问题', '新回答');
  const h = conversationSyncHarness(async (url) => (
    url.startsWith('/api/room/chat?') ? delayedGet.promise : successfulHistory([...first, ...next])
  ));
  h.sync.writeRoomConversation(first);
  const loading = h.sync.loadRoomConversation();
  await tick();
  h.sync.writeRoomConversation([...first, ...next]);
  await h.sync.saveRoomConversationTurn({ turnId: 'turn-0007', userMessage: '新问题', assistantMessage: '新回答' });
  delayedGet.resolve(successfulHistory(first));
  const loaded = await loading;
  assert.equal(loaded.at(-1).content, '新回答');
  assert.equal(h.sync.readRoomConversation().at(-1).turnId, 'turn-0007');
});


test('diary recording survives a reload beyond the 24-message chat cache and stays account-scoped', async () => {
  const storage = new Map();
  let account = 'morning-user';
  const persisted = {
    diaryArchiveKey: () => `roomDiaryArchive:${account}`,
    writeJson: (key, value) => storage.set(key, JSON.stringify(value)),
    readJson: (key, fallback) => storage.has(key) ? JSON.parse(storage.get(key)) : fallback
  };
  const morning = await setup(persisted);
  for (let i = 0; i < 16; i++) await send(morning.chat, `morning-${i}`);
  assert.equal(morning.chat.sessionTurnCount(), 32);
  morning.chat.destroy();
  const evening = await setup(persisted);
  assert.equal(evening.chat.sessionTurnCount(), 32);
  await send(evening.chat, 'evening');
  evening.chat.destroy();
  account = 'another-user';
  const other = await setup(persisted);
  assert.equal(other.chat.sessionTurnCount(), 0);
  other.chat.destroy();
  account = 'morning-user';
  const restored = await setup(persisted);
  await restored.chat.confirmEndChat();
  assert.equal(restored.requests[0].length, 34);
  assert.equal(restored.requests[0][0].content, 'morning-0');
  assert.equal(restored.requests[0].at(-2).content, 'evening');
  restored.chat.destroy();
  const ended = await setup(persisted);
  assert.equal(ended.chat.sessionTurnCount(), 0);
  ended.chat.destroy();
});

test('a diary recording storage failure is visible and does not mark a complete reply failed', async () => {
  const h = await setup({ writeJson: () => { throw new Error('quota exceeded'); } });
  await send(h.chat, 'Please remember this');
  assert.equal(h.chat.sessionTurnCount(), 2);
  assert.match(h.chat.diaryRecordingError.value, /尚未保存/);
  assert.equal(h.chat.generationState.value.status, 'idle');
  h.chat.destroy();
});

test('refreshing after diary sync failure reuses the saved entry without generating it twice', async () => {
  const storage = new Map();
  const persisted = {
    writeJson: (key, value) => storage.set(key, JSON.stringify(value)),
    readJson: (key, fallback) => storage.has(key) ? JSON.parse(storage.get(key)) : fallback
  };
  const first = await setup({ ...persisted, syncDiaryArchive: async options => {
    if (options?.ensureDiaryId) throw new Error('offline');
    return { synced: true };
  } });
  await send(first.chat, 'A whole day together');
  await first.chat.confirmEndChat();
  assert.equal(first.saved.length, 1);
  assert.equal(first.chat.sessionTurnCount(), 2);
  first.chat.destroy();
  const reopened = await setup(persisted);
  await reopened.chat.confirmEndChat();
  assert.equal(reopened.requests.length, 0);
  assert.equal(reopened.saved.length, 0);
  assert.equal(reopened.clearCount(), 1);
  assert.equal(reopened.chat.sessionTurnCount(), 0);
  reopened.chat.destroy();
});
