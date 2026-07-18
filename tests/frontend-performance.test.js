const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function bytes(relativePath) {
    return fs.statSync(path.join(root, relativePath)).size;
}

describe('constrained-device performance policy', () => {
    it('keeps public list payloads compact and loads route CSS on demand', () => {
        const avatars = source('backend/utils/avatar.js');
        const messages = source('backend/repositories/message-repository.js');
        const articles = source('backend/repositories/article-repository.js');
        const pixels = source('backend/repositories/pixel-art-repository.js');
        const router = source('src/frontend/router/index.js');
        const globalCss = source('assets/css/vue-app.css');
        const modernTheme = source('assets/css/vue/modern-theme.css');

        assert.match(avatars, /function publicAvatarUrl/);
        assert.match(messages, /publicAvatarUrl/);
        assert.match(articles, /publicAvatarUrl/);
        assert.match(pixels, /pixels_base64/);
        assert.match(router, /function loadRoute\(/);
        assert.match(router, /styles\/routes\/hub\.css/);
        assert.doesNotMatch(globalCss, /vue\/pages\/(?:hub|stage|plaza|gallery|arena)\.css/);
        assert.doesNotMatch(modernTheme, /\.route-view\s*\{[^}]*display:\s*block/);
    });

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

    it('shares route-load promises and prefetches navigation intent without forcing slow connections', () => {
        const router = source('src/frontend/router/index.js');
        const shell = source('src/frontend/layouts/AppShell.vue');
        const hub = source('src/frontend/pages/HubPage.vue');

        assert.match(router, /let routePromise = null/);
        assert.match(router, /if \(!routePromise\)/);
        assert.match(router, /export function warmRoutePath\(path\)/);
        assert.match(router, /connection\?\.saveData \|\| isReducedPerformance\(\)/);
        assert.match(router, /router\.resolve\(path\)/);
        assert.match(shell, /@pointerenter="item\.spa && warmRoutePath\(item\.path\)/);
        assert.match(shell, /@pointerdown="item\.spa && warmRoutePath\(item\.path\)"/);
        assert.match(hub, /function warmScene\(scene\)/);
        assert.match(hub, /@pointerenter="warmScene\(scene\)"/);
    });

    it('keeps mobile actions readable and restores the full-resolution Hub pixel crop', () => {
        const plaza = source('assets/css/vue/pages/plaza.css');
        const arena = source('assets/css/vue/pages/arena.css');
        const productPolish = source('assets/css/vue/product-polish.css');
        const hubPage = source('src/frontend/pages/HubPage.vue');
        const hubStyles = source('assets/css/vue/pages/hub.css');
        const hubPreview = source('backend/routes/hub-preview.js');

        assert.match(plaza, /\.plaza-msg-footer \.icon-btn\s*\{[^}]*min-width:\s*max-content/s);
        assert.match(plaza, /\.plaza-msg-footer \.icon-btn > span\s*\{[^}]*overflow:\s*visible[^}]*text-overflow:\s*clip/s);
        assert.match(plaza, /@media \(max-width: 760px\)[\s\S]*\.plaza-hero,[\s\S]*\.plaza-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
        assert.match(plaza, /@media \(max-width: 560px\)[\s\S]*\.plaza-msg-footer\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*visible/);
        assert.match(productPolish, /\.page\.plaza-page \.plaza-msg-footer \.icon-btn:not\([^}]*\{[^}]*width:\s*auto[^}]*min-width:\s*max-content[^}]*aspect-ratio:\s*auto/s);
        assert.match(productPolish, /\.page\.plaza-page \.plaza-msg-footer \.icon-btn > span\s*\{[^}]*text-overflow:\s*clip[^}]*white-space:\s*nowrap/s);
        assert.match(arena, /@media \(max-width: 760px\)[\s\S]*\.pixel-art-actions\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
        assert.match(arena, /@media \(max-width: 760px\)[\s\S]*\.pixel-art-actions \.icon-btn\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*aspect-ratio:\s*auto/s);
        assert.match(productPolish, /@media \(max-width: 760px\)[\s\S]*\.page\.arena-page \.pixel-art-actions \.icon-btn:not\([^}]*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*aspect-ratio:\s*auto/s);
        assert.doesNotMatch(hubPage, /--hub-pixel-(?:width|height)/);
        assert.match(hubStyles, /\.hub-arena-cover \.pixel-canvas-renderer\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/s);
        assert.match(hubStyles, /@media \(max-width: 620px\)[\s\S]*\.scene-card:not\(\.scene-card-plaza\) \.scene-label\s*\{[^}]*position:\s*absolute[^}]*top:\s*1\.5rem[^}]*left:\s*4\.25rem/s);
        assert.match(hubPreview, /preview:\s*true/);
        assert.doesNotMatch(hubPreview, /preview:\s*'compact'/);
    });

    it('keeps mobile content and immersive controls inside the viewport', () => {
        const stage = source('assets/css/vue/pages/stage.css');
        const room = source('assets/css/vue/pages/room.css');
        const accessPage = source('src/frontend/pages/AccessPage.vue');
        const accessStyles = source('assets/css/vue/pages/access.css');
        const attachments = source('src/frontend/pages/AttachmentsPage.vue');

        assert.match(stage, /@media \(max-width: 760px\)[\s\S]*\.stage-card\s*\{[^}]*height:\s*auto[^}]*flex-direction:\s*column-reverse/s);
        assert.match(stage, /@media \(max-width: 760px\)[\s\S]*\.stage-card-cover\s*\{[^}]*width:\s*100%[^}]*height:\s*clamp/s);
        assert.match(room, /\.room-panel:not\(\.room-chat-panel\)/);
        assert.match(room, /\.room-panel\.room-chat-panel\s*\{[^}]*left:\s*50%\s*!important[^}]*top:\s*auto\s*!important[^}]*transform:\s*translateX\(-50%\)/s);
        assert.match(accessPage, /disablepictureinpicture/);
        assert.match(accessPage, /disableremoteplayback/);
        assert.match(accessStyles, /\.access-video\s*\{[^}]*pointer-events:\s*none[^}]*touch-action:\s*none/s);
        assert.match(attachments, /let assetLoadController = null/);
        assert.match(attachments, /assetLoadController\?\.abort\(\)/);
        assert.match(attachments, /matchMedia\('\(max-width: 760px\)'\)\.matches \? 18 : 36/);
        assert.match(attachments, /preload="none"[\s\S]*disablepictureinpicture[\s\S]*disableremoteplayback/);
        assert.match(attachments, /v-if="state\.totalPages > 1" class="attachments-pager"/);
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
        const model = fs.readFileSync(path.join(root, 'models/tsukimi-yachiyo/tsukimi-yachiyo.moc3'));
        const compressedModel = fs.readFileSync(path.join(root, 'models/tsukimi-yachiyo/tsukimi-yachiyo.moc3.gzip-r1'));
        assert.ok(compressedModel.length < model.length * 0.45);
        assert.deepEqual(zlib.gunzipSync(compressedModel), model);
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
        assert.match(room, /ROOM_RENDER_REDUCED_MAX_FRAME_INTERVAL_MS = 1000 \/ 20/);
        assert.match(room, /roomRenderMaxFrameInterval\(\)/);
        assert.match(bridge, /currentFrameInterval\(\)/);
        assert.match(subdelegate, /window\.devicePixelRatio \|\| 1/);
        assert.match(subdelegate, /clientWidth \* ratio/);
        assert.doesNotMatch(subdelegate, /Math\.min\([^\n]*devicePixelRatio/);
        assert.match(loader, /loadScript\(CORE_SCRIPT\).*loadScript\(ROOM_SCRIPT\)/s);
        assert.doesNotMatch(loader, /loadScript\(assetUrl\(/);
        assert.doesNotMatch(loader, /assetUrl/);
        assert.match(loader, /tsukimi-yachiyo\.moc3/);
        assert.match(loader, /MODEL_MOC_COMPRESSED/);
        assert.match(loader, /window\.DecompressionStream/);
    });
});
