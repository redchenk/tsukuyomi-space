const { test, expect } = require('../e2e-fixtures.cjs');

test.describe.configure({ mode: 'parallel' });

const actions = '[data-ui], .primary-btn, .ghost-btn, .danger-btn, .chip, .filter-btn, .tab-btn, .stage-page-btn, .stage-new-btn';
const routes = ['/hub', '/payments', '/wiki', '/stage', '/plaza', '/gallery', '/download', '/growth', '/friend-links', '/login', '/register', '/game', '/notifications', '/room/settings', '/apply', '/privacy', '/friend-links/apply', '/chatroom', '/drift', '/pixel', '/game/gomoku', '/reality'];

// Inspect the text rectangles, including labels that a nested ellipsis or a fixed-height button would clip.
async function layout(page) {
  return page.evaluate(selector => {
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page exceeds viewport: ' + document.documentElement.scrollWidth);
    for (const el of document.querySelectorAll(selector)) {
      const bounds = el.getBoundingClientRect();
      if (!bounds.width || !bounds.height || bounds.right < 0 || bounds.left > innerWidth || getComputedStyle(el).visibility === 'hidden') continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, text = node.textContent.trim();
        if (!text || node.parentElement.closest('[hidden], .sr-only, .ts-visually-hidden, .visually-hidden')) continue;
        const range = document.createRange();
        for (const word of node.textContent.matchAll(/\b[A-Za-z]{2,12}\b/g)) {
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const lines = new Set(Array.from(range.getClientRects()).filter(r => r.width > 1).map(r => Math.round(r.top)));
          if (lines.size > 1) problems.push(el.className + ' split word: ' + word[0]);
        }
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 1 && rect.height > 1);
        if (rects.some(rect => rect.left < bounds.left - 2 || rect.right > bounds.right + 2 || rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2)) {
          problems.push(el.tagName + '.' + String(el.className).split(' ').join('.') + ' / ' + text.slice(0, 80));
        }
      }
    }
    return problems;
  }, actions);
}
for (const language of (process.env.UI_ENGLISH_EDITION === '1' ? ['en'] : ['zh', 'en', 'ja'])) {
  test('shared control labels fit on content and account routes in ' + language, async ({ page }) => {
    test.setTimeout(240000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(lang => {
      localStorage.setItem('lang', lang);
      localStorage.setItem('tsukuyomi_content_translation', 'off');
    }, language);
    await page.goto('/hub');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    if (language !== 'en' && await page.locator('meta[http-equiv="content-language"][content="en"]').count()) {
      test.skip(true, 'The compiled English edition fixes its interface language.');
    }
    await expect(page.locator('html')).toHaveAttribute('lang', new RegExp('^' + language + '(?:-|$)'));
    const errors = [];
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#boot-splash')).toHaveCount(0);
      await expect(page.locator('main:visible, [role="main"]:visible').first()).toBeVisible();
      for (const width of [320, 390, 768, 1081, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const problems = await layout(page);
        if (problems.length) errors.push(route + ' @' + width + ' ' + problems.join('; '));
      }
    }
    expect(errors).toEqual([]);
  });
}

test('catalogue demonstrates shared actions, focus, busy state and wrapping', async ({ page }, info) => {
  test.skip(process.env.DESIGN_PREVIEW !== '1', 'The catalogue is available in development and design-preview builds.');
  await page.goto('/design-system');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  const sample = page.locator('.samples-page');
  await expect(sample).toBeVisible();
  const selection = sample.locator('select');
  await selection.selectOption('en');
  await sample.locator('input[type="checkbox"]').first().check();
  const unread = sample.getByRole('button', { name: 'Unread' });
  await unread.click();
  await expect(unread).toHaveAttribute('aria-pressed', 'true');
  const saved = sample.getByRole('button', { name: 'Saved', exact: true });
  if (info.project.use.isMobile) {
    // Mobile Safari follows the device keyboard navigation preference for Tab.
    await saved.focus();
  } else {
    await unread.press('Tab');
  }
  await expect(saved).toBeFocused();
  await saved.press('Enter');
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  const fill = control => control.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(await fill(saved)).not.toBe(await fill(unread));
  expect((await saved.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const save = sample.locator('button[type="submit"]');
  await sample.locator('input[type="checkbox"]').nth(1).check();
  await expect(save).toBeDisabled();
  await sample.locator('input[type="checkbox"]').nth(1).uncheck();
  for (const lang of ['zh','en','ja']) {
    await selection.selectOption(lang);
    for (const width of [320,390,1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await layout(page)).toEqual([]);
    }
  }
  await save.click();
  await expect(sample.locator('output')).toHaveText('八千代の部屋');
  await selection.selectOption('zh');
  await sample.locator('input[type="checkbox"]').first().uncheck();
  if (process.env.UI_CAPTURE_DIR) {
    const fs = require('node:fs'), path = require('node:path');
    fs.mkdirSync(process.env.UI_CAPTURE_DIR, { recursive: true });
    for (const [label,width] of [['desktop',1440],['mobile',390]]) {
      await page.setViewportSize({ width, height: label === 'desktop' ? 900 : 844 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: path.join(process.env.UI_CAPTURE_DIR, 'catalogue-' + label + '.png'), fullPage: true });
    }
  }
});

test('signed-in wallet and profile actions fit in the dark theme', async ({ page, baseURL }) => {
  test.skip(!['127.0.0.1','localhost'].includes(new URL(baseURL).hostname), 'Uses an isolated fixture account.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const res = await page.request.post('/api/auth/login', {
    headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' },
    data: { username: 'e2e-user', password: 'e2e-password' }
  });
  expect(res.status()).toBe(200);
  await page.addInitScript(user => {
    localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
    localStorage.setItem('lang','en');
    localStorage.setItem('tsukuyomi_theme','dark');
  }, (await res.json()).data.user);
  for (const [route, selector] of [['/payments','.payment-section-nav'],['/user-center','.uc-page'],['/room/settings?section=llm','.settings-providers']]) {
    await page.goto(route);
    await expect(page.locator(selector).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    for (const width of [320, 390, 860, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await layout(page), route + ' at ' + width).toEqual([]);
    }
  }
});
