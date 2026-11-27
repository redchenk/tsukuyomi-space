const { test, expect } = require('../e2e-fixtures.cjs');

test.use({ launchOptions: { args: ['--no-proxy-server'] } });

test('interrupted Room stream restores the unsent turn after reload and retries it once', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true,
            apiUrl: 'https://fixture.test/v1/chat/completions', model: 'fixture-model', apiKey: 'fixture-key' }));
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
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    await expect(page.locator('.room-entry-splash')).toHaveCount(0);
    await page.locator('#chatInput').click();
    await page.locator('#chatInput').fill('今天有点累');
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('.chat-message.user.is-failed')).toContainText('今天有点累');
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toHaveCount(0);
    await expect(page.locator('#sendChatBtn')).toBeDisabled();
    const partial = page.locator('.room-interrupted-reply');
    await partial.locator('summary').click();
    await expect(partial.locator('p')).toHaveText('半句');
    expect(attempts).toBe(1);

    await page.reload();
    await expect(page.locator('.chat-message.user.is-failed')).toContainText('今天有点累');
    await page.getByRole('button', { name: /重试这轮|Retry this turn/ }).click();
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

test('official HTTP 400 keeps the question and retries exactly once on request', async ({ page, baseURL }) => {
    const login = await page.request.post('/api/auth/login', {
        headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' },
        data: { username: 'e2e-user', password: 'e2e-password' }
    });
    expect(login.ok()).toBe(true);
    const { data: { user } } = await login.json();
    await page.addInitScript(({ user, origin }) => {
        localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
        localStorage.setItem('roomLLMSettings', JSON.stringify({ apiUrl: origin + '/official-api/v1/', model: 'deepseek-flash', apiKey: 'tsukuyomi-site-session' }));
        localStorage.setItem('roomTTSSettings', JSON.stringify({ enabled: false }));
    }, { user, origin: baseURL });
    let preflights = 0;
    await page.route('**/official-api/api/dashboard', route => {
        preflights++;
        return route.fulfill({ json: { enabled: true, me: { account_id: 'fixture' }, models: [
            { id: 'deepseek-flash', enabled: true, max_output_tokens: 512, capabilities: { apps: true } }
        ] } });
    });
    const sent = [];
    await page.route('**/official-api/v1/deepseek/chat/completions', route => {
        const req = route.request();
        sent.push({ headers: req.headers(), body: req.postDataJSON() });
        if (sent.length === 1) return route.fulfill({ status: 400, json: { error: { code: 'INVALID_MESSAGES', message: 'Unsupported input.' } } });
        return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"index":0,"delta":{"content":"Successfully retried"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n' });
    });

    await page.goto('/room');
    const input = page.locator('#chatInput');
    await input.click();
    await input.fill('Room gateway regression');
    await page.locator('#sendChatBtn').click();
    const notice = page.locator('.chat-generation-notice.error');
    await expect(notice).toContainText('Unsupported input.');
    await expect(notice.locator('a[href="/room/settings"]')).toBeVisible();
    await expect(page.locator('.chat-message.user.is-failed')).toContainText('Room gateway regression');
    expect(sent).toHaveLength(1);

    await notice.getByRole('button', { name: /重试这轮|Retry this turn/ }).click();
    await expect(page.locator('.chat-message.assistant').filter({ hasText: 'Successfully retried' }).last()).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(preflights).toBe(2);
    for (const request of sent) {
        expect(request.headers['x-official-expected-account']).toBe('fixture');
        expect(request.body.messages.at(-1).content).toBe('Room gateway regression');
        expect(request.body.max_tokens).toBeLessThanOrEqual(512);
    }
    expect(sent[0].headers['idempotency-key']).not.toBe(sent[1].headers['idempotency-key']);
});
