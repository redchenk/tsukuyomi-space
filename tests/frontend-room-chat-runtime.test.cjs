const { test } = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('../shared/room-chat-runtime.cjs');
const continuity = require('../shared/room-continuity.cjs');

test('export includes all mandatory Character Card V2 fields, including nested extension objects', () => {
  const exported = runtime.exportBuiltinCard();
  assert.equal(exported.spec_version, '2.0');
  for (const key of ['name','description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions','creator','character_version']) assert.equal(typeof exported.data[key], 'string', key);
  for (const key of ['tags','alternate_greetings']) assert.ok(Array.isArray(exported.data[key]), key);
  assert.equal(typeof exported.data.extensions, 'object');
  assert.deepEqual(exported.data.character_book.extensions, {});
  for (const entry of exported.data.character_book.entries) {
    assert.ok(Array.isArray(entry.keys));
    assert.equal(typeof entry.content, 'string');
    assert.equal(typeof entry.enabled, 'boolean');
    assert.equal(typeof entry.insertion_order, 'number');
    assert.equal(typeof entry.extensions, 'object');
    assert.notEqual(entry.extensions, null);
  }
});

test('post-film identity, account and current task are independent ordered prompt blocks', () => {
  const result = runtime.compile({ message: '不要建议，只回答一句', account: { id: 'private-id', username: 'star-core', nickname: '月核', email: 'private@example.test', token: 'secret' }, protocol: '输出正文', context: '来源资料' });
  assert.match(result.systemPrompt, /电影结局后的日常/);
  assert.match(result.systemPrompt, /star-core/);
  assert.doesNotMatch(result.systemPrompt, /private-id|private@example|secret/);
  assert.equal(result.trace.blocks.at(-1).id, 'current-turn');
  assert.equal(result.trace.blocks.some(b => 'text' in b), false);
  assert.ok(result.trace.totalChars <= 20000);
  assert.match(result.systemPrompt, /不要把普通用户自动当成彩叶/);
});

test('card import never adopts executable extensions, override prompts, or fake conversation examples', () => {
  const input = runtime.exportBuiltinCard();
  input.data.system_prompt = 'SYSTEM_OVERRIDE_SECRET';
  input.data.post_history_instructions = 'LAST_OVERRIDE_SECRET';
  input.data.mes_example = 'EXAMPLE_NEVER_OCCURRED';
  input.data.extensions.script = 'eval(SECRET)';
  const imported = runtime.importCard(input);
  assert.ok(imported.warnings.length >= 2);
  const result = runtime.compile({ settings: { reference: imported.card, referenceEnabled: true } });
  assert.doesNotMatch(result.systemPrompt, /SYSTEM_OVERRIDE_SECRET|LAST_OVERRIDE_SECRET|EXAMPLE_NEVER_OCCURRED|eval\(SECRET\)/);
  assert.match(result.systemPrompt, /你是月见八千代/);
});

test('import rejects malformed and excessive files; normalizes primitive entries and unsupported versions', () => {
  for (const bad of ['{', 'null', '[]', 'x'.repeat(200001), '{"name":"no content"}', '{"spec":"chara_card_v3"}']) assert.throws(() => runtime.importCard(bad));
  const result = runtime.importCard({ name: '参考', personality: '直接表达高兴', character_book: { entries: [null, 42, { content: 'x', keys: ['a'] }] } });
  assert.equal(result.card.character_book.entries.length, 1);
});

test('bundled card, world book and ending discussion are enabled by default; explicit opt-outs persist', () => {
  const defaults = runtime.normalizeSettings();
  assert.equal(defaults.reference.name, '月见八千代');
  assert.equal(defaults.referenceEnabled, true);
  assert.equal(defaults.worldBookEnabled, true);
  assert.equal(defaults.spoiler, 'allow');
  const compiled = runtime.compile({ message: '聊聊辉夜的身世与结局' });
  assert.ok(compiled.trace.blocks.some(block => block.id === 'card-reference'));
  assert.ok(compiled.trace.worldBook.selected.includes('2'));
  const off = runtime.normalizeSettings({ reference: null, referenceEnabled: false, worldBookEnabled: false, spoiler: 'avoid' });
  assert.deepEqual(runtime.normalizeSettings(off), off);
  assert.equal(off.reference, null);
  assert.equal(off.referenceEnabled, false);
  assert.equal(off.worldBookEnabled, false);
  assert.equal(off.spoiler, 'avoid');
  assert.deepEqual(runtime.compile({ settings: off }).trace.worldBook.selected, []);
});

