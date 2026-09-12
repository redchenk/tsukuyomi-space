/**
 * Verifies that bracketed action beats, expression cues and kaomoji survive in
 * the visible reply, while true protocol artefacts are still removed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.cwd();
const chatSrc = fs.readFileSync(path.join(root, 'src/frontend/composables/room/useRoomChat.js'), 'utf8');

// Load the visible-reply pipeline with its two pure dependencies stubbed.
const pStart = chatSrc.indexOf('function uid()');
const pEnd = chatSrc.indexOf('function defaultTtsUrl(provider)');
const helpers = chatSrc.slice(pStart, pEnd).replace(/^export function /gm, 'function ');

const ctx = {
    String, Array, Object, JSON, RegExp, Number, Math, Boolean,
    compileBehaviorIntent: () => null,
    inferLive2DIntentFromText: () => ({ emotion: 'neutral' })
};
vm.runInNewContext(
    `${helpers}\nglobalThis.__h = { parseAssistantPayload, cleanReply, stripActionHints };`,
    ctx,
    { filename: 'replyHelpers.js' }
);
const h = ctx.__h;

let failures = 0;
function keeps(name, input, expected) {
    try {
        const got = h.parseAssistantPayload(input).reply;
        assert.equal(got, expected);
        console.log('  PASS  keep: ' + name);
    } catch (e) {
        failures += 1;
        console.log('  FAIL  keep: ' + name);
        console.log('        expected ' + JSON.stringify(expected));
        console.log('        got      ' + JSON.stringify(h.parseAssistantPayload(input).reply));
    }
}
function drops(name, input, forbidden) {
    try {
        const got = h.parseAssistantPayload(input).reply;
        assert.doesNotMatch(got, forbidden);
        console.log('  PASS  drop: ' + name);
    } catch (e) {
        failures += 1;
        console.log('  FAIL  drop: ' + name + '\n        got ' + JSON.stringify(h.parseAssistantPayload(input).reply));
    }
}

console.log('=== bracketed style is preserved ===');

keeps('action beat in full-width parens',
    '（摸了摸戒指）唔…老公送的~',
    '（摸了摸戒指）唔…老公送的~');

keeps('action beat mid-sentence',
    '我（有点害羞地）躲到他背后去了。',
    '我（有点害羞地）躲到他背后去了。');

keeps('expression cue with 微笑',
    '（微笑）今天很开心呀。',
    '（微笑）今天很开心呀。');

keeps('blush cue',
    '（脸红）别、别说了啦…',
    '（脸红）别、别说了啦…');

keeps('half-width parens cue',
    '(blushing) I missed you.',
    '(blushing) I missed you.');

keeps('kaomoji with brackets',
    '好累呀 [躺平] 不想动了 (。-ω-)zzz',
    '好累呀 [躺平] 不想动了 (。-ω-)zzz');

keeps('multiple kaomoji forms',
    '呜…(⁄ ⁄•⁄ω⁄•⁄ ⁄) 别看我啦 ε=( o｀ω′)ノ',
    '呜…(⁄ ⁄•⁄ω⁄•⁄ ⁄) 别看我啦 ε=( o｀ω′)ノ');

keeps('emphatic asterisks kept as prose',
    '你*真的*很讨厌诶',
    '你*真的*很讨厌诶');

keeps('brackets used for normal asides',
    '明天（如果不下雨的话）我们去散步吧。',
    '明天（如果不下雨的话）我们去散步吧。');

keeps('multi-line with action beats on their own lines',
    '（把脸埋进他肩窝）\n唔…好暖和。\n（小声）再抱一会儿嘛。',
    '（把脸埋进他肩窝）\n唔…好暖和。\n（小声）再抱一会儿嘛。');

keeps('braces in ordinary prose',
    '这个符号 { 我用在画里了',
    '这个符号 { 我用在画里了');

console.log('\n=== protocol artefacts are still removed ===');

drops('a whole-message bracket wrapper is unwrapped',
    '（今天很开心呀，明天见）',
    /^（/);

keeps('whole-message wrapper keeps its content',
    '（今天很开心呀，明天见）',
    '今天很开心呀，明天见');

drops('labelled action field line',
    '动作：微微歪头\n今天天气真好。',
    /动作：/);

drops('labelled emotion field line',
    'emotion: happy\n我很开心。',
    /emotion:/);

drops('reply prefix',
    'reply: 你好呀',
    /^reply:/);

drops('trailing affection annotation',
    '今天很开心。<好感变化:+2>',
    /好感变化/);

drops('trailing trust annotation in brackets',
    '今天很开心。[信任变化:+1]',
    /信任变化/);

drops('trailing shyness annotation',
    '呜…（害羞）[害羞变化:+6]',
    /害羞变化/);

console.log('\n=== JSON envelope handling ===');

keeps('a legacy JSON reply is unwrapped',
    '{"reply":"你好呀","live2d":{"emotion":"happy"}}',
    '你好呀');

keeps('a JSON reply keeps its internal brackets',
    '{"reply":"（微笑）你好呀"}',
    '（微笑）你好呀');

console.log('\n=== prompt wording ===');
const prompt = chatSrc.slice(chatSrc.indexOf('function roomProtocolPrompt()'), chatSrc.indexOf('function applyRoomAct'));
const checks = [
    ['forbids wrapping the whole message in brackets', /不要把整段回复包在括号里/],
    ['forbids JSON', /不要输出 JSON/],
    ['forbids field prefixes', /不要输出「reply:」「emotion:」这类字段前缀/],
    ['explicitly ALLOWS brackets for action/expression/kaomoji', /正文里可以正常使用括号/],
    ['mentions 动作', /动作/],
    ['mentions 神态', /神态/],
    ['mentions 颜文字', /颜文字/],
    ['no longer bans square brackets outright', /不要使用任何大括号或方括号/, true]
];
for (const [name, re, invert] of checks) {
    const hit = re.test(prompt);
    const ok = invert ? !hit : hit;
    if (ok) console.log('  PASS  ' + name);
    else { failures += 1; console.log('  FAIL  ' + name); }
}

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
