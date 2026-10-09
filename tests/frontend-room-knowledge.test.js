const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const code = ['src/frontend/constants/room/knowledgeEntries.js', 'src/frontend/services/room/roomKnowledge.js']
  .map(file => fs.readFileSync(file, 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
const api = vm.runInNewContext(code + '\n({shouldRetrieveRoomPersona, normalizeRoomKnowledge, selectRoomKnowledgeEntries, roomKnowledgeQuery, roomKnowledgeAllowsSpoilers, cloneKnowledgeEntry, legacy: LEGACY_ROOM_KNOWLEDGE_ENTRIES, defaults: DEFAULT_ROOM_KNOWLEDGE_ENTRIES, version: ROOM_KNOWLEDGE_VERSION})');
const copy = value => JSON.parse(JSON.stringify(value));
const select = (q, settings, limit, options) => copy(api.selectRoomKnowledgeEntries(q, settings, limit, options));

test('intact previous defaults upgrade, preserving custom edits, additions and switches', () => {
  const old = copy(api.legacy);
  old[0].content = '用户自定义的身份，优先保留';
  old[1].enabled = false;
  old.push({ id: 'custom', title: '茶', content: '喜欢桂花乌龙茶', enabled: true });
  const upgraded = copy(api.normalizeRoomKnowledge({ enabled: false, entries: old }));
  assert.equal(upgraded.enabled, false);
  assert.equal(upgraded.entries[0].content, old[0].content);
  assert.equal(upgraded.entries[1].enabled, false);
  assert.ok(upgraded.entries.some(item => item.id === 'custom'));
  assert.ok(upgraded.entries.some(item => item.id === 'yachiyo_canon_research'));
  assert.equal(upgraded.entries.filter(item => item.id === 'yachiyo_canon_research').length, 1);
  assert.equal(api.normalizeRoomKnowledge(upgraded).entries.length, upgraded.entries.length);
});

test('empty, custom-only and reduced libraries never refill; current-edition deletions stay deleted', () => {
  for (const entries of [[], [{ id: 'custom', title: '茶', content: '喝茶', enabled: true }], copy(api.legacy).slice(1)]) {
    assert.equal(api.normalizeRoomKnowledge({ entries }).entries.length, entries.length);
  }
  const current = copy(api.defaults).filter(item => item.id !== 'yachiyo_canon_research');
  const normalized = api.normalizeRoomKnowledge({ builtinVersion: api.version, entries: current });
  assert.equal(normalized.entries.length, current.length);
  assert.ok(!normalized.entries.some(item => item.id === 'yachiyo_canon_research'));
});

test('a modified built-in loses canon attribution; disabling retains its source', () => {
  const builtin = api.defaults.find(item => item.id === 'yachiyo_canon_ending_boundary');
  const edited = api.cloneKnowledgeEntry({ ...builtin, content: '我自己的另一种结局' });
  assert.equal(edited.content, '我自己的另一种结局');
  assert.equal(edited.edition, undefined);
  assert.equal(edited.references, undefined);
  const disabled = api.cloneKnowledgeEntry({ ...builtin, enabled: false });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.edition, '小说');
});

test('topic retrieval finds exact rules and late novel facts ahead of generic persona prose', () => {
  const cases = [
    ['八千代杯按照什么规则算冠军', 'yachiyo_canon_cup'],
    ['SETSUNA 是几个人玩的', 'yachiyo_canon_setsuna'],
    ['不剧透，駒泽乃依是雷的妹妹吗', 'yachiyo_canon_blackonyx'],
    ['小说结局，义体启动成功了吗', 'yachiyo_canon_ending_boundary'],
    ['八千代的52小时限制是什么', 'yachiyo_canon_52_hours'],
    ['CIA 和正仓院的竹子怎么回事', 'yachiyo_canon_cia'],
    ['Remember 真正怎么来的', 'yachiyo_canon_song_loop'],
    ['八千代也会担心观众喜欢演出吗', 'yachiyo_canon_stage_nerves']
  ];
  for (const [question, id] of cases) {
    const result = select(question, null, 5);
    assert.ok(result.some(item => item.id === id), `${question}: ${result.map(item => item.id)}`);
  }
});

test('greetings stay small, explicit no-spoiler wins and zero/disabled limits are respected', () => {
  const greeting = select('你好呀八千代', null);
  assert.ok(greeting.length <= 3);
  assert.ok(greeting.every(item => !item.spoiler));
  assert.ok(select('不要剧透，我没看完，八千代和辉夜是什么关系', null).every(item => !item.spoiler));
  assert.ok(select('八千代和辉夜是不是同一个人，讲结局', null).some(item => item.spoiler));
  assert.equal(select('Remember', null, 0).length, 0);
  assert.equal(select('Remember', { enabled: false }).length, 0);
});

test('short follow-ups retrieve the last human topic without treating assistant fiction as evidence', () => {
  const history = [{ role: 'user', content: '小说结局，为什么要研究义体' }, { role: 'assistant', content: '并不存在的机器人王国' }];
  const query = api.roomKnowledgeQuery('那后来成功了吗', history);
  assert.match(query, /义体/);
  assert.doesNotMatch(query, /机器人王国/);
  assert.ok(select('那后来成功了吗', null, 5, { recentMessages: history }).some(item => item.id === 'yachiyo_canon_ending_boundary'));
  assert.ok(select('那后来呢，但别剧透', null, 5, { recentMessages: history }).every(item => !item.spoiler));
  const noSpoilers = [{ role: 'user', content: '不要剧透，我刚开始看小说' }];
  assert.ok(select('那现在可以讲结局了，义体醒了吗', null, 5, { recentMessages: noSpoilers }).some(item => item.spoiler));
});

test('canon cards cover every story chapter with short paraphrases and edition boundaries', () => {
  assert.equal(api.defaults.length, 81);
  for (const source of ['p-001.xhtml','p-010.xhtml','p-002.xhtml','p-003.xhtml','p-004.xhtml','p-005.xhtml','p-006.xhtml','p-007.xhtml','p-008.xhtml','p-009.xhtml']) {
    assert.ok(api.defaults.some(item => item.references.some(ref => ref.includes(source))), source);
  }
  assert.ok(api.defaults.every(item => item.content.length < 400 && item.references.length));
  const ending = api.defaults.find(item => item.id === 'yachiyo_canon_ending_boundary');
  assert.match(ending.content, /没有继续描写启动是否成功/);
  assert.equal(ending.edition, '小说');
});


test('unversioned corpus cannot crowd out daily chat or verified current canon', () => {
  assert.equal(api.shouldRetrieveRoomPersona('你好，今天没睡好', []), false);
  assert.equal(api.shouldRetrieveRoomPersona('不要剧透，讲讲辉夜', []), false);
  assert.equal(api.shouldRetrieveRoomPersona('小说中的义体实验', select('小说结局义体实验', null)), false);
  assert.equal(api.shouldRetrieveRoomPersona('小说里的未覆盖设定', []), true);
});


test('daily topics retrieve facts without feeding a matching scripted reply', () => {
  for (const question of ['松饼煎糊了，陪我吐槽一句', '你也会紧张吗', '别给我讲道理']) {
    assert.ok(!select(question, null).some(item => item.id === 'yachiyo_few_shots_001'));
  }
  assert.ok(select('给出八千代的语气示例', null).some(item => item.id === 'yachiyo_few_shots_001'));
});
