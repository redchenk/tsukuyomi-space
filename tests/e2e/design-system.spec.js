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
  await page.goto('/gallery');
  await page.locator('.header-account').click();
  const shelf = page.locator('#site-navigation');
  for (const path of ['/user-center','/notifications','/attachments','/growth']) {
    await expect(shelf.locator(`.account-menu a[href="${path}"]`)).toBeVisible();
  }
  await expect(shelf.locator('.account-menu a[href="/login"]')).toHaveCount(0);
  await shelf.locator('.account-menu a[href="/user-center"]').click();
  await expect(page).toHaveURL(/\/user-center$/);
  await expect(shelf).not.toBeVisible();
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

test('liquid controls follow a pointer and emit one set of rings per native activation', async ({ page }, info) => {
  test.skip(process.env.DESIGN_PREVIEW !== '1', 'Requires the local component catalogue.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/design-system');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  const panel = page.locator('.samples-page');
  const sample = variant => panel.locator(`.ui-panel [data-ui="${variant}"]`).first();
  for (const variant of ['primary','accent','secondary','choice','danger','ghost']) {
    await expect(sample(variant)).toHaveCSS('border-radius','12px');
    await expect(sample(variant)).toHaveCSS('clip-path','none');
  }
  const target = panel.locator('.ui-panel button[data-ui="secondary"]:enabled').first();
  await target.scrollIntoViewIfNeeded();
  // Record the transient paint in the same frame, independent of runner speed.
  await page.evaluate(() => {
    window.controlPaint = [];
    new MutationObserver(records => {
      for (const rec of records) for (const node of rec.addedNodes) {
        if (!(node instanceof HTMLElement) || !node.matches('.ui-liquid-wave') || !node.childElementCount) continue;
        const rings = [...node.children];
        window.controlPaint.push({
          rings: rings.length, pointer: getComputedStyle(node).pointerEvents,
          inert: node.inert, hidden: node.getAttribute('aria-hidden'), width: node.getBoundingClientRect().width,
          x: parseFloat(node.style.getPropertyValue('--wave-x')), animation: getComputedStyle(rings[0]).animationName,
          delays: rings.map(el => parseFloat(getComputedStyle(el).animationDelay))
        });
      }
    }).observe(document.body, {childList:true, subtree:true});
  });

  const box = await target.boundingBox();
  if (info.project.use.isMobile) {
    await target.tap({ position: {x:12, y:Math.floor(box.height/2)} });
  } else {
    const highlight = () => target.evaluate(el => parseFloat(el.style.getPropertyValue('--lens-x')));
    await target.hover({position:{x:10,y:Math.floor(box.height / 2)}});
    await expect.poll(highlight).toBeLessThan(35);
    await target.hover({position:{x:Math.floor(box.width - 10),y:Math.floor(box.height / 2)}});
    await expect.poll(highlight).toBeGreaterThan(65);
    await target.click({ position: {x:12, y:Math.floor(box.height/2)} });
  }
  await expect(panel.locator('output')).toHaveText(await target.innerText());
  const waves = () => page.evaluate(() => window.controlPaint);
  const [wave] = await waves();
  expect(wave).toMatchObject({rings:3,inert:true,hidden:'true',pointer:'none',animation:'ui-liquid-ring'});
  expect(Math.abs(wave.x - 12)).toBeLessThan(3);
  expect(wave.delays[0]).toBeLessThan(wave.delays[1]);
  expect(wave.delays[1]).toBeLessThan(wave.delays[2]);
  expect(await waves()).toHaveLength(1);
  await expect(page.locator('.ui-liquid-wave')).toHaveCount(0);
  await target.press('Enter');
  const events = await waves();
  expect(events).toHaveLength(2);
  expect(Math.abs(events[1].x - events[1].width / 2)).toBeLessThan(1);
  await expect(page.locator('.ui-liquid-wave')).toHaveCount(0);
  const disabled = panel.locator('.ui-panel button:disabled').first();
  await disabled.scrollIntoViewIfNeeded();
  await disabled.click({force:true});
  expect(await waves()).toHaveLength(2);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(target).toHaveCSS('transition-duration', /^(?:0s)(?:, 0s)*$/);
  await target.press('Enter');
  expect(await waves()).toHaveLength(2);
});

