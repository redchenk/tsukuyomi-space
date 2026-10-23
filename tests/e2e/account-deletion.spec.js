const { test, expect } = require('@playwright/test');
for (const width of [390, 1440]) {
  test(`public policy and authenticated request, receipt and cancellation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: '隐私政策', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '申请注销账号', exact: true })).toBeVisible();
    expect((await page.locator('.privacy-heading').boundingBox()).y).toBeGreaterThanOrEqual(90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: '申请注销账号', exact: true }).click();
    await expect(page.getByRole('link', { name: '登录后在线提交' })).toBeVisible();
    const login = await page.request.post('/api/auth/login', { data: { username: 'e2e-user', password: 'e2e-password' }, headers: { Origin: new URL(page.url()).origin, 'X-Requested-With': 'XMLHttpRequest' } });
    expect(login.ok()).toBe(true);
    await page.reload();
    const submit = page.getByRole('button', { name: '提交注销申请', exact: true });
    await expect(submit).toBeDisabled();
    const checkbox = page.getByRole('checkbox');
    const box = await checkbox.boundingBox();
    expect(box.height).toBe(box.width);
    await checkbox.check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText('等待站长核验', { exact: true })).toBeVisible();
    await expect(submit).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/account-deletion-receipt-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.reload();
    await expect(page.getByText('等待站长核验', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '撤回申请' }).click();
    await expect(page.getByText('已撤回申请', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

}

for (const { width, lang, theme } of [
  { width: 1440, lang: 'zh', theme: 'light' },
  { width: 1024, lang: 'en', theme: 'dark' },
  { width: 768, lang: 'zh', theme: 'light' },
  { width: 390, lang: 'en', theme: 'dark' }
]) {
  test(`privacy pages use the reading column at ${width}px (${lang}, ${theme})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(({ lang, theme }) => {
      localStorage.setItem('lang', lang);
      localStorage.setItem('tsukuyomi_theme', theme);
    }, { lang, theme });
    for (const route of ['/privacy', '/delete-account']) {
      await page.goto(route);
      await expect(page.locator('.privacy-heading')).toBeVisible();
      await expect(page.locator('#boot-splash')).toBeHidden();
      await page.evaluate(() => document.fonts.ready);
      const heading = await page.locator('.privacy-heading').boundingBox();
      const navigation = await page.locator('.site-commandbar').boundingBox();
      expect(heading.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
      const cards = await page.locator('.privacy-section').all();
      expect(cards.length).toBe(route === '/privacy' ? 11 : 4);
      for (const card of cards) {
        const box = await card.boundingBox();
        expect(Math.abs(box.x - heading.x)).toBeLessThan(1);
        expect(Math.abs(box.width - heading.width)).toBeLessThan(1);
      }
      if (width >= 1024) expect(heading.width).toBeGreaterThan(800);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (route === '/delete-account') {
        await expect(page.getByRole('link', { name: lang === 'zh' ? '登录后在线提交' : 'Sign in to submit' })).toBeVisible();
        const main = await page.locator('.privacy-request-main').boundingBox();
        const help = await page.locator('.privacy-request-help').boundingBox();
        if (width > 760) {
          expect(help.x).toBeGreaterThanOrEqual(main.x + main.width);
          expect(Math.abs(help.y - main.y)).toBeLessThan(1);
        } else {
          expect(help.y).toBeGreaterThanOrEqual(main.y + main.height);
          expect(Math.abs(help.width - main.width)).toBeLessThan(1);
        }
      }
      await page.screenshot({ path: `test-results/${route.slice(1)}-${width}-${lang}-${theme}.png`, fullPage: true, animations: 'disabled' });
    }
  });
}
