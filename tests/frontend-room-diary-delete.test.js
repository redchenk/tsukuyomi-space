/**
 * Deleting one diary entry at a time from the diary panel.
 *
 * Deletion must remove exactly the chosen entry and leave everything else —
 * other entries, the persona, the slot and the mirrored affection — intact.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const source = (p) => fs.readFileSync(path.join(rootDir, p), 'utf8');

function createStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
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

function loadArchive(storage = createStorage()) {
    const context = {
        localStorage: storage, console, Date, JSON, Number, String, Math, Object, Array, Boolean,
        window: { setTimeout: () => 0, location: { origin: 'https://example.test' }, dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} },
        document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
        getSession: () => null,
        crypto: { randomUUID: () => 'uuid' },
        Blob: function Blob() {},
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
        CustomEvent: function CustomEvent() {},
        fetch: async () => { throw new Error('no net'); }
    };
    const code = `${stripExports(source('src/frontend/services/room/roomStorage.js'))}\n`
        .concat(stripExports(source('src/frontend/services/room/roomDiaryArchive.js')))
        .concat(`
globalThis.__a = {
    readDiaryArchive, writeDiaryArchive, deleteDiaryEntry, listPersonaPrompts,
    activePersonaId, selectPersonaPrompt, serializeDiaryArchive, parseDiaryArchive
};
`);
    vm.runInNewContext(code, context, { filename: 'archive.js' });
    return { archive: context.__a, storage };
}

function backupWith(count = 5) {
    return {
        version: '1.0.0', timestamp: 1700000000000, exportDate: '2023-11-14T22:13:20.000Z', slotId: 3,
        data: {
            gameData: { characterStats: { affection: 777, trust: 88 } },
            diary: Array.from({ length: count }, (_, i) => ({
                timestamp: 1700000000000 + i * 86400000,
                date: `2026/9/${i + 1}`,
                time: `${String(9 + i).padStart(2, '0')}:00:00`,
                affection: 700 + i,
                content: `【日记】\n\n第 ${i + 1} 篇。\n\n\n\n【日记书写时间为2026年9月${i + 1}日】`,
                conversationLength: 0,
                mode: 'test',
                diaryId: `entry-${i}`
            })),
            settings: {},
            prompts: {
                'sample-persona': { id: 'sample-persona', data: { name: 'Aoi', description: '书店店员' } },
                'other-persona': { id: 'other-persona', data: { name: 'Yuki', description: '兽耳' } }
            },
            other: {}
        }
    };
}

describe('deleting a single diary entry', () => {
    it('removes exactly the chosen entry', () => {
        const { archive } = loadArchive();
        archive.parseDiaryArchive(JSON.stringify(backupWith(5)));
        archive.writeDiaryArchive(archive.parseDiaryArchive(JSON.stringify(backupWith(5))));

        const before = archive.readDiaryArchive().data.diary.length;
        archive.deleteDiaryEntry('entry-2');

        const after = archive.readDiaryArchive().data.diary;
        assert.equal(after.length, before - 1, 'exactly one entry removed');
        assert.ok(!after.some((e) => e.diaryId === 'entry-2'), 'the chosen entry is gone');
        for (const id of ['entry-0', 'entry-1', 'entry-3', 'entry-4']) {
            assert.ok(after.some((e) => e.diaryId === id), `${id} must survive`);
        }
    });

    it('keeps the remaining entries in chronological order', () => {
        const { archive } = loadArchive();
        archive.writeDiaryArchive(archive.parseDiaryArchive(JSON.stringify(backupWith(5))));
        archive.deleteDiaryEntry('entry-0');
        archive.deleteDiaryEntry('entry-3');

        const ids = archive.readDiaryArchive().data.diary.map((e) => e.diaryId);
        assert.deepEqual(Array.from(ids), ['entry-1', 'entry-2', 'entry-4']);
    });

    it('leaves personas, slot and affection untouched', () => {
        const { archive } = loadArchive();
        archive.writeDiaryArchive(archive.parseDiaryArchive(JSON.stringify(backupWith(4))));
        archive.selectPersonaPrompt('other-persona');

        archive.deleteDiaryEntry('entry-1');

        const result = archive.readDiaryArchive();
        assert.equal(result.slotId, 3);
        assert.equal(result.data.gameData.characterStats.affection, 777);
        assert.equal(result.data.gameData.characterStats.trust, 88);
        assert.equal(archive.listPersonaPrompts().length, 2, 'both personas remain');
        assert.equal(archive.activePersonaId(), 'other-persona', 'selection is preserved');
    });

    it('can delete every entry one by one', () => {
        const { archive } = loadArchive();
        archive.writeDiaryArchive(archive.parseDiaryArchive(JSON.stringify(backupWith(3))));

        for (const id of ['entry-0', 'entry-1', 'entry-2']) {
            archive.deleteDiaryEntry(id);
        }

        assert.equal(archive.readDiaryArchive().data.diary.length, 0);
    });

    it('persists the deletion across a reload', () => {
        const { archive, storage } = loadArchive();
        archive.writeDiaryArchive(archive.parseDiaryArchive(JSON.stringify(backupWith(3))));
        archive.deleteDiaryEntry('entry-1');

        const reloaded = loadArchive(storage);
        const ids = reloaded.archive.readDiaryArchive().data.diary.map((e) => e.diaryId);
        assert.deepEqual(Array.from(ids), ['entry-0', 'entry-2']);
    });

    it('round-trips a deletion through export', () => {
        const { archive } = loadArchive();
        archive.writeDiaryArchive(archive.parseDiaryArchive(JSON.stringify(backupWith(4))));
        archive.deleteDiaryEntry('entry-2');

        const text = archive.serializeDiaryArchive();
        const other = loadArchive();
        const reloaded = other.archive.parseDiaryArchive(text);
        assert.equal(reloaded.data.diary.length, 3);
        assert.ok(!reloaded.data.diary.some((e) => e.diaryId === 'entry-2'));
    });

    it('refuses an unknown id instead of reporting success', () => {
        const { archive } = loadArchive();
        archive.writeDiaryArchive(archive.parseDiaryArchive(JSON.stringify(backupWith(3))));

        assert.throws(() => archive.deleteDiaryEntry('entry-nope'), /没有找到这篇日记/);
        assert.throws(() => archive.deleteDiaryEntry(''), /缺少日记标识/);
        assert.throws(() => archive.deleteDiaryEntry(null), /缺少日记标识/);
        assert.equal(archive.readDiaryArchive().data.diary.length, 3, 'nothing was removed');
    });

    it('handles an archive that has no diary array', () => {
        const { archive } = loadArchive();
        archive.writeDiaryArchive({
            version: '1.0.0', timestamp: 1, exportDate: '2026-01-01T00:00:00.000Z', slotId: 1,
            data: { gameData: { characterStats: { affection: 0, trust: 0 } }, diary: [], settings: {}, prompts: {}, other: {} }
        });
        assert.throws(() => archive.deleteDiaryEntry('anything'), /没有找到这篇日记/);
    });
});

describe('delete wiring', () => {
    it('exposes the deletion in the diary view-model', () => {
        const code = source('src/frontend/composables/room/useRoomDiary.js');
        assert.match(code, /deleteDiaryEntry/);
        assert.match(code, /function deleteEntry\(entry\)/);
        assert.match(code, /^\s*deleteEntry,$/m);
        // The selection must stay valid after the list shrinks.
        assert.match(code, /if \(!entries\.value\.some\(\(item\) => item\.diaryId === selectedId\.value\)\)/);
    });

    it('renders a delete control per row and in the detail view', () => {
        const panel = source('src/frontend/components/room/RoomDiaryPanel.vue');
        assert.match(panel, /class="diary-list-delete"/);
        assert.match(panel, /@click\.stop="requestDelete\(entry\)"/);
        assert.match(panel, /class="diary-detail-delete"/);
        assert.match(panel, /@click="requestDelete\(selected\)"/);
        assert.match(panel, /props\.diary\.deleteEntry\?\.\(entry\)/);
        // Rows must not be buttons, or the nested delete button would be invalid.
        assert.match(panel, /<button class="diary-entry-select" type="button"/);
        assert.doesNotMatch(panel, /<button[\s\S]{0,300}?class="diary-list-item"/);
    });

    it('asks for confirmation before deleting', () => {
        const panel = source('src/frontend/components/room/RoomDiaryPanel.vue');
        assert.match(panel, /if \(!window\.confirm\(/);
        assert.match(panel, /此操作不可撤销/);
    });
});
