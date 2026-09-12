/**
 * Proves the fix end to end: with a persona in the archive, the request body
 * sent to the LLM must describe the imported character (not the built-in one),
 * while keeping the plain-text output rules.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.cwd();
const src = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (code) => code
    .replace(/^import [\s\S]*?from '[^']*';$/gm, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export async function /gm, 'async function ')
    .replace(/^export \{[\s\S]*?\};?$/gm, '');

const archive = JSON.parse(src('tests/fixtures/persona-sample.json'));
const SAMPLE_PERSONA = archive.data.prompts['sample-persona'];

const store = new Map();
store.set('roomLLMSettings', JSON.stringify({
    apiUrl: 'https://api.deepseek.com/chat/completions',
    apiKey: 'test-key',
    model: 'deepseek-v4-flash'
}));
store.set('roomDiaryArchive:guest', JSON.stringify(archive));

const ctx = {
    console, Date, JSON, Number, String, Math, Object, Array, Boolean, URL, Promise, RegExp, Set, Map,
    localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    },
    window: { location: { origin: 'https://example.test' }, setTimeout: () => 0, clearTimeout: () => {} },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
    getSession: () => null,
    crypto: { randomUUID: () => 'uuid' },
    Blob: function Blob() {},
    fetch: async () => { throw new Error('no net'); }
};

// Load the archive + the persona helpers pulled from the composable.
const chatSrc = src('src/frontend/composables/room/useRoomChat.js');
const helperStart = chatSrc.indexOf('function fallbackRoomPersona()');
const helperEnd = chatSrc.indexOf('function pickReply(data)');
const helpers = chatSrc.slice(helperStart, helperEnd)
    .replace(/^export function /gm, 'function ')
    .replace(/live2DSemanticPromptCatalog\(\)/g, "'[semantic catalog]'")
    .replace(/live2DPromptCatalog\(\)/g, "'[prompt catalog]'");

vm.runInNewContext([
    strip(src('src/frontend/services/room/roomStorage.js')),
    strip(src('src/frontend/services/room/roomDiaryArchive.js')),
    helpers,
    'globalThis.__t = { readDiaryArchive, activePersonaPrompt, resolveRoomSystemPrompt, roomPersonaPrompt, roomProtocolPrompt };'
].join('\n'), ctx, { filename: 'personaFlow.js' });

const t = ctx.__t;

// 1. The composable path: read the archive, take the active persona.
const a = t.readDiaryArchive();
assert.equal(a.data.diary.length, 2, 'fixture diary should load');
const persona = t.activePersonaPrompt(a);
assert.equal(persona.data.name, 'Aoi');

// 2. Build the prompt exactly like send() does.
const systemPrompt = t.resolveRoomSystemPrompt({
    persona,
    userPrompt: undefined,
    context: '【上下文标记】相关长期记忆：她喜欢喝温热的饮品。'
});

// 3. Assert on the persona half.
assert.match(systemPrompt, /你现在的身份是「Aoi」/);
assert.match(systemPrompt, /旧书店店员/);
assert.match(systemPrompt, /安静、耐心/);
assert.doesNotMatch(systemPrompt, /你是月见八千代/);

// 4. Assert the output rules survived, in their new plain-text form.
assert.match(systemPrompt, /【输出格式 · 必须严格遵守】/);
assert.match(systemPrompt, /不要输出 JSON/);
assert.match(systemPrompt, /不要把整段回复包在括号里/);
// In-prose brackets stay allowed for action beats, expressions and kaomoji.
assert.match(systemPrompt, /正文里可以正常使用括号/);
assert.doesNotMatch(systemPrompt, /不要使用任何大括号或方括号/);
assert.doesNotMatch(systemPrompt, /"reply"/);
assert.doesNotMatch(systemPrompt, /"live2d"/);

// 5. Assert ordering: persona first, output rules after, context last.
assert.ok(systemPrompt.indexOf('Aoi') < systemPrompt.indexOf('【输出格式 · 必须严格遵守】'));
assert.ok(systemPrompt.indexOf('【输出格式 · 必须严格遵守】') < systemPrompt.indexOf('【上下文标记】'));

console.log('PERSONA FLOW OK');
console.log('  persona name        :', persona.data.name);
console.log('  system prompt bytes :', Buffer.byteLength(systemPrompt, 'utf8'));
console.log('  contains built-in   :', /你是月见八千代/.test(systemPrompt));
console.log('  output rules kept   :', /【输出格式 · 必须严格遵守】/.test(systemPrompt));
console.log('  requests JSON       :', /"reply"/.test(systemPrompt));
console.log('  persona head        :', JSON.stringify(systemPrompt.slice(0, 60)));
