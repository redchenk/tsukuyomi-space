const { test, expect } = require('../e2e-fixtures.cjs');
const article = { id: 3, title: '双向滚动验收文章', content_format: 'markdown',
  content: Array.from({ length: 32 }, (_, i) => `## 月下章节 ${i + 1}\n\n${'顺着月光阅读，向下探索，向上回望。'.repeat(12)}`).join('\n\n') };
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//, route => route.fulfill({ json: { success: true, data: article } }));
  await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/messages/, route => route.fulfill({ json: { success: true, data: [] } }));
});
async function ready(page) {
  await page.goto('/article?id=3');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.article-content')).toContainText('月下章节 32');
}
test('native scrolling works in both directions without a second scroll engine', async ({ page, isMobile }) => {
  await ready(page);
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
  if (isMobile) await page.evaluate(() => scrollBy(0, 650));
  else { await page.mouse.move(180, 300); await page.mouse.wheel(0, 650); }
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  const down = await page.evaluate(() => scrollY);
  if (isMobile) await page.evaluate(() => scrollBy(0, -250));
  else await page.mouse.wheel(0, -250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(down - 100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('reading content stays visible when revisited from either direction', async ({ page }) => {
  await ready(page);
  const block = page.locator('.article-content > p').nth(5);
  await block.scrollIntoViewIfNeeded();
  await expect(block).toBeInViewport();
  await expect(block).toHaveCSS('opacity', '1');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await block.scrollIntoViewIfNeeded();
  await expect(block).toBeInViewport();
  await expect(block).toHaveCSS('opacity', '1');
  expect(await block.evaluate(el => el.getAnimations().length)).toBe(0);
});
test('reduced motion leaves reading and native scrolling usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const block = page.locator('.article-content > p').nth(8);
  await block.scrollIntoViewIfNeeded();
  await expect(block).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  expect(await block.evaluate(el => el.getAnimations().length)).toBe(0);
});
test('search locks the document and releases scrolling and focus on Escape', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => scrollTo(0, 400));
  const trigger = page.locator('.header-search');
  await trigger.evaluate(el => el.focus({ preventScroll: true }));
  const before = await page.evaluate(() => scrollY);
  await trigger.press('Enter');
  const search = page.getByRole('dialog', { name: '想找些什么？' });
  await expect(search).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(search).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(3);
});
test('public routes use native scrolling without animation errors', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/hub', '/stage', '/plaza', '/gallery', '/wiki', '/download']) {
    await page.goto(path);
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/lenis/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
