/**
 * Verifies the mobile room layout fix:
 *   the note / diary / profile panels and the top dock must never overlap the
 *   weather pill, and every panel control must stay on-screen and hittable.
 *
 * Run against a Vite dev server:
 *   npx vite --config vite.frontend.config.js --port 5199 --strictPort
 *   node tests/room-mobile-weather-overlap.cjs
 */
const { chromium } = require('@playwright/test');

const EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.REPRO_BASE || 'http://localhost:5199';

const PHONES = [
    { name: 'small 360x640', width: 360, height: 640 },
    { name: 'phone 390x844', width: 390, height: 844 },
    { name: 'large 430x932', width: 430, height: 932 },
    { name: 'tablet 768x1024', width: 768, height: 1024 }
];

function overlaps(a, b) {
    const gapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const gapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return gapX > 1 && gapY > 1;
}

(async () => {
    const browser = await chromium.launch({ executablePath: EXECUTABLE });
    let failures = 0;

    for (const phone of PHONES) {
        const page = await browser.newPage({
            viewport: { width: phone.width, height: phone.height },
            hasTouch: true,
            isMobile: true
        });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));

        await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.addStyleTag({ url: `${BASE}/styles/routes/room.css` });
        await page.waitForTimeout(400);

        const out = await page.evaluate(async () => {
            const steps = [];
            const problems = [];
            const vue = await import('/@id/vue');
            const dockMod = await import('/components/room/RoomDock.vue');
            const weatherMod = await import('/components/room/RoomWeatherCard.vue');
            const noteMod = await import('/components/room/RoomNotePanel.vue');
            const diaryMod = await import('/components/room/RoomDiaryPanel.vue');
            const profileMod = await import('/components/room/RoomProfilePanel.vue');

            const buttons = [
                { id: 'chatPanel', label: '聊天', icon: 'message' },
                { id: 'diaryPanel', label: '日记', icon: 'book' },
                { id: 'profilePanel', label: '资料', icon: 'badge' },
                { id: 'notePanel', label: '便签', icon: 'note' }
            ];
            const activePanels = { chatPanel: false, diaryPanel: true, profilePanel: true, notePanel: true };
            const noop = () => {};

            // The note/profile components read `note.value` / plain fields
            // directly in their templates, so pass plain objects here.
            const note = { value: '灵感' };
            const diary = {
                entries: { value: [{ diaryId: 'd1', date: '2026-01-01', time: '10:00', content: '今天也很努力呢', affection: 60, mode: 'LLM' }] },
                selectedId: { value: 'd1' },
                selectedEntry: { value: { diaryId: 'd1', date: '2026-01-01', time: '10:00', content: '今天也很努力呢', affection: 60, mode: 'LLM' } },
                personaName: { value: 'Aoi' },
                notice: { value: '' },
                selectEntry: noop, exportArchive: noop, importFile: noop
            };
            const profile = { nickname: '访客', signature: '' };

            const host = document.createElement('div');
            host.className = 'room-shell room-page';
            host.style.cssText = 'position:absolute;inset:0;';
            document.body.appendChild(host);

            const panels = [
                { mod: noteMod, props: { note, panelStyle: {}, onClose: noop, onFocus: noop, onDragStart: noop, onSave: noop }, selector: '#notePanel', label: 'note' },
                { mod: diaryMod, props: { diary, panelStyle: {}, onClose: noop, onFocus: noop, onDragStart: noop }, selector: '#diaryPanel', label: 'diary' },
                { mod: profileMod, props: { profile, panelStyle: {}, onClose: noop, onFocus: noop, onDragStart: noop, onSave: noop }, selector: '#profilePanel', label: 'profile' }
            ];

            // One panel at a time, exactly like the real page (v-if per panel).
            // On the real page an open panel intentionally sits above the dock
            // (z-index 90 vs 87), so dock hit-testing is done separately below.
            for (const entry of panels) {
                const app = vue.createApp({
                    render: () => vue.h('div', [
                        vue.h(weatherMod.default, {
                            weather: { city: '月读市', temperature: '21°C', label: '晴', wind: '微风', detail: '适合出门' }
                        }),
                        vue.h(dockMod.default, { buttons, activePanels, onToggle: noop, onSettings: noop }),
                        vue.h(entry.mod.default, entry.props)
                    ])
                });
                app.mount(host);
                await new Promise((r) => setTimeout(r, 240));

                const vh = window.innerHeight;
                const vw = window.innerWidth;
                const weather = host.querySelector('.room-weather-card');
                const dock = host.querySelector('.room-dock');

                if (!weather) problems.push('weather pill not rendered for ' + entry.label);
                const wr = weather ? weather.getBoundingClientRect() : null;
                if (wr) steps.push('weather pill rect = ' + [wr.left, wr.top, wr.width, wr.height].map(Math.round).join(','));

                function overlapsWeather(r, label) {
                    if (!wr || r.width <= 0 || r.height <= 0) return false;
                    const gapX = Math.min(r.right, wr.right) - Math.max(r.left, wr.left);
                    const gapY = Math.min(r.bottom, wr.bottom) - Math.max(r.top, wr.top);
                    const hit = gapX > 1 && gapY > 1;
                    steps.push('  [' + label + '] overlaps weather pill = ' + hit);
                    if (hit) problems.push(label + ' overlaps the weather pill');
                    return hit;
                }

                const panel = host.querySelector(entry.selector);
                if (!panel) {
                    problems.push(entry.label + ' panel not rendered');
                } else {
                    const r = panel.getBoundingClientRect();
                    steps.push('[' + entry.label + '] rect = ' + [r.left, r.top, r.width, r.height].map(Math.round).join(','));
                    overlapsWeather(r, entry.label + ' panel');
                    const withinVp = r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1;
                    steps.push('  fully on screen = ' + withinVp);
                    if (!withinVp) problems.push(entry.label + ' panel off-screen: ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
                    if (r.width < 180) problems.push(entry.label + ' panel too narrow to be usable: ' + Math.round(r.width) + 'px');

                    const close = panel.querySelector('.panel-close');
                    if (close) {
                        const br = close.getBoundingClientRect();
                        const element = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
                        const ok = Boolean(element && (element === close || close.contains(element)));
                        steps.push('  close button hittable = ' + ok
                            + (ok ? '' : ' occludedBy=' + (element ? (element.id || element.className || element.tagName) : 'null')));
                        if (!ok) problems.push(entry.label + ' close button unreachable');
                    }

                    const header = panel.querySelector('.panel-header');
                    if (header && wr) {
                        const hr = header.getBoundingClientRect();
                        const clear = hr.top >= wr.bottom - 1;
                        steps.push('  header clears weather = ' + clear
                            + ' (header top ' + Math.round(hr.top) + ', pill bottom ' + Math.round(wr.bottom) + ')');
                        if (!clear) problems.push(entry.label + ' header sits under the weather pill');
                    }
                }

                if (dock) overlapsWeather(dock.getBoundingClientRect(), 'dock');

                app.unmount();
            }

            // Dock reachability is measured with no panel open, as on the page.
            {
                const app = vue.createApp({
                    render: () => vue.h('div', [
                        vue.h(weatherMod.default, {
                            weather: { city: '月读市', temperature: '21°C', label: '晴', wind: '微风', detail: '适合出门' }
                        }),
                        vue.h(dockMod.default, { buttons, activePanels: { chatPanel: false, diaryPanel: false, profilePanel: false, notePanel: false }, onToggle: noop, onSettings: noop })
                    ])
                });
                app.mount(host);
                await new Promise((r) => setTimeout(r, 240));

                const vh = window.innerHeight;
                const vw = window.innerWidth;
                const dock = host.querySelector('.room-dock');
                const weather = host.querySelector('.room-weather-card');
                const wr = weather ? weather.getBoundingClientRect() : null;

                if (!dock) {
                    problems.push('dock not rendered');
                } else {
                    const dr = dock.getBoundingClientRect();
                    steps.push('[dock] rect = ' + [dr.left, dr.top, dr.width, dr.height].map(Math.round).join(','));
                    if (wr) {
                        const gapX = Math.min(dr.right, wr.right) - Math.max(dr.left, wr.left);
                        const gapY = Math.min(dr.bottom, wr.bottom) - Math.max(dr.top, wr.top);
                        const hit = gapX > 1 && gapY > 1;
                        steps.push('  dock overlaps weather pill = ' + hit);
                        if (hit) problems.push('dock overlaps the weather pill');
                    }
                    const buttons = [...dock.querySelectorAll('.panel-toggle-btn')];
                    steps.push('  dock buttons rendered = ' + buttons.length + ' (expected 5)');
                    if (buttons.length !== 5) problems.push('dock should render 5 buttons, got ' + buttons.length);
                    for (const b of buttons) {
                        const br = b.getBoundingClientRect();
                        const label = b.querySelector('.dock-label');
                        const name = label ? label.textContent.trim() : '?';
                        const inVp = br.left >= -1 && br.right <= vw + 1 && br.top >= -1 && br.bottom <= vh + 1;
                        const element = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
                        const ok = Boolean(element && (element === b || b.contains(element)));
                        if (!inVp) problems.push('dock button off-screen: ' + name);
                        if (!ok) problems.push('dock button unreachable: ' + name + ' occludedBy='
                            + (element ? (element.id || element.className || element.tagName) : 'null'));
                    }
                }
                app.unmount();
            }

            return { steps, problems };
        });

        console.log('=== ' + phone.name + ' ===');
        out.steps.forEach((s) => console.log('  ' + s));
        if (out.problems.length) {
            console.log('  PROBLEMS:');
            out.problems.forEach((p) => console.log('    - ' + p));
            failures += out.problems.length;
        } else {
            console.log('  OK: no overlap, all controls reachable');
        }
        if (errors.length) console.log('  page errors: ' + errors.join(' | '));
        await page.close();
    }

    await browser.close();
    console.log('\n' + (failures ? failures + ' PROBLEM(S)' : 'ALL ROOM MOBILE OVERLAP CHECKS PASSED'));
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
