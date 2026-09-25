const { test, expect } = require('../e2e-fixtures.cjs');

for (const timezoneId of ['Asia/Shanghai', 'America/Los_Angeles']) {
    test.describe(`Room bubble times on a ${timezoneId} device`, () => {
        test.use({ timezoneId });

        test('saved UTC history and live timestamps stay UTC+8 after reload and desktop resize', async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.addInitScript(() => {
                localStorage.setItem('roomChatHistory:guest', JSON.stringify([
                    { id: 'utc-sqlite', role: 'user', content: '数据库历史时间', createdAt: '2026-09-25 09:42:00' },
                    { id: 'utc-iso', role: 'assistant', content: '跨过午夜的回复', createdAt: '2026-09-25T16:05:00Z' },
                    { id: 'explicit-offset', role: 'user', content: '带时区的时间', createdAt: '2026-09-26T00:06:00+08:00' },
                    { id: 'live-epoch', role: 'assistant', content: '即时消息时间', createdAt: Date.UTC(2026, 8, 25, 16, 7) }
                ]));
            });
            await page.goto('/room');
            const times = page.locator('.chat-message-time');
            const expected = ['17:42', '00:05', '00:06', '00:07'];
            await expect(times).toHaveText(expected);
            await expect(times.first()).toHaveAttribute('title', 'UTC+8');
            await page.reload();
            await expect(times).toHaveText(expected);
            await page.setViewportSize({ width: 1440, height: 1000 });
            await expect(times).toHaveText(expected);
        });
    });
}

test('mobile history stays in place during a reply and returns to the latest bubble', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
        localStorage.setItem('roomChatHistory:guest', JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
            id: `history-${index}`, role: index % 2 ? 'assistant' : 'user',
            content: `第 ${index + 1} 条聊天，今晚一起看月亮。`, createdAt: Date.now() - (12 - index) * 60000
        }))));
    });
    let completeReply;
    const ready = new Promise(resolve => { completeReply = resolve; });
    await page.route('**/api/chat/stream', async route => {
        await ready;
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: done\ndata: {"reply":"我在这里，慢慢看。"}\n\n' });
    });
    await page.goto('/room');
    const transcript = page.locator('#chatMessages');
    await expect(transcript.locator('.assistant')).toHaveCount(6);
    const remaining = () => transcript.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight);
    await expect.poll(remaining).toBeLessThan(24);
    const conversation = await page.locator('.room-conversation-surface').boundingBox();
    expect(conversation.y).toBeGreaterThan(844 * .35);
    expect(conversation.y).toBeLessThan(844 * .51);
    await expect(page.locator('.room-conversation-surface')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.locator('#chatInput').fill('最新的一条消息');
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('#stopChatBtn')).toBeVisible();
    await page.locator('.room-tools-disclosure > summary').click();
    await page.getByRole('button', { name: '查看对话开头', exact: true }).click();
    await expect.poll(() => transcript.evaluate(node => node.scrollTop)).toBeLessThan(2);
    completeReply();
    await expect(transcript.locator('.assistant').last()).toContainText('我在这里，慢慢看。');
    expect(await transcript.evaluate(node => node.scrollTop)).toBeLessThan(2);
    await page.getByRole('button', { name: '回到最新消息', exact: true }).click();
    await expect.poll(remaining).toBeLessThan(24);
    await expect(page.getByRole('button', { name: '回到最新消息', exact: true })).toBeHidden();
    const composer = await page.locator('.chat-input-row').boundingBox();
    const nav = await page.locator('.mobile-bottom-nav').boundingBox();
    expect(composer.y + composer.height).toBeLessThanOrEqual(nav.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
