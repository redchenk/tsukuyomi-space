const { test, expect } = require('../e2e-fixtures.cjs');

const sizes = [{ width: 375, height: 667 }, { width: 360, height: 780 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
async function ready(page, path = '/hub') {
  await page.goto(path);
  await expect(page.locator('#boot-splash')).toHaveCount(0);
}
async function sheetSettled(sheet) {
  await expect(sheet).toBeVisible();
  await sheet.evaluate(node => Promise.allSettled(node.getAnimations().map(animation => animation.finished)));
}
async function login(page, baseURL) {
  const response = await page.request.post('/api/auth/login', {
    headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest', 'Sec-Fetch-Site': 'same-origin' },
    data: { username: 'e2e-user', password: 'e2e-password' }
  });
  expect(response.ok()).toBe(true);
  await page.addInitScript(() => localStorage.setItem('tsukuyomi_user', JSON.stringify({ id: 'e2e-user-001', username: 'e2e-user', role: 'user' })));
}

for (const theme of ['light', 'dark']) for (const season of ['spring', 'summer', 'autumn', 'winter']) {
  test(`mobile geometry across four screens: ${season} ${theme}`, async ({ page }, info) => {
    await page.addInitScript(({ theme, season }) => {
      localStorage.setItem('tsukuyomi_theme', theme);
      localStorage.setItem('tsukuyomi_season_theme_v1', JSON.stringify({ mode: season }));
    }, { theme, season });
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-season', season);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expect.poll(async () => {
        const composer = await page.locator('.hero-composer').boundingBox(), dock = await page.locator('.mobile-dock').boundingBox();
        return composer.y + composer.height <= dock.y - 8;
      }).toBe(true);
      const suggestions = await page.locator('.hero-suggestions').boundingBox(), dock = await page.locator('.mobile-dock').boundingBox();
      expect(suggestions.y + suggestions.height).toBeLessThan(dock.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const target of ['.header-download', '.header-search', '.header-account', '.hero-composer button']) {
        const box = await page.locator(target).boundingBox();
        expect(box.width, target).toBeGreaterThanOrEqual(44); expect(box.height, target).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: `output/mobile-ux/${info.project.name}-${season}-${theme}-${size.width}.png`, animations: 'disabled' });
    }
  });
}

test('exploration, account, sort and music share a dismissible sheet with focus restoration', async ({ page }) => {
  await page.setViewportSize(sizes[2]);
  await ready(page);
  const trigger = page.locator('.mobile-dock > button'), sheet = page.locator('#site-navigation');
  await trigger.click(); await sheetSettled(sheet);
  await expect(sheet.locator('.explore-tiles a')).toHaveCount(8);
  expect((await sheet.boundingBox()).y).toBeGreaterThanOrEqual(16);
  await sheet.locator('.menu-music').click();
  const music = page.locator('.site-music-drawer'); await sheetSettled(music);
  await expect(music.getByRole('button', { name: 'Play music', exact: true }).first()).toBeVisible();
  await music.locator('[data-modal-close]').click(); await expect(music).toHaveCount(0);
  await trigger.click(); await sheetSettled(sheet);
  const grip = await sheet.locator('.sheet-handle').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down(); await page.mouse.move(grip.x + grip.width / 2, grip.y + 145, { steps: 12 }); await page.mouse.up();
  await expect(sheet).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.click(); await sheetSettled(sheet);
  await page.keyboard.press('Escape'); await expect(sheet).not.toBeVisible(); await expect(trigger).toBeFocused();
  await page.locator('.header-account').click(); await sheetSettled(sheet);
  await expect(sheet.locator('.account-menu')).toBeVisible();
  await sheet.locator('[data-modal-close]').click(); await expect(page.locator('.header-account')).toBeFocused();
  await ready(page, '/stage');
  await page.locator('.journal-sort-button').click();
  const sort = page.getByRole('dialog', { name: '文章排序' }); await sheetSettled(sort);
  await sort.getByRole('button', { name: '每日推荐', exact: true }).click();
  await expect(page).toHaveURL(/sort=daily/); await expect(sort).not.toBeVisible();
  await expect(page.locator('.journal-sort-button')).toBeFocused();
});

test('reading keeps actions reachable and directory navigation returns focus to the heading', async ({ page }) => {
  await page.setViewportSize(sizes[2]);
  await ready(page, '/stage');
  const first = page.locator('.journal-title').first(); const title = await first.innerText();
  await first.click(); await expect(page.locator('.article-content')).toBeVisible();
  await expect(page.locator('.mobile-dock')).toHaveCount(0);
  const toolbar = page.locator('.article-reading-tools'); await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: '文章目录' }).click();
  const contents = page.getByRole('dialog', { name: '文章目录' }); await sheetSettled(contents);
  const link = contents.locator('a').last();
  if (await link.count()) {
    const id = await link.getAttribute('href'); await link.click();
    await expect(contents).not.toBeVisible(); await expect(page.locator(id)).toBeInViewport();
  } else { await contents.locator('[data-modal-close]').click(); }
  await toolbar.getByRole('button', { name: '分享', exact: true }).click();
  const share = page.getByRole('dialog', { name: '分享', exact: true }); await sheetSettled(share);
  await expect(share.locator('.social-share-copy')).toContainText(title);
  await share.locator('[data-modal-close]').click();
  await page.goBack(); await expect(page.locator('.journal-list')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-route-transition', 'active');
});

