const { test, expect } = require('../e2e-drift-fixtures.cjs');

for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1365, height: 900 }]) {
    test(`${viewport.name}: shore, opening a bottle, paper replies and accessible bottle collection`, async ({ page, baseURL, browser }) => {
        test.setTimeout(45_000);
        await page.setViewportSize(viewport);
        const headers = { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' };
        const login = async (request, username) => {
            const response = await request.post('/api/auth/login', { headers, data: { username, password: 'mem0-test-password' } });
            expect(response.ok()).toBeTruthy();
        };
        await login(page.request, 'reply-owner');
        const marker = `月下的纸条 ${viewport.name} ${Date.now()}`;
        const sent = await page.request.post('/api/drift', { headers, data: { content: marker, language: 'zh' } });
        expect(sent.status()).toBe(201);
        const bottleId = (await sent.json()).data.id;
        try {
            await login(page.request, 'reply-reader');
            await page.goto('/drift');
            await expect(page.locator('#boot-splash')).toHaveCount(0);
            await expect(page.getByRole('tab')).toHaveCount(2);
            const mine = page.getByRole('tab', { name: '我的瓶子', exact: true });
            await expect(mine).toBeInViewport();
            await mine.click();
            await expect(page.locator('#drift-panel-bottles')).toBeVisible();
            await expect(page.locator('#drift-draft')).toBeHidden();
            expect(await page.evaluate(() => window.scrollY)).toBeLessThan(170);
            await page.getByRole('tab', { name: '海边', exact: true }).click();
            const backgroundWidth = await page.locator('.site-global-bg').evaluate(async element => {
                const url = getComputedStyle(element).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];
                if (!url) throw new Error('The shore background is missing');
                const image = new Image();
                image.src = url;
                await image.decode();
                return image.naturalWidth;
            });
            expect(backgroundWidth).toBeGreaterThan(1000);
            await page.screenshot({ path: `/tmp/drift-shore-${viewport.name}.png`, fullPage: true });
            await page.getByRole('button', { name: '捡一个', exact: true }).click();
            const dialog = page.getByRole('dialog');
            await expect(dialog).toBeVisible();
            await expect(dialog.getByRole('heading')).toHaveText('你捡到了一个漂流瓶');
            await expect(dialog.locator('.drift-original-paper')).toBeHidden();
            await dialog.getByRole('button', { name: '打开瓶子', exact: true }).click();
            await expect(dialog.locator('.drift-original-paper')).toHaveText(marker);
            await dialog.getByRole('button', { name: '扔回海里', exact: true }).click();
            await expect(dialog).not.toBeVisible();
            expect((await page.request.get(`/api/drift/${bottleId}`)).status()).toBe(404);
            await page.getByRole('button', { name: '捡一个', exact: true }).click();
            await dialog.getByRole('button', { name: '打开瓶子', exact: true }).click();
            await dialog.getByRole('button', { name: '回应', exact: true }).click();
            await page.locator('#drift-reply').fill('谢谢，我也在看月亮');
            await dialog.getByRole('button', { name: '把回信放进瓶子', exact: true }).click();
            await expect(dialog.locator('.drift-reply')).toContainText('谢谢，我也在看月亮');
            await expect(dialog.getByRole('button', { name: '扔回海里', exact: true })).toBeHidden();
            await page.reload();
            await expect(page.locator('#boot-splash')).toHaveCount(0);
            await expect(dialog.locator('.drift-reply')).toContainText('谢谢，我也在看月亮');
            const sender = await browser.newContext({ baseURL });
            try {
                await login(sender.request, 'reply-owner');
                const arrived = '这是一封从另一端漂来的回信';
                const response = await sender.request.post(`/api/drift/${bottleId}/replies`, { headers, data: { content: arrived } });
                expect(response.status()).toBe(201);
                await expect(dialog.locator('.drift-reply')).toContainText(['谢谢，我也在看月亮', arrived], { timeout: 12_000 });
                await dialog.getByRole('button', { name: '回应', exact: true }).click();
                const unsent = '还没写完的纸条';
                await page.locator('#drift-reply').fill(unsent);
                const updated = page.waitForResponse(r => new URL(r.url()).pathname === `/api/drift/${bottleId}` && r.request().method() === 'GET');
                await page.evaluate(() => window.dispatchEvent(new Event('focus')));
                await updated;
                await expect(page.locator('#drift-reply')).toHaveValue(unsent);
                const submit = dialog.getByRole('button', { name: '把回信放进瓶子', exact: true });
                await expect(submit).toBeInViewport();
                expect(await submit.evaluate(button => {
                    const r = button.getBoundingClientRect();
                    return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
                })).toBe(true);
                if (viewport.name === 'mobile') {
                    await page.setViewportSize({ width: 390, height: 420 });
                    await expect(submit).toBeInViewport();
                    await expect(page.locator('#drift-reply')).toHaveValue(unsent);
                    await page.screenshot({ path: '/tmp/drift-paper-keyboard.png' });
                    await page.locator('#drift-reply').blur();
                    await page.setViewportSize(viewport);
                }
                await dialog.getByRole('button', { name: '取消', exact: true }).click();
                await dialog.getByRole('button', { name: '回应', exact: true }).click();
                await expect(page.locator('#drift-reply')).toHaveValue(unsent);
                await dialog.getByRole('button', { name: '取消', exact: true }).click();
                await page.screenshot({ path: `/tmp/drift-letter-${viewport.name}.png` });
            } finally { await sender.close(); }
            await dialog.getByRole('button', { name: '关闭纸条', exact: true }).click();
            await mine.click();
            await expect(page.locator('#drift-panel-bottles')).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
            await page.screenshot({ path: `/tmp/drift-bottles-${viewport.name}.png`, fullPage: true });
        } finally {
            await login(page.request, 'reply-owner');
            await page.request.post(`/api/drift/${bottleId}/close`, { headers, data: {} });
        }
    });
}
