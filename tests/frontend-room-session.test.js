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
  const { realContext = false, ...provided } = overrides;
  const { createRoomReplyPresenter } = await import('../src/frontend/services/room/roomReplyPresentation.mjs');
  const { packRoomContext, selectRecentRoomConversation, revalidateRoomMemorySnapshot } = await import('../src/frontend/services/room/roomContext.mjs');
  let onUpdate;
  let clearCount = 0;
  const saved = [];
  const requests = [];
  const context = {
    agentProtocol: require('../shared/agent-protocol.cjs'), llmProtocol: require('../shared/llm-protocol.cjs'),
    memoryRetrieval: require('../shared/room-memory-retrieval.cjs'), revalidateRoomMemorySnapshot, packRoomContext,
    console, Date, URL, AbortController,
    ref: (value) => ({ value }), nextTick: (fn) => Promise.resolve().then(fn),
    selectRecentRoomConversation: (messages) => messages,
    usesLocalRoomMemory: () => true,
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
    persistRoomImage: async image => ({ id: 'c6b5f9c0-e4b6-45ef-8bfb-6c71006bbc0a', name: image.name, url: '/api/room/chat/images/c6b5f9c0-e4b6-45ef-8bfb-6c71006bbc0a' }),
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
    ...provided,
    ...(realContext ? { selectRecentRoomConversation } : {})
  };
  vm.runInNewContext(code + (realContext ? '' : '\nbuildRoomContext = async () => ({ text: "", trace: [], retrieval: {} });')
    + '\nglobalThis.chat = useRoomChat({}); globalThis.tts = cleanTtsText; globalThis.streamingVisible = streamingVisibleText;', context);
  await tick();
  return { chat: context.chat, context, saved, requests, sync: () => onUpdate({}), clearCount: () => clearCount };
}
async function send(chat, text) { chat.input.value = text; await chat.send(); await tick(); }

