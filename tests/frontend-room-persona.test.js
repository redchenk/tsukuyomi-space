/**
 * Verifies that an imported persona actually replaces the built-in character in
 * the outgoing chat request, while the machine-readable protocol half survives.
 *
 * This is the regression that made chat stay on the built-in character even
 * after a successful archive import.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const source = (p) => fs.readFileSync(path.join(rootDir, p), 'utf8');

function stripExports(code) {
    return code
        .replace(/^import [\s\S]*?from '[^']*';$/gm, '')
        .replace(/^export const /gm, 'const ')
        .replace(/^export function /gm, 'function ')
        .replace(/^export async function /gm, 'async function ')
        .replace(/^export \{[\s\S]*?\};?$/gm, '');
}

function loadPromptHelpers() {
    const chat = source('src/frontend/composables/room/useRoomChat.js');

    // Pull only the pure prompt helpers out of the composable so no browser
    // globals are needed to exercise them.
    const start = chat.indexOf('function fallbackRoomPersona()');
    const end = chat.indexOf('function pickReply(data)');
    assert.ok(start > 0 && end > start, 'prompt helpers must be locatable');

    const helpers = chat
        .slice(start, end)
        .replace(/^export function /gm, 'function ')
        .replace(/live2DSemanticPromptCatalog\(\)/g, "'[semantic catalog]'")
        .replace(/live2DPromptCatalog\(\)/g, "'[prompt catalog]'");

    const context = { String, Array, Object };
    vm.runInNewContext(
        `${helpers}\nglobalThis.__p = { fallbackRoomPersona, roomProtocolPrompt, roomPersonaPrompt, resolveRoomSystemPrompt };`,
        context,
        { filename: 'roomPromptHelpers.js' }
    );
    return context.__p;
}

// Synthetic persona used across these tests; no real character data.
const PERSONA = {
    data: {
        name: 'Aoi',
        description: '22岁，旧书店店员，住在临海小镇。短发，安静，话不多。',
        personality: '安静、耐心、观察细致。说话慢，句子短，很少用感叹号。',
        scenario: '你在小镇的旧书店里工作，对方是常来的客人，你们已经认识一段时间。',
        creator_notes: '[示例扮演指南]\n情绪都放在动作里，例如「（把书推过去）这本你会喜欢。」\n<好感变化:+1>',
        tags: ['示例', '日常', '平和']
    }
};

describe('room chat persona resolution', () => {
    it('replaces the built-in character once a persona is imported', () => {
        const p = loadPromptHelpers();
        const prompt = p.resolveRoomSystemPrompt({ persona: PERSONA });

        // The imported character must be present.
        assert.match(prompt, /你现在的身份是「Aoi」/);
        assert.match(prompt, /22岁，旧书店店员/);
        assert.match(prompt, /安静、耐心/);
        assert.match(prompt, /你们已经认识一段时间/);
        assert.match(prompt, /\[示例扮演指南\]/);

        // The built-in character must not be defined anywhere.
        assert.doesNotMatch(prompt, /你是月见八千代/);
        assert.doesNotMatch(prompt, /月夜见的管理员/);
        assert.doesNotMatch(prompt, /电子歌姬/);
        assert.doesNotMatch(prompt, /舞台象征/);
        assert.doesNotMatch(prompt, /可使用舞台、旅程、闪光/);
    });

    it('keeps the plain-text output rules while allowing in-prose brackets', () => {
        const p = loadPromptHelpers();
        const withPersona = p.resolveRoomSystemPrompt({ persona: PERSONA });
        const withoutPersona = p.resolveRoomSystemPrompt({});

        for (const prompt of [withPersona, withoutPersona]) {
            assert.match(prompt, /【输出格式 · 必须严格遵守】/);
            assert.match(prompt, /不要输出 JSON/);
            assert.match(prompt, /不要把整段回复包在括号里/);
            // The forbidden JSON structure must not be echoed back to the model.
            assert.doesNotMatch(prompt, /"reply"/);
            assert.doesNotMatch(prompt, /"live2d"/);
            assert.doesNotMatch(prompt, /\{"reply/);
            assert.doesNotMatch(prompt, /expressionMix/);
            // Action beats, expressions and kaomoji must remain explicitly allowed.
            assert.match(prompt, /正文里可以正常使用括号/);
            assert.match(prompt, /动作/);
            assert.match(prompt, /神态/);
            assert.match(prompt, /颜文字/);
            assert.doesNotMatch(prompt, /不要使用任何大括号或方括号/);
        }
    });

    it('falls back to the built-in character when no persona is imported', () => {
        const p = loadPromptHelpers();

        for (const empty of [undefined, null, {}, { data: {} }, { data: { name: '   ' } }]) {
            const prompt = p.resolveRoomSystemPrompt({ persona: empty });
            assert.match(prompt, /八千代/, 'built-in character should be used as the fallback');
        }
        assert.equal(p.roomPersonaPrompt(undefined), '');
        assert.equal(p.roomPersonaPrompt({ data: { name: '  ' } }), '');
    });

    it('keeps the user prompt and room context ahead of the protocol rules', () => {
        const p = loadPromptHelpers();
        const prompt = p.resolveRoomSystemPrompt({
            persona: PERSONA,
            userPrompt: '请用更短的句子回答。',
            context: '【上下文标记】相关长期记忆。'
        });

        const personaAt = prompt.indexOf('Aoi');
        const protocolAt = prompt.indexOf('【输出格式 · 必须严格遵守】');
        const contextAt = prompt.indexOf('【上下文标记】');

        assert.ok(personaAt > -1 && protocolAt > -1 && contextAt > -1);
        assert.ok(prompt.indexOf('请用更短的句子回答。') < personaAt, 'user prompt comes first');
        assert.ok(personaAt < protocolAt, 'persona precedes the output rules');
        assert.ok(protocolAt < contextAt, 'context is appended last');
    });

    it('is wired into the live chat request rather than sitting unused', () => {
        const chat = source('src/frontend/composables/room/useRoomChat.js');

        assert.match(chat, /const persona = activePersonaPrompt\(readDiaryArchive\(\)\);/);
        assert.match(chat, /const systemPrompt = resolveRoomSystemPrompt\(\{/);
        assert.match(chat, /persona,\s*userPrompt: settings\.systemPrompt,\s*context: roomContext/);
        // The old hardcoded-only path must be gone.
        assert.doesNotMatch(chat, /const basePrompt = settings\.systemPrompt/);
        assert.doesNotMatch(chat, /function roomSystemPrompt\(/);
    });

    it('labels the transcript with the imported character instead of a constant', () => {
        const chat = source('src/frontend/composables/room/useRoomChat.js');
        const panel = source('src/frontend/components/room/RoomChatPanel.vue');

        // The composable exposes a reactive, archive-derived name with a fallback.
        assert.match(chat, /export function roomCharacterName\(persona\)/);
        assert.match(chat, /return name \|\| '\\u516b\\u5343\\u4ee3';/);
        assert.match(chat, /const characterName = ref\(roomCharacterName\(\)\);/);
        assert.match(chat, /characterName\.value = roomCharacterName\(\);/);
        assert.match(chat, /^\s*characterName,$/m);

        // The panel renders it rather than hardcoding a name.
        assert.match(panel, /const characterName = computed\(\(\) => String\(props\.chat\.characterName\?\.value \|\| ''\)\.trim\(\)/);
        assert.match(panel, /const panelTitle = computed\(\(\) => `与\$\{characterName\.value\}聊天`\)/);
        assert.match(panel, /:title="panelTitle"/);
        assert.match(panel, /message\.role === 'assistant' \? characterName :/);

        // No hardcoded character name may remain in the panel markup.
        assert.doesNotMatch(panel, /'八千代'/);
        assert.doesNotMatch(panel, /&#19982;&#36745;&#22812;&#23020;/);
    });
});

describe('persona extraction from a backup fixture', () => {
    it('builds a usable prompt from the desktop persona card shape', () => {
        const p = loadPromptHelpers();
        const archive = JSON.parse(source('tests/fixtures/persona-sample.json'));
        const persona = archive.data.prompts['sample-persona'];

        const prompt = p.roomPersonaPrompt(persona);
        assert.match(prompt, /你现在的身份是「Aoi」/);
        assert.match(prompt, /【角色设定】/);
        assert.match(prompt, /【性格与口吻】/);
        assert.match(prompt, /【相处背景\/当前情境】/);
        assert.match(prompt, /【详细扮演指南】/);
        assert.match(prompt, /【重要】始终称呼自己为「Aoi」/);

        const resolved = p.resolveRoomSystemPrompt({ persona });
        // The imported character is defined; the built-in one is not.
        assert.match(resolved, /你现在的身份是「Aoi」/);
        assert.doesNotMatch(resolved, /你是月见八千代/);
        assert.doesNotMatch(resolved, /电子歌姬/);
        assert.doesNotMatch(resolved, /月夜见的管理员/);
        assert.match(resolved, /【输出格式 · 必须严格遵守】/);
    });

    it('ships no real character or diary data in the fixture', () => {
        const raw = source('tests/fixtures/persona-sample.json');
        const archive = JSON.parse(raw);

        // The fixture must stay synthetic so the repo carries no personal data.
        for (const forbidden of ['Yuki', '小雪', '哥哥', '小年糕', '大福', '未婚妻', 'sister-null', 'Deepseek']) {
            assert.doesNotMatch(raw, new RegExp(forbidden), `fixture must not contain "${forbidden}"`);
        }
        assert.equal(archive.data.prompts['sample-persona'].data.name, 'Aoi');
        assert.ok(archive.data.diary.length > 0, 'fixture still needs diary entries for tests');
        assert.equal(archive.data.prompts['sample-persona'].data.tags.includes('性瘾'), false);
    });
});
