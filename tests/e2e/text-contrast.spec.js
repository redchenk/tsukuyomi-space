const { test, expect } = require('../e2e-fixtures.cjs');

// A computed background color misses the illustration and translucent layers
// behind the profile. Sample the painted backdrop with only the glyphs hidden.
async function expectReadable(locator, minimum) {
  await expect(locator).toBeVisible();
  const foreground = await locator.evaluate(el => getComputedStyle(el).color);
  const backdrop = await locator.screenshot({
    scale: 'css',
    animations: 'disabled',
    style: '* { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }'
  });
  const ratio = await locator.evaluate(async (_, { image, foreground }) => {
    const bitmap = new Image();
    bitmap.src = 'data:image/png;base64,' + image;
    await bitmap.decode();
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = foreground;
    ctx.fillRect(0, 0, 1, 1);
    const ink = ctx.getImageData(0, 0, 1, 1).data;
    ctx.drawImage(bitmap, 0, 0);
    const luminance = rgb => [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => {
      const s = rgb[i] / 255;
      return sum + weight * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
    }, 0);
    return Math.min(...[0.15, 0.5, 0.85].map(x => {
      const bg = ctx.getImageData(Math.floor(x * bitmap.width), Math.floor(bitmap.height / 2), 1, 1).data;
      const alpha = ink[3] / 255;
      const painted = [0, 1, 2].map(i => ink[i] * alpha + bg[i] * (1 - alpha));
      const a = luminance(painted), b = luminance(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }));
  }, { image: backdrop.toString('base64'), foreground });
  expect(ratio, String(locator)).toBeGreaterThanOrEqual(minimum);
}

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`public profile and primary action text contrast at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 840 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(theme => localStorage.setItem('tsukuyomi_theme', theme), theme);
      await page.goto('/users/e2e-user');
      await expect(page.locator('#boot-splash')).toHaveCount(0);
      await expect(page.locator('.profile-meta')).toContainText('@e2e-user');
      await expectReadable(page.locator('.profile-main h1'), 3);
      await expectReadable(page.locator('.profile-main p'), 4.5);
      await expectReadable(page.locator('.profile-actions .primary-btn span'), 4.5);
    });
  }
}

test.describe('public profile without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the startup screen clears the server-rendered profile', async ({ page }) => {
    await page.goto('/users/e2e-user');
    await expect(page.locator('#boot-splash')).toBeHidden();
    await expect(page.locator('[data-seo-fallback] h1')).toBeVisible();
  });
});
