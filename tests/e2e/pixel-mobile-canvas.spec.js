const { test, expect } = require('../e2e-fixtures.cjs');

const ZOOM_IN = '缩放 +';
const ZOOM_OUT = '缩放 -';

async function openStudio(page) {
    await page.goto('/pixel');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
    await expect(page.getByRole('img', { name: 'pixel canvas', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Let the site's page entrance finish before measuring the viewport.
    await page.evaluate(() => Promise.all(document.getAnimations()
        .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {}))));
}

async function zoomValue(page) {
    return Number.parseInt(await page.locator('.arena-zoom-controls strong').textContent(), 10);
}

// The +/- buttons step through Photoshop-style zoom stops.
async function stepZoomTo(page, target) {
    const controls = page.locator('.arena-zoom-controls');
    for (let guard = 0; guard < 24; guard += 1) {
        const current = await zoomValue(page);
        if (current === target) break;
        await controls.getByRole('button', { name: current < target ? ZOOM_IN : ZOOM_OUT, exact: true }).click();
    }
    expect(await zoomValue(page)).toBe(target);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

function canvas(page) {
    return page.getByRole('img', { name: 'pixel canvas', exact: true });
}

async function snapshot(page) {
    return canvas(page).evaluate(element => element.toDataURL());
}

async function touches(client, frames, pause = 16) {
    for (const [type, points] of frames) {
        await client.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 }))
        });
        await new Promise(resolve => setTimeout(resolve, pause));
    }
}

function swipe([x, y], [dx, dy], steps = 8) {
    const frames = [['touchStart', [[x, y]]]];
    for (let step = 1; step <= steps; step += 1) frames.push(['touchMove', [[x + dx * step / steps, y + dy * step / steps]]]);
    frames.push(['touchEnd', []]);
    return frames;
}

test('phone studio is a fixed app viewport with the dock at the bottom', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'Phone layout');
    await openStudio(page);
    const layout = await page.evaluate(() => {
        const dock = document.querySelector('.ps-toolbar').getBoundingClientRect();
        return {
            pageScroll: document.documentElement.scrollHeight - innerHeight,
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            dockBottom: innerHeight - dock.bottom
        };
    });
    expect(layout.pageScroll).toBeLessThanOrEqual(1);
    expect(layout.overflowX).toBeLessThanOrEqual(0);
    expect(layout.dockBottom).toBeLessThan(2);
    await expect(page.locator('.ps-toolbar').getByRole('button', { name: '画笔', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.arena-canvas-viewport').evaluate(el => getComputedStyle(el).touchAction)).toBe('none');
    expect(await canvas(page).evaluate(el => getComputedStyle(el).touchAction)).toBe('none');
});

test('canvas viewport stays put while zooming through every stop', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'Phone layout');
    await openStudio(page);
    const viewport = page.locator('.arena-canvas-viewport');
    const baseline = await viewport.boundingBox();
    for (const zoom of [50, 100, 200, 400, 1200, 20]) {
        await stepZoomTo(page, zoom);
        const rect = await viewport.boundingBox();
        expect(Math.abs(rect.y - baseline.y)).toBeLessThan(1);
        expect(Math.abs(rect.height - baseline.height)).toBeLessThan(1);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        const box = await canvas(page).boundingBox();
        expect(Math.abs(box.height - 648 * zoom / 100)).toBeLessThan(1.5);
    }
});

test('one finger paints without pointer cancellation and undo restores it', async ({ page, browserName }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile || browserName !== 'chromium', 'Trusted touch input requires Chromium CDP');
    await openStudio(page);
    const client = await page.context().newCDPSession(page);
    await canvas(page).evaluate(element => {
        window.pixelPointerCancels = 0;
        element.addEventListener('pointercancel', () => window.pixelPointerCancels++);
    });
    for (const zoom of [20, 100, 400]) {
        await stepZoomTo(page, zoom);
        const v = await page.locator('.arena-canvas-viewport').boundingBox();
        const c = await canvas(page).boundingBox();
        const before = await snapshot(page);
        const view = await page.locator('.arena-canvas-viewport').evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }));
        await touches(client, swipe([Math.max(c.x, v.x) + 50, Math.max(c.y, v.y) + 40], [60, 24]));
        await expect.poll(async () => await snapshot(page) !== before).toBe(true);
        expect(await page.evaluate(() => window.pixelPointerCancels)).toBe(0);
        expect(await page.locator('.arena-canvas-viewport').evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }))).toEqual(view);
        await page.locator('.ps-bar').getByRole('button', { name: '撤销', exact: true }).click();
        await expect.poll(async () => await snapshot(page) === before).toBe(true);
    }
    await client.detach();
});

