const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const strip = s => s.replace(/^import [\s\S]*?from '[^']*';$/gm, '').replace(/^export /gm, '');
const source = path => fs.readFileSync(path, 'utf8');
const knowledgeCode = strip(source('src/frontend/constants/room/knowledgeEntries.js')) + '\n' + strip(source('src/frontend/services/room/roomKnowledge.js'));
const pageCode = strip(source('src/frontend/pages/RoomSettingsPage.vue').split('<script setup>')[1].split('</script>')[0]);
function setup() {
  const store = new Map();
  let failWrites = false;
  let owner = 'guest';
  let imported = false;
  let routeGuard;
  const navigation = [];
  const ctx = {
    URL, console, setTimeout: () => 0, clearTimeout() {},
    reactive: x => x, ref: value => ({ value }), computed: get => ({ get value() { return get(); } }),
    defineProps: () => ({}), defineEmits: () => (...args) => navigation.push(args),
    onMounted() {}, onBeforeUnmount() {}, watch() {}, onBeforeRouteLeave: fn => { routeGuard = fn; },
    nextTick: fn => fn?.(), getSession: () => null,
    roomLive2DManifest: { expressions: [], motions: [] },
    localStorage: { getItem: k => store.get(k) || null, setItem(k, value) { if (failWrites) throw new Error('QuotaExceededError'); store.set(k, value); } },
    window: { confirm: () => false, location: { origin: 'https://example.test' } },
    readDiaryArchive: () => ({ data: { diary: [], gameData: { characterStats: {} } } }),
    activePersonaPrompt: () => ({ data: { name: '日记作者' } }),
    diaryArchiveKey: () => owner,
    importDiaryArchive: () => { imported = true; return { data: { diary: [] } }; }
  };
  vm.runInNewContext(knowledgeCode + '\n' + pageCode + `
    loadMemoryCount = () => {};
    globalThis.api = { loadSettings, llm, tts, model, mcp, knowledge, diary, memory, activeSection, savingSettings, settingsSearch, filteredSettingsGroups, connectionCheck, testedConnectionStatus, toast, pendingSections, hasUnsavedSettings,
      saveLLM, saveTTS, saveMCP, saveModel, saveKnowledge, saveKnowledgeEntry, discardSettings, testLLM, selectSettingsSection, saveAllSettings, enterRoom,
      onDiaryImportFile, normalizeRoomKnowledge, knowledgeContext, applyKnowledgeDraft, defaultKnowledgeEntries };
  `, ctx);
  ctx.api.loadSettings();
  return { ...ctx.api, store, navigation, read: k => JSON.parse(store.get(k)), set: (k,v) => store.set(k,JSON.stringify(v)), fail: () => { failWrites = true; }, switchAccount: () => { owner = 'user:2'; }, imported: () => imported, leave: () => routeGuard() };
}

test('editing built-in knowledge reaches context, and removed/disabled entries stay removed', () => {
  const h = setup();
  const old = h.knowledge.entries[0];
  h.knowledge.editingId = old.id;
  h.knowledge.draft = { ...old, content: '校验标记：八千代今天喜欢喝桂花乌龙茶。' };
  assert.equal(h.saveKnowledge(), true);
  const saved = h.read('roomKnowledgeSettings');
  const context = h.knowledgeContext('你今天喜欢喝什么茶呢', saved);
  assert.match(context, /校验标记/);
  assert.ok(!context.includes(old.content));
  assert.equal(h.knowledge.editingId, null);
  saved.entries = [{ ...saved.entries[0], enabled: false }];
  assert.equal(h.knowledgeContext('茶', saved), '');
  assert.equal(h.knowledgeContext('八千代', { entries: [] }), '');
  assert.equal(h.normalizeRoomKnowledge({ entries: [] }).entries.length, 0);
  assert.ok(h.normalizeRoomKnowledge(null).entries.length > 0);
});

test('Chinese partial matches retrieve custom entries beyond the default ten', () => {
  const h = setup();
  const content = '海盐蛋糕是每周五的甜点。' + '有详细的制作说明。'.repeat(32) + '最后加入樱花糖。';
  const entries = [...h.defaultKnowledgeEntries(), { id: 'cake', title: '甜点偏好', content, tags: '海盐蛋糕' }];
  const context = h.knowledgeContext('你会做海盐蛋糕吗', { entries });
  assert.match(context, /最后加入樱花糖/);
  assert.equal(h.knowledgeContext('海盐蛋糕', { enabled: false, entries }), '');
});

