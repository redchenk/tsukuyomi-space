const { test, expect } = require('../e2e-fixtures.cjs');

function silentWave() {
    const data = Buffer.alloc(44 + 16000);
    data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
    data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28);
    data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(16000, 40);
    return data;
}

test('remote GPT-SoVITS settings use the same-origin bridge for preview and persist the choice', async ({ page }) => {
    const endpoint = 'http://39.105.82.185:9880/tts';
    const reference = 'E:\\声音\\月见八千代.wav';
    await page.addInitScript(({ endpoint, reference }) => {
        localStorage.setItem('roomTTSSettings', JSON.stringify({
            enabled: true, provider: 'gpt-sovits', apiUrl: endpoint,
            refAudioPath: reference, textLang: 'auto', promptLang: 'ja', useProxy: false
        }));
    }, { endpoint, reference });
    let directCalls = 0;
    await page.route('http://39.105.82.185:9880/**', route => { directCalls++; return route.abort(); });
    const proxyBodies = [];
    await page.route('**/api/tts', route => {
        proxyBodies.push(route.request().postDataJSON());
        return route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWave() });
    });
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/room/settings');
    await page.getByRole('button', { name: '语音与朗读 可选', exact: true }).click();
    const card = page.locator('#room-tts-settings');
    await expect(card).toBeVisible();
    await card.locator('summary').click();
    await expect(card.getByText(/公网 IP 或域名自动使用站内代理/)).toBeVisible();
    await card.getByRole('button', { name: '保存并试听', exact: true }).click();
    await expect(page.getByText('连接成功，已开始播放测试语音。', { exact: true })).toBeVisible();
    expect(proxyBodies).toHaveLength(1);
    expect(proxyBodies[0]).toMatchObject({ provider: 'gpt-sovits', apiUrl: endpoint, refAudioPath: reference, useProxy: true });
    expect(directCalls).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('roomTTSSettings')).useProxy)).toBe(true);
});
