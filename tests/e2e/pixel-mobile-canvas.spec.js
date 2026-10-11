const { test, expect } = require('../e2e-fixtures.cjs');

async function openWorkspace(page) {
    await page.goto('/pixel');
    await expect(page.getByRole('img', { name: 'pixel canvas', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
}

async function setZoom(page, target) {
    const controls = page.locator('.arena-zoom-controls');
    let current = Number.parseInt(await controls.locator('strong').textContent(), 10);
    while (current !== target) {
        await controls.getByRole('button', { name: `缩放 ${current < target ? '+' : '-'}`, exact: true }).click();
        current = Number.parseInt(await controls.locator('strong').textContent(), 10);
    }
    // Canvas rendering and scroll extents settle on animation frames after zoom.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function touchDrag(page, client, from, delta) {
    const hit = await page.evaluate(p => ({ target: document.elementFromPoint(p.x, p.y)?.className,
        viewport: { width: innerWidth, height: innerHeight }, from: p,
        pageScroll: { x: scrollX, y: scrollY },
        rectangles: ['.pw-workbench', '.pw-body', '.pw-center', '.pw-context', '.pw-statusbar', '.arena-zoom-controls', '.arena-canvas-viewport', '.pixel-canvas-renderer'].map(s => {
            const el = document.querySelector(s), r = el.getBoundingClientRect(); return { s, x: r.x, y: r.y, width: r.width, height: r.height, scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth };
        }) }), from);
    expect(hit.target, JSON.stringify(hit)).toBeTruthy();
    expect(hit.target, JSON.stringify(hit)).toContain('pixel-canvas-renderer');
    const point = (x, y) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
    for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchTouchEvent', {
            type: 'touchMove', touchPoints: point(from.x + delta.x * step / 8, from.y + delta.y * step / 8)
        });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('mobile canvas stays in the same viewport at small and large zooms', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'Phone layout regression');
    await openWorkspace(page);
    const viewport = page.locator('.arena-canvas-viewport');
    const baseline = await viewport.boundingBox();
    const documentTop = baseline.y + await page.evaluate(() => window.scrollY);
    for (const zoom of [20, 30, 50, 100, 150, 260, 20]) {
        await setZoom(page, zoom);
        const rect = await viewport.boundingBox();
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(Math.abs(rect.y + scrollY - documentTop)).toBeLessThan(1);
        expect(Math.abs(rect.x - baseline.x)).toBeLessThan(1);
        expect(Math.abs(rect.height - baseline.height)).toBeLessThan(1);
        expect(await page.locator('.pw-center').evaluate(el => el.scrollLeft)).toBe(0);
        const canvas = await page.getByRole('img', { name: 'pixel canvas', exact: true }).boundingBox();
        expect(Math.abs(canvas.height - 648 * zoom / 100)).toBeLessThan(1);
    }
});

test('finger pans the zoomed canvas without browser cancellation or page drift', async ({ page, browserName }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile || browserName !== 'chromium', 'Trusted touch input requires Chromium CDP');
    await openWorkspace(page);
    const client = await page.context().newCDPSession(page);
    const viewport = page.locator('.arena-canvas-viewport');
    await page.evaluate(() => {
        window.pixelPointerCancels = 0;
        document.querySelector('.pw-center .pixel-canvas-renderer').addEventListener('pointercancel', () => window.pixelPointerCancels++);
    });
    for (const zoom of [20, 50, 100, 150, 260]) {
        await setZoom(page, zoom);
        await page.getByRole('button', { name: '移动', exact: true }).click();
        await viewport.evaluate(el => { el.scrollTop = 0; el.scrollLeft = 0; });
        const v = await viewport.boundingBox();
        const c = await page.getByRole('img', { name: 'pixel canvas', exact: true }).boundingBox();
        const initialY = await page.evaluate(() => window.scrollY);
        const from = { x: Math.max(c.x, v.x + 32) + 60, y: Math.max(c.y, v.y + 28) + 55 };
        const maxScroll = await viewport.evaluate(el => el.scrollHeight - el.clientHeight);
        await touchDrag(page, client, from, { x: 0, y: -40 });
        expect(await page.evaluate(() => window.pixelPointerCancels), `pointercancel at ${zoom}%`).toBe(0);
        expect(await page.evaluate(() => window.scrollY), `page scroll at ${zoom}%`).toBe(initialY);
        expect(await page.locator('.pw-center').evaluate(el => el.scrollLeft)).toBe(0);
        await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeCloseTo(Math.min(40, maxScroll), 0);
        await touchDrag(page, client, from, { x: 0, y: 20 });
        await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeCloseTo(Math.max(0, Math.min(40, maxScroll) - 20), 0);
    }
    await client.detach();
});

test('finger drawing stays fixed at low and high zooms and undo preserves the artwork', async ({ page, browserName }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile || browserName !== 'chromium', 'Trusted touch input requires Chromium CDP');
    await openWorkspace(page);
    const client = await page.context().newCDPSession(page);
    const viewport = page.locator('.arena-canvas-viewport');
    const canvas = page.getByRole('img', { name: 'pixel canvas', exact: true });
    for (const zoom of [20, 100, 260]) {
        await setZoom(page, zoom);
        await page.getByRole('button', { name: '画笔', exact: true }).click();
        const v = await viewport.boundingBox();
        const c = await canvas.boundingBox();
        const before = await canvas.evaluate(el => el.toDataURL());
        const position = await viewport.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft, page: window.scrollY }));
        await touchDrag(page, client, { x: Math.max(c.x, v.x + 32) + 60, y: Math.max(c.y, v.y + 28) + 55 }, { x: 0, y: 20 });
        await expect.poll(async () => await canvas.evaluate(el => el.toDataURL()) !== before).toBe(true);
        expect(await viewport.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft, page: window.scrollY }))).toEqual(position);
        await page.getByRole('button', { name: '撤销', exact: true }).click();
        await expect.poll(async () => await canvas.evaluate(el => el.toDataURL()) === before).toBe(true);
    }
    await client.detach();
});

test('drawing and move tools own canvas gestures while the surrounding page remains scrollable', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'Phone gesture regression');
    await openWorkspace(page);
    const canvas = page.getByRole('img', { name: 'pixel canvas', exact: true });
    for (const tool of ['画笔', '橡皮', '填充', '移动']) {
        await page.getByRole('button', { name: tool, exact: true }).click();
        expect(await canvas.evaluate(el => getComputedStyle(el).touchAction)).toBe('none');
    }
    expect(await page.locator('.arena-page').evaluate(el => getComputedStyle(el).touchAction)).toBe('pan-y pinch-zoom');
});

test('narrow phone toolbars stay inside the canvas panel at every zoom', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'Narrow phone overflow regression');
    await page.setViewportSize({ width: 320, height: 844 });
    await openWorkspace(page);
    await expect(page.locator('.pw-fit-top')).toBeHidden();
    for (const zoom of [20, 100, 260]) {
        await setZoom(page, zoom);
        const panel = await page.locator('.pw-center').evaluate(el => ({
            left: el.scrollLeft, width: el.clientWidth, content: el.scrollWidth
        }));
        expect(panel.left).toBe(0);
        expect(panel.content).toBeLessThanOrEqual(panel.width);
        const context = await page.locator('.pw-context').boundingBox();
        for (const name of ['网格', '专注绘画', '颜色']) {
            const rect = await page.locator('.pw-context').getByRole('button', { name, exact: true }).boundingBox();
            expect(rect.x).toBeGreaterThanOrEqual(context.x);
            expect(rect.x + rect.width).toBeLessThanOrEqual(context.x + context.width);
        }
    }
});
