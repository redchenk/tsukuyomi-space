const { test, expect } = require('../e2e-fixtures.cjs');

for (const width of [390, 1280]) {
    test(`streamed bubbles keep the reader in place and diary recording survives reload at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ status: 404, body: '' }));
        await page.addInitScript(() => {
            localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
            localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
            const originalFetch = window.fetch;
            window.fetch = async function (input, init) {
                const url = typeof input === 'string' ? input : input.url || String(input);
                if (new URL(url, location.href).pathname !== '/api/chat/stream') return originalFetch.call(this, input, init);
                const encoder = new TextEncoder();
                return new Response(new ReadableStream({ start(controller) {
                    window.__diaryDelta = text => controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`));
                    window.__diaryDone = reply => {
                        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ reply })}\n\n`));
                        controller.close();
                    };
                } }), { headers: { 'Content-Type': 'text/event-stream' } });
            };
        });
        let diaryRequest;
        await page.route('**/api/chat', route => {
            diaryRequest = route.request().postDataJSON();
            return route.fulfill({ json: { success: true, data: { reply: '今天从清晨到夜晚，我们聊起了早餐、读书和月亮，我会好好记得这一天。' } } });
        });
        await page.goto('/room');
        await page.locator('#chatInput').fill('早上一起吃早餐');
        await page.locator('#sendChatBtn').click();
        await page.waitForFunction(() => typeof window.__diaryDelta === 'function');
        const transcript = page.locator('#chatMessages');
        const first = '先说早上的第一件小事。';
        await page.evaluate(text => window.__diaryDelta(text), first);
        const bubble = transcript.locator('.assistant[aria-busy="true"]');
        await expect(bubble).toContainText(first);
        const node = await bubble.elementHandle();
        const before = await transcript.evaluate(element => element.scrollTop);
        const reply = first + Array.from({ length: 28 }, (_, i) => `第${i + 1}段是慢慢说给你听的故事，保留细节，让我们按自己的速度读下去。`).join('\n\n');
        await page.evaluate(text => window.__diaryDelta(text), reply.slice(first.length));
        await expect(bubble).toContainText('第28段');
        expect(Math.abs(await transcript.evaluate(element => element.scrollTop) - before)).toBeLessThan(2);
        // The reader moves in the middle of generation; completion must retain
        // both that new position and the existing streaming DOM node.
        await transcript.evaluate(element => { element.scrollTop = 115; });
        const reading = await transcript.evaluate(element => element.scrollTop);
        await page.evaluate(text => window.__diaryDone(text), reply);
        await expect(transcript.locator('.assistant:not([aria-busy="true"])')).toHaveCount(1);
        expect(await node.evaluate(element => element.isConnected)).toBe(true);
        expect(Math.abs(await transcript.evaluate(element => element.scrollTop) - reading)).toBeLessThan(2);
        await expect(page.locator('.chat-end-hint')).toHaveText('本次已记录 2 条对话');
        await page.reload();
        await expect(page.locator('.chat-end-hint')).toHaveText('本次已记录 2 条对话');
        await page.locator('#chatInput').fill('晚上一起看月亮');
        await page.locator('#sendChatBtn').click();
        await page.waitForFunction(() => typeof window.__diaryDone === 'function');
        await page.evaluate(() => window.__diaryDone('我也很喜欢今天的月亮。'));
        await expect(page.locator('.chat-end-hint')).toHaveText('本次已记录 4 条对话');
        await page.reload();
        await expect(page.locator('.chat-end-hint')).toHaveText('本次已记录 4 条对话');
        if (width < 860) {
            await page.locator('.room-tools-disclosure > summary').click();
            await page.getByRole('button', { name: '结束聊天', exact: true }).click();
        } else await page.locator('#endChatBtn').click();
        await page.getByRole('button', { name: '确认结束并写日记' }).click();
        await expect(page.getByRole('dialog', { name: '八千代的日记', exact: true })).toBeVisible();
        expect(diaryRequest.message).toContain('早上一起吃早餐');
        expect(diaryRequest.message).toContain('晚上一起看月亮');
        await page.reload();
        await expect(page.getByText('本次已记录 4 条对话', { exact: true })).toHaveCount(0);
    });
}