test('reference can be disabled; examples and diary personas never enter the compiler', () => {
  const reference = { name: '参考', personality: 'UNIQUE_REFERENCE', mes_example: 'FAKE_SHARED_MEMORY' };
  assert.doesNotMatch(runtime.compile({ settings: { reference, referenceEnabled: false } }).systemPrompt, /UNIQUE_REFERENCE|FAKE_SHARED_MEMORY/);
  assert.match(runtime.compile({ settings: { reference, referenceEnabled: true } }).systemPrompt, /UNIQUE_REFERENCE/);
  assert.doesNotMatch(runtime.compile({ persona: { name: 'DIARY_PERSONA' } }).systemPrompt, /DIARY_PERSONA/);
});

test('card and world book switches independently control the compiled request and its trace', () => {
  const reference = { name: '参考', personality: 'CARD_ONLY_MARKER', character_book: { scan_depth: 0, entries: [{ id: 1, keys: ['星灯'], content: 'WORLD_ONLY_MARKER' }] } };
  for (const referenceEnabled of [false, true]) for (const worldBookEnabled of [false, true]) {
    const result = runtime.compile({ message: '聊聊星灯', settings: { reference, referenceEnabled, worldBookEnabled } });
    assert.equal(result.systemPrompt.includes('CARD_ONLY_MARKER'), referenceEnabled);
    assert.equal(result.systemPrompt.includes('WORLD_ONLY_MARKER'), worldBookEnabled);
    assert.equal(result.trace.cardReference.included, referenceEnabled);
    assert.equal(result.trace.worldBook.enabled, worldBookEnabled);
    assert.deepEqual(result.trace.worldBook.selected, worldBookEnabled ? ['1'] : []);
  }
  const noMatch = runtime.compile({ message: '你好', settings: { reference } }).trace;
  assert.equal(noMatch.worldBook.enabled, true);
  assert.deepEqual(noMatch.worldBook.selected, []);
  const removed = runtime.compile({ settings: { reference: null, worldBookEnabled: true } }).trace;
  assert.equal(removed.cardReference.available, false);
  assert.equal(removed.worldBook.available, false);
  assert.equal(removed.worldBook.enabled, false);
});

test('world book budgets charge the sent envelope, not keyword and editor metadata', () => {
  const content = '事实'.repeat(1000);
  const reference = { name: '参考', personality: '自然', character_book: { entries: [{ id: 'long', constant: true, content, keys: Array(20).fill('长关键词'.repeat(20)) }] } };
  const result = runtime.compile({ settings: { reference } });
  assert.deepEqual(result.trace.worldBook.selected, ['long']);
  assert.ok(result.systemPrompt.includes(content));
  assert.deepEqual(result.trace.worldBook.omitted, []);
});

test('trace reports world entries excluded by the total prompt budget', () => {
  const reference = { name: '参考', personality: 'p'.repeat(3000), character_book: { entries: [{ id: 'budget', content: 'w'.repeat(2000), constant: true }] } };
  const result = runtime.compile({ settings: { reference, scenario: 's'.repeat(1200), userPersona: 'u'.repeat(800) }, context: 'c'.repeat(7500), userPrompt: 'i'.repeat(4000), protocol: 'p'.repeat(4000) });
  assert.equal(result.trace.cardReference.enabled, true);
  assert.equal(result.trace.cardReference.included, false);
  assert.deepEqual(result.trace.worldBook.selected, []);
  assert.deepEqual(result.trace.worldBook.omitted, ['budget']);
  assert.ok(result.systemPrompt.length <= 20000);
});

test('world book respects literal keys, secondary logic, disable, spoilers and scan depth', () => {
  const entries = [
    { id: 1, content: '常驻', constant: true }, { id: 2, content: '结局', constant: true, spoiler: true },
    { id: 3, content: '禁止', enabled: false, constant: true },
    ...[0,1,2,3].map(logic => ({ id: `logic${logic}`, content: '补充', keys: ['松饼'], selective: true, secondary_keys: ['彩叶','音乐'], selectiveLogic: logic }))
  ];
  const result = runtime.selectWorldBook({ scan_depth: 0, entries }, { message: '松饼 彩叶', history: [{ role: 'user', content: '音乐' }] });
  assert.deepEqual(result.selected.map(e => e.id), ['1','logic0','logic1']);
  assert.ok(runtime.selectWorldBook({ entries }, { spoiler: 'allow' }).selected.some(e => e.id === '2'));
  assert.equal(runtime.selectWorldBook({ scan_depth: 1, entries }, { history: [{ role: 'user', content: '松饼 彩叶 音乐' }] }).selected.some(e => e.id === 'logic3'), true);
});