test('an unrelated greeting does not fill the context with every character subplot', () => {
  const h = setup();
  const context = h.knowledgeContext('hello', null);
  assert.match(context, /基础身份/);
  assert.doesNotMatch(context, /原作后段的身世与重逢|歌曲与 Remember/);
  assert.match(h.knowledgeContext('时间旅行的真相是什么', null), /原作后段的身世与重逢/);
});

test('save all persists an active knowledge draft, switch and memory together', async () => {
  const h = setup();
  h.knowledge.draft = { title: '测试知识', content: '测试内容', enabled: true };
  h.knowledge.enabled = false;
  h.memory.enabled = false;
  assert.equal(h.hasUnsavedSettings.value, true);
  assert.equal(await h.saveAllSettings(), true);
  assert.equal(h.read('roomKnowledgeSettings').entries[0].title, '测试知识');
  assert.equal(h.read('roomKnowledgeSettings').enabled, false);
  assert.equal(h.read('roomMemorySettings').enabled, false);
  assert.equal(h.hasUnsavedSettings.value, false);
});

test('independent memory settings save both switches and empty knowledge survives reload', async () => {
  const h = setup();
  h.knowledge.enabled = false;
  h.knowledge.entries = [];
  h.memory.enabled = false;
  assert.equal(await h.saveAllSettings(), true);
  h.loadSettings();
  assert.equal(h.knowledge.enabled, false);
  assert.equal(h.knowledge.entries.length, 0);
  assert.equal(h.memory.enabled, false);
});

test('invalid or failed saves retain drafts and prevent return navigation', async () => {
  const h = setup();
  h.knowledge.draft = { title: '不能丢失', content: '' };
  await h.enterRoom();
  assert.equal(h.navigation.length, 0);
  assert.equal(h.knowledge.draft.title, '不能丢失');
  assert.match(h.toast.text, /标题和内容/);
  h.knowledge.draft.content = '完整内容';
  h.fail();
  await h.enterRoom();
  assert.equal(h.navigation.length, 0);
  assert.equal(h.knowledge.draft.content, '完整内容');
  assert.match(h.toast.text, /保存失败/);
  assert.equal(h.hasUnsavedSettings.value, true);
  assert.equal(h.leave(), false);
});

test('LLM and model saves preserve existing instructions and extra runtime settings', async () => {
  const h = setup();
  h.set('roomLLMSettings', { apiUrl: 'https://example.test/v1/chat/completions', model: 'model-a', systemPrompt: '仅聊天指令', custom: 1 });
  h.set('roomModelSettings', { scale: 1.2, stageFloatEnabled: false, stageMotionScale: 0.8 });
  h.loadSettings();
  h.llm.model = 'model-b';
  h.model.xOffset = 20;
  assert.equal(await h.saveAllSettings(), true);
  assert.equal(h.read('roomLLMSettings').systemPrompt, '仅聊天指令');
  assert.equal(h.read('roomLLMSettings').custom, 1);
  assert.equal(h.read('roomModelSettings').stageFloatEnabled, false);
  assert.equal(h.read('roomModelSettings').xOffset, 20);
  assert.equal(h.read('roomModelSettings').scale, 1.2);
});

test('invalid endpoints cannot be presented as saved enabled services', () => {
  const h = setup();
  h.llm.apiUrl = 'bad endpoint'; h.llm.model = 'x';
  assert.equal(h.saveLLM(false), false);
  h.tts.enabled = true; h.tts.apiUrl = 'bad endpoint';
  assert.equal(h.saveTTS(false), false);
  h.mcp.enabled = true;
  assert.equal(h.saveMCP(false), false);
  h.mcp.endpoint = '/api/mcp/token-plan';
  assert.equal(h.saveMCP(false), true);
});

test('a delayed archive import cannot write into a different account', async () => {
  const h = setup();
  let finish;
  const read = new Promise(resolve => { finish = resolve; });
  const pending = h.onDiaryImportFile({ target: { files: [{ text: () => read }], value: 'file.json' } });
  h.switchAccount(); finish('{}'); await pending;
  assert.equal(h.imported(), false);
  assert.match(h.toast.text, /账号已切换/);
});

