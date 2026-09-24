const { test, expect } = require('../e2e-fixtures.cjs');

test.use({ launchOptions: { args: ['--no-proxy-server'] } });

test('interrupted Room stream restores the unsent turn after reload and retries it once', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    });

    let attempts = 0;
    await page.route('**/api/chat/stream', async (route) => {
        attempts += 1;
        const reply = '我在这里，慢慢说。';
        const body = attempts === 1
            ? 'event: delta\ndata: {"text":"半句"}\n\n'
            : `event: delta\ndata: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: ${JSON.stringify({ reply })}\n\n`;
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
    });

    await page.goto('/room');
    await page.locator('#chatInput').fill('今天有点累');
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('.chat-message.user.is-failed')).toContainText('今天有点累');
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toHaveCount(0);
    await expect(page.locator('#sendChatBtn')).toBeDisabled();

    await page.reload();
    await expect(page.locator('.chat-message.user.is-failed')).toContainText('今天有点累');
    await page.getByRole('button', { name: '重试这轮' }).click();
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toContainText('我在这里，慢慢说。');
    await expect(page.locator('.chat-message.user.is-failed')).toHaveCount(0);
    expect(attempts).toBe(2);

    const saved = await page.evaluate(() => ({
        history: JSON.parse(localStorage.getItem('roomChatHistory:guest')),
        draft: localStorage.getItem('roomChatGeneration:guest')
    }));
    expect(saved.history.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(saved.draft).toBeNull();
});
