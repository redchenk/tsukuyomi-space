const { test, expect } = require('@playwright/test');

test.use({ launchOptions: { args: ['--no-proxy-server'] } });

for (const width of [1280, 390]) {
  test(`Room diary generates, exports and recalls persona memory at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
      localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
      localStorage.setItem('roomDiaryArchive:guest', JSON.stringify({ data: {
        prompts: { sample: { id: 'sample', data: { name: 'Aoi', description: '旧书店店员' } } },
        diary: [{ diaryId: 'old', date: '2026/9/1', time: '12:00:00', content: '以前我们一起看过蓝色的海。' }]
      } }));
    });
    const chatRequests = [];
    await page.route('**/api/chat', async (route) => {
      const body = route.request().postDataJSON();
      const isDiary = body.systemPrompt.includes('私人日记');
      chatRequests.push(body);
      await route.fulfill({ json: { success: true, data: {
        reply: isDiary ? '今天我们又在旧书店聊了很久。窗外的阳光很暖，我也会记得这一段愉快的时光。' : '（轻轻挥手）欢迎来到书店。'
      } } });
    });
    await page.goto('/room');
    await expect(page.locator('#chatInput')).toBeVisible();
    await page.locator('#chatInput').fill('今天我们来聊聊书吧');
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('.chat-content').filter({ hasText: '欢迎来到书店' })).toBeVisible();
    expect(chatRequests[0].systemPrompt).toContain('蓝色的海');
    expect(chatRequests[0].systemPrompt).toContain('Aoi');
    await page.locator('#endChatBtn').click();
    const dialog = page.getByRole('dialog', { name: '结束聊天', exact: true });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await dialog.getByRole('button', { name: '确认结束并写日记' }).click();
    const preview = page.getByRole('dialog', { name: 'Aoi的日记' });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('旧书店聊了很久');
    expect(chatRequests[1].message).not.toContain('以前我们一起看过');
    const archive = await page.evaluate(() => JSON.parse(localStorage.getItem('roomDiaryArchive:guest')));
    expect(archive.data.diary).toHaveLength(2);
    const downloaded = page.waitForEvent('download');
    await preview.getByRole('button', { name: '导出存档' }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toContain('Aoi');
    await preview.getByRole('button', { name: '继续聊天' }).click();
    await expect(preview).not.toBeVisible();
    await expect(page.locator('.chat-content').filter({ hasText: '欢迎来到书店' })).toHaveCount(0);
  });
}
