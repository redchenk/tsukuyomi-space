/**
 * Multi-persona selection, verified against the user's real archive.
 *
 * The backup carries 10 personas that mostly share one display name, so the
 * archive key is the identifier and switching must change what the room uses.
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
    readDiaryArchive, writeDiaryArchive, parseDiaryArchive, importDiaryArchive,
    listPersonaPrompts, activePersonaPrompt, activePersonaId, selectPersonaPrompt,
    updatePersonaPrompt, personaDisplayName, serializeDiaryArchive, DIARY_ARCHIVE_UPDATED_EVENT
};
`);
    vm.runInNewContext(code, context, { filename: 'archive.js' });
    return { archive: context.__a, storage };
}

/** Builds a backup shaped like a real one: several personas, one display name. */
function multiPersonaBackup() {
    const ids = [
        ['sister-null', '小雪', ['妹妹', '未婚妻']],
        ['sister-verylow', 'Yuki', ['毒舌']],
        ['sister-low', 'Yuki', ['内向']],
        ['sister-medium', 'Yuki', ['可爱']],
        ['sister-high', 'Yuki', ['未婚妻']],
        ['sister-dilei', 'Yuki', ['地雷系']],
        ['sister-kindergarten', 'Yuki', ['幼儿园']],
        ['sister-tutor', 'Yuki', ['家教']],
        ['sister-kemonomimi', 'Yuki', ['兽耳']],
        ['sister-kemonomimi-cat', 'Yuki', ['伶鼬']]
    ];
    const prompts = {};
    for (const [id, name, tags] of ids) {
        prompts[id] = {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name,
                description: `${id} 的设定描述`,
                personality: `${id} 的性格`,
                scenario: `${id} 的情境`,
                creator_notes: `${id} 的扮演指南`,
                tags
            }
        };
    }
    return {
        version: '1.0.0', timestamp: 1700000000000, exportDate: '2023-11-14T22:13:20.000Z', slotId: 1,
        data: {
            gameData: { characterStats: { affection: 1000, trust: 100 } },
            diary: [{ timestamp: 1700000000000, date: '2026/9/13', time: '20:00:00', affection: 1000, content: '【日记】\n\n示例。', conversationLength: 0, mode: 'test', diaryId: 'd1' }],
            settings: {}, prompts, other: {}
        }
    };
}

describe('multi-persona archives', () => {
    it('lists every persona, not just the first', () => {
        const { archive } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));

        const list = archive.listPersonaPrompts();
        assert.equal(list.length, 10, 'all ten personas must be listed');
        assert.deepEqual(
            Array.from(list, (item) => item.id),
            ['sister-null', 'sister-verylow', 'sister-low', 'sister-medium', 'sister-high',
                'sister-dilei', 'sister-kindergarten', 'sister-tutor', 'sister-kemonomimi', 'sister-kemonomimi-cat']
        );
        // Nine of them share the display name, so labels must carry the key.
        assert.equal(list[0].label, '小雪 · sister-null');
        assert.equal(list[9].label, 'Yuki · sister-kemonomimi-cat');
        assert.equal(new Set(Array.from(list, (item) => item.label)).size, 10, 'labels must be unique');
    });

    it('defaults to the first named persona without a selection', () => {
        const { archive } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));
        assert.equal(archive.activePersonaId(), 'sister-null');
        assert.equal(archive.activePersonaPrompt().data.name, '小雪');
    });

    it('switches to a chosen persona and remembers it', () => {
        const { archive, storage } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));

        archive.selectPersonaPrompt('sister-kemonomimi-cat');

        assert.equal(archive.activePersonaId(), 'sister-kemonomimi-cat');
        assert.equal(archive.activePersonaPrompt().data.name, 'Yuki');
        assert.equal(archive.activePersonaPrompt().data.personality, 'sister-kemonomimi-cat 的性格');
        assert.match(archive.activePersonaPrompt().data.creator_notes, /sister-kemonomimi-cat/);

        // Must survive a reload.
        const reloaded = loadArchive(storage);
        assert.equal(reloaded.archive.activePersonaId(), 'sister-kemonomimi-cat');
        assert.equal(reloaded.archive.activePersonaPrompt().data.personality, 'sister-kemonomimi-cat 的性格');
    });

    it('marks exactly one persona active', () => {
        const { archive } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));
        archive.selectPersonaPrompt('sister-tutor');
        const list = archive.listPersonaPrompts();
        assert.equal(list.filter((item) => item.isActive).length, 1);
        assert.equal(list.find((item) => item.isActive).id, 'sister-tutor');
    });

    it('routes the diary prompt through the selected persona', () => {
        const { archive } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));
        archive.selectPersonaPrompt('sister-kindergarten');
        const persona = archive.activePersonaPrompt();
        assert.equal(persona.data.scenario, 'sister-kindergarten 的情境');
        assert.equal(archive.personaDisplayName(), 'Yuki');
    });

    it('edits the selected persona, not the first one', () => {
        const { archive } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));
        archive.selectPersonaPrompt('sister-tutor');

        archive.updatePersonaPrompt({ data: { name: '家教小雪' } });

        assert.equal(archive.activePersonaPrompt().data.name, '家教小雪');
        const all = archive.listPersonaPrompts();
        assert.equal(all.find((item) => item.id === 'sister-tutor').name, '家教小雪');
        // The untouched first persona keeps its own name.
        assert.equal(all.find((item) => item.id === 'sister-null').name, '小雪');
    });

    it('rejects an unknown persona id instead of silently falling back', () => {
        const { archive } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));
        assert.throws(() => archive.selectPersonaPrompt('sister-nope'), /没有这个人设/);
        assert.throws(() => archive.selectPersonaPrompt(''), /没有这个人设/);
        assert.equal(archive.activePersonaId(), 'sister-null', 'selection must be unchanged');
    });

    it('survives a round trip through export and import', () => {
        const { archive } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));
        archive.selectPersonaPrompt('sister-dilei');
        const text = archive.serializeDiaryArchive();

        const other = loadArchive();
        other.archive.importDiaryArchive(text);
        assert.equal(other.archive.activePersonaId(), 'sister-dilei');
        assert.equal(other.archive.listPersonaPrompts().length, 10);
    });

    it('falls back safely when a new file lacks the previously selected id', () => {
        const { archive } = loadArchive();
        archive.importDiaryArchive(JSON.stringify(multiPersonaBackup()));
        archive.selectPersonaPrompt('sister-dilei');

        // Import a file that only has a different persona.
        archive.importDiaryArchive(JSON.stringify({
            version: '1.0.0', timestamp: 1, exportDate: '2026-01-01T00:00:00.000Z', slotId: 2,
            data: {
                gameData: { characterStats: { affection: 1, trust: 1 } },
                diary: [],
                settings: {},
                prompts: { 'other-persona': { data: { name: 'Aoi' } } },
                other: {}
            }
        }));

        assert.equal(archive.activePersonaId(), 'other-persona');
        assert.equal(archive.activePersonaPrompt().data.name, 'Aoi');
    });
});

