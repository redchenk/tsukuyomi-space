const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

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

function createStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
}

function jsonResponse(status, body) {
    return {
        status,
        text: async () => JSON.stringify(body)
    };
}

function loadApiClient(fetchImpl) {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    const context = {
        localStorage,
        sessionStorage,
        navigator: {},
        fetch: fetchImpl,
        Date,
        JSON,
        Number,
        String,
        URL
    };
    const code = source('src/frontend/api/client.js')
        .replace(/export async function /g, 'async function ')
        .replace(/export function /g, 'function ')
        .concat('\nglobalThis.__client = { getSession, saveUserSession, clearSession, loadCurrentSession };\n');

    vm.runInNewContext(code, context, { filename: 'src/frontend/api/client.js' });

    return {
        client: context.__client,
        localStorage,
        setFetch(nextFetch) {
            context.fetch = nextFetch;
        }
    };
}

describe('frontend room memory API client usage', () => {
    it('routes chat memory requests through the shared API client', () => {
        const code = source('src/frontend/composables/room/useRoomChat.js');

        assert.match(code, /import \{ apiFetch, authFetch, authHeaders, noStoreUrl, parseResponse \} from '\.\.\/\.\.\/api\/client';/);
        assert.match(code, /authFetch\(noStoreUrl\(`\/api\/room\/memory\?\$\{params\}`\)/);
        assert.match(code, /authFetch\(noStoreUrl\(`\/api\/room\/persona-memory\?\$\{params\}`\)/);
        assert.match(code, /authFetch\('\/api\/room\/memory'/);
        assert.match(code, /tsukuyomi:room-memory-updated/);
        assertNoRawRoomMemoryFetch('src/frontend/composables/room/useRoomChat.js');
    });

    it('routes settings memory management through the shared API client', () => {
        const code = source('src/frontend/pages/RoomSettingsPage.vue');

        assert.match(code, /import \{ apiFetch, apiUrl, authFetch, authHeaders, getSession, noStoreUrl, parseResponse \} from '\.\.\/api\/client';/);
        assert.match(code, /return getSession\(\)\?\.user \|\| null;/);
        assert.match(code, /authFetch\(noStoreUrl\('\/api\/room\/memory\/status'\)/);
        assert.match(code, /authFetch\(noStoreUrl\(`\/api\/room\/memory\?\$\{params\}`\)/);
        assert.match(code, /window\.addEventListener\('tsukuyomi:room-memory-updated', onRoomMemoryUpdated\)/);
        assertNoRawRoomMemoryFetch('src/frontend/pages/RoomSettingsPage.vue');
    });
});

describe('frontend session refresh resilience', () => {
    it('keeps a cached user when the session refresh is interrupted', async () => {
        const env = loadApiClient(async () => {
            throw new Error('navigation aborted');
        });
        env.localStorage.setItem('tsukuyomi_user', JSON.stringify({ username: 'mobile-user' }));

        const session = await env.client.loadCurrentSession();

        assert.equal(session.user.username, 'mobile-user');
        assert.ok(env.localStorage.getItem('tsukuyomi_user'));
    });

    it('clears a cached user only for explicit auth failures', async () => {
        const env = loadApiClient(async () => jsonResponse(401, {
            success: false,
            code: 'TOKEN_EXPIRED'
        }));
        env.localStorage.setItem('tsukuyomi_user', JSON.stringify({ username: 'expired-user' }));

        const session = await env.client.loadCurrentSession();

        assert.equal(session, null);
        assert.equal(env.localStorage.getItem('tsukuyomi_user'), null);
    });

    it('lets a non-clearing concurrent refresh protect the shared request', async () => {
        let release;
        const response = new Promise((resolve) => {
            release = () => resolve(jsonResponse(401, {
                success: false,
                code: 'TOKEN_EXPIRED'
            }));
        });
        const env = loadApiClient(async () => response);
        env.localStorage.setItem('tsukuyomi_user', JSON.stringify({ username: 'route-user' }));

        const clearingRefresh = env.client.loadCurrentSession({ allowClear: true });
        const protectedRefresh = env.client.loadCurrentSession({ allowClear: false });
        release();

        const [clearingSession, protectedSession] = await Promise.all([clearingRefresh, protectedRefresh]);

        assert.equal(clearingSession.user.username, 'route-user');
        assert.equal(protectedSession.user.username, 'route-user');
        assert.ok(env.localStorage.getItem('tsukuyomi_user'));
    });

    it('trusts a just-saved session through a transient auth mismatch', async () => {
        const env = loadApiClient(async () => jsonResponse(401, {
            success: false,
            code: 'UNAUTHORIZED'
        }));
        env.client.saveUserSession('', { username: 'fresh-user' });

        const session = await env.client.loadCurrentSession();

        assert.equal(session.user.username, 'fresh-user');
        assert.ok(env.localStorage.getItem('tsukuyomi_user'));
    });
});

describe('room Live2D mobile quality parity', () => {
    it('keeps the room renderer on the full desktop profile for every device', () => {
        const bridge = source('src/frontend/services/room/live2dBridge.js');
        const roomRuntime = source('src/live2d/main-room.ts');
        const subdelegate = source('src/live2d/lappsubdelegate.ts');
        const manager = source('src/live2d/lapplive2dmanager.ts');
        const textures = source('src/live2d/lapptexturemanager.ts');
        const model = source('src/live2d/lappmodel.ts');

        assert.match(bridge, /export function live2DPerformanceMode\(\) \{\s*return 'standard';\s*\}/);
        assert.doesNotMatch(bridge, /isConstrainedMobileLive2DDevice|lowQualityModel|tsukimi-yachiyo-(?:mobile|lite)\.model3\.json/);
        assert.doesNotMatch(roomRuntime, /targetFrameMs|lastRenderAt|pendingPointerMove|lowPower|1000 \/ 30|1000 \/ 60|dataset\.performance/);
        assert.match(subdelegate, /return window\.devicePixelRatio \|\| 1;/);
        assert.doesNotMatch(subdelegate, /Math\.min\(ratio|isMobile/);
        assert.match(manager, /function live2dModelJsonName\(index: number\): string \{\s*return `\$\{LAppDefine\.ModelDir\[index\]\}\.model3\.json`;/);
        assert.doesNotMatch(manager, /-mobile\.model3\.json|-lite\.model3\.json|live2dModelVariant/);
        assert.match(textures, /function shouldUseMipmaps\(\): boolean \{\s*return true;\s*\}/);
        assert.match(model, /function shouldReduceIdleEffects\(\): boolean \{\s*return false;\s*\}/);
    });
});
