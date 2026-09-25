const { test, expect } = require('../e2e-fixtures.cjs');

test('desktop tabs preserve a pending reply and drafts through utility panels and phone resize', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 810 });
    await page.addInitScript(() => {
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
        // Old floating panel positions must not displace the new workspace.
        localStorage.setItem('roomPanelPositions', JSON.stringify({ chatPanel: { left: '9000px', top: '9000px', right: 'auto' }, profilePanel: { left: '-9000px', top: '-9000px', right: 'auto' } }));
    });
    let completeReply;
    const replyReady = new Promise(resolve => { completeReply = resolve; });
    await page.route('**/api/chat/stream', async route => {
        await replyReady;
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: done\ndata: {"reply":"先歇一会儿吧。\\n\\n八千代在这里～"}\n\n' });
    });
    await page.goto('/room');
    await page.locator('#chatInput').fill('今天有点累');
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('#stopChatBtn')).toBeVisible();
    await page.getByRole('tab', { name: '资料', exact: true }).click();
    await expect(page.locator('#profilePanel')).toBeVisible();
    await page.locator('#nicknameInput').fill('月下旅人');
    await page.locator('#signatureInput').fill('还没保存的资料草稿');
    completeReply();
    await page.getByRole('tab', { name: '便签', exact: true }).click();
    await page.locator('#noteContent').fill('记得休息');
    await page.locator('#saveNoteBtn').click();
    await page.getByRole('tab', { name: '资料', exact: true }).click();
    await expect(page.locator('#signatureInput')).toHaveValue('还没保存的资料草稿');
    await page.getByRole('tab', { name: '聊天', exact: true }).click();
    await expect(page.locator('.assistant:not([aria-busy="true"]) .chat-reply-part')).toHaveText(['先歇一会儿吧。', '八千代在这里～']);
    await page.locator('#chatInput').fill('下一条消息草稿');
    await page.getByRole('tab', { name: '聊天', exact: true }).press('ArrowRight');
    await expect(page.getByRole('tab', { name: '日记', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#diaryPanel')).toBeVisible();
    await page.getByRole('tab', { name: '日记', exact: true }).press('Home');
    await expect(page.locator('#chatInput')).toHaveValue('下一条消息草稿');
    const stage = await page.locator('.room-stage').boundingBox();
    const chat = await page.locator('.room-conversation-surface').boundingBox();
    expect(stage.x + stage.width).toBeLessThan(chat.x);
    expect(chat.y).toBeCloseTo(stage.y, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#chatInput')).toHaveValue('下一条消息草稿');
    await expect(page.locator('.room-mobile-header')).toBeVisible();
    await expect(page.locator('.room-desktop-tabs')).toBeHidden();
    await expect(page.locator('#live2d-container')).toHaveCount(1);
    await page.reload();
    await page.locator('.room-tools-disclosure > summary').click();
    await page.getByRole('button', { name: '便签', exact: true }).click();
    await expect(page.locator('#noteContent')).toHaveValue('记得休息');
});

for (const width of [1024, 1920]) {
    test(`desktop workspace stays within ${width}px and isolates utility scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 810 });
        await page.goto('/room');
        await page.getByRole('tab', { name: '资料', exact: true }).click();
        const workspace = await page.locator('.room-conversation-surface').boundingBox();
        const profile = await page.locator('#profilePanel').boundingBox();
        expect(profile.x).toBeGreaterThanOrEqual(workspace.x);
        expect(profile.x + profile.width).toBeLessThanOrEqual(workspace.x + workspace.width);
        expect(profile.y + profile.height).toBeLessThanOrEqual(810);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.getByRole('tab', { name: '聊天', exact: true }).click();
        await expect(page.locator('#sendChatBtn')).toBeVisible();
        const input = await page.locator('.chat-input-row').boundingBox();
        expect(input.x + input.width).toBeLessThanOrEqual(width);
    });
}
