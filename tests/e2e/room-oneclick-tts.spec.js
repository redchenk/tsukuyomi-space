const { test, expect } = require('../e2e-fixtures.cjs');
const defaults = require('../fixtures/oneclick-tts-defaults.json');

const origin = 'https://yachiyo.hk';
const tokenA = 'A'.repeat(43);
const tokenB = 'B'.repeat(43);
const launchHash = token => `#tsukuyomi-tts=v1.${token}`;

function silentWave() {
    const data = Buffer.alloc(44 + 16000);
    data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
    data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28);
    data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(16000, 40);
    return data;
}

async function useOfficialOriginFixture(page, baseURL) {
    // Exercise the real production-origin guard with the local built app.
    // Every website request stays on the isolated E2E server.
    await page.route(`${origin}/**`, async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/live2dcubismcore-v5.min.js')) {
            return route.fulfill({ status: 404, body: '' });
        }
        const response = await route.fetch({ url: baseURL + url.pathname + url.search });
        return route.fulfill({ response });
    });
    await page.addInitScript(() => {
        if (!localStorage.getItem('oneclick-test-initialized')) {
            localStorage.setItem('oneclick-test-initialized', '1');
            localStorage.setItem('login-session', 'keep-login');
            localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
            localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
            localStorage.setItem('roomTTSSettings', JSON.stringify({ enabled: false, provider: 'mimo' }));
        }
    });
}

async function openTtsSection(page) {
    const menu = page.locator('.settings-mobile-menu');
    await expect(menu).toBeAttached();
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '语音与朗读 可选', exact: true }).click();
    const card = page.locator('#room-tts-settings');
    await expect(card).toBeVisible();
    return card;
}

test('fresh voice settings expose the complete one-click defaults without enabling audio', async ({ page, baseURL }) => {
    await useOfficialOriginFixture(page, baseURL);
    await page.goto(origin + '/room/settings');
    await page.evaluate(() => localStorage.removeItem('roomTTSSettings'));
    await page.reload();
    const card = await openTtsSection(page);
    await expect(card.getByRole('switch', { name: '开启语音合成' })).not.toBeChecked();
    await card.getByRole('switch', { name: '开启语音合成' }).check();
    await expect(card.getByRole('combobox', { name: '语音服务' })).toHaveValue('gptSovitsLocal');
    await card.locator('summary').click();
    for (const [name, key] of [['apiurl', 'apiUrl'], ['model', 'model'], ['refaudiopath', 'refAudioPath'], ['prompttext', 'promptText'], ['gptweightpath', 'gptWeightPath'], ['sovitsweightpath', 'sovitsWeightPath']]) {
        await expect(card.locator(`[name="room-setting-tts-${name}"]`)).toHaveValue(defaults[key]);
    }
});

for (const width of [1280, 390]) {
    test(`launcher connects and refreshes credentials with authenticated playback at ${width}px`, async ({ page, baseURL }, testInfo) => {
        await page.setViewportSize({ width, height: 960 });
        await useOfficialOriginFixture(page, baseURL);
        const localRequests = [];
        let currentToken = tokenA;
        await page.route('http://localhost:9880/**', async route => {
            const url = new URL(route.request().url());
            localRequests.push(url);
            if (url.searchParams.get('oneclick_token') !== currentToken) {
                return route.fulfill({ status: 401, body: 'Invalid launch credential' });
            }
            if (url.pathname === '/tts') {
                return route.fulfill({ contentType: 'audio/wav', body: silentWave() });
            }
            return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
        });
        const websiteRequests = [];
        page.on('request', request => { if (request.url().startsWith(origin)) websiteRequests.push(request.url()); });
        await page.goto(origin + '/room?from=oneclick' + launchHash(tokenA));
        await expect(page).toHaveURL(origin + '/room?from=oneclick');
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('roomTTSSettings')))).toEqual({
            ...defaults, enabled: true, apiUrl: defaults.apiUrl + '?oneclick_token=' + tokenA
        });
        expect(await page.evaluate(() => localStorage.getItem('login-session'))).toBe('keep-login');
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('roomLLMSettings')))).toEqual({ useProxy: true });
        await page.goto(origin + '/room/settings');
        let card = await openTtsSection(page);
        await expect(card.getByRole('switch', { name: '开启语音合成' })).toBeChecked();
        await expect(card).toContainText('八千代一键包已自动连接，可以直接朗读。');
        await card.getByRole('combobox', { name: '语音服务' }).selectOption('gptSovitsLocal');
        await card.getByRole('button', { name: '保存并试听', exact: true }).click();
        await expect(page.getByText('已直接请求本机 GPT-SoVITS 并开始播放。', { exact: true })).toBeVisible();
        expect(localRequests.map(url => url.pathname)).toEqual(['/set_gpt_weights', '/set_sovits_weights', '/tts']);
        expect(localRequests[0].searchParams.get('weights_path')).toBe(defaults.gptWeightPath);
        expect(localRequests[1].searchParams.get('weights_path')).toBe(defaults.sovitsWeightPath);
        expect(localRequests[2].searchParams.get('ref_audio_path')).toBe(defaults.refAudioPath);
        expect(localRequests[2].searchParams.get('prompt_text')).toBe(defaults.promptText);
        expect(localRequests[2].searchParams.get('prompt_lang')).toBe('ja');
        expect(localRequests.every(url => url.searchParams.get('oneclick_token') === tokenA)).toBe(true);

        currentToken = tokenB;
        await page.evaluate(hash => { location.hash = hash; }, launchHash(tokenB));
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('roomTTSSettings')).apiUrl)).toBe(defaults.apiUrl + '?oneclick_token=' + tokenB);
        await expect(page).toHaveURL(origin + '/room/settings');
        card = await openTtsSection(page);
        await expect(card.getByRole('switch', { name: '开启语音合成' })).toBeChecked();
        await card.getByRole('button', { name: '保存并试听', exact: true }).click();
        await expect(page.getByText('已直接请求本机 GPT-SoVITS 并开始播放。', { exact: true })).toBeVisible();
        expect(localRequests.slice(3).map(url => url.pathname)).toEqual(['/set_gpt_weights', '/set_sovits_weights', '/tts']);
        expect(localRequests.slice(3).every(url => url.searchParams.get('oneclick_token') === tokenB)).toBe(true);
        expect(websiteRequests.every(url => !url.includes(tokenA) && !url.includes(tokenB))).toBe(true);
        await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
        await card.screenshot({ path: testInfo.outputPath(`oneclick-connected-${width}.png`) });
    });
}
