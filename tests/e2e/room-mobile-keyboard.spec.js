const { test, expect } = require('../e2e-fixtures.cjs');

test('Room input remains above an overlay keyboard and composition never sends a message', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        const viewport = new EventTarget();
        Object.assign(viewport, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
        Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    });
    await page.goto('/room');
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    const input = page.locator('#chatInput');
    await expect(input).toBeVisible();
    const stage = page.locator('.room-stage');
    const canvasContainer = page.locator('#live2d-container');
    const header = page.locator('.room-mobile-header');
    const initialStage = await stage.boundingBox();
    const initialCanvasHeight = await canvasContainer.evaluate(node => node.clientHeight);
    const initialHeader = await header.boundingBox();
    await input.fill('中文输入测试');
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
    await expect(input).toHaveValue('中文输入测试');
    await page.evaluate(() => {
        window.visualViewport.height = 430;
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('.app-shell')).toHaveClass(/is-keyboard-open/);
    await expect(page.locator('.mobile-bottom-nav')).toHaveCSS('visibility', 'hidden');
    const box = await input.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(430);
    // iOS may pan the visual viewport after its keyboard resize event. Screen
    // coordinates are layout coordinates minus offsetTop, not just rect.y.
    await page.evaluate(() => {
        window.visualViewport.offsetTop = 176;
        window.visualViewport.dispatchEvent(new Event('scroll'));
        window.scrollTo(0, 200);
    });
    await expect.poll(async () => (await header.boundingBox()).y - 176).toBeCloseTo(initialHeader.y, 0);
    const shiftedStage = await stage.boundingBox();
    expect(shiftedStage.y - 176).toBeCloseTo(initialStage.y, 0);
    expect(shiftedStage.height).toBeCloseTo(initialStage.height, 0);
    expect(await canvasContainer.evaluate(node => node.clientHeight)).toBe(initialCanvasHeight);
    const shiftedInput = await input.boundingBox();
    expect(shiftedInput.y - 176).toBeGreaterThan(0);
    expect(shiftedInput.y + shiftedInput.height - 176).toBeLessThanOrEqual(430);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await input.evaluate((node) => node.blur());
    // Keep the composer anchored until the closing animation restores space.
    await expect(page.locator('.app-shell')).toHaveClass(/is-keyboard-open/);
    await page.evaluate(() => {
        window.visualViewport.height = 844;
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('.app-shell')).not.toHaveClass(/is-keyboard-open/);
    await expect(page.locator('.mobile-bottom-nav')).toHaveCSS('visibility', 'visible');
    expect((await header.boundingBox()).y).toBeCloseTo(initialHeader.y, 0);
    expect((await stage.boundingBox()).height).toBeCloseTo(initialStage.height, 0);
});
