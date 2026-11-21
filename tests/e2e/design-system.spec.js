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
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await fill(saved)) !== (await fill(unread))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(saved).toHaveCSS('transition-duration', /^(?:0s)(?:, 0s)*$/);
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

test('real seasonal themes preserve colour contrast, button sizes and busy geometry', async ({ page }, info) => {
  test.skip(process.env.DESIGN_PREVIEW !== '1', 'Requires the local component catalogue.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design-system');
  const sample = page.locator('.samples-page');
  await expect(sample).toBeVisible();
  const seasons = sample.locator('.samples-palette [data-ui="choice"]');
  const mode = sample.locator('.samples-palette [aria-pressed]').last();
  const save = sample.locator('button[type="submit"]');
  const cssColours = [];
  for (const [index, season] of ['spring', 'summer', 'autumn', 'winter'].entries()) {
    await seasons.nth(index).click();
    await expect(page.locator('html')).toHaveAttribute('data-season', season);
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await mode.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const pairs = await sample.evaluate(el => {
        const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgb = css => {
          context.fillStyle = css; context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
        };
        const luminance = colour => rgb(colour).reduce((result, byte, i) => {
          const v = byte / 255;
          return result + [0.2126, 0.7152, 0.0722][i] * (v <= 0.04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        }, 0);
        const root = getComputedStyle(document.documentElement);
        const paint = name => root.getPropertyValue('--' + name).trim();
        const actual = selector => {
          const style = getComputedStyle(el.querySelector(selector));
          return [style.color, style.backgroundColor];
        };
        const colours = [actual('[data-ui="primary"]'),actual('[data-ui="secondary"]'),actual('[data-ui="danger"]'),
          actual('[data-ui="choice"][aria-pressed="true"]'),[paint('muted'), paint('paper')],[paint('ink'), paint('surface')]];
        return { accent: paint('accent'), contrast: colours.map(([fg,bg]) => {
          const values = [luminance(fg), luminance(bg)].sort((a,b) => b-a);
          return (values[0] + .05) / (values[1] + .05);
        }) };
      });
      cssColours.push(pairs.accent);
      for (const value of pairs.contrast) expect(value, season + ' / ' + theme).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(new Set(cssColours).size).toBe(8);
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  for (const [size, expected] of [['sm',touch ? 44 : 36],['md',44],['lg',48]]) {
    const element = sample.locator('.ui-panel button[data-size="' + size + '"]').first();
    const box = await element.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(expected);
    if (touch) expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  const narrow = sample.locator('input[type="checkbox"]').first();
  await narrow.check();
  for (const label of ['保存当前房间的全部语音设置'.repeat(3),'この部屋の字幕と音声設定を保存する'.repeat(3),'Publish artwork and save the current room preferences','ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(4)]) {
    await sample.locator('#test-action-label').fill(label);
    await expect(save).toContainText(label);
    expect(await layout(page)).toEqual([]);
    const box = await save.boundingBox();
    await sample.locator('input[type="checkbox"]').nth(1).check();
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute('aria-busy','true');
    expect(await save.evaluate(el => [el.offsetWidth,el.offsetHeight])).toEqual([Math.round(box.width), Math.round(box.height)]);
    await expect(save).toContainText(label);
    await sample.locator('input[type="checkbox"]').nth(1).uncheck();
  }
});

test('double text size at a fixed viewport on editorial pages', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.goto('/stage');
  const articleLink = page.locator('.journal-row a[href^="/articles/"]').first();
  await expect(articleLink).toBeVisible();
  const article = await articleLink.getAttribute('href');
  for (const route of ['/gallery', '/plaza', '/stage', article, '/payments', ...(process.env.DESIGN_PREVIEW === '1' ? ['/design-system'] : [])]) {
    await page.goto(route);
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect(page.locator('main h1').first()).toBeVisible();
    // Magnify rendered text only, including legacy pixel fonts. Keep viewport and controls at their original widths.
    const change = await page.locator('main:visible').last().evaluate(main => {
      const nodes = [main,...main.querySelectorAll('*')].filter(el =>
        el instanceof HTMLElement && (el.matches('button, input, select, textarea') ||
        [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())));
      const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize));
      nodes.forEach((el, i) => el.style.setProperty('font-size', (2 * sizes[i]) + 'px', 'important'));
      return nodes.every((el,i) => Math.abs(parseFloat(getComputedStyle(el).fontSize) - 2 * sizes[i]) < .1);
    });
    expect(change).toBe(true);
    expect(await page.evaluate(() => innerWidth)).toBe(1280);
    expect(await layout(page), route).toEqual([]);
  }
});
