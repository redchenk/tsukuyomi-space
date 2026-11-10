const { test, expect } = require('../e2e-fixtures.cjs');
const background = page => page.locator('.site-background-shell').evaluate(el => {
  const s = getComputedStyle(el, '::before');
  return { position: s.position, animation: s.animationName, image: s.backgroundImage, top: s.top, left: s.left, width: parseFloat(s.width), height: parseFloat(s.height) };
});
for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`seasonal artwork stays fixed while content scrolls at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto('/hub');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-season', 'spring');
    const before = await background(page);
    expect(before.position).toBe('fixed'); expect(before.animation).toBe('none');
    expect(before.image).toMatch(/moonwhite-lake|moonlit-shrine/);
    await page.mouse.move(viewport.width / 2, viewport.height / 2); await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    expect(await background(page)).toEqual(before);
    expect(before.top).toBe('0px'); expect(before.left).toBe('0px');
    expect(before.width).toBe(viewport.width); expect(before.height).toBeGreaterThanOrEqual(viewport.height);
  });
}
test('login and public pages share Sakura artwork; Access and Room keep their own scenes', async ({ page }) => {
  for (const path of ['/login', '/register', '/stage', '/wiki', '/room/settings']) {
    await page.goto(path); await expect(page.locator('.site-background-shell')).toBeVisible();
    expect((await background(page)).image).toMatch(/moonwhite-lake|moonlit-shrine/);
  }
  await page.goto('/'); await expect(page.locator('.site-background-shell')).toHaveCount(0);
  await expect(page.locator('.access-film-poster')).toBeVisible();
  await page.locator('.access-enter').click(); await expect(page).toHaveURL(/\/hub$/);
  await page.goto('/room'); await expect(page.locator('.room-shell')).toBeVisible();
  await expect(page.locator('.site-background-shell')).toHaveCount(0);
  await page.goto('/hub'); expect((await background(page)).image).toMatch(/moonwhite-lake|moonlit-shrine/);
});
