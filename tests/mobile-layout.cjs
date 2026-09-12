/**
 * Verifies the mobile fixes:
 *   a) the end-chat dialog is centred, fully on-screen and every button is hittable
 *   b) every dock button is visible and tappable
 */
const { chromium } = require('@playwright/test');

const EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.REPRO_BASE || 'http://localhost:5199';

const PHONES = [
    { name: 'small 360x640', width: 360, height: 640 },
    { name: 'phone 390x844', width: 390, height: 844 },
    { name: 'large 430x932', width: 430, height: 932 }
];

(async () => {
    const browser = await chromium.launch({ executablePath: EXECUTABLE });
    let failures = 0;

    for (const phone of PHONES) {
        const page = await browser.newPage({
            viewport: { width: phone.width, height: phone.height },
            hasTouch: true, isMobile: true
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
            const panelMod = await import('/components/room/RoomChatPanel.vue');
            const dockMod = await import('/components/room/RoomDock.vue');

            const state = vue.ref({ visible: false, status: 'idle', message: '', detail: '', entry: null, turnCount: 0 });
            const chat = {
                messages: { value: [] }, input: { value: '' }, sending: { value: false },
                ttsState: { value: { messageId: '', status: 'idle' } },
                imageAttachment: { value: null }, messageListRef: { value: null },
                characterName: { value: 'Aoi' }, endChatState: state,
                sessionTurnCount: () => 2,
                attachImage: () => {}, clearImage: () => {}, send: () => {}, playTTS: () => {}, onDrop: () => {},
                openEndChatDialog: () => {
                    state.value = { visible: true, status: 'confirm', message: '结束本次聊天，并写一篇日记？', detail: '将根据本次的 2 条对话生成日记。', entry: null, turnCount: 2 };
                },
                closeEndChatDialog: () => { state.value = { ...state.value, visible: false, status: 'idle' }; },
                confirmEndChat: () => {}, confirmEndChatWithoutDiary: () => {},
                dismissDiaryText: () => {}, exportDiaryArchive: () => {}
            };

            const activePanels = { chatPanel: true, diaryPanel: false, profilePanel: false, notePanel: false };
            const chatPanelOpen = vue.ref(true);
            const buttons = [
                { id: 'chatPanel', label: '聊天', icon: 'message' },
                { id: 'diaryPanel', label: '日记', icon: 'book' },
                { id: 'profilePanel', label: '资料', icon: 'badge' },
                { id: 'notePanel', label: '便签', icon: 'note' }
            ];

            const host = document.createElement('div');
            host.className = 'room-shell room-page';
            host.style.cssText = 'position:absolute;inset:0;';
            document.body.appendChild(host);

            const app = vue.createApp({
                render: () => vue.h('div', [
                    chatPanelOpen.value
                        ? vue.h(panelMod.default, {
                            chat,
                            panelStyle: { top: 'auto', bottom: '5.55rem', left: '50%' },
                            onClose: () => { chatPanelOpen.value = false; }
                        })
                        : null,
                    vue.h(dockMod.default, { buttons, activePanels, onToggle: () => {}, onSettings: () => {} })
                ])
            });
            app.mount(host);
            await new Promise((r) => setTimeout(r, 200));

            const vh = window.innerHeight;

            // --- a) dock first, while no modal is open ---
            const dock = host.querySelector('.room-dock');
            steps.push('dock found = ' + Boolean(dock));
            if (dock) {
                const dr = dock.getBoundingClientRect();
                steps.push('dock rect = ' + [dr.left, dr.top, dr.width, dr.height].map(Math.round).join(','));
                const dockBtns = [...dock.querySelectorAll('.panel-toggle-btn')];
                steps.push('dock buttons rendered = ' + dockBtns.length + ' (expected 5 incl. settings)');
                if (dockBtns.length !== 5) problems.push('dock should render 5 buttons, got ' + dockBtns.length);

                for (const b of dockBtns) {
                    const br = b.getBoundingClientRect();
                    const visible = br.width > 0 && br.height > 0 && getComputedStyle(b).display !== 'none';
                    const bx = br.left + br.width / 2;
                    const by = br.top + br.height / 2;
                    const hit = document.elementFromPoint(bx, by);
                    const hittable = Boolean(hit && (hit === b || b.contains(hit)));
                    const label = b.querySelector('.dock-label');
                    steps.push('  [' + (label ? label.textContent.trim() : '?') + '] visible=' + visible + ' hittable=' + hittable
                        + ' at ' + Math.round(bx) + ',' + Math.round(by)
                        + (hittable ? '' : ' occludedBy=' + (hit ? (hit.id || hit.className || hit.tagName) : 'null')));
                    if (!visible) problems.push('dock button hidden: ' + (label ? label.textContent.trim() : '?'));
                    if (!hittable) problems.push('dock button unreachable: ' + (label ? label.textContent.trim() : '?'));
                    const withinVp = br.left >= 0 && br.right <= window.innerWidth + 1 && br.top >= 0 && br.bottom <= vh + 1;
                    if (!withinVp) problems.push('dock button off-screen: ' + (label ? label.textContent.trim() : '?'));
                }
                steps.push('dock within viewport = ' + (dr.left >= 0 && dr.right <= window.innerWidth + 1 && dr.top >= 0 && dr.bottom <= vh + 1));
            } else {
                problems.push('dock not rendered');
            }

            // --- b) the chat panel must expose a tappable close button ---
            // The phone layout hides the panel title, which used to take the
            // close button with it and left touch users unable to dismiss chat.
            let closeWorked = false;
            const closeBtn = host.querySelector('#chatPanel .panel-close');
            steps.push('chat close button found = ' + Boolean(closeBtn));
            if (!closeBtn) {
                problems.push('chat panel has no close button');
            } else {
                const cb = closeBtn.getBoundingClientRect();
                const cs = getComputedStyle(closeBtn);
                const visible = cb.width > 0 && cb.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
                steps.push('  close button visible = ' + visible + ' size=' + Math.round(cb.width) + 'x' + Math.round(cb.height));
                if (!visible) problems.push('chat close button is not visible');
                if (cb.width < 28 || cb.height < 28) problems.push('chat close button is too small to tap: ' + Math.round(cb.width) + 'x' + Math.round(cb.height));

                const inVp = cb.left >= -1 && cb.right <= window.innerWidth + 1 && cb.top >= -1 && cb.bottom <= vh + 1;
                steps.push('  close button on screen = ' + inVp);
                if (!inVp) problems.push('chat close button is off-screen');

                const hit = document.elementFromPoint(cb.left + cb.width / 2, cb.top + cb.height / 2);
                const hittable = Boolean(hit && (hit === closeBtn || closeBtn.contains(hit)));
                steps.push('  close button hittable = ' + hittable
                    + (hittable ? '' : ' occludedBy=' + (hit ? (hit.id || hit.className || hit.tagName) : 'null')));
                if (!hittable) problems.push('chat close button is unreachable');

                // Opening the panel must let the close button dismiss it.
                closeBtn.click();
                await new Promise((r) => setTimeout(r, 120));
                closeWorked = !document.getElementById('chatPanel');
                steps.push('  close button dismisses the panel = ' + closeWorked);
                if (!closeWorked) problems.push('chat close button does not close the panel');

                // Reopen it so the end-chat checks below still have their panel.
                chatPanelOpen.value = true;
                await new Promise((r) => setTimeout(r, 120));
            }

            // --- c) end-chat dialog: opens centred and every button is tappable ---
            const endBtn = host.querySelector('#endChatBtn');
            steps.push('endChatBtn found = ' + Boolean(endBtn));
            if (endBtn) endBtn.click();
            await new Promise((r) => setTimeout(r, 200));

            const card = document.querySelector('.endchat-card');
            steps.push('overlay card rendered = ' + Boolean(card));
            if (!card) {
                problems.push('end-chat dialog did not render');
            } else {
                const r = card.getBoundingClientRect();
                steps.push('card rect = ' + [r.left, r.top, r.width, r.height].map(Math.round).join(','));
                const fullyVisible = r.top >= 0 && r.bottom <= vh + 1 && r.left >= 0 && r.right <= window.innerWidth + 1;
                steps.push('fully on screen = ' + fullyVisible);
                if (!fullyVisible) problems.push('card extends off-screen: bottom=' + Math.round(r.bottom) + ' vh=' + vh);

                const cx = r.left + r.width / 2;
                steps.push('card centred horizontally = ' + (Math.abs(cx - window.innerWidth / 2) <= 2));

                for (const b of card.querySelectorAll('button')) {
                    const br = b.getBoundingClientRect();
                    const bx = br.left + br.width / 2;
                    const by = br.top + br.height / 2;
                    const hit = document.elementFromPoint(bx, by);
                    const ok = Boolean(hit && (hit === b || b.contains(hit)));
                    const inVp = br.top >= 0 && br.bottom <= vh + 1;
                    steps.push('  [' + b.textContent.trim() + '] inViewport=' + inVp + ' hittable=' + ok
                        + (ok ? '' : ' occludedBy=' + (hit ? (hit.id || hit.className || hit.tagName) : 'null')));
                    if (!ok || !inVp) problems.push('button unreachable: ' + b.textContent.trim());
                }

                // The overlay must be dismissable.
                const cont = [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === '继续聊天');
                if (cont) {
                    cont.click();
                    await new Promise((r2) => setTimeout(r2, 200));
                    const gone = !document.querySelector('.endchat-card');
                    steps.push('closing via 继续聊天 works = ' + gone);
                    if (!gone) problems.push('dialog did not close');
                    // Dock must be usable again afterwards.
                    const dockBtn = host.querySelector('.room-dock .panel-toggle-btn');
                    if (dockBtn) {
                        const br = dockBtn.getBoundingClientRect();
                        const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
                        const back = Boolean(hit && (hit === dockBtn || dockBtn.contains(hit)));
                        steps.push('dock usable again after closing = ' + back);
                        if (!back) problems.push('dock still blocked after closing the dialog');
                    }
                }
            }

            app.unmount();
            return { steps, problems };
        });

        console.log('=== ' + phone.name + ' ===');
        out.steps.forEach((s) => console.log('  ' + s));
        if (out.problems.length) {
            console.log('  PROBLEMS:');
            out.problems.forEach((p) => console.log('    - ' + p));
            failures += out.problems.length;
        } else {
            console.log('  OK: all controls reachable');
        }
        if (errors.length) console.log('  page errors: ' + errors.join(' | '));
        await page.close();
    }

    await browser.close();
    console.log('\n' + (failures ? failures + ' PROBLEM(S)' : 'ALL MOBILE CHECKS PASSED'));
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