test('two fingers pinch-zoom without painting and a two-finger tap undoes', async ({ page, browserName }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile || browserName !== 'chromium', 'Trusted touch input requires Chromium CDP');
    await openStudio(page);
    const client = await page.context().newCDPSession(page);
    const c = await canvas(page).boundingBox();
    const blank = await snapshot(page);
    await touches(client, swipe([c.x + 40, c.y + 30], [80, 20]));
    await expect.poll(async () => await snapshot(page) !== blank).toBe(true);
    const painted = await snapshot(page);

    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const start = await zoomValue(page);
    const pinch = [['touchStart', [[cx - 30, cy], [cx + 30, cy]]]];
    for (let step = 1; step <= 12; step += 1) pinch.push(['touchMove', [[cx - 30 - step * 10, cy], [cx + 30 + step * 10, cy]]]);
    pinch.push(['touchEnd', []]);
    await touches(client, pinch, 30);
    await expect.poll(() => zoomValue(page)).toBeGreaterThan(start * 1.8);
    expect(await snapshot(page)).toBe(painted);

    await touches(client, [['touchStart', [[cx - 40, cy], [cx + 40, cy]]], ['touchEnd', []]], 50);
    await expect.poll(async () => await snapshot(page) === blank).toBe(true);
    await client.detach();
});

test('a second finger withdraws a stroke that just started', async ({ page, browserName }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile || browserName !== 'chromium', 'Trusted touch input requires Chromium CDP');
    await openStudio(page);
    const client = await page.context().newCDPSession(page);
    const c = await canvas(page).boundingBox();
    const blank = await snapshot(page);
    const [x, y] = [c.x + 50, c.y + 40];
    await touches(client, [
        ['touchStart', [[x, y]]],
        ['touchMove', [[x + 20, y]]],
        ['touchStart', [[x + 20, y], [x + 120, y + 40]]],
        ['touchMove', [[x + 10, y], [x + 140, y + 50]]],
        ['touchEnd', []]
    ], 30);
    await page.waitForTimeout(150);
    expect(await snapshot(page)).toBe(blank);
    await expect(page.locator('.ps-bar').getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await client.detach();
});

test('hand tool and pasteboard drags pan the zoomed canvas, never the page', async ({ page, browserName }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile || browserName !== 'chromium', 'Trusted touch input requires Chromium CDP');
    await openStudio(page);
    const client = await page.context().newCDPSession(page);
    const viewport = page.locator('.arena-canvas-viewport');
    await stepZoomTo(page, 200);
    const blank = await snapshot(page);
    await page.locator('.ps-toolbar').getByRole('button', { name: '移动', exact: true }).click();
    const v = await viewport.boundingBox();
    const before = await viewport.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }));
    await touches(client, swipe([v.x + v.width / 2, v.y + v.height / 2], [-120, -60]));
    await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(before.left + 60);
    expect(await snapshot(page)).toBe(blank);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // Back on the brush, a drag that starts on the pasteboard still pans instead of painting.
    await page.locator('.ps-toolbar').getByRole('button', { name: '画笔', exact: true }).click();
    await stepZoomTo(page, 50);
    const c = await canvas(page).boundingBox();
    const left = await viewport.evaluate(el => el.scrollLeft);
    await touches(client, swipe([v.x + v.width / 2, Math.max(v.y + 6, c.y - 14)], [-80, 0]));
    await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(left + 40);
    expect(await snapshot(page)).toBe(blank);
    await client.detach();
});

test('panels open as a bottom sheet and drawing tools stay one tap away', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'Phone layout');
    await openStudio(page);
    const studio = page.locator('.pixel-studio');
    await page.locator('.ps-chip-fg').click();
    await expect(studio).toHaveClass(/is-sheet-open/);
    const sheet = page.locator('#arena-controls-panel');
    await expect(sheet.getByRole('tab', { name: '颜色' })).toHaveAttribute('aria-selected', 'true');
    await sheet.locator('[data-panel="swatches"] .ps-swatch').nth(5).click();
    await expect(page.locator('.ps-chip-fg')).toHaveAttribute('style', /255, 154, 186|#ff9aba/i);
    await sheet.getByRole('tab', { name: '画笔' }).click();
    await sheet.getByRole('button', { name: '大小 4 px', exact: true }).click();
    await expect(page.locator('.ps-dock-size')).toContainText('4');
    await sheet.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(studio).not.toHaveClass(/is-sheet-open/);

    await page.locator('.ps-bar').getByRole('button', { name: '更多', exact: true }).click();
    await expect(sheet.getByRole('tab', { name: '文件' })).toHaveAttribute('aria-selected', 'true');
    await expect(sheet.locator('[data-panel="file"]').getByRole('button', { name: '大家的作品' })).toBeVisible();
});

test('narrow phones keep the top bar and dock inside the screen at every zoom', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'Narrow phone overflow regression');
    await page.setViewportSize({ width: 320, height: 640 });
    await openStudio(page);
    for (const zoom of [20, 100, 400]) {
        await stepZoomTo(page, zoom);
        const boxes = await page.evaluate(() => [...document.querySelectorAll('.ps-bar button, .ps-toolbar > *, .ps-tool-group > button')]
            .filter(el => el.getBoundingClientRect().width > 0)
            .map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
        for (const box of boxes) {
            expect(box.left).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(320);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
});
