const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function assertNoRawRoomMemoryFetch(relativePath) {
    const code = source(relativePath);
    assert.doesNotMatch(
        code,
        /fetch\(\s*(?:`|'|")\/api\/room\/(?:memory|persona-memory)/,
        `${relativePath} must use the shared API client for room memory endpoints`
    );
}

describe('frontend room memory API client usage', () => {
    it('routes chat memory requests through the shared API client', () => {
        const code = source('src/frontend/composables/room/useRoomChat.js');

        assert.match(code, /import \{ authFetch, authHeaders, noStoreUrl, parseResponse \} from '\.\.\/\.\.\/api\/client';/);
        assert.match(code, /authFetch\(noStoreUrl\(`\/api\/room\/memory\?\$\{params\}`\)/);
        assert.match(code, /authFetch\(noStoreUrl\(`\/api\/room\/persona-memory\?\$\{params\}`\)/);
        assert.match(code, /authFetch\('\/api\/room\/memory'/);
        assert.match(code, /tsukuyomi:room-memory-updated/);
        assertNoRawRoomMemoryFetch('src/frontend/composables/room/useRoomChat.js');
    });

    it('routes settings memory management through the shared API client', () => {
        const code = source('src/frontend/pages/RoomSettingsPage.vue');

        assert.match(code, /import \{ authFetch, authHeaders, getSession, noStoreUrl, parseResponse \} from '\.\.\/api\/client';/);
        assert.match(code, /return getSession\(\)\?\.user \|\| null;/);
        assert.match(code, /authFetch\(noStoreUrl\('\/api\/room\/memory\/status'\)/);
        assert.match(code, /authFetch\(noStoreUrl\(`\/api\/room\/memory\?\$\{params\}`\)/);
        assert.match(code, /window\.addEventListener\('tsukuyomi:room-memory-updated', onRoomMemoryUpdated\)/);
        assertNoRawRoomMemoryFetch('src/frontend/pages/RoomSettingsPage.vue');
    });
});
