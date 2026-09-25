const { test, expect } = require('../e2e-fixtures.cjs');

test.use({ launchOptions: { args: ['--no-proxy-server'] } });

test('Room renders live words, presents short messages and persists one complete turn', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
        const originalFetch = window.fetch;
        window.fetch = async function (input, init) {
            const url = typeof input === 'string' ? input : input.url || String(input);
            if (new URL(url, location.href).pathname !== '/api/chat/stream') return originalFetch.call(this, input, init);
            window.__roomChatRequest = JSON.parse(init.body);
            const encoder = new TextEncoder();
            return new Response(new ReadableStream({
                start(controller) {
                    window.__roomDelta = text => controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`));
                    window.__roomDone = reply => {
                        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ reply })}\n\n`));
                        controller.close();
                    };
                }
            }), { headers: { 'Content-Type': 'text/event-stream' } });
        };
    });
    await page.goto('/room');
    await page.locator('#chatInput').fill('你也会紧张吗？');
    await page.locator('#sendChatBtn').click();
    await page.waitForFunction(() => typeof window.__roomDelta === 'function');
    await page.evaluate(() => window.__roomDelta('八千'));
    const pending = page.locator('.chat-message.assistant[aria-busy="true"]');
    // No done event has been sent: this catches mutation of a non-reactive object.
    await expect(pending.locator('.chat-reply-part')).toHaveText('八千');
    expect(await page.evaluate(() => window.__roomChatRequest.systemPrompt)).toContain('1–3 条短消息');

    const reply = '八千代也会紧张。\n\n只是藏得好一点～';
    await page.evaluate(reply => {
        window.__roomDelta(reply.slice(2));
        window.__roomDone(reply);
    }, reply);
    const assistant = page.locator('.chat-message.assistant:not([aria-busy="true"])');
    await expect(assistant).toHaveCount(1);
    await expect(assistant.locator('.chat-reply-part')).toHaveText(['八千代也会紧张。', '只是藏得好一点～']);
    await expect(assistant.getByRole('button', { name: '重新生成' })).toHaveCount(1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('roomChatHistory:guest')));
    expect(saved.map(item => item.role)).toEqual(['user', 'assistant']);
    expect(saved[1].content).toBe(reply);
    expect(await assistant.evaluate(node => node.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('room-chat-mobile.png') });

    await page.reload();
    await expect(page.locator('.chat-message.assistant .chat-reply-part')).toHaveText(['八千代也会紧张。', '只是藏得好一点～']);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    await expect(page.locator('.chat-message.assistant .chat-reply-part').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('room-chat-desktop.png') });
});

test('a requested long reply remains complete across bubbles and regeneration', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    });
    const replies = [
        '好，那就慢慢讲。\n\n' + '这是需要完整保留的一步说明，包含细节和原因。'.repeat(20),
        '换个说法吧。\n\n先做好眼前这一步，再继续。'
    ];
    let count = 0;
    await page.route('**/api/chat/stream', route => {
        const reply = replies[count++];
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ reply })}\n\n` });
    });
    await page.goto('/room');
    await page.locator('#chatInput').fill('请详细解释，保留完整步骤');
    await page.locator('#sendChatBtn').click();
    const assistant = page.locator('.chat-message.assistant:not([aria-busy="true"])');
    await expect(assistant).toHaveCount(1);
    expect((await assistant.locator('.chat-reply-part').allTextContents()).join('')).toBe(replies[0].replace(/\n/g, ''));
    await assistant.getByRole('button', { name: '重新生成' }).click();
    await expect(assistant.locator('.chat-reply-part')).toHaveText(['换个说法吧。', '先做好眼前这一步，再继续。']);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('roomChatHistory:guest')));
    expect(saved.map(item => item.role)).toEqual(['user', 'assistant']);
    expect(saved[1].content).toBe(replies[1]);
    expect(count).toBe(2);
});