test('chat context reads the saved knowledge switch on every turn, never diary archives', async () => {
  let enabled = true;
  let corpusCalls = 0;
  const ctx = { URL, console,
    isEnglishSite: () => false,
    readJson: (key, fallback) => key === 'roomKnowledgeSettings' ? { enabled, entries: [{ title: '当前知识', content: '已保存的修改' }] } : fallback,
    readDiaryArchive: () => { throw new Error('Live chat must not read diary content'); },
    loadGrowth: async () => null, growthContext: () => '', corpus: async () => { corpusCalls++; return []; }
  };
  vm.runInNewContext(knowledgeCode + '\n' + strip(source('src/frontend/services/room/roomContext.mjs')) + '\n' + strip(source('src/frontend/composables/room/useRoomChat.js')) + `
    fetchSiteFeedContext = async () => '';
    fetchPersonaMemories = corpus;
    fetchRelevantMemories = async () => ({ data: [], retrieval: {} });
    globalThis.build = buildRoomContext;
  `, ctx);
  assert.match((await ctx.build('知识', null, {}, '环境')).text, /已保存的修改/);
  enabled = false;
  assert.doesNotMatch((await ctx.build('知识', null, {}, '环境')).text, /已保存的修改/);
  assert.equal(corpusCalls, 1);
});

test('fresh Live2D views apply saved scale and offsets once, including after re-entry', async () => {
  const calls = [];
  const ctx = {
    navigator: { userAgent: 'iPhone', maxTouchPoints: 1 },
    readJson: () => ({ scale: 1.25, xOffset: 45, yOffset: -30 }),
    window: { initTsukuyomiLive2DRoom() {}, destroyTsukuyomiLive2DRoom() {},
      setLive2DModelSettings: (...args) => calls.push(args) }
  };
  vm.runInNewContext(strip(source('src/frontend/services/room/live2dBridge.js')) + `
    ensureLive2DScripts = async () => {};
    waitForLive2DReady = async () => {};
    globalThis.api = { initLive2DRoom, destroyLive2DRoom };
  `, ctx);
  await Promise.all([ctx.api.initLive2DRoom(), ctx.api.initLive2DRoom()]);
  assert.deepEqual(calls, [[1.25, 45, -30]]);
  ctx.api.destroyLive2DRoom();
  ctx.readJson = () => ({ scale: 'invalid', xOffset: 900, yOffset: -999 });
  await ctx.api.initLive2DRoom();
  assert.deepEqual(calls[1], [1, 240, -180]);
});

test('TTS save and reload preserve custom local endpoints and Unicode reference paths', () => {
  const h = setup();
  const endpoint = 'http://127.0.0.1:9988/tts';
  const refPath = '/Users/test/超时空辉夜姬/月见八千代.wav';
  h.set('roomTTSSettings', { enabled: true, provider: 'gpt-sovits', apiUrl: endpoint, refAudioPath: refPath });
  h.loadSettings();
  assert.equal(h.tts.apiUrl, endpoint);
  assert.equal(h.saveTTS(false), true);
  h.loadSettings();
  assert.equal(h.tts.refAudioPath, refPath);
  assert.equal(h.tts.apiUrl, endpoint);
});


test('saving an invalid hidden section reveals it without navigating or dropping the draft', async () => {
  const h = setup();
  h.activeSection.value = 'memory';
  h.llm.apiUrl = 'invalid'; h.llm.model = 'keep-this-draft';
  await h.enterRoom();
  assert.equal(h.activeSection.value, 'llm');
  assert.equal(h.savingSettings.value, false);
  assert.equal(h.llm.model, 'keep-this-draft');
  assert.equal(h.navigation.length, 0);
});

test('connection status expires when model settings change, and invalid tests never save', async () => {
  const h = setup();
  h.connectionCheck.status = 'success';
  h.connectionCheck.snapshot = JSON.stringify(h.llm);
  assert.equal(h.testedConnectionStatus.value, 'success');
  h.llm.model = 'changed';
  assert.equal(h.testedConnectionStatus.value, 'idle');
  await h.testLLM();
  assert.equal(h.store.has('roomLLMSettings'), false);
  assert.equal(h.hasUnsavedSettings.value, true);
});

test('settings search finds fields inside their category and supports no results', () => {
  const h = setup();
  h.settingsSearch.value = 'API';
  assert.equal(h.filteredSettingsGroups.value[0].items[0].id, 'llm');
  h.settingsSearch.value = '权重';
  assert.equal(h.filteredSettingsGroups.value[0].items[0].id, 'tts');
  h.settingsSearch.value = 'no-such-settings';
  assert.equal(h.filteredSettingsGroups.value.length, 0);
});
