const { test, expect } = require('../e2e-fixtures.cjs');

for (const location of ['plaza', 'article']) {
    test(`${location} keeps an unsent reply when switching community translation`, async ({ page, baseURL }) => {
        const headers = { Origin: baseURL, 'Sec-Fetch-Site': 'same-origin', 'X-Requested-With': 'XMLHttpRequest' };
        const login = await page.request.post('/api/auth/login', { headers, data: { username: 'e2e-user', password: 'e2e-password' } });
        expect(login.ok()).toBe(true);
        const created = await page.request.post('/api/messages', { headers, data: {
            content: `月下的故事 ${location} ${Date.now()}`,
            ...(location === 'article' ? { article_id: 1 } : {})
        } });
        expect(created.status()).toBe(201);
        const root = (await created.json()).data;
        const reads = [];
        const writes = [];
        // Exercise the actual English-host behavior against the isolated local
        // fixture. No request reaches the production site or translation service.
        await page.route('http://tsukuyomi-space.com/**', async route => {
            const request = route.request();
            const url = new URL(request.url());
            const translated = url.pathname.startsWith('/en-api/');
            if (url.pathname.includes('/messages') && request.method() === 'GET') reads.push(translated);
            if (request.method() === 'POST' && url.pathname.includes('/messages')) {
                writes.push({ path: url.pathname, body: request.postDataJSON() });
            }
            url.host = new URL(baseURL).host;
            url.pathname = url.pathname.replace(/^\/en-api\//, '/api/');
            const forwardedHeaders = { ...request.headers(), host: url.host, origin: baseURL };
            // Let the request context use its localhost fixture session, rather
            // than replacing it with the synthetic hostname's browser cookies.
            delete forwardedHeaders.cookie;
            const response = await page.request.fetch(url.toString(), {
                method: request.method(),
                headers: forwardedHeaders,
                ...(request.postDataBuffer() ? { data: request.postDataBuffer() } : {})
            });
            if (translated && url.pathname.includes('/messages') && request.method() === 'GET') {
                const body = await response.json();
                const messages = Array.isArray(body.data) ? body.data : body.data?.messages || [];
                for (const message of messages) message.content = `EN: ${message.content}`;
                await route.fulfill({ response, json: body });
            } else await route.fulfill({ response });
        });
        await page.goto(`http://tsukuyomi-space.com/${location === 'plaza' ? 'plaza' : 'article?id=1'}`);
        const prefix = location === 'plaza' ? 'msg' : 'comment';
        const target = page.locator(`#${prefix}-${root.id}`);
        const replyButton = target.getByRole('button', { name: /^Reply(?: to)?(?: \d+)?$/ }).first();
        await replyButton.click();
        const draft = `这是一条还没有发送的私人回复草稿。${location} ${root.id}`;
        const input = target.locator('.message-reply-form textarea');
        await input.fill(draft);
        for (const translated of [false, true]) {
            const count = reads.length;
            await page.locator('.site-account-trigger').click();
            await page.getByRole('switch', { name: 'Translate community content' }).setChecked(translated);
            await page.locator('.site-nav-drawer-head > button').click();
            await expect.poll(() => reads.slice(count).includes(translated)).toBe(true);
            if (location === 'article') await expect(page.locator('#article-comments')).toHaveAttribute('aria-busy', 'false');
            else await expect(page.locator('.plaza-wall')).toHaveAttribute('aria-busy', 'false');
            await expect(input).toBeVisible();
            await expect(target.locator('.message-reply-quote')).toHaveText(`${translated ? 'EN: ' : ''}${root.content}`);
            await expect(input).toHaveValue(draft);
        }
        if (location === 'plaza') {
            await page.locator('.plaza-refresh-btn').click();
            await expect(page.locator('.plaza-wall')).toHaveAttribute('aria-busy', 'false');
            await expect(input).toHaveValue(draft);
        }
        expect(writes).toEqual([]);
        const submitted = page.waitForResponse(response => response.url().endsWith(`/api/messages/${root.id}/reply`) && response.request().method() === 'POST');
        await target.locator('.message-reply-form .primary-btn').click();
        const response = await submitted;
        expect(response.status(), await response.text()).toBe(201);
        await expect(target.locator('.message-reply-form')).toHaveCount(0);
        expect(writes).toEqual([{ path: `/api/messages/${root.id}/reply`, body: { content: draft } }]);
        await replyButton.click();
        await expect(input).toHaveValue('');
    });
}