test('image messages retain previews after completion, history sync and reload; upload failure remains retryable', async () => {
  let history = [];
  let turn;
  const h = await setup({
    readRoomConversation: () => history, loadRoomConversation: async () => history,
    writeRoomConversation: value => { history = value; },
    saveRoomConversationTurn: async value => { turn = value; }
  });
  h.chat.imageAttachment.value = { name: 'IMG_5320.jpeg', dataUrl: 'data:image/png;base64,test' };
  assert.equal(await h.chat.send(), true);
  assert.equal(history[0].image.id, turn.imageId);
  assert.doesNotMatch(history[0].content, /\[image:/);
  assert.equal(history[0].image.dataUrl, undefined, 'persistent history carries only a reference');
  h.sync(); await tick();
  assert.ok(h.chat.messages.value.find(item => item.role === 'user').image);
  h.chat.destroy();
  const restored = await setup({ loadRoomConversation: async () => history });
  assert.equal(restored.chat.messages.value.find(item => item.role === 'user').image.id, turn.imageId);
  restored.chat.destroy();
  const failed = await setup({ persistRoomImage: async () => { throw new Error('图片云同步失败'); } });
  failed.chat.imageAttachment.value = { name: 'IMG.jpeg', dataUrl: 'data:image/png;base64,test' };
  assert.equal(await failed.chat.send(), false);
  assert.match(failed.chat.generationState.value.error, /图片云同步失败/);
  assert.equal(failed.chat.messages.value.find(item => item.role === 'user' && item.failed).image.name, 'IMG.jpeg');
  failed.chat.destroy();
});

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

test('real context isolates saved target turns, freezes regeneration references and revalidates edits/deletion', async () => {
  let history = [
    { role: 'user', content: 'older question', turnId: 'recent-turn' },
    { role: 'assistant', content: 'older answer', turnId: 'recent-turn' }
  ];
  let rows = [{ id: 'distant', context: 'stable remembered fact', retrievalRevision: 'v1',
    metadata: { sourceKind: 'chat-turn-auto', sourceTurnId: 'distant-turn' } }];
  let personaCalls = 0, siteCalls = 0, clock = 1, calls = 0;
  const prompts = [], scopes = [];
  const settings = { apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen3.8-flash' };
  const h = await setup({ realContext: true, growthContext: () => '', selectRoomKnowledgeEntries: () => [],
    shouldRetrieveRoomPersona: () => true, roomKnowledgeQuery: message => message,
    readJson: (key, fallback) => key === 'roomLLMSettings' ? settings : fallback,
    readRoomConversation: () => history, loadRoomConversation: async () => history,
    writeRoomConversation: value => { history = value; },
    saveRoomConversationTurn: async value => {
      rows.push({ id: 'target-auto', context: 'previous wrong answer must not return',
        metadata: { sourceKind: 'chat-turn-auto', sourceTurnId: value.turnId }, retrievalRevision: 'target-v1' });
    },
    replaceRoomConversationTurn: async value => {
      history = history.map(item => item.turnId === value.turnId ? { ...item,
        content: item.role === 'user' ? value.userMessage : value.assistantMessage } : item);
    }
  });
  h.context.currentTimeContext = () => 'time ' + clock;
  h.context.fetchSiteFeedContext = async () => { siteCalls++; return 'site version ' + clock; };
  h.context.fetchPersonaMemories = async () => { personaCalls++; return [{ id: 'canon', summary: 'canon version ' + clock }]; };
  h.context.fetchRelationship = async () => null;
  h.context.fetchRelevantMemories = async (message, signal, scope) => {
    scopes.push(scope);
    const selected = rows.filter(row => !scope.excludeTurnIds.includes(row.metadata?.sourceTurnId)
      && (scope.snapshotIds === undefined || scope.snapshotIds.includes(row.id)));
    return { data: selected, retrieval: { backend: 'sqlite' } };
  };
  h.context.requestRoomReply = async ({ onDelta, systemPrompt, conversation, message }) => {
    prompts.push(systemPrompt); calls++;
    assert.equal(message, 'current question');
    assert.ok(conversation.every(item => item.turnId === 'recent-turn'));
    onDelta('current answer ' + calls);
    return { reply: 'current answer ' + calls };
  };
  await send(h.chat, 'current question');
  const target = h.chat.messages.value.filter(item => item.role === 'assistant').at(-1);
  clock = 2;
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(await h.chat.regenerateReply(target.id), true);
  assert.ok(prompts.every(prompt => prompt === prompts[0]), 'repeated regeneration retains the original time and reference selection');
  assert.equal(siteCalls, 1);
  assert.equal(personaCalls, 1);
  assert.ok(scopes.every(scope => scope.excludeTurnIds.includes(target.turnId) && scope.excludeTurnIds.includes('recent-turn')));
  assert.ok(prompts.every(prompt => !prompt.includes('previous wrong answer')));
  assert.equal(history.filter(item => item.turnId === target.turnId).length, 2);
  rows[0] = { ...rows[0], context: 'edited remembered fact', retrievalRevision: 'v2' };
  assert.equal(await h.chat.regenerateReply(target.id), true);
  assert.match(prompts.at(-1), /edited remembered fact/);
  assert.doesNotMatch(prompts.at(-1), /stable remembered fact/);
  rows = rows.filter(row => row.id !== 'distant');
  assert.equal(await h.chat.regenerateReply(target.id), true);
  assert.doesNotMatch(prompts.at(-1), /edited remembered fact|stable remembered fact|previous wrong answer/);
  settings.model = 'qwen3.8-max';
  assert.equal(await h.chat.regenerateReply(target.id), true);
  assert.equal(personaCalls, 2, 'changing model/settings starts a fresh scoped snapshot');
  assert.match(prompts.at(-1), /time 2/);
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

function conversationSyncHarness(authFetch, overrides = {}) {
  const source = fs.readFileSync('src/frontend/services/room/roomConversationSync.js', 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export /gm, '');
  const storage = overrides.storage || new Map();
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  let account = 'account-a';
  const localSaves = [];
  const context = {
    AbortController, console, localStorage, Map, Set, Date,
    getSession: () => ({ user: { id: account } }),
    usesLocalRoomMemory: () => !account || storage.get(`roomMemorySource:${account}`) === 'local',
    accountLocalMemoryKey: userId => `user-local:${userId}`,
    guestMemoryKey: () => 'guest:test-guest',
    saveGuestMemory: async (turn, scope) => {
      assert.equal(scope.accountId, account);
      assert.equal(scope.userKey, account ? `user-local:${account}` : 'guest:test-guest');
      localSaves.push(JSON.parse(JSON.stringify({ turn, scope })));
    },
    authFetch,
    authHeaders: value => value,
    noStoreUrl: value => value,
    parseResponse: async response => JSON.parse(await response.text()),
    applyGrowthResult() {},
    window: { addEventListener() {}, removeEventListener() {} },
    ...overrides
  };
  const imagesSource = fs.readFileSync('src/frontend/services/room/roomChatImages.js', 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInNewContext(imagesSource + '\nglobalThis.normalizeImage = normalizeRoomImage;', context);
  context.normalizeRoomImage = context.normalizeImage;
  vm.runInNewContext(source + '\nglobalThis.sync = { readRoomConversation, writeRoomConversation, saveRoomConversationTurn, replaceRoomConversationTurn, loadRoomConversation };', context);
  return { sync: context.sync, storage, localSaves, setAccount: value => { account = value; },
    setMemoryMode: mode => storage.set(`roomMemorySource:${account}`, mode) };
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

test('Room history normalization and save echoes keep image references, never inline image binaries', async () => {
  const image = { id: 'c6b5f9c0-e4b6-45ef-8bfb-6c71006bbc0a', name: 'IMG_5320.jpeg', dataUrl: 'data:image/png;base64,large' };
  const history = savedTurn('turn-image-sync', '看图片', '我看到了');
  history[0].image = image;
  const h = conversationSyncHarness(async (url, options) => {
    if (options?.body) assert.equal(JSON.parse(options.body).imageId, image.id);
    return successfulHistory(history);
  });
  h.sync.writeRoomConversation(history);
  assert.equal(h.sync.readRoomConversation()[0].image.id, image.id);
  assert.equal(h.sync.readRoomConversation()[0].image.dataUrl, undefined);
  await h.sync.saveRoomConversationTurn({ turnId: 'turn-image-sync', userMessage: '看图片', assistantMessage: '我看到了', imageId: image.id });
  assert.equal((await h.sync.loadRoomConversation())[0].image.url, `/api/room/chat/images/${image.id}`);
});

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

test('local account memory is saved in its browser scope while cloud chat capture stays disabled', async () => {
  const history = savedTurn('turn-local', '本地问题', '本地回答');
  let request;
  const h = conversationSyncHarness(async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return successfulHistory(history);
  });
  h.setMemoryMode('local');
  h.sync.writeRoomConversation(history);
  await h.sync.saveRoomConversationTurn({ turnId: 'turn-local', userMessage: '本地问题', assistantMessage: '本地回答' });
  assert.equal(request.url, '/api/room/chat/turn');
  assert.equal(request.body.memorySource, 'local');
  assert.equal(request.body.memoryEnabled, false);
  assert.equal(request.body.localMemoryKey, undefined, 'browser ownership keys are not uploaded');
  assert.equal(h.localSaves.length, 1);
  assert.equal(h.localSaves[0].turn.memoryEnabled, true);
  assert.equal(h.localSaves[0].scope.userKey, 'user-local:account-a');
  assert.equal(h.sync.readRoomConversation().at(-1).content, '本地回答');
  assert.equal(h.storage.get('roomChatPending:account-a'), undefined);
});

test('a local turn remains local after failed cloud chat sync, a source change and reload before retry', async () => {
  const history = savedTurn('turn-local-retry', '保留本地', '记住了');
  const requests = [];
  let offline = true;
  const request = async (url, options) => {
    if (options?.body) requests.push(JSON.parse(options.body));
    if (offline) throw new Error('offline');
    return successfulHistory(history);
  };
  const h = conversationSyncHarness(request);
  h.setMemoryMode('local');
  h.sync.writeRoomConversation(history);
  await assert.rejects(h.sync.saveRoomConversationTurn({ turnId: 'turn-local-retry', userMessage: '保留本地', assistantMessage: '记住了' }), /offline/);
  const pending = JSON.parse(h.storage.get('roomChatPending:account-a'));
  assert.equal(pending[0].memorySource, 'local');
  assert.equal(pending[0].localMemoryKey, 'user-local:account-a');
  h.setMemoryMode('cloud');
  offline = false;
  const reloaded = conversationSyncHarness(request, { storage: h.storage });
  await reloaded.sync.loadRoomConversation();
  assert.equal(requests.length, 2);
  assert.ok(requests.every(turn => turn.memorySource === 'local' && turn.memoryEnabled === false));
  assert.equal(reloaded.localSaves.length, 1);
  assert.equal(reloaded.localSaves[0].scope.userKey, 'user-local:account-a');
  assert.equal(h.storage.get('roomChatPending:account-a'), undefined);
});

test('retrying a cloud outbox after selecting local disables cloud capture and persists that choice', async () => {
  const old = savedTurn('turn-old-cloud', '离线问题', '离线回答');
  const next = savedTurn('turn-new-local', '新问题', '新回答');
  const requests = [];
  let offline = true;
  const h = conversationSyncHarness(async (url, options) => {
    const turn = JSON.parse(options.body);
    requests.push(turn);
    if (offline) throw new Error('offline');
    return successfulHistory(turn.turnId === 'turn-old-cloud' ? old : [...old, ...next]);
  });
  h.sync.writeRoomConversation(old);
  await assert.rejects(h.sync.saveRoomConversationTurn({ turnId: 'turn-old-cloud', userMessage: '离线问题', assistantMessage: '离线回答' }), /offline/);
  h.setMemoryMode('local');
  h.sync.writeRoomConversation([...old, ...next]);
  await assert.rejects(h.sync.saveRoomConversationTurn({ turnId: 'turn-new-local', userMessage: '新问题', assistantMessage: '新回答' }), /offline/);
  const pending = JSON.parse(h.storage.get('roomChatPending:account-a'));
  assert.deepEqual(pending.map(turn => turn.turnId), ['turn-old-cloud', 'turn-new-local']);
  assert.ok(pending.every(turn => turn.memorySource === 'local'));
  h.setMemoryMode('cloud');
  offline = false;
  await h.sync.saveRoomConversationTurn({ turnId: 'turn-last-cloud', userMessage: '最后一问', assistantMessage: '最后一答' });
  assert.deepEqual(requests.slice(2).map(turn => turn.turnId), ['turn-old-cloud', 'turn-new-local', 'turn-last-cloud']);
  assert.ok(requests.slice(1, 4).every(turn => turn.memoryEnabled === false && turn.memorySource === 'local'));
  assert.equal(requests.at(-1).memoryEnabled, true);
  assert.equal(requests.at(-1).memorySource, undefined);
});

test('explicitly retrying the same pending local turn preserves its source and queue position', async () => {
  const requests = [];
  let offline = true;
  const h = conversationSyncHarness(async (url, options) => {
    requests.push(JSON.parse(options.body));
    if (offline) throw new Error('offline');
    return successfulHistory([]);
  });
  h.setMemoryMode('local');
  const turn = { turnId: 'turn-explicit-retry', userMessage: '本地旧问题', assistantMessage: '本地旧回答' };
  await assert.rejects(h.sync.saveRoomConversationTurn(turn), /offline/);
  await assert.rejects(h.sync.saveRoomConversationTurn({ turnId: 'turn-later', userMessage: '后续问题', assistantMessage: '后续回答' }), /offline/);
  h.setMemoryMode('cloud');
  offline = false;
  await h.sync.saveRoomConversationTurn(turn);
  assert.deepEqual(requests.slice(-2).map(item => item.turnId), ['turn-explicit-retry', 'turn-later']);
  assert.ok(requests.every(item => item.memorySource === 'local' && item.memoryEnabled === false));
});

test('logout during local capture keeps the outbox and prevents a cloud chat request', async () => {
  const capture = deferred();
  let requests = 0;
  const h = conversationSyncHarness(async () => {
    requests++;
    return successfulHistory([]);
  }, { saveGuestMemory: () => capture.promise });
  h.setMemoryMode('local');
  const saving = h.sync.saveRoomConversationTurn({ turnId: 'turn-local-logout', userMessage: '私有问题', assistantMessage: '私有回答' });
  await tick();
  h.setAccount('');
  capture.resolve();
  await assert.rejects(saving, /登录账号已切换/);
  assert.equal(requests, 0);
  assert.equal(JSON.parse(h.storage.get('roomChatPending:account-a'))[0].localMemoryKey, 'user-local:account-a');
  assert.equal(h.storage.get('roomChatPending:guest'), undefined);
});

test('local account regeneration replaces only scoped local memory and disables server retirement', async () => {
  const previous = savedTurn('turn-local-edit', '旧问题', '旧回答');
  const updated = savedTurn('turn-local-edit', '新问题', '新回答');
  let payload;
  const h = conversationSyncHarness(async (url, options) => {
    assert.equal(url, '/api/room/chat/turn/turn-local-edit');
    payload = JSON.parse(options.body);
    return successfulHistory(updated);
  });
  h.setMemoryMode('local');
  h.sync.writeRoomConversation(previous);
  await h.sync.replaceRoomConversationTurn({ turnId: 'turn-local-edit', expectedUserMessage: '旧问题', expectedAssistantMessage: '旧回答',
    userMessage: '新问题', assistantMessage: '新回答' });
  assert.equal(payload.memorySource, 'local');
  assert.equal(payload.memoryEnabled, false);
  assert.equal(h.localSaves.length, 1);
  assert.equal(h.localSaves[0].turn.replace, true);
  assert.equal(h.localSaves[0].scope.userKey, 'user-local:account-a');
  assert.equal(h.sync.readRoomConversation().at(-1).content, '新回答');
});

test('guest captures stay guest-scoped and never send cloud chat requests', async () => {
  const h = conversationSyncHarness(async () => { throw new Error('unexpected cloud request'); });
  h.setAccount('');
  h.sync.writeRoomConversation(savedTurn('turn-guest-local', '访客问题', '访客回答'));
  await h.sync.saveRoomConversationTurn({ turnId: 'turn-guest-local', userMessage: '访客问题', assistantMessage: '访客回答' });
  assert.equal(h.localSaves.length, 1);
  assert.equal(h.localSaves[0].scope.accountId, '');
  assert.equal(h.localSaves[0].scope.userKey, 'guest:test-guest');
  assert.equal(h.storage.get('roomChatPending:guest'), undefined);
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
