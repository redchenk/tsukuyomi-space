/**
 * Verifies the three requested behaviours against the real modules:
 *   1. the outgoing prompt no longer asks for a JSON envelope
 *   2. a JSON reply is still unwrapped, plain text passes through untouched
 *   3. ending a chat clears the transcript, but leaving does not
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

const chatSrc = src('src/frontend/composables/room/useRoomChat.js');

function loadHelpers() {
    // Prompt helpers + the reply parser, with their few pure dependencies stubbed.
    const pStart = chatSrc.indexOf('function uid()');
    const pEnd = chatSrc.indexOf('function defaultTtsUrl(provider)');
    const helpers = chatSrc.slice(pStart, pEnd).replace(/^export function /gm, 'function ');

    const ctx = {
        String, Array, Object, JSON, RegExp, Number, Math, Boolean,
        compileBehaviorIntent: () => null,
        inferLive2DIntentFromText: () => ({ emotion: 'neutral' })
    };
    vm.runInNewContext(
        `${helpers}\nglobalThis.__h = { parseAssistantPayload, cleanReply, unwrapJsonEnvelope };`,
        ctx,
        { filename: 'replyHelpers.js' }
    );
    return ctx.__h;
}

function loadPersona() {
    const pStart = chatSrc.indexOf('function fallbackRoomPersona()');
    const pEnd = chatSrc.indexOf('function pickReply(data)');
    const helpers = chatSrc.slice(pStart, pEnd)
        .replace(/^export function /gm, 'function ')
        .replace(/live2DSemanticPromptCatalog\(\)/g, "'[legacy-semantic]'")
        .replace(/live2DPromptCatalog\(\)/g, "'[legacy-catalog]'");
    const ctx = { String, Array, Object };
    vm.runInNewContext(
        `${helpers}\nglobalThis.__p = { resolveRoomSystemPrompt, roomProtocolPrompt };`,
        ctx,
        { filename: 'promptHelpers.js' }
    );
    return ctx.__p;
}

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log('  PASS  ' + name);
    } catch (e) {
        failures += 1;
        console.log('  FAIL  ' + name);
        console.log('        ' + e.message);
    }
}

console.log('=== 1. outgoing prompt is plain-text ===');
const p = loadPersona();
const persona = JSON.parse(src('tests/fixtures/persona-sample.json')).data.prompts['sample-persona'];
const prompt = p.resolveRoomSystemPrompt({ persona });

check('no longer demands a JSON object', () => {
    assert.doesNotMatch(prompt, /只返回 JSON 对象/);
    assert.doesNotMatch(prompt, /返回格式必须是/);
});
check('no longer specifies reply/live2d schema', () => {
    assert.doesNotMatch(prompt, /"reply"/);
    assert.doesNotMatch(prompt, /"live2d"/);
    assert.doesNotMatch(prompt, /"emotion"/);
    assert.doesNotMatch(prompt, /expressionMix/);
});
check('forbids JSON envelopes without banning in-prose brackets', () => {
    assert.match(prompt, /不要输出 JSON/);
    assert.match(prompt, /不要把整段回复包在括号里/);
    assert.match(prompt, /正文里可以正常使用括号/);
    assert.doesNotMatch(prompt, /不要使用任何大括号或方括号/);
});
check('legacy live2d catalogs are gone', () => {
    assert.doesNotMatch(prompt, /\[legacy-semantic\]/);
    assert.doesNotMatch(prompt, /\[legacy-catalog\]/);
});
check('still identifies as the imported persona', () => {
    assert.match(prompt, /你现在的身份是「Aoi」/);
    assert.doesNotMatch(prompt, /你是月见八千代/);
});

console.log('\n=== 2. reply parsing ===');
const h = loadHelpers();

check('plain text passes through untouched', () => {
    const r = h.parseAssistantPayload('唔……今天好累呀，抱抱~');
    assert.equal(r.reply, '唔……今天好累呀，抱抱~');
});
check('braces in ordinary prose survive', () => {
    const r = h.parseAssistantPayload('这个符号 { 我用在画里了');
    assert.equal(r.reply, '这个符号 { 我用在画里了');
});
check('a legacy JSON reply is still unwrapped', () => {
    assert.equal(h.parseAssistantPayload('{"reply":"你好呀","live2d":{"emotion":"happy"}}').reply, '你好呀');
});
check('a markdown-fenced JSON reply is unwrapped', () => {
    assert.equal(h.parseAssistantPayload('```json\n{"reply":"晚上好"}\n```').reply, '晚上好');
});
check('malformed JSON falls back to text, not empty', () => {
    const r = h.parseAssistantPayload('{坏了');
    assert.equal(r.reply, '{坏了');
});
check('action beats and expression cues are preserved', () => {
    assert.equal(h.parseAssistantPayload('（微笑）今天很开心').reply, '（微笑）今天很开心');
    assert.equal(h.parseAssistantPayload('（摸了摸戒指）唔…老公送的~').reply, '（摸了摸戒指）唔…老公送的~');
    assert.equal(h.parseAssistantPayload('呜…(⁄ ⁄•⁄ω⁄•⁄ ⁄) 别看我').reply, '呜…(⁄ ⁄•⁄ω⁄•⁄ ⁄) 别看我');
});
check('only a whole-message bracket wrapper is unwrapped', () => {
    assert.equal(h.parseAssistantPayload('（今天很开心呀，明天见）').reply, '今天很开心呀，明天见');
});

console.log('\n=== 3. session clearing ===');

check('end-chat clears the transcript and persists the reset', () => {
    assert.match(chatSrc, /function startNewSession\(\{ keepMemories = true \} = \{\}\) \{[\s\S]*?messages\.value = \[\];[\s\S]*?writeRoomConversation\(\[\]\);/);
    assert.match(chatSrc, /const \{ entry \} = appendDiaryEntry\(\{[\s\S]*?\}\);\s*diary\?\.refresh\?\.\(\);\s*\/\/[^\n]*\n\s*startNewSession\(\);/);
});
check('leaving the room does not clear anything', () => {
    // destroy() is what runs on unmount; it must not wipe the conversation.
    const destroy = chatSrc.slice(chatSrc.indexOf('function destroy()'));
    const body = destroy.slice(0, destroy.indexOf('\n  }'));
    assert.doesNotMatch(body, /writeRoomConversation\(\[\]\)/);
    assert.doesNotMatch(body, /messages\.value = \[\]/);
    assert.doesNotMatch(body, /startNewSession/);
});
check('a failed generation does not clear the transcript', () => {
    const catchIdx = chatSrc.indexOf('} catch (error) {', chatSrc.indexOf('async function confirmEndChat'));
    const catchBlock = chatSrc.slice(catchIdx, catchIdx + 500);
    assert.doesNotMatch(catchBlock, /startNewSession/);
});

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL BEHAVIOUR CHECKS PASSED'));
process.exit(failures ? 1 : 0);