test('a mobile post draft survives dismissing, reopening and changing the layout', async ({ page, baseURL }) => {
  await page.setViewportSize(sizes[2]); await login(page, baseURL); await ready(page, '/plaza');
  await page.locator('.plaza-compose-trigger').click();
  const input = page.locator('#plaza-message-input'); await expect(input).toBeVisible();
  await input.fill('关闭抽屉后，这段草稿应该仍然保留。');
  const sheet = page.getByRole('dialog', { name: '今天有什么想分享的？' });
  await sheet.locator('[data-modal-close]').click(); await expect(sheet).not.toBeVisible();
  await page.locator('.plaza-compose-trigger').click(); await expect(input).toHaveValue('关闭抽屉后，这段草稿应该仍然保留。');
  await page.setViewportSize({ width: 1280, height: 900 }); await expect(input).toHaveCount(1); await expect(input).toHaveValue('关闭抽屉后，这段草稿应该仍然保留。');
});

test('safe area, reduced motion and an overlay keyboard preserve the mobile controls', async ({ page }) => {
  await page.setViewportSize(sizes[2]); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const viewport = new EventTarget(); Object.assign(viewport, { height: 844, width: 390, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  });
  await ready(page);
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
  await page.evaluate(() => { document.documentElement.style.setProperty('--safe-t', '44px'); document.documentElement.style.setProperty('--safe-b', '34px'); });
  const dock = await page.locator('.mobile-dock').boundingBox(); expect(dock.y + dock.height).toBeLessThanOrEqual(844 - 34);
  await page.locator('.hero-composer input').fill('键盘测试');
  await page.evaluate(() => { visualViewport.height = 430; visualViewport.dispatchEvent(new Event('resize')); });
  await expect(page.locator('.mobile-dock')).toHaveCount(0);
  await page.locator('.hero-composer input').blur();
  await page.evaluate(() => { visualViewport.height = 844; visualViewport.dispatchEvent(new Event('resize')); });
  await expect(page.locator('.mobile-dock')).toBeVisible();
  await page.locator('.mobile-dock > button').click();
  expect(await page.locator('#site-navigation').evaluate(node => node.getAnimations().length)).toBe(0);
});

test('chat detents resize without hiding the input or moving the scene', async ({ page }) => {
  await page.setViewportSize(sizes[2]);
  await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ status: 404, body: '' }));
  await ready(page, '/room');
  await page.getByRole('button', { name: '先进入房间', exact: true }).click();
  await page.getByRole('button', { name: '稍后设置', exact: true }).click();
  const panel = page.locator('.room-conversation-surface'), handle = page.locator('.room-sheet-handle');
  const initialScene = await page.locator('.room-stage').boundingBox();
  for (const detent of ['peek', 'half', 'full', 'peek']) {
    await expect(panel).toHaveAttribute('data-detent', detent);
    await expect(page.locator('#chatInput')).toBeInViewport();
    expect((await page.locator('.room-stage').boundingBox()).height).toBe(initialScene.height);
    await handle.click();
  }
  await handle.press('End'); await expect(panel).toHaveAttribute('data-detent', 'full');
  await handle.press('Home'); await expect(panel).toHaveAttribute('data-detent', 'peek');
  await panel.evaluate(node => Promise.allSettled(node.getAnimations().map(animation => animation.finished)));
  const grip = await handle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down(); await page.mouse.move(grip.x + grip.width / 2, 90, { steps: 16 }); await page.mouse.up();
  await expect(panel).toHaveAttribute('data-detent', 'full');
});

for (const theme of ['light', 'dark']) test(`legacy utilities fit a narrow viewport and the editor stays usable in ${theme}`, async ({ page, baseURL }) => {
  await page.setViewportSize(sizes[1]); await login(page, baseURL);
  await page.addInitScript(theme => localStorage.setItem('tsukuyomi_theme', theme), theme);
  for (const path of ['/notifications', '/users/e2e-user', '/attachments', '/friend-links', '/editor', '/terminal', '/reality', '/pixel']) {
    await ready(page, path);
    await expect(page.locator('main').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true);
    const smallInputs = await page.locator('main input, main textarea, main select').evaluateAll(nodes => nodes.filter(node => node.checkVisibility() && !['file', 'checkbox', 'radio', 'range', 'color', 'hidden'].includes(node.type) && parseFloat(getComputedStyle(node).fontSize) < 16).map(node => node.id));
    expect(smallInputs, path).toEqual([]);
  }
  await ready(page, '/editor');
  await page.locator('#editorTitle').fill('手机上的一篇新文章');
  await page.locator('#editorContent').fill('## 月光下\n\n手机上也能安心写作。');
  await page.locator('.editor-view-switch button').last().click();
  await expect(page.locator('.editor-markdown-preview h2')).toHaveText('月光下');
  await page.locator('.editor-view-switch button').first().click();
  await expect(page.locator('#editorContent')).toHaveValue('## 月光下\n\n手机上也能安心写作。');
});
