const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const strip = (code) => code
    .replace(/^import [\s\S]*?from '[^']*';$/gm, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export async function /gm, 'async function ');

function storage() {
    const values = new Map();
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key)
    };
}

function server() {
    const entries = new Map();
    let metadata = null;
    let revision = 0;
    let available = true;
    let writes = 0;
    function response(status, data = null, message = '') {
        return { ok: status < 400, status, body: { success: status < 400, data, message } };
    }
    return {
        entries,
        get writes() { return writes; },
        set available(value) { available = value; },
        async fetch(url, options = {}) {
            if (!available) throw new Error('offline');
            const [pathname, search = ''] = String(url).split('?');
            const method = options.method || 'GET';
            const body = options.body ? JSON.parse(options.body) : {};
            if (pathname === '/api/room/diary' && method === 'GET') {
                const cursor = new URLSearchParams(search).get('cursor') || '';
                const rows = [...entries.entries()].filter(([id]) => id > cursor).sort(([a], [b]) => a.localeCompare(b));
                const page = rows.slice(0, 100);
                return response(200, {
                    userId: 'user-1',
                    entries: page.map(([diaryId, entry]) => ({ diaryId, deleted: entry == null, entry })),
                    nextCursor: rows.length > 100 ? page.at(-1)[0] : null
                });
            }
            if (pathname === '/api/room/diary/sync' && method === 'POST') {
                if (body.expectedUserId !== 'user-1') return response(409);
                writes++;
                for (const id of body.deletedIds) entries.set(id, null);
                for (const entry of body.entries) if (!entries.has(entry.diaryId)) entries.set(entry.diaryId, entry);
                return response(200, {});
            }
            if (pathname === '/api/room/diary' && method === 'DELETE') {
                writes++;
                for (const id of entries.keys()) entries.set(id, null);
                return response(200, {});
            }
            if (pathname === '/api/room/diary/metadata' && method === 'GET') {
                return response(200, { userId: 'user-1', metadata, revision });
            }
            if (pathname === '/api/room/diary/metadata' && method === 'PUT') {
                if (body.expectedUserId !== 'user-1' || body.expectedRevision !== revision) return response(409);
                writes++;
                metadata = body.metadata;
                revision++;
                return response(200, { revision });
            }
            throw new Error(`Unexpected ${method} ${pathname}`);
        }
    };
}

function device(sharedServer, userId = 'user-1') {
    const localStorage = storage();
    let currentUserId = userId;
    const context = {
        localStorage, console, Date, JSON, Number, String, Math, Object, Array,
        Boolean, Promise, Map, Set, URLSearchParams,
        crypto: { randomUUID: () => `diary-${Math.random().toString(36).slice(2)}` },
        getSession: () => currentUserId ? { user: { id: currentUserId } } : null,
        authFetch: (...args) => sharedServer.fetch(...args),
        parseResponse: async (response) => response.body,
        window: { dispatchEvent() {}, setTimeout() {} },
        CustomEvent: class CustomEvent { constructor(name, options) { this.name = name; this.detail = options.detail; } }
    };
    const script = [
        strip(source('src/frontend/services/room/roomStorage.js')),
        strip(source('src/frontend/services/room/roomDiaryArchive.js')),
        strip(source('src/frontend/services/room/roomDiarySync.js')),
        'globalThis.api = { syncDiaryArchive, readDiaryArchive, writeDiaryArchive, appendDiaryEntry, deleteDiaryEntry, updatePersonaPrompt, clearDiaryArchive };'
    ].join('\n');
    vm.runInNewContext(script, context);
    return { api: context.api, localStorage, setUser(id) { currentUserId = id; } };
}

it('migrates a local diary across devices and a deletion cannot be resurrected offline', async () => {
    const cloud = server();
    const first = device(cloud);
    const second = device(cloud);
    first.api.appendDiaryEntry({ content: '旧设备保存的完整日记', diaryId: 'old-entry' });
    first.api.updatePersonaPrompt({ data: { name: 'Aoi' } });
    await first.api.syncDiaryArchive();
    await second.api.syncDiaryArchive();
    assert.equal(second.api.readDiaryArchive().data.diary[0].content, '旧设备保存的完整日记');
    assert.equal(second.api.readDiaryArchive().data.prompts['yachiyo-default'].data.name, 'Aoi');

    cloud.available = false;
    second.api.deleteDiaryEntry('old-entry');
    await assert.rejects(second.api.syncDiaryArchive(), /offline/);
    assert.equal(second.api.readDiaryArchive().data.diary.length, 0);
    cloud.available = true;
    await second.api.syncDiaryArchive();
    await first.api.syncDiaryArchive();
    assert.equal(first.api.readDiaryArchive().data.diary.length, 0);
    assert.equal(cloud.entries.get('old-entry'), null);
});

it('refuses to upload browser data when the authenticated server owner differs', async () => {
    const cloud = server();
    const browser = device(cloud, 'stale-user');
    browser.api.appendDiaryEntry({ content: '其他账号的日记', diaryId: 'private-entry' });
    await assert.rejects(browser.api.syncDiaryArchive(), /账号与本机存档不一致/);
    assert.equal(cloud.writes, 0);
    assert.equal(cloud.entries.size, 0);
});

it('clearing an account archive resets its diary-only persona on another device', async () => {
    const cloud = server();
    const first = device(cloud);
    const second = device(cloud);
    first.api.appendDiaryEntry({ content: '待清空的日记', diaryId: 'clear-entry' });
    first.api.updatePersonaPrompt({ data: { name: 'Aoi' } });
    await first.api.syncDiaryArchive();
    await second.api.syncDiaryArchive();
    second.api.clearDiaryArchive();
    await second.api.syncDiaryArchive();
    await first.api.syncDiaryArchive();
    assert.equal(first.api.readDiaryArchive().data.diary.length, 0);
    assert.equal(first.api.readDiaryArchive().data.prompts['yachiyo-default'].data.name, '八千代');
    assert.equal(cloud.entries.get('clear-entry'), null);
});
