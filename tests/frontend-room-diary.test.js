const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function createStorage() {
    const store = new Map();
    return {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear()
    };
}

function stripExports(code) {
    return code
        .replace(/^import [\s\S]*?from '[^']*';$/gm, '')
        .replace(/^export const /gm, 'const ')
        .replace(/^export function /gm, 'function ')
        .replace(/^export async function /gm, 'async function ')
        .replace(/^export \{[\s\S]*?\};?$/gm, '');
}

function loadArchive({ user = null, storage = createStorage() } = {}) {
    const context = {
        localStorage: storage,
        console,
        Date,
        JSON,
        Number,
        String,
        Math,
        Object,
        Array,
        Boolean,
        Blob: function Blob() {},
        document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
        window: { setTimeout: () => 0, location: { origin: 'https://example.test' } },
        crypto: { randomUUID: () => 'uuid-test' },
        getSession: () => (user ? { user } : null),
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }
    };
    const code = `${stripExports(source('src/frontend/services/room/roomStorage.js'))}\n`
        .concat(stripExports(source('src/frontend/services/room/roomDiaryArchive.js')))
        .concat(`
globalThis.__archive = {
    readDiaryArchive, writeDiaryArchive, defaultArchive, normalizeArchive, appendDiaryEntry,
    activePersonaPrompt, personaDisplayName, updatePersonaPrompt, parseDiaryArchive,
    serializeDiaryArchive, importDiaryArchive, clearDiaryArchive, diaryArchiveKey,
    archiveFileName, normalizeDiaryEntry, diaryDateParts, diaryTimestampLabel, nextSlotId,
    latestDiaryEntry, defaultPersonaPrompt, diarySortKey, DEFAULT_PERSONA_PROMPT_ID,
    DIARY_ARCHIVE_UPDATED_EVENT
};
`);
    vm.runInNewContext(code, context, { filename: 'roomDiaryArchive.js' });
    return { archive: context.__archive, storage };
}

function loadGeneration(llmSettings = {}) {
    const storage = createStorage();
    if (Object.keys(llmSettings).length) storage.setItem('roomLLMSettings', JSON.stringify(llmSettings));
    const context = {
        console,
        Date,
        JSON,
        Number,
        String,
        Math,
        Object,
        Array,
        Boolean,
        URL,
        localStorage: storage,
        window: { location: { origin: 'https://example.test' } },
        getSession: () => null,
        crypto: { randomUUID: () => 'uuid-test' },
        fetch: async () => { throw new Error('network disabled in unit test'); }
    };
    const code = `${stripExports(source('src/frontend/services/room/roomStorage.js'))}\n`
        .concat(stripExports(source('src/frontend/services/room/localOllamaTransport.js')))
        .concat(stripExports(source('src/frontend/services/room/roomDiaryArchive.js')))
        .concat(stripExports(source('src/frontend/services/room/roomDiaryGeneration.js')))
        .concat(`
globalThis.__generation = {
    cleanDiaryContent, composeDiaryBody, normalizeDiaryConversation, diaryConversationLength,
    buildDiarySystemPrompt, buildDiaryUserPrompt, generateDiaryEntry, isDiaryGenerationConfigured,
    diarySettings, diaryGenerationConstants
};
`);
    vm.runInNewContext(code, context, { filename: 'roomDiaryGeneration.js' });
    return context.__generation;
}

