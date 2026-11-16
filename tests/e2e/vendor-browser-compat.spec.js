const { test, expect } = require('../e2e-fixtures.cjs');
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });
const { configureRoomFixture, waitForRoom } = require('../e2e-room-helpers.cjs');

test('season colours and background remain complete without native colour mixing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/hub'); await expect(page.locator('#boot-splash')).toHaveCount(0);
  for (const theme of ['light', 'dark']) for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const result = await page.evaluate(({ theme, season }) => {
      const root = document.documentElement;
      root.dataset.theme = theme; root.dataset.season = season;
      const styles = getComputedStyle(root);
      const element = document.createElement('div');
      element.style.background = 'var(--ts-accent-soft)'; document.body.append(element);
      const actual = getComputedStyle(element).backgroundColor;
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      const pixel = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
      const a = pixel(styles.getPropertyValue('--accent').trim()), b = pixel(styles.getPropertyValue('--paper').trim());
      const expected = a.map((v, i) => i === 3 ? 255 : Math.round(v * .09 + b[i] * .91));
      const measured = pixel(actual); element.remove();
      return { actual, measured, expected, background: getComputedStyle(document.querySelector('.site-background-shell'), '::before').backgroundImage, overflow: root.scrollWidth > innerWidth };
    }, { theme, season });
    result.measured.forEach((value, i) => expect(Math.abs(value - result.expected[i]), `${season}/${theme}: ${result.actual}`).toBeLessThanOrEqual(1));
    expect(result.background).toContain('url('); expect(result.background).toContain('linear-gradient'); expect(result.overflow).toBe(false);
  }
});

test('320px Pixel touch controls are separate, usable and inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/pixel'); await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.ps-toolbar')).toBeVisible();
  for (const selector of ['.ps-doc-button', '.ps-bar .ps-icon-btn', '.ps-bar-actions > .ps-btn-primary', '.ps-tool-group .ps-tool', '.ps-dock-size', '.ps-chip-fg', '.ps-zoom .ps-icon-btn.is-small', '.ps-zoom-value']) {
    for (const button of await page.locator(selector).all()) {
      if (!await button.isVisible()) continue;
      const box = await button.boundingBox();
      expect(box.width, selector).toBeGreaterThanOrEqual(44); expect(box.height, selector).toBeGreaterThanOrEqual(44);
      expect(box.x, selector).toBeGreaterThanOrEqual(0); expect(box.x + box.width, selector).toBeLessThanOrEqual(320);
      if (!await button.isDisabled()) expect(await button.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), selector).toBe(true);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: 'output/vendor-browser-compat-20261116/pixel-320.png' });
});

test('Room attachment icons have their own row above the composer at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await configureRoomFixture(page);
  await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/room'); await waitForRoom(page);
  await page.locator('.chat-attach-menu summary').click();
  await expect(page.locator('.chat-input-row')).toHaveClass(/has-attachments-open/);
  const suggestions = await page.locator('.room-chat-suggestions').boundingBox();
  const options = await page.locator('.chat-attach-options').boundingBox();
  expect(options.y).toBeGreaterThanOrEqual(suggestions.y + suggestions.height);
  for (const id of ['attachImageBtn', 'attachFileBtn']) {
    const button = page.locator('#' + id), box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  }
  await page.screenshot({ path: 'output/vendor-browser-compat-20261116/room-attachments-320.png' });
  await page.keyboard.press('Escape'); await expect(page.locator('.chat-input-row')).not.toHaveClass(/has-attachments-open/);
});

test('compatibility probe is self-contained and makes no data requests', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(request.url()); });
  await page.goto('/compat/');
  await expect(page.locator('#features dt')).toHaveCount(17);
  await page.locator('#keyboard').fill('这里只在本机输入');
  await page.locator('#refresh').click();
  expect(JSON.parse(await page.locator('#report').inputValue()).features).toBeTruthy();
  expect(await page.locator('#report').inputValue()).not.toContain('这里只在本机输入');
  expect(requests).toEqual([]);
});

test('unsupported MP4 keeps the Seedance poster and entry remains usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) { return type.includes('mp4') ? '' : original.call(this, type); };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.access-film-poster')).toBeVisible();
  const hero = await page.locator('.access-hero').boundingBox();
  expect(Math.abs(hero.x + hero.width / 2 - page.viewportSize().width / 2)).toBeLessThan(1);
  await expect(page.locator('.access-film-intro')).toHaveCount(0);
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-gate')).toHaveCount(0);
  await expect(page.locator('.hub')).toBeVisible();
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert');
});
