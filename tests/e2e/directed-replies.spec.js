const { test, expect } = require('../e2e-fixtures.cjs');

for (const location of ['plaza', 'article']) {
    test(`${location} replies identify the selected recipient and survive reload`, async ({ page, baseURL }) => {
        // Three user sessions plus submit/reload/navigation take about 25s on
        // mobile WebKit; keep the per-assertion limits while allowing the flow to finish.
        test.setTimeout(45_000);
        await page.setViewportSize({ width: 390, height: 844 });
        const headers = { Origin: new URL(baseURL).origin, 'Sec-Fetch-Site': 'same-origin', 'X-Requested-With': 'XMLHttpRequest' };
        const login = async username => {
            const response = await page.request.post('/api/auth/login', { headers, data: { username, password: 'mem0-test-password' } });
            expect(response.ok()).toBe(true);
        };
        const marker = `一起看月亮 ${location} ${Date.now()}`;
        await login('reply-owner');
        const rootResponse = await page.request.post('/api/messages', { headers, data: { content: marker, ...(location === 'article' ? { article_id: 1 } : {}) } });
        expect(rootResponse.status()).toBe(201);
        const root = (await rootResponse.json()).data;
        await login('reply-reader');
        const readerResponse = await page.request.post(`/api/messages/${root.id}/reply`, { headers, data: { content: `我也喜欢这段故事 ${marker}` } });
        expect(readerResponse.status()).toBe(201);
        const reader = (await readerResponse.json()).data;
        await login('reply-writer');
        await page.goto(location === 'plaza' ? '/plaza' : '/article?id=1');
        if (location === 'plaza') await page.locator('.plaza-search').fill(marker);
        const prefix = location === 'plaza' ? 'msg' : 'comment';
        const thread = page.locator(`#${prefix}-${root.id}`);
        const target = thread.locator(`#${prefix}-${reader.id}`);
        await expect(target.locator('.message-reply-recipient')).toContainText('reply-owner');
        await target.getByRole('button', { name: '回复 reply-reader', exact: true }).click();
        const form = target.locator('.message-reply-form');
        await expect(form.getByRole('textbox', { name: '回复 reply-reader' })).toBeFocused();
        await expect(form.locator('blockquote')).toContainText('我也喜欢这段故事');
        await form.getByRole('button', { name: '取消回复' }).click();
        await expect(form).toHaveCount(0);
        await target.getByRole('button', { name: '回复 reply-reader', exact: true }).click();
        const text = `谢谢你的分享 ${marker}`;
        await form.getByRole('textbox').fill(text);
        const submitted = page.waitForResponse(response => response.url().includes(`/api/messages/${reader.id}/reply`) && response.request().method() === 'POST');
        await form.locator('.primary-btn').click();
        const response = await submitted;
        expect(response.status()).toBe(201);
        const reply = (await response.json()).data;
        expect(reply.parent_id).toBe(root.id);
        expect(reply.reply_to_id).toBe(reader.id);
        const result = thread.locator(`#${prefix}-${reply.id}`);
        await expect(result).toContainText(text);
        await expect(result.locator('.message-reply-recipient')).toContainText('reply-reader');
        await expect(result.locator('.message-reply-recipient a')).toHaveAttribute('href', `#${prefix}-${reader.id}`);
        await page.reload();
        if (location === 'plaza') await page.locator('.plaza-search').fill(marker);
        await expect(result).toContainText(text);
        // Scroll the thread itself into view before targeting a descendant:
        // mobile WebKit may defer offscreen reply layout via content-visibility.
        await thread.scrollIntoViewIfNeeded();
        await expect(result.locator('.message-reply-recipient a')).toBeVisible();
        await result.locator('.message-reply-recipient a').click();
        await expect(target).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
}

for (const width of [390, 1280]) {
    test(`article shortcuts reach comments and top without covering floating tools at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/article?id=1');
        const shortcuts = page.getByRole('navigation', { name: '文章快捷导航' });
        await expect(shortcuts).toBeVisible();
        await expect(shortcuts).toBeInViewport();
        const quick = await shortcuts.boundingBox();
        expect(quick.y + quick.height).toBeLessThanOrEqual(844);
        for (const element of [page.getByRole('button', { name: 'Expand music drawer' }), page.getByRole('button', { name: '打开八千代 AI 使用向导' })]) {
            const box = await element.boundingBox();
            expect(box).not.toBeNull();
            expect(quick.x < box.x + box.width && quick.x + quick.width > box.x && quick.y < box.y + box.height && quick.y + quick.height > box.y).toBe(false);
        }
        await shortcuts.getByRole('button', { name: '跳转评论' }).click();
        await expect(page.locator('#article-comments')).toBeFocused();
        await expect(page.locator('.comments-head')).toBeInViewport();
        expect((await page.locator('.comments-head').boundingBox()).y).toBeGreaterThan(80);
        await shortcuts.getByRole('button', { name: '回到顶部' }).click();
        await expect(page.locator('#article-top')).toBeFocused();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    });
}