describe('room diary archive', () => {
    it('starts from a persona + diary mixed document matching the desktop backup shape', () => {
        const { archive } = loadArchive();
        const fresh = archive.defaultArchive();

        assert.equal(fresh.version, '1.0.0');
        assert.equal(fresh.slotId, 1);
        assert.equal(typeof fresh.timestamp, 'number');
        assert.match(fresh.exportDate, /^\d{4}-\d{2}-\d{2}T/);
        assert.deepEqual(Object.keys(fresh.data).sort(), ['diary', 'gameData', 'other', 'prompts', 'settings']);
        assert.ok(Array.isArray(fresh.data.diary));
        assert.ok(Object.keys(fresh.data.prompts).length >= 1);
        assert.equal(typeof fresh.data.gameData.characterStats.affection, 'number');
        assert.equal(typeof fresh.data.gameData.characterSystemData.character.name, 'string');
    });

    it('fails the archive-write announcement only through a real window', () => {
        const { archive } = loadArchive();
        // The room stage re-reads the persona from this event, so the writer
        // must always announce. In the vm sandbox there is no window, which
        // exercises the guard instead of throwing.
        assert.equal(typeof archive.DIARY_ARCHIVE_UPDATED_EVENT, 'string');
        assert.equal(archive.DIARY_ARCHIVE_UPDATED_EVENT, 'tsukuyomi:room-diary-archive-updated');
        assert.doesNotThrow(() => archive.updatePersonaPrompt({ data: { name: '月见八千代' } }));
    });

    it('formats diary timestamps the way the reference backups do', () => {        const { archive } = loadArchive();
        const parts = archive.diaryDateParts(new Date(2026, 8, 3, 20, 51, 19));

        assert.equal(parts.date, '2026/9/3');
        assert.equal(parts.time, '20:51:19');
        assert.equal(parts.localDate, '2026-09-03');
        assert.equal(parts.localTime, '20:51');
        assert.equal(archive.diaryTimestampLabel(new Date(2026, 8, 3, 20, 0, 0)), '2026年9月3日20点');
        assert.equal(archive.diaryTimestampLabel(new Date(2026, 8, 3, 20, 51, 0)), '2026年9月3日20点51分');
    });

    it('appends entries with the expected field set and keeps affection mirrored', () => {
        const { archive } = loadArchive();
        const { archive: saved, entry } = archive.appendDiaryEntry(
            { content: '【日记】\n\n今天的月亮很好看。\n\n\n\n【日记书写时间为2026年9月3日20点】', affection: 42, mode: 'Deepseek' },
            { now: new Date(2026, 8, 3, 20, 51, 19) }
        );

        assert.equal(saved.data.diary.length, 1);
        assert.equal(entry.date, '2026/9/3');
        assert.equal(entry.time, '20:51:19');
        assert.equal(entry.localDate, '2026-09-03');
        assert.equal(entry.localTime, '20:51');
        assert.equal(entry.affection, 42);
        assert.equal(entry.mode, 'Deepseek');
        assert.equal(typeof entry.diaryId, 'string');
        assert.ok(entry.diaryId.length > 0);
        assert.equal(saved.data.gameData.characterStats.affection, 42);
        assert.equal(saved.data.gameData.characterSystemData.stats.affection, 42);
    });

    it('orders entries by their date header when timestamps are unusable', () => {
        const { archive } = loadArchive();
        const sameStamp = 1789128693115;

        // Mirrors real desktop backups: entries share one timestamp while their
        // visible date/time headers still carry the true sequence.
        assert.ok(
            archive.diarySortKey({ date: '2026/8/30', time: '13:19:59', timestamp: sameStamp })
            < archive.diarySortKey({ date: '2026/9/2', time: '08:38:56', timestamp: sameStamp })
        );
        assert.ok(
            archive.diarySortKey({ date: '2026/9/3', time: '08:59:35' })
            < archive.diarySortKey({ date: '2026/9/3', time: '20:51:19' })
        );
        // Without a date header it still yields a usable key from the timestamp.
        assert.equal(archive.diarySortKey({ timestamp: sameStamp }), sameStamp);
        assert.ok(archive.diarySortKey({ date: '2026/9/3' }) > 0);

        const saved = archive.writeDiaryArchive({
            ...archive.defaultArchive(),
            data: {
                ...archive.defaultArchive().data,
                diary: [
                    { date: '2026/9/2', time: '08:38:56', timestamp: sameStamp, content: 'b' },
                    { date: '2026/8/30', time: '13:19:59', timestamp: sameStamp, content: 'a' },
                    { date: '2026/9/3', time: '20:51:19', timestamp: sameStamp, content: 'c' }
                ]
            }
        });

        assert.deepEqual(
            Array.from(saved.data.diary, (item) => item.content),
            ['a', 'b', 'c']
        );
    });

    it('scopes storage per account and keeps guest archives separate', () => {        const { archive, storage } = loadArchive({ user: { id: 'u-1' } });
        assert.equal(archive.diaryArchiveKey(), 'roomDiaryArchive:u-1');

        const guest = loadArchive();
        assert.equal(guest.archive.diaryArchiveKey(), 'roomDiaryArchive:guest');

        archive.appendDiaryEntry({ content: 'x' });
        assert.ok(storage.getItem('roomDiaryArchive:u-1'));
        assert.equal(storage.getItem('roomDiaryArchive:guest'), null);
    });

    it('round-trips a desktop-style backup through import and export', () => {
        const { archive } = loadArchive();
        const imported = {
            version: '1.0.0',
            timestamp: 1788439947505,
            exportDate: '2026-09-03T12:52:27.505Z',
            slotId: 3,
            data: {
                gameData: {
                    characterStats: { affection: 1000, trust: 100 },
                    characterSystemData: {
                        stats: { affection: 1000, trust: 100 },
                        character: { name: 'Aoi', personality: 'quiet', favoriteGifts: [], specialEvents: [], currentMood: 'neutral' }
                    },
                    extraKeyKept: true
                },
                diary: [
                    { timestamp: 1788439879642, date: '2026/9/3', time: '20:51:19', affection: 1000, content: '【日记】\n\n示例日记正文。', conversationLength: 0, mode: 'test', diaryId: 'abc' }
                ],
                settings: { bgmVolume: 0 },
                prompts: { 'sample-persona': { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Aoi', description: '22岁', personality: '安静', scenario: '书店', tags: ['示例'] } } },
                other: { ai_chat_mode: 'TEST' }
            }
        };

        const normalized = archive.parseDiaryArchive(JSON.stringify(imported));
        assert.equal(normalized.slotId, 3);
        assert.equal(normalized.data.diary.length, 1);
        assert.equal(normalized.data.diary[0].diaryId, 'abc');
        assert.equal(normalized.data.gameData.characterStats.affection, 1000);
        assert.equal(normalized.data.gameData.extraKeyKept, true);
        assert.equal(archive.personaDisplayName(normalized), 'Aoi');
        assert.equal(normalized.data.prompts['sample-persona'].data.tags.length, 1);

        const saved = archive.writeDiaryArchive(normalized);
        const again = archive.parseDiaryArchive(archive.serializeDiaryArchive(saved));
        assert.equal(again.data.diary.length, 1);
        assert.equal(again.data.diary[0].content, imported.data.diary[0].content);
        assert.equal(archive.personaDisplayName(again), 'Aoi');
    });

    it('rejects files that carry neither persona nor diary data', () => {
        const { archive } = loadArchive();
        assert.throws(() => archive.parseDiaryArchive('{"hello":"world"}'), /没有可识别的角色或日记数据/);
    });

    it('updates persona fields and exports a slot-and-date file name', () => {
        const { archive } = loadArchive();
        archive.appendDiaryEntry({ content: 'x' });
        const updated = archive.updatePersonaPrompt({ data: { name: '八千代', description: '管理员' } });
        assert.equal(archive.personaDisplayName(updated), '八千代');
        assert.equal(
            archive.archiveFileName(updated, new Date(2026, 8, 3, 12, 52, 27)),
            '八千代_槽位1_备份_2026-09-03T12-52-27.json'
        );
    });

    it('clears the archive back to a fresh document', () => {
        const { archive } = loadArchive();
        archive.appendDiaryEntry({ content: 'x' });
        assert.equal(archive.readDiaryArchive().data.diary.length, 1);
        const cleared = archive.clearDiaryArchive();
        assert.equal(cleared.data.diary.length, 0);
    });

    it('exports every symbol the room UI imports', () => {        const archiveCode = source('src/frontend/services/room/roomDiaryArchive.js');
        const generationCode = source('src/frontend/services/room/roomDiaryGeneration.js');
        const archiveExports = new Set(
            [...archiveCode.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((match) => match[1])
        );
        const generationExports = new Set(
            [...generationCode.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((match) => match[1])
        );

        // Every named import used by the diary consumers must exist in the module.
        for (const consumer of [
            'src/frontend/pages/RoomSettingsPage.vue',
            'src/frontend/composables/room/useRoomDiary.js',
            'src/frontend/composables/room/useRoomChat.js'
        ]) {
            const code = source(consumer);
            const importBlock = code.match(/import \{([^}]*?)\} from '[^']*services\/room\/roomDiaryArchive'/);
            if (importBlock) {
                for (const raw of importBlock[1].split(',')) {
                    const name = raw.trim().split(/\s+as\s+/)[0].trim();
                    if (!name) continue;
                    assert.ok(archiveExports.has(name), `${consumer} imports missing export "${name}" from roomDiaryArchive.js`);
                }
            }
        }

        for (const name of ['generateDiaryEntry', 'normalizeDiaryConversation', 'diaryConversationLength']) {
            assert.ok(generationExports.has(name), `roomDiaryGeneration.js must export ${name}`);
        }
        for (const name of ['readDiaryArchive', 'writeDiaryArchive', 'appendDiaryEntry', 'clearDiaryArchive', 'downloadDiaryArchive', 'importDiaryArchive', 'updatePersonaPrompt', 'activePersonaPrompt']) {
            assert.ok(archiveExports.has(name), `roomDiaryArchive.js must export ${name}`);
        }
    });
});

describe('room diary generation', () => {
    it('normalizes the finished conversation, dropping non-dialogue turns', () => {
        const generation = loadGeneration();
        const turns = generation.normalizeDiaryConversation([
            { role: 'system', content: 'Live2D 已就绪' },
            { role: 'user', content: '今天好累' },
            { role: 'assistant', content: '那先坐下吧', pending: false },
            { role: 'assistant', content: '正在回应...', pending: true },
            { role: 'assistant', content: '那先坐下吧', pending: false },
            { role: 'user', content: '   ' }
        ]);

        assert.deepEqual(Array.from(turns, (turn) => turn.role), ['user', 'assistant']);
        assert.equal(generation.diaryConversationLength(turns), 2);
    });

    it('builds a first-person diary prompt grounded in the persona', () => {
        const generation = loadGeneration();
        const system = generation.buildDiarySystemPrompt({
            id: 'p', data: { name: 'Aoi', description: '22岁书店店员', personality: '安静', scenario: '书店', creator_notes: '喜欢看书' }
        });
        assert.match(system, /你是「Aoi」/);
        assert.match(system, /第一人称/);
        assert.match(system, /只输出日记正文/);
        assert.match(system, /不要编造/);

        const user = generation.buildDiaryUserPrompt(
            [{ role: 'user', content: '我今天画完啦' }, { role: 'assistant', content: '真厉害' }],
            { timestampLabel: '2026年9月3日20点', personaName: 'Aoi' }
        );
        assert.match(user, /<对话开始>/);
        assert.match(user, /对方：我今天画完啦/);
        assert.match(user, /Aoi：真厉害/);
        assert.match(user, /2026年9月3日20点/);
    });

    it('cleans model noise and composes the reference body layout', () => {
        const generation = loadGeneration();
        const cleaned = generation.cleanDiaryContent('```\n<think>hidden</think>【日记】\n\n今天很开心。\n\n\n\n【日记书写时间为2026年9月3日20点】\n```');
        assert.equal(cleaned, '今天很开心。');

        const body = generation.composeDiaryBody(cleaned, '2026年9月3日20点');
        assert.match(body, /^【日记】\n\n今天很开心。/);
        assert.match(body, /【日记书写时间为2026年9月3日20点】$/);
    });

    it('unwraps a JSON envelope some models return anyway', () => {
        const generation = loadGeneration();
        assert.equal(generation.cleanDiaryContent('{"diary":"今天写了很多东西。"}'), '今天写了很多东西。');
    });

    it('refuses to generate without a configured LLM or without conversation', async () => {
        const generation = loadGeneration();

        await assert.rejects(
            generation.generateDiaryEntry([], { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
            /没有可记录的对话内容/
        );
        await assert.rejects(
            generation.generateDiaryEntry([{ role: 'user', content: 'hi' }], { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
            /配置 LLM/
        );
    });

    it('surfaces a short-reply failure instead of saving an empty diary', async () => {
        const generation = loadGeneration({
            apiUrl: 'https://api.deepseek.com/chat/completions',
            apiKey: 'test-key',
            model: 'deepseek-v4-flash'
        });

        await assert.rejects(
            generation.generateDiaryEntry(
                [{ role: 'user', content: 'hi' }],
                { fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '嗯' } }] }) }) }
            ),
            /过短/
        );
    });

    it('generates a cleaned diary entry when an LLM reply is available', async () => {
        const generation = loadGeneration({
            apiUrl: 'https://api.deepseek.com/chat/completions',
            apiKey: 'test-key',
            model: 'deepseek-v4-flash'
        });

        let seenBody = null;
        const result = await generation.generateDiaryEntry(
            [{ role: 'user', content: '今天去看了画展' }, { role: 'assistant', content: '听起来很棒' }],
            {
                persona: { id: 'p', data: { name: 'Aoi', description: '书店店员', personality: '安静', scenario: '', creator_notes: '' } },
                now: new Date(2026, 8, 3, 20, 51, 0),
                fetchImpl: async (url, options) => {
                    seenBody = JSON.parse(options.body);
                    return { ok: true, json: async () => ({ choices: [{ message: { content: '【日记】\n\n今天去看了画展，心里亮堂堂的，连回家的路都觉得比平时短。' } }] }) };
                }
            }
        );

        assert.equal(seenBody.model, 'deepseek-v4-flash');
        assert.match(seenBody.messages[0].content, /你是「Aoi」/);
        assert.equal(result.content, '今天去看了画展，心里亮堂堂的，连回家的路都觉得比平时短。');
        assert.match(result.body, /^【日记】\n\n今天去看了画展/);
        assert.match(result.body, /【日记书写时间为2026年9月3日20点51分】$/);
        assert.equal(result.conversationLength, 2);
        assert.equal(result.personaName, 'Aoi');
    });
});

