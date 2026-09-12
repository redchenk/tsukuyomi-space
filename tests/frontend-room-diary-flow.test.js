/**
 * Integration check for the "结束聊天 → 生成日记 → 写入混合 JSON" flow.
 *
 * Loads the real archive + generation modules in a VM with a stubbed LLM, then
 * drives the same sequence useRoomChat.confirmEndChat performs, and finally
 * asserts the persisted document matches the desktop backup schema.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = process.cwd();
const src = (p) => fs.readFileSync(path.join(rootDir, p), 'utf8');
const strip = (code) => code
    .replace(/^import [\s\S]*?from '[^']*';$/gm, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export async function /gm, 'async function ')
    .replace(/^export \{[\s\S]*?\};?$/gm, '');

const store = new Map();
const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};

localStorage.setItem('roomLLMSettings', JSON.stringify({
    apiUrl: 'https://api.deepseek.com/chat/completions',
    apiKey: 'test-key',
    model: 'deepseek-v4-flash'
}));

const context = {
    console, Date, JSON, Number, String, Math, Object, Array, Boolean, URL, Promise, RegExp,
    localStorage,
    window: { location: { origin: 'https://example.test' }, setTimeout: () => 0 },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
    getSession: () => null,
    crypto: { randomUUID: () => `uuid-${(store.size + 1)}` },
    Blob: function Blob() {},
    fetch: async () => { throw new Error('unexpected raw fetch'); }
};

const code = [
    strip(src('src/frontend/services/room/roomStorage.js')),
    strip(src('src/frontend/services/room/localOllamaTransport.js')),
    strip(src('src/frontend/services/room/roomDiaryArchive.js')),
    strip(src('src/frontend/services/room/roomDiaryGeneration.js')),
    'globalThis.__api = { readDiaryArchive, writeDiaryArchive, appendDiaryEntry, generateDiaryEntry, activePersonaPrompt, updatePersonaPrompt, parseDiaryArchive, serializeDiaryArchive, diaryArchiveKey, archiveFileName, diarySortKey };'
].join('\n');

vm.runInNewContext(code, context, { filename: 'roomDiary.integration.js' });
const api = context.__api;

(async () => {
    // 1. Fresh archive starts empty but valid.
    let archive = api.readDiaryArchive();
    assert.equal(archive.data.diary.length, 0);
    assert.equal(api.diaryArchiveKey(), 'roomDiaryArchive:guest');

    // 2. Persona edit is reflected in the same document.
    api.updatePersonaPrompt({ data: { name: '八千代', personality: '温柔、爱开玩笑', description: '月读空间的管理员' } });
    assert.equal(api.activePersonaPrompt(api.readDiaryArchive()).data.name, '八千代');

    // 3. A finished conversation + stubbed LLM produces a diary body.
    const sessionMessages = [
        { role: 'user', content: '今天陪你走了很久的路' },
        { role: 'assistant', content: '其实我一直在等你开口呢～' },
        { role: 'user', content: '下次还来' }
    ];
    const generated = await api.generateDiaryEntry(sessionMessages, {
        now: new Date(2026, 8, 3, 20, 51, 0),
        fetchImpl: async (url, options) => {
            const body = JSON.parse(options.body);
            assert.equal(body.model, 'deepseek-v4-flash');
            assert.match(body.messages[0].content, /你是「八千代」/);
            assert.match(body.messages[1].content, /今天陪你走了很久的路/);
            return {
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: '【日记】\n\n今天陪你走了很久的路，风很轻。你说下次还来，我把这句话收进了口袋里。' } }]
                })
            };
        }
    });
    assert.equal(generated.conversationLength, 3);

    // 4. Persist exactly like the room does.
    const { entry } = api.appendDiaryEntry({
        content: generated.body,
        conversationLength: generated.conversationLength,
        mode: 'Deepseek'
    }, { now: new Date(2026, 8, 3, 20, 51, 19) });

    // 5. The stored document matches the desktop backup schema.
    archive = api.readDiaryArchive();
    assert.equal(archive.data.diary.length, 1);
    assert.equal(entry.date, '2026/9/3');
    assert.equal(entry.time, '20:51:19');
    assert.match(entry.content, /^【日记】\n\n今天陪你走了很久的路/);
    assert.match(entry.content, /【日记书写时间为2026年9月3日20点51分】$/);
    assert.equal(archive.data.gameData.characterStats.affection, 0);
    assert.equal(archive.data.prompts['yachiyo-default'].data.name, '八千代');

    const serialized = JSON.parse(api.serializeDiaryArchive(archive));
    for (const key of ['version', 'timestamp', 'exportDate', 'slotId', 'data']) {
        assert.ok(key in serialized, `top-level "${key}" missing`);
    }
    for (const key of ['gameData', 'diary', 'settings', 'prompts', 'other']) {
        assert.ok(key in serialized.data, `data.${key} missing`);
    }

    // 6. Round-trip through export/import keeps the entry.
    const reimported = api.parseDiaryArchive(api.serializeDiaryArchive(archive));
    assert.equal(reimported.data.diary.length, 1);
    assert.equal(reimported.data.diary[0].content, entry.content);

    // 7. Importing a multi-entry backup, then appending, keeps both.
    //    Built inline so the test never depends on a local file.
    const backupEntries = Array.from({ length: 12 }, (_, i) => ({
        timestamp: 1700000000000 + i * 86400000,
        date: `2023/11/${String(i + 1).padStart(2, '0')}`,
        time: '20:00:00',
        affection: 100 + i,
        content: `【日记】\n\n第 ${i + 1} 篇示例日记。\n\n\n\n【日记书写时间为2023年11月${i + 1}日20点】`,
        conversationLength: 0,
        mode: 'test',
        diaryId: `backup-${i}`
    }));
    // One entry with no usable timestamp, mirroring real desktop exports.
    backupEntries.push({
        date: '2023/12/01',
        time: '09:00:00',
        affection: 999,
        content: '【日记】\n\n没有时间戳的一篇。',
        conversationLength: 0,
        mode: 'test',
        diaryId: 'backup-no-timestamp'
    });

    const backup = JSON.stringify({
        version: '1.0.0',
        timestamp: 1700000000000,
        exportDate: '2023-11-14T22:13:20.000Z',
        slotId: 2,
        data: {
            gameData: { characterStats: { affection: 999, trust: 50 } },
            diary: backupEntries,
            settings: {},
            prompts: {
                'sample-persona': {
                    id: 'sample-persona',
                    spec: 'chara_card_v2',
                    spec_version: '2.0',
                    data: { name: 'Aoi', description: '示例角色', personality: '安静', scenario: '书店', tags: ['示例'] }
                }
            },
            other: {}
        }
    });

    api.writeDiaryArchive(api.parseDiaryArchive(backup));
    const before = api.readDiaryArchive();
    assert.equal(before.data.diary.length, 13);
    assert.equal(api.activePersonaPrompt(before).data.name, 'Aoi');

    const second = await api.generateDiaryEntry(sessionMessages, {
        persona: api.activePersonaPrompt(before),
        now: new Date(2026, 8, 3, 22, 10, 0),
        fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '今天也把心事轻轻写下来了，窗外的月亮很圆，我想把这句话留到明天再讲给你听。' } }] }) })
    });
    const appended = api.appendDiaryEntry(
        { content: second.body, conversationLength: second.conversationLength, mode: 'test' },
        { now: new Date(2026, 8, 3, 22, 10, 30) }
    );

    const after = api.readDiaryArchive();
    assert.equal(after.data.diary.length, 14, 'existing entries must be preserved');
    const mine = after.data.diary.find((item) => item.diaryId === appended.entry.diaryId);
    assert.ok(mine, 'the new diary entry must be present');
    assert.equal(mine.date, '2026/9/3');
    assert.equal(after.data.diary[after.data.diary.length - 1].diaryId, appended.entry.diaryId, 'newest entry sorts last');
    assert.equal(after.data.diary[0].content, before.data.diary[0].content, 'oldest entry untouched');
    assert.equal(api.activePersonaPrompt(after).data.name, 'Aoi', 'persona preserved');
    assert.equal(after.slotId, 2, 'slot preserved');
    assert.equal(api.archiveFileName(after, new Date(2026, 8, 3, 12, 52, 27)), 'Aoi_槽位2_备份_2026-09-03T12-52-27.json');

    // 8. Regression: a backup can contain entries with no usable `timestamp`
    //    (they would all collapse onto Date.now()), so ordering must follow the
    //    date/time header rather than the raw timestamp.
    const backupRaw = JSON.parse(backup);
    const missingStamps = backupRaw.data.diary.filter((item) => !(Number(item.timestamp) > 0));
    assert.ok(missingStamps.length > 0, 'fixture should contain entries without a timestamp');
    const keys = after.data.diary.map((item) => api.diarySortKey(item));
    for (let i = 1; i < keys.length; i += 1) {
        assert.ok(keys[i] >= keys[i - 1], `diary ordering broken at index ${i}`);
    }
    assert.ok(
        missingStamps.every((item) => api.diarySortKey(item) > 0),
        'entries without a timestamp must still get a usable sort key'
    );

    console.log('INTEGRATION OK');
    console.log('  fresh diary entries      :', archive.data.diary.length);
    console.log('  entry header             :', entry.date, entry.time, 'affection=' + entry.affection);
    console.log('  after backup import      :', before.data.diary.length, 'entries, persona=' + api.activePersonaPrompt(before).data.name);
    console.log('  after new diary appended :', after.data.diary.length, 'entries');
    console.log('  exported filename        :', api.archiveFileName(after, new Date(2026, 8, 3, 12, 52, 27)));
})().catch((error) => {
    console.error('INTEGRATION FAILED:', error.message);
    process.exit(1);
});