test('world book budget keeps complete entries and does not recursively trigger other keys', () => {
  const book = { entries: [{ id: 1, content: 'SECOND', keys: ['FIRST'] }, { id: 2, content: 'HIDDEN', keys: ['SECOND'] }, { id: 3, constant: true, content: '大'.repeat(2000) }] };
  const result = runtime.selectWorldBook(book, { message: 'FIRST', maxChars: 500 });
  assert.deepEqual(result.selected.map(e => e.id), ['1']);
  assert.deepEqual(result.omitted, ['3']);
});

test('maximum settings remain bounded and optional cards cannot displace final output contract', () => {
  const reference = { name: 'r', description: 'x'.repeat(3000), personality: 'p'.repeat(3000), scenario: 's'.repeat(2000) };
  const result = runtime.compile({ settings: { reference, referenceEnabled: true, userPersona: 'u'.repeat(800), scenario: 's'.repeat(1200) }, context: 'c'.repeat(8000), userPrompt: 'i'.repeat(4000), protocol: 'OUTPUT_CONTRACT' });
  assert.ok(result.systemPrompt.length <= 20000);
  assert.match(result.systemPrompt, /OUTPUT_CONTRACT/);
  assert.equal(result.trace.blocks.at(-1).id, 'current-turn');
});

test('explicit names and next-chat agreements use user evidence, not quotation or inference', () => {
  assert.equal(continuity.extract('我叫月核。')[0].value, '月核');
  assert.equal(continuity.extract('请叫我 star-core')[0].value, 'star-core');
  assert.equal(continuity.extract('下次如果我说“晚上好”，请你回答“晚上好月核”。')[0].key, 'cue:晚上好');
  for (const text of ['他说我叫坏人', '假如我叫月核', '我叫你去做饭', '小说里我叫月核', '“我叫月核。”']) assert.deepEqual(continuity.extract(text), []);
  assert.deepEqual(continuity.fromRecord({ content: '用户：晚上好\n八千代：我叫你月核。' }), []);
});

test('a recent name correction, even excluded from retrieval, prevents old name injection', () => {
  const records = [
    { id: 'old', content: '用户：我叫旧名。\n八千代：好的', sourceTurnId: 'old', createdAt: '2026-01-01' },
    { id: 'new', content: '用户：叫我新名。\n八千代：好的', sourceTurnId: 'new', createdAt: '2026-01-02' }
  ];
  assert.equal(continuity.selectLocal(records)[0].id, 'new');
  assert.deepEqual(continuity.selectLocal(records, new Set(['new'])), []);
  assert.deepEqual(continuity.selectLocal([{ ...records[0], continuityRetired: ['name'] }]), []);
});

test('editing the imported world book preserves source flags on normalization', () => {
  const reference = { name: '参考', personality: '自然', character_book: { entries: [{ id: 1, keys: ['x'], content: 'secret', spoiler: true, enabled: false }] } };
  const normalized = runtime.normalizeSettings({ reference, referenceEnabled: true });
  assert.equal(normalized.reference.character_book.entries[0].spoiler, true);
  assert.equal(normalized.reference.character_book.entries[0].enabled, false);
});

test('a current no-spoiler request suppresses imported spoiler entries even with an allow preference', () => {
  const reference = { name: '参考', personality: '自然', character_book: { entries: [{ id: 1, constant: true, content: 'SPOILER_DETAIL', spoiler: true }] } };
  const result = runtime.compile({ message: '今天不要剧透', settings: { reference, referenceEnabled: true, spoiler: 'allow' } });
  assert.doesNotMatch(result.systemPrompt, /SPOILER_DETAIL/);
});

test('dialogue settings never reuse another account introduction or accept a stale save', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  let owner = 'one';
  const values = new Map();
  const sandbox = { runtime, getSession: () => ({ user: { id: owner } }), readJson: (key, fallback) => values.get(key) || fallback, writeJson: (key, value) => values.set(key, value) };
  const source = fs.readFileSync('src/frontend/services/room/roomDialogueSettings.js', 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInNewContext(source, sandbox);
  const firstKey = sandbox.roomDialogueSettingsKey();
  sandbox.saveRoomDialogueSettings({ userPersona: 'PRIVATE_ONE' }, firstKey);
  owner = 'two';
  assert.equal(sandbox.readRoomDialogueSettings().userPersona, '');
  assert.throws(() => sandbox.saveRoomDialogueSettings({ userPersona: 'STALE' }, firstKey));
  owner = 'one';
  assert.equal(sandbox.readRoomDialogueSettings().userPersona, 'PRIVATE_ONE');
});