describe('room chat end-chat wiring', () => {
    const chatSource = () => source('src/frontend/composables/room/useRoomChat.js');

    it('scopes diary generation to turns produced after the session boundary', () => {
        const code = chatSource();

        // Restored history must never be re-diarized on every load/refresh.
        assert.match(code, /let sessionBoundaryReady = false;/);
        assert.match(code, /const wasInitialLoad = !sessionBoundaryReady;/);
        assert.match(code, /if \(wasInitialLoad\) \{\s*markSessionStart\(\);\s*sessionBoundaryReady = true;\s*\}/);
        assert.match(code, /function loadHistory\(\) \{[\s\S]*markSessionStart\(\);[\s\S]*refreshSyncedHistory\(\);/);

        // renderHistory must stay boundary-neutral so repeated syncs cannot reset it.
        assert.match(code, /function renderHistory\(history\) \{\s*messages\.value = \[\];[\s\S]*?history\.forEach[\s\S]*?\n  \}/);
        assert.doesNotMatch(code, /function renderHistory\(history\) \{[\s\S]{0,200}markSessionStart/);

        // Boundary tracking uses a message count, not fragile timestamps.
        assert.match(code, /restoredCount: messages\.value\.filter/);
        assert.match(code, /\.slice\(since\);/);
    });

    it('persists the generated entry through the archive and refreshes the diary panel', () => {
        const code = chatSource();

        assert.match(code, /const generated = await generateDiaryEntry\(turns, \{ persona, now \}\);/);
        assert.match(code, /const \{ entry \} = appendDiaryEntry\(\{/);
        assert.match(code, /content: generated\.body/);
        assert.match(code, /conversationLength: generated\.conversationLength/);
        assert.match(code, /diary\?\.refresh\?\.\(\);/);
        assert.match(code, /status: 'done'/);
    });

    it('surfaces generation failures without writing a partial diary', () => {
        const code = chatSource();

        assert.match(code, /status: 'error'/);
        assert.match(code, /function endChatErrorMessage\(error\)/);
        // \u65e5\u8bb0\u751f\u6210\u5931\u8d25 === 日记生成失败
        assert.match(code, /\\u65e5\\u8bb0\\u751f\\u6210\\u5931\\u8d25/);
        // The failure path must not append anything to the archive.
        const catchBlock = code.slice(code.indexOf('} catch (error) {', code.indexOf('async function confirmEndChat')));
        assert.doesNotMatch(catchBlock.slice(0, 400), /appendDiaryEntry/);
    });

    it('exposes the end-chat surface the chat panel renders', () => {
        const chat = chatSource();
        const panel = source('src/frontend/components/room/RoomChatPanel.vue');

        for (const name of ['openEndChatDialog', 'closeEndChatDialog', 'confirmEndChat', 'endChatState', 'sessionTurnCount']) {
            assert.match(chat, new RegExp(`\\b${name}\\b`), `useRoomChat must expose ${name}`);
        }
        assert.match(panel, /id="endChatBtn"/);
        assert.match(panel, /chat\.openEndChatDialog\(\)/);
        assert.match(panel, /chat\.confirmEndChat\(\)/);
        assert.match(panel, /chat\.closeEndChatDialog\(\)/);
        // Every end-chat state renders in the centred overlay.
        assert.match(panel, /v-if="endChat\.visible"/);
        assert.match(panel, /class="endchat-backdrop"/);
        assert.match(panel, /v-if="!diaryPreviewOpen"/);
        assert.match(panel, /class="endchat-card"/);
        assert.match(panel, /class="diary-preview-card"/);
        assert.match(panel, /role="dialog"/);
    });

    it('registers the diary panel with the room panel system', () => {
        const panels = source('src/frontend/composables/useRoomPanels.js');
        const page = source('src/frontend/pages/RoomPage.vue');
        const state = source('src/frontend/composables/room/useRoomState.js');

        // \u65e5\u8bb0 === 日记
        assert.match(panels, /\{ id: 'diaryPanel', label: '\\u65e5\\u8bb0', icon: 'book' \}/);
        assert.match(panels, /diaryPanel: \{ top: .*right: .* \}/);
        assert.match(panels, /diaryPanel: false,/);
        assert.match(page, /import RoomDiaryPanel from '\.\.\/components\/room\/RoomDiaryPanel\.vue';/);
        assert.match(page, /<RoomDiaryPanel[\s\S]*:diary="room\.diary"/);
        assert.match(state, /const diary = useRoomDiary\(\);/);
        assert.match(state, /useRoomChat\(\{ live2d, world, diary \}\)/);
    });
});
