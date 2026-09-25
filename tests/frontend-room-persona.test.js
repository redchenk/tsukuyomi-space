const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const chat = fs.readFileSync('src/frontend/composables/room/useRoomChat.js', 'utf8');
const start = chat.indexOf('export const BUILT_IN_CHARACTER_NAME');
const end = chat.indexOf('function pickReply(data)');
const context = {};
vm.runInNewContext(chat.slice(start, end).replace(/^export /gm, '') + '\nglobalThis.helpers = {resolveRoomSystemPrompt, roomCharacterName, roomStageCharacterName};', context);
const p = context.helpers;
const archive = JSON.parse(fs.readFileSync('tests/fixtures/persona-sample.json', 'utf8'));

test('imported diary persona cannot replace live chat identity or labels', () => {
  const persona = archive.data.prompts['sample-persona'];
  const prompt = p.resolveRoomSystemPrompt({ persona });
  assert.match(prompt, /你是月见八千代/);
  assert.doesNotMatch(prompt, /Aoi|旧书店店员/);
  assert.equal(p.roomCharacterName(persona), '八千代');
  assert.equal(p.roomStageCharacterName(archive), '八千代辉夜姬');
  assert.equal(prompt, p.resolveRoomSystemPrompt());
});

test('chat keeps explicit user instructions, context and plain-text protocol', () => {
  const prompt = p.resolveRoomSystemPrompt({ userPrompt: '请用更短的句子回答。', context: '知识库：偏爱红茶' });
  assert.match(prompt, /请用更短的句子回答。/);
  assert.match(prompt, /知识库：偏爱红茶/);
  assert.match(prompt, /【输出格式 · 必须严格遵守】/);
  assert.match(prompt, /不要输出 JSON/);
  assert.match(prompt, /正文里可以正常使用括号/);
  assert.match(prompt, /颜文字/);
  assert.doesNotMatch(prompt, /"reply"|expressionMix/);
});

test('chat builds prompts independently while diary generation keeps its own persona', () => {
  const send = chat.slice(chat.indexOf('async function send('), chat.indexOf('  const endChatState ='));
  assert.match(send, /userPrompt: settings.systemPrompt/);
  assert.doesNotMatch(send, /activePersonaPrompt|recentDiaryContext/);
  assert.match(chat, /generateDiaryEntry\(/);
  assert.match(chat, /activePersonaPrompt\(readDiaryArchive\(\)\)/);
});

test('private chat defaults to short exchanges while allowing requested detail and canon complexity', () => {
  const prompt = p.resolveRoomSystemPrompt();
  assert.match(prompt, /1–3 条短消息/);
  assert.match(prompt, /空行分隔/);
  assert.match(prompt, /明确要求详细解释/);
  assert.match(prompt, /同一人的不同时间阶段/);
  assert.match(prompt, /不要把普通用户自动当成彩叶/);
  assert.match(prompt, /装傻|耍赖/);
  assert.doesNotMatch(prompt, /每次回复尽量包含 2-3 个元素/);
});

test('backup fixture remains synthetic and usable for diary tests', () => {
  assert.equal(archive.data.prompts['sample-persona'].data.name, 'Aoi');
  assert.ok(archive.data.diary.length > 0);
});
