const { test, expect } = require('../e2e-fixtures.cjs');

const widths = [320, 360, 390, 414, 768, 800, 860, 1024, 1440];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'en');
    localStorage.setItem('tsukuyomi_theme', 'light');
    localStorage.setItem('tsukuyomi_content_translation', 'off');
  });
});

async function open(page, route) {
  await page.goto(route);
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

// Check rendered text fragments, including wrapped lines, against the actual
// control bounds. scrollWidth alone misses text hidden by nested ellipsis.
async function expectTextContained(locator) {
  const violations = await locator.evaluateAll(elements => elements.flatMap(element => {
    const bounds = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const failures = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || !node.parentElement.checkVisibility()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1
          || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) {
          failures.push(node.textContent.trim());
        }
      }
    }
    return failures;
  }));
  expect(violations).toEqual([]);
}

test('translated pixel toolbar keeps document controls and every action reachable', async ({ page }) => {
  await open(page, '/pixel');
  await expect(page.locator('.pw-document-actions .primary-btn')).toHaveText('Publish artwork');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.locator('.pw-document').evaluate(header => {
      const bounds = header.getBoundingClientRect();
      const name = header.querySelector('.pw-document-name').getBoundingClientRect();
      const actions = [...header.querySelector('.pw-document-actions').children].map(e => e.getBoundingClientRect());
      return {
        nameWidth: name.width,
        contained: actions.every(r => r.left >= bounds.left && r.right <= bounds.right && r.bottom <= bounds.bottom),
        separated: actions.every(r => r.left >= name.right || r.top >= name.bottom),
      };
    });
    expect(geometry.nameWidth, `document name at ${width}`).toBeGreaterThan(100);
    expect(geometry.contained, `actions at ${width}`).toBe(true);
    expect(geometry.separated, `document/action overlap at ${width}`).toBe(true);
    await expectTextContained(page.locator('.pw-document-actions > *'));
  }
});

test('translated Wiki metadata labels do not overlap their values', async ({ page }) => {
  await open(page, '/wiki');
  await expect(page.locator('.wiki-music-row dt').filter({ hasText: 'Performed by' }).first()).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const labels = page.locator('.wiki-music-row dt, .wiki-derivative-card dt');
    expect(await labels.count()).toBeGreaterThan(10);
    await expectTextContained(labels);
    const overlaps = await labels.evaluateAll(elements => elements.filter(e =>
      e.getBoundingClientRect().right > e.nextElementSibling.getBoundingClientRect().left
    ).map(e => e.textContent));
    expect(overlaps, `metadata at ${width}`).toEqual([]);
  }
});

test('translated provider buttons and runtime scope remain usable on narrow screens', async ({ page }) => {
  await open(page, '/room/settings');
  await expect(page.getByRole('button', { name: 'Alibaba Cloud Model Studio', exact: true })).toBeVisible();
  await page.locator('.runtime-panel > summary').click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expectTextContained(page.locator('.settings-providers .ghost-btn'));
    const select = page.locator('select[name="room-runtime-level"]');
    expect((await select.boundingBox()).width, `scope at ${width}`).toBeGreaterThanOrEqual(180);
    await expectTextContained(page.locator('.runtime-level-row > button'));
  }
});

test('profile navigation keeps its full translated destination visible', async ({ page }) => {
  await open(page, '/users/e2e-user');
  await expect(page.locator('.profile-actions')).toContainText('Back to Main Stage');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expectTextContained(page.locator('.profile-actions .profile-icon-action'));
  }
});

test('admin notification and configuration save labels fit their buttons', async ({ page }) => {
  await open(page, '/terminal');
  await page.locator('input[autocomplete="username"]').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.terminal-nav-btn').first()).toBeVisible();
  for (const panel of [7, 8]) {
    await page.locator('.terminal-nav-btn').nth(panel).click();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const buttons = page.locator('.terminal-context-actions > button');
      await expect(buttons).toHaveCount(2);
      await expectTextContained(buttons);
    }
  }
});
