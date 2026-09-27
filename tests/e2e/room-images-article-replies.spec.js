const path = require('node:path');
const { test, expect } = require('../e2e-fixtures.cjs');

test('a guest image stays visible after a reply and refresh without base64 in chat history', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    });
    await page.route('**/api/chat/stream', route => route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: 'event: delta\ndata: {"text":"图片收到了。"}\n\nevent: done\ndata: {"reply":"图片收到了。"}\n\n' }));
    await page.goto('/room');
    await page.locator('input[type="file"][accept*="image"]').setInputFiles(path.resolve('assets/icons/icon-192.png'));
    await expect(page.locator('#chatImagePreview img')).toBeVisible();
    await page.locator('#chatInput').fill('看看这张图片');
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toContainText('图片收到了。');
    await expect(page.locator('.chat-message.user .chat-image-thumb')).toBeVisible();
    await page.reload();
    const image = page.locator('.chat-message.user .chat-image-thumb');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    const saved = await page.evaluate(() => localStorage.getItem('roomChatHistory:guest'));
    expect(saved).not.toContain('data:image');
    expect(saved).not.toContain('[image:');
    expect(saved).toContain('localId');
});

test('article threads initially show only the latest reply and reveal hidden recipients and notification anchors', async ({ page }) => {
    const messages = [
        { id: 8100, article_id: 3, author: '楼主', content: '评论主楼', created_at: '2026-09-27 01:00:00' },
        { id: 8101, article_id: 3, parent_id: 8100, reply_to_id: 8100, author: '甲', content: '较早的回复', created_at: '2026-09-27 02:00:00' },
        { id: 8102, article_id: 3, parent_id: 8100, reply_to_id: 8101, author: '乙', content: '最新的回复', created_at: '2026-09-27 03:00:00' }
    ];
    await page.route('**/api/articles/3/messages', route => route.fulfill({ json: { success: true, data: messages } }));
    await page.goto('/article?id=3');
    await expect(page.locator('#comment-8102')).toBeVisible();
    await expect(page.locator('#comment-8101')).toHaveCount(0);
    await page.getByRole('button', { name: '展开全部 2 条回复' }).click();
    await expect(page.locator('#comment-8101')).toBeVisible();
    await page.getByRole('button', { name: '收起回复' }).click();
    await expect(page.locator('#comment-8101')).toHaveCount(0);
    await page.locator('#comment-8102 .message-reply-recipient a').click();
    await expect(page.locator('#comment-8101')).toBeVisible();
    await page.reload();
    await expect(page.locator('#comment-8101')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '收起回复' }).click();
    await expect(page.locator('#comment-8102')).toBeVisible();
    await expect(page.locator('#comment-8101')).toHaveCount(0);
    await page.locator('#comment-8102 .message-reply-recipient a').click();
    await expect(page.locator('#comment-8101')).toBeVisible();
});
