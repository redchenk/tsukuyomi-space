const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function bytes(relativePath) {
    return fs.statSync(path.join(root, relativePath)).size;
}

describe('constrained-device performance policy', () => {
    it('detects hardware, network, and measured long-task pressure', () => {
        const performance = source('src/frontend/utils/performance.js');
        const main = source('src/frontend/main.js');

        assert.match(performance, /navigator\.deviceMemory/);
        assert.match(performance, /navigator\.hardwareConcurrency/);
        assert.match(performance, /\['slow-2g', '2g', '3g'\]/);
        assert.match(performance, /PerformanceObserver/);
        assert.match(performance, /entry\.duration/);
        assert.match(performance, /document\.documentElement\.dataset\.performance/);
        assert.match(main, /initializePerformanceProfile\(\)/);
        assert.match(main, /performance\.css/);
    });

    it('prefetches only a small adjacent route set during idle time', () => {
        const router = source('src/frontend/router/index.js');

        assert.match(router, /isReducedPerformance\(\)/);
        assert.match(router, /scheduleIdleTask/);
        assert.match(router, /hub: \[StagePage, PlazaPage\]/);
        assert.match(router, /if \(!loaders\.length \|\| to\.name === 'room'\) return/);
        assert.doesNotMatch(router, /setTimeout\(warm,.*(?:70|180)/);
        assert.doesNotMatch(router, /hub: \[[^\]]*(?:RoomPage|RoomSettingsPage|ArenaPage)/);
    });

    it('uses compressed full-resolution backgrounds and a lightweight pet frame', () => {
        const runtime = [
            source('src/frontend/utils/assetUrl.js'),
            source('assets/css/vue/pages/room.css'),
            source('assets/css/vue/pages/hub.css')
        ].join('\n');
        const baseThemes = [
            source('src/frontend/styles/themes.css'),
            source('assets/css/vue/foundation.css'),
            source('assets/css/vue/modern-theme.css')
        ].join('\n');
        const productPolish = source('assets/css/vue/product-polish.css');
        const pet = source('src/frontend/components/SitePet.vue');

        assert.ok(bytes('assets/images/tsukuyomi-bg.webp') < bytes('assets/images/tsukuyomi-bg.png') * 0.15);
        assert.ok(bytes('assets/images/room-bg.webp') < bytes('assets/images/room-bg.png') * 0.15);
        assert.ok(bytes('assets/images/auth-visual-bg.webp') < bytes('assets/images/auth-visual-bg.png') * 0.05);
        assert.ok(bytes('assets/pets/yachiyo/spritesheet-perf-r2.webp') < 1.2 * 1024 * 1024);
        assert.ok(bytes('assets/pets/yachiyo/idle.webp') < 30 * 1024);
        assert.match(pet, /spritesheet-perf-r2\.webp/);
        assert.doesNotMatch(runtime, /(?:tsukuyomi|room)-bg\.png/);
        assert.match(runtime, /tsukuyomi-bg\.webp/);
        assert.match(runtime, /room-bg\.webp/);
        assert.doesNotMatch(baseThemes, /tsukuyomi-bg\.webp/);
        assert.doesNotMatch(productPolish, /body,\s*html\[data-theme="dark"\] body,\s*body\.vue-global-bg-route\s*\{[^}]*tsukuyomi-bg/s);
    });

    it('keeps the pet guidance available while avoiding its full sprite animation on reduced devices', () => {
        const app = source('src/frontend/App.vue');
        const pet = source('src/frontend/components/SitePet.vue');

        assert.match(app, /defineAsyncComponent\(\(\) => import\('\.\/components\/SitePet\.vue'\)\)/);
        assert.match(app, /scheduleIdleTask/);
        assert.match(app, /:reduced="petReduced"/);
        assert.match(pet, /assets\/pets\/yachiyo\/idle\.webp/);
        assert.match(pet, /if \(motionReduced \|\| props\.reduced\) return/);
        assert.match(pet, /@click="showGuidanceTip"/);
    });

    it('reduces compositing work without changing Live2D canvas pixel density', () => {
        const styles = source('src/frontend/styles/performance.css');
        const room = source('src/live2d/main-room.ts');
        const subdelegate = source('src/live2d/lappsubdelegate.ts');
        const bridge = source('src/frontend/services/room/live2dCubismBehaviorBridge.js');
        const loader = source('src/frontend/services/room/live2dBridge.js');

        assert.match(styles, /data-performance="reduced"/);
        assert.match(styles, /backdrop-filter: none !important/);
        assert.match(styles, /content-visibility: auto/);
        assert.match(room, /ROOM_RENDER_REDUCED_MAX_FRAME_INTERVAL_MS = 1000 \/ 30/);
        assert.match(room, /roomRenderMaxFrameInterval\(\)/);
        assert.match(bridge, /currentFrameInterval\(\)/);
        assert.match(subdelegate, /window\.devicePixelRatio \|\| 1/);
        assert.match(subdelegate, /clientWidth \* ratio/);
        assert.doesNotMatch(subdelegate, /Math\.min\([^\n]*devicePixelRatio/);
        assert.match(loader, /loadScript\(CORE_SCRIPT\).*loadScript\(ROOM_SCRIPT\)/s);
        assert.doesNotMatch(loader, /loadScript\(assetUrl\(/);
        assert.match(loader, /tsukimi-yachiyo\.moc3/);
        assert.match(loader, /textures\/desktop\/texture_00\.webp/);
        assert.match(loader, /\.\.\.MODEL_RESOURCES/);
    });
});
