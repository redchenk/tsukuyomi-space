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
        const glManager = source('src/live2d/lappglmanager.ts');
        const textures = source('src/live2d/lapptexturemanager.ts');
        const model = source('src/live2d/lappmodel.ts');

        assert.match(bridge, /export function live2DPerformanceMode\(\) \{\s*return 'standard';\s*\}/);
        assert.doesNotMatch(bridge, /isConstrainedMobileLive2DDevice|lowQualityModel|tsukimi-yachiyo-(?:mobile|lite)\.model3\.json/);
        assert.match(roomRuntime, /ROOM_RENDER_FRAME_INTERVAL_MS = 1000 \/ 60/);
        assert.match(roomRuntime, /ROOM_RENDER_MAX_FRAME_INTERVAL_MS = 1000 \/ 45/);
        assert.doesNotMatch(roomRuntime, /lowPower|1000 \/ 30|dataset\.performance/);
        assert.match(subdelegate, /return window\.devicePixelRatio \|\| 1;/);
        assert.doesNotMatch(subdelegate, /Math\.min\(ratio|isMobile/);
        assert.match(manager, /function live2dModelJsonName\(index: number\): string \{\s*return `\$\{LAppDefine\.ModelDir\[index\]\}\.model3\.json`;/);
        assert.doesNotMatch(manager, /-mobile\.model3\.json|-lite\.model3\.json|live2dModelVariant/);
        assert.match(textures, /function shouldUseMipmaps\(\): boolean \{\s*return true;\s*\}/);
        assert.match(model, /function shouldReduceIdleEffects\(\): boolean \{\s*return false;\s*\}/);
    });

    it('removes high-frequency Room work without reducing Live2D quality', () => {
        const roomRuntime = source('src/live2d/main-room.ts');
        const behaviorBridge = source('src/frontend/services/room/live2dCubismBehaviorBridge.js');
        const localBridge = source('src/frontend/services/room/live2dLocalCubismBridge.js');
        const bodyActuator = source('src/frontend/services/room/live2dBodyActuator.js');
        const panels = source('src/frontend/composables/useRoomPanels.js');
        const manager = source('src/live2d/lapplive2dmanager.ts');
        const glManager = source('src/live2d/lappglmanager.ts');

        assert.match(roomRuntime, /pointerFrameId: number/);
        assert.match(roomRuntime, /if \(isPointerControlDisabled\(\) \|\| !pointerActive\) return;/);
        assert.match(behaviorBridge, /LOCAL_CUBISM_FRAME_INTERVAL_MS = 1000 \/ 60/);
        assert.match(localBridge, /queueLocalCubismFrame\(parameters\);\s*flushLocalCubismFrame\(\);/);
        assert.doesNotMatch(localBridge, /requestAnimationFrame\(flushLocalCubismFrame\)/);
        assert.match(bodyActuator, /const stageSettings = readModelStageSettings\(\);/);
        assert.match(bodyActuator, /lastContainer\?\.isConnected/);
        assert.match(panels, /requestAnimationFrame\(applyPanelDrag\)/);
        assert.match(panels, /style\.transform = `translate3d/);
        assert.match(manager, /this\._models\.at\(i\)\?\.release\(\)/);
        assert.match(manager, /CubismRenderer\.staticRelease\(\)/);
        assert.match(glManager, /WEBGL_lose_context/);
    });

    it('keeps Room startup work behind the Live2D critical path', () => {
        const app = source('src/frontend/App.vue');
        const music = source('src/frontend/composables/room/useRoomMusic.js');
        const router = source('src/frontend/router/index.js');
        const bridge = source('src/frontend/services/room/live2dBridge.js');
        const nginx = source('deploy/nginx.conf');

        assert.match(app, /Boolean\(route\.name\).*showSitePet|showSitePet.*Boolean\(route\.name\)/s);
        assert.doesNotMatch(app, /onMounted\(\(\) => \{\s*refreshUser\(\);/);
        assert.match(app, /function handlePageShow\(event\) \{\s*if \(!event\?\.persisted\) return;/);
        assert.match(app, /router\.isReady\(\)\.then\(\(\) => \{[\s\S]*initialRouteReady = true;[\s\S]*refreshUser\(\);/);
        assert.doesNotMatch(app, /watch\(\(\) => route\.fullPath,[\s\S]{0,100}\{ immediate: true \}/);
        assert.match(music, /function ensureTrackLoaded\(/);
        assert.doesNotMatch(music, /\n\s*loadTrack\(trackIndex\.value\);\s*\n\s*onBeforeUnmount/);
        assert.match(router, /LIVE2D_READY_EVENT = 'tsukuyomi:live2d-ready'/);
        assert.match(router, /if \(to\.name === 'room'\)[\s\S]*addEventListener\(LIVE2D_READY_EVENT/);
        assert.match(bridge, /LIVE2D_READY_TIMEOUT = 45000/);
        assert.match(bridge, /live2d-room-neuro-live\.20260714-mobile-perf\.iife\.js/);
        assert.match(nginx, /location = \/lib\/bundled\/live2d-room-neuro-live\.iife\.js \{[\s\S]*max-age=300, must-revalidate/);
        assert.match(nginx, /location = \/lib\/bundled\/live2d-room-neuro-live\.20260714-mobile-perf\.iife\.js \{[\s\S]*immutable/);
    });

    it('shares peripheral animation timing and avoids redundant frame writes', () => {
        const live2d = source('src/frontend/composables/room/useLive2D.js');
        const behaviorBridge = source('src/frontend/services/room/live2dCubismBehaviorBridge.js');
        const live2dDebug = source('src/frontend/services/room/live2dDebug.js');
        const localBridge = source('src/frontend/services/room/live2dLocalCubismBridge.js');
        const bodyActuator = source('src/frontend/services/room/live2dBodyActuator.js');

        assert.match(live2d, /externallyDriven:\s*true/);
        assert.match(live2d, /onPerformanceFrame:\s*destroyStageBodyActuator\.renderFrame/);
        assert.match(behaviorBridge, /onPerformanceFrame\?\.\(performanceFrame, now\)/);
        assert.match(live2dDebug, /if \(now - lastPerformanceDebugAt < PERFORMANCE_DEBUG_INTERVAL_MS\) return;/);
        assert.match(localBridge, /lastDebugSummaryAt/);
        assert.match(localBridge, /if \(now - lastDebugSummaryAt >= 250\)[\s\S]*summarizeDebugParameters/);
        assert.match(bodyActuator, /if \(containerTransform !== lastContainerTransform\)/);
        assert.match(bodyActuator, /cleanup\.renderFrame = renderExternalFrame/);
    });

    it('avoids mobile Room filters that force full-screen recompositing', () => {
        const responsive = source('src/frontend/styles/responsive.css');

        assert.doesNotMatch(responsive, /\.room-shell \.room-live2d-container \{[^}]*drop-shadow/s);
        assert.doesNotMatch(responsive, /\.room-shell \.room-weather-card \{[^}]*backdrop-filter/s);
        assert.doesNotMatch(responsive, /\.room-shell \.room-chat-panel \.chat-body \{[^}]*backdrop-filter/s);
        assert.doesNotMatch(responsive, /\.room-shell \.room-chat-panel \.chat-input-row \{[^}]*backdrop-filter/s);
    });
});

describe('room model and voice defaults', () => {
    it('keeps the DeepSeek and GPT-SoVITS defaults aligned across every request path', () => {
        const settings = source('src/frontend/pages/RoomSettingsPage.vue');
        const roomChat = source('src/frontend/composables/room/useRoomChat.js');
        const live2dSpeech = source('src/frontend/services/room/live2dSpeech.js');
        const backendTts = source('backend/services/tts.js');
        const sources = [settings, roomChat, live2dSpeech, backendTts];

        assert.match(settings, /model: 'deepseek-v4-flash'/);
        for (const content of sources) {
            assert.match(content, /GPT_weights_v2ProPlus\/yachiyo-v2pro-e20\.ckpt/);
            assert.match(content, /SoVITS_weights_v2ProPlus\/yachiyo-v2pro_e12_s684\.pth/);
            assert.doesNotMatch(content, /yachiyo-v2pro-e15\.ckpt|yachiyo-v2pro_e8_s456\.pth/);
        }
    });

    it('does not cap the visible Room LLM reply', () => {
        const roomChat = source('src/frontend/composables/room/useRoomChat.js');
        const llmService = source('backend/services/llm.js');

        assert.doesNotMatch(roomChat, /max_output_tokens:\s*360/);
        assert.doesNotMatch(roomChat, /max_tokens:\s*240/);
        assert.match(roomChat, /if \(Array\.isArray\(data\?\.content\)\)/);
        assert.match(roomChat, /max_tokens:\s*16384/);
        assert.doesNotMatch(llmService, /max_output_tokens:\s*360|max_tokens:\s*240/);
        assert.doesNotMatch(llmService, /每次回复不超过\s*\d+\s*字/);
    });
});