test('season display follows the real preference and the payment control opens the wallet', async ({ page }) => {
  test.skip(process.env.DESIGN_PREVIEW !== '1', 'Requires the local component catalogue.');
  await page.goto('/design-system');
  const palette = page.locator('.samples-palette');
  const next = palette.locator('.samples-plate-controls button');
  await expect(next).toBeVisible();
  const before = await page.locator('html').getAttribute('data-season');
  const mark = () => palette.locator('.plate-mark').evaluateAll(paths => paths.map(path => path.getAttribute('d')).join(''));
  const initialMark = await mark();
  await next.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-season',before);
  await expect.poll(() => palette.locator('.plate-imprint').count()).toBe(1);
  await expect.poll(mark).not.toBe(initialMark);
  await expect(palette.locator('[data-ui="choice"][aria-pressed="true"]')).toHaveCount(1);
  const link = page.locator('.payment-center-link:visible').first();
  await expect(link).toHaveAttribute('href','/payments');
  await link.click();
  await expect(page).toHaveURL(/\/payments(?:[?#]|$)/);
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('.ui-liquid-wave')).toHaveCount(0);
});

test('text stays legible on the painted liquid surfaces in all eight palettes', async ({ page }) => {
  test.skip(process.env.DESIGN_PREVIEW !== '1', 'Uses the local component catalogue.');
  test.setTimeout(90000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1180,height:850});
  await page.goto('/design-system');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  const sample = page.locator('.samples-page');
  const grid = sample.locator('.ui-grid');
  const seasons = sample.locator('.samples-palette [data-ui="choice"]');
  const mode = sample.locator('.samples-palette [aria-pressed]').last();
  for (const [index,season] of ['spring','summer','autumn','winter'].entries()) {
    await seasons.nth(index).click();
    await expect(page.locator('html')).toHaveAttribute('data-season',season);
    for (const theme of ['light','dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await mode.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await grid.scrollIntoViewIfNeeded();
      // Sample the composited gradient behind each real text rectangle, with its glyphs temporarily transparent.
      const inkless = await grid.screenshot({ scale:'css', style:
        '.samples-page .ui-grid :is([data-ui],[data-ui] *) { -webkit-text-fill-color: transparent !important; }' });
      const ratios = await grid.evaluate(async (root, png) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(image,0,0);
        const pixels = ctx.getImageData(0,0,image.width,image.height).data;
        const origin = root.getBoundingClientRect();
        function luminance(rgb) {
          const linear = Array.from(rgb, v => v / 255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
          return .2126*linear[0] + .7152*linear[1] + .0722*linear[2];
        }
        const results = [];
        for (const el of root.querySelectorAll('[data-ui]:not(:disabled)')) {
          ctx.fillStyle = getComputedStyle(el).color;
          ctx.fillRect(0,0,1,1);
          const ink = luminance(ctx.getImageData(0,0,1,1).data.slice(0,3));
          const walker = document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            for (const r of range.getClientRects()) {
              for (let y=Math.ceil(r.top-origin.top)+1; y<r.bottom-origin.top-1; y+=2) {
                for (let x=Math.ceil(r.left-origin.left)+1; x<r.right-origin.left-1; x+=2) {
                  const offset=(y*image.width+x)*4;
                  const bg=luminance(pixels.subarray(offset,offset+3));
                  results.push((Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05));
                }
              }
            }
          }
        }
        return results.length ? Math.min(...results) : 0;
      }, inkless.toString('base64'));
      expect(ratios, season+' '+theme+' rendered label contrast').toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('search artwork and page index follow the keyboard order at narrow and wide widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/gallery');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  const trigger = page.locator('.header-search');
  const search = page.locator('#site-search');
  const input = search.getByRole('combobox');
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await trigger.focus();
    await trigger.press('Enter');
    await expect(input).toBeFocused();
    const covers = search.locator('.shelf-cover');
    await expect(covers).toHaveCount(4);
    await expect.poll(() => covers.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    for (const option of (await search.getByRole('option').all()).slice(0, 5)) {
      await input.press('ArrowDown');
      await expect(option).toHaveAttribute('aria-selected', 'true');
      await expect(input).toHaveAttribute('aria-activedescendant', await option.getAttribute('id'));
    }
    expect(await search.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await input.fill('wallet');
    await expect(covers).toHaveCount(0);
    await expect(search.locator('.shelf-index a[href="/payments"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});

test('account shelf follows its trigger on desktop and keeps mobile preferences usable at double text size', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/gallery');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  const trigger = page.locator('.header-account');
  const dialog = page.locator('#site-navigation');
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 820 });
    await trigger.focus();
    await trigger.press('Enter');
    await expect(dialog.locator('a[href="/login"]')).toBeVisible();
    await expect(dialog.locator('a[href="/register"]')).toBeVisible();
    const bounds = await dialog.boundingBox();
    if (width === 1440) {
      expect(bounds.width).toBeLessThan(450);
      expect(bounds.x + bounds.width).toBeGreaterThan((await trigger.boundingBox()).x);
      expect(bounds.y).toBeLessThan(140);
    } else {
      expect(Math.abs(bounds.y - (await trigger.boundingBox()).y)).toBeLessThan(5);
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    }
    const picker = dialog.locator('.site-season-picker');
    await picker.locator('summary').click();
    await expect(picker.getByRole('combobox').first()).toBeVisible();
    expect(await dialog.evaluate(el => [el,...el.querySelectorAll('.menu-link,.site-preference-button')].every(n => n.scrollWidth <= n.clientWidth + 2))).toBe(true);
    await picker.locator('summary').click();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});

test('header menus unfold from their trigger, stagger content, reverse and honor reduced motion', async ({ page }) => {
  await page.setViewportSize({width: 1280, height: 820});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/gallery');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await page.evaluate(() => {
    window.menuFrames = [];
    new MutationObserver(records => {
      for (const {target} of records) {
        if (target.id !== 'site-search' || !target.dataset.menuPhase) continue;
        const effects = target.getAnimations({subtree:true});
        const shell = effects.find(a=>a.id === 'menu-surface');
        if (!shell) continue;
        const from = shell.effect.getKeyframes()[0];
        const last = shell.effect.getKeyframes().at(-1);
        window.menuFrames.push({
          phase:target.dataset.menuPhase, origin:target.dataset.menuOrigin,
          differs:from.clipPath !== last.clipPath, rate:shell.playbackRate,
          duration:shell.effect.getTiming().duration,
          delays:effects.filter(a=>a.id==='menu-content').map(a=>a.effect.getKeyframes()[1].offset),
          carriesTrigger:effects.some(a=>a.id==='menu-trigger-mark')
        });
      }
    }).observe(document.body, {subtree:true,attributes:true,attributeFilter:['data-menu-phase']});
  });
  const trigger = page.locator('.header-search');
  await trigger.focus();
  await trigger.press('Enter');
  const search = page.locator('#site-search');
  await expect(search.getByRole('combobox')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.menuFrames.length)).toBeGreaterThan(0);
  const [opening] = await page.evaluate(() => window.menuFrames);
  expect(opening).toMatchObject({phase:'opening', origin:'header', differs:true, rate:1, duration:700, carriesTrigger:true});
  expect(new Set(opening.delays).size).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.menuFrames.some(f=>f.phase==='closing' && f.rate<0))).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await trigger.press('Enter');
  await expect(search.getByRole('combobox')).toBeFocused();
  expect(await search.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.id.startsWith('menu-')).length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
