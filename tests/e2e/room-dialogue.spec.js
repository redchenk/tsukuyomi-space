const { test, expect } = require('../e2e-fixtures.cjs');
const engine = require('../../shared/room-dialogue.cjs');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });

test('Room sends scoped dialogue guidance and restores it after reload', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true,
            apiUrl: 'https://fixture.test/v1/chat/completions', model: 'fixture-model', apiKey: 'fixture-key' }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    });
    const requests = [];
    await page.route('**/api/chat/stream', route => {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ status: 200, contentType: 'text/event-stream',
            body: `event: done\ndata: ${JSON.stringify({ reply: '好，先听你说。' })}\n\n` });
    });
    await page.goto('/room');
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    const send = async text => {
        await page.locator('#chatInput').fill(text);
        await page.locator('#sendChatBtn').click();
        await expect(page.locator('.chat-message.assistant[aria-busy="true"]')).toHaveCount(0);
    };
    await send('今天好烦，别给我建议');
    expect(requests).toHaveLength(1);
    expect(requests[0].systemPrompt).toContain(engine.policy.notes.noAdvice);
    await send('嗯，我继续说');
    expect(requests[1].systemPrompt).toContain(engine.policy.notes.noAdvice);
    await page.reload();
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    await send('先听着');
    expect(requests[2].systemPrompt).toContain(engine.policy.notes.noAdvice);
    await page.screenshot({ path: testInfo.outputPath('room-dialogue-continuity.png') });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('roomChatHistory:guest')).length)).toBe(6);
    expect((await page.locator('.chat-message.assistant').allTextContents()).join('')).not.toContain('【本轮接话】');
});

test('regenerating the latest reply plans from the preceding turns', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true,
            apiUrl: 'https://fixture.test/v1/chat/completions', model: 'fixture-model', apiKey: 'fixture-key' }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
        localStorage.setItem('roomChatHistory:guest', JSON.stringify([
            { id: 'u1', role: 'user', turnId: 'base-turn', content: '今天去买了面包' },
            { id: 'a1', role: 'assistant', turnId: 'base-turn', content: '刚出炉的真香。' },
            { id: 'u2', role: 'user', turnId: 'latest-turn', content: '嗯' },
            { id: 'a2', role: 'assistant', turnId: 'latest-turn', content: '还买了什么？' }
        ]));
    });
    let request;
    await page.route('**/api/chat/stream', route => {
        request = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'text/event-stream',
            body: `event: done\ndata: ${JSON.stringify({ reply: '趁热吃正好。' })}\n\n` });
    });
    await page.goto('/room');
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    const latest = page.locator('.chat-message.assistant').last();
    await latest.getByRole('button', { name: '重新生成' }).click();
    await expect(latest.locator('.chat-reply-part')).toHaveText('趁热吃正好。');
    await expect(page.locator('.chat-message.assistant[aria-busy="true"]')).toHaveCount(0);
    expect(request.systemPrompt).not.toContain(engine.policy.notes.questionCooldown);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('roomChatHistory:guest')));
    expect(saved).toHaveLength(4);
    expect(saved.at(-1).content).toBe('趁热吃正好。');
});
