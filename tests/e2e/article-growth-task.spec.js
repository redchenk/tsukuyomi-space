const { test, expect } = require('@playwright/test');

for (const scenario of [
  { action: 'like', width: 1440, button: /^点赞/, endpoint: 'article-likes' },
  { action: 'bookmark', width: 390, button: /^收藏/, endpoint: 'bookmarks' }
]) {
  test(`${scenario.action} completes the article task with visible feedback at ${scenario.width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const login = await page.request.post('/api/auth/login', {
      headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' },
      data: { username: `article-task-${scenario.action}`, password: 'article-task-password' }
    });
    expect(login.ok()).toBe(true);
    const { data: { user } } = await login.json();
    await page.addInitScript(user => localStorage.setItem('tsukuyomi_user', JSON.stringify(user)), user);
    await page.goto('/growth');
    await expect(page.locator('#boot-splash')).toBeHidden();
    await page.evaluate(() => document.fonts.ready);
    const task = page.locator('.growth-task').filter({ hasText: '给任意一篇文章点赞或收藏' });
    await expect(task).toBeEnabled();
    await expect(task).toContainText('打开任意文章，点击点赞或收藏即可完成。');
    expect(await task.locator('.growth-task-hint').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/article-task-${scenario.action}-before.png`, fullPage: true, animations: 'disabled' });
    await task.click();
    await expect(page).toHaveURL(/\/stage/);
    const before = await (await page.request.get('/api/growth/me')).json();
    expect(before.data.today.tasks[2].completed).toBe(false);
    await page.locator('.stage-controls input[type="search"]').fill('成长任务验收文章');
    await page.locator('.stage-card[data-article-id="987601"]').click();
    await expect(page.locator('.article-reader h1')).toHaveText('成长任务验收文章');
    const recorded = page.waitForResponse(response => response.url().includes(`/user/${scenario.endpoint}/987601`) && response.request().method() === 'POST');
    await page.locator('.article-social-actions').getByRole('button', { name: scenario.button }).click();
    const result = await (await recorded).json();
    expect(result.growth.award.xp).toBe(20);
    await expect(page.getByText('今日任务已完成，+20 经验', { exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/article-task-${scenario.action}-feedback.png`, fullPage: true, animations: 'disabled' });
    await page.goto('/growth');
    await expect(page.locator('#boot-splash')).toBeHidden();
    await page.evaluate(() => document.fonts.ready);
    await expect(task).toBeDisabled();
    await expect(task).toContainText('已完成');
    const after = await (await page.request.get('/api/growth/me')).json();
    expect(after.data.today.tasks[2].earnedXp).toBe(20);
    expect(after.data.level.totalXp).toBe(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/article-task-${scenario.action}-done.png`, fullPage: true, animations: 'disabled' });
  });
}
