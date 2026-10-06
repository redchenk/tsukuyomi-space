const { test, expect } = require('@playwright/test');
const path = require('node:path');

function wav() {
    const samples = 8000 * 20; const bytes = Buffer.alloc(44 + samples * 2);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40); return bytes;
}

for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
    test(`music QR, search, playback and fallback at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(theme => localStorage.setItem('tsukuyomi_theme', theme), theme);
        let linked = false; let checking = 0; const calls = [];
        const song = { id: '123', title: '夏夜的来信', artist: '八千代', cover: '', source: 'netease' };
        const profile = { id: '10001', nickname: '月下听歌人', avatar: '' };
        await page.route('**/api/music/**', async route => {
            const url = new URL(route.request().url()); calls.push(url.pathname);
            let body;
            if (url.pathname.endsWith('/status')) body = { enabled: true, profile: linked ? profile : null };
            else if (url.pathname.endsWith('/qr/check')) { checking++; linked = true; body = { status: 'authorized', profile }; }
            else if (url.pathname.endsWith('/qr')) body = { qrId: 'mock-qr-id', url: 'https://music.163.com/login?codekey=test-qrcode-key-123456', expiresAt: Date.now() + 180000 };
            else if (url.pathname.endsWith('/logout')) { linked = false; body = {}; }
            else if (url.pathname.endsWith('/playlists')) body = { playlists: [{ id: '456', title: '我的夏日歌单', count: 1, cover: '' }], more: false };
            else if (url.pathname.endsWith('/playlists/456') || url.pathname.endsWith('/search')) body = { tracks: [song], offset: 0, total: 1 };
            else if (url.pathname.endsWith('/playback')) body = { url: 'https://m801.music.126.net/test.wav', expiresIn: 300, preview: false };
            else throw new Error(`Unexpected mock music route ${url.pathname}`);
            await route.fulfill({ json: { success: true, ...body } });
        });
        await page.route('https://m801.music.126.net/test.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav() }));
        await page.goto('/hub');
        const before = await page.evaluate(() => window.scrollY);
        await page.getByRole('button', { name: 'Expand music drawer' }).click();
        await expect(page.getByRole('combobox', { name: '网站曲目' })).toBeVisible();
        await expect(page.getByRole('combobox', { name: '网站曲目' }).locator('option')).toHaveCount(10);
        await page.getByRole('button', { name: '网易云', exact: true }).click();
        await page.getByRole('button', { name: '扫码登录网易云' }).click();
        const qr = page.getByRole('img', { name: '网易云音乐登录二维码' });
        await expect(qr).toBeVisible();
        await expect.poll(() => qr.evaluate(img => img.complete && img.naturalWidth > 0)).toBeTruthy();
        const qrBox = await qr.boundingBox(); expect(qrBox.width).toBeGreaterThan(140);
        const panel = page.locator('.site-music-panel'); const box = await panel.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => window.scrollY)).toBe(before);
        await expect(page.getByText('月下听歌人', { exact: true })).toBeVisible();
        await expect.poll(() => checking).toBe(1);
        await page.getByRole('searchbox', { name: '搜索网易云音乐' }).fill('夏夜');
        await page.getByRole('button', { name: '搜索音乐', exact: true }).click();
        await page.getByRole('button', { name: '播放 夏夜的来信' }).click();
        await expect(page.locator('.site-music-title-row strong')).toHaveText('夏夜的来信');
        await expect(page.getByRole('button', { name: 'Pause music', exact: true }).first()).toBeVisible();
        await expect(page.locator('.music-playback-status')).toHaveCount(0);
        await expect.poll(() => page.locator('.site-music-meta-row').innerText()).toContain('0:20');
        await page.getByRole('button', { name: '我的歌单', exact: true }).click();
        await page.getByRole('button', { name: '我的夏日歌单 1 首' }).click();
        await expect(page.getByRole('button', { name: '播放 夏夜的来信' })).toBeVisible();
        const input = page.getByRole('searchbox', { name: '搜索网易云音乐' });
        await expect(input).toHaveAttribute('autocomplete', 'off');
        const overflow = await panel.evaluate(el => el.scrollWidth > el.clientWidth + 1); expect(overflow).toBe(false);
        const buttonRadius = await page.getByRole('button', { name: '网易云', exact: true }).evaluate(el => getComputedStyle(el).borderRadius);
        expect(parseFloat(buttonRadius)).toBeGreaterThan(15);
        const colors = await page.locator('.site-music-main-control').evaluate(el => {
            const reference = document.querySelector('.site-room-cta');
            return { player: getComputedStyle(el).backgroundColor, site: getComputedStyle(reference).backgroundColor };
        });
        expect(colors.player).toBe(colors.site);
        await page.screenshot({ path: path.resolve('.codex_tmp/netease-music-20261006', `player-${width}-${theme}.png`) });
        await page.getByRole('button', { name: '退出', exact: true }).click();
        await expect(page.getByRole('button', { name: '扫码登录网易云' })).toBeVisible();
        await expect(page.locator('.site-music-title-row strong')).toHaveText('Remember');
        await page.getByRole('button', { name: '网站曲目', exact: true }).click();
        await expect(page.getByRole('combobox', { name: '网站曲目' }).locator('option')).toHaveCount(10);
        await page.getByRole('button', { name: 'Collapse music drawer' }).click();
        expect(calls.filter(call => call.endsWith('/playback'))).toHaveLength(1);
    });
}

test('QR polling stops when player closes; provider failures preserve local songs', async ({ page }) => {
    let checks = 0;
    await page.route('**/api/music/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/qr/check')) { checks++; return route.fulfill({ json: { success: true, status: 'waiting' } }); }
        if (path.endsWith('/qr')) return route.fulfill({ json: { success: true, qrId: 'qr-test', url: 'https://music.163.com/login?codekey=test-qrcode-key-123456', expiresAt: Date.now() + 180000 } });
        return route.fulfill({ json: { success: true, enabled: true, profile: null } });
    });
    await page.goto('/hub');
    await page.getByRole('button', { name: 'Expand music drawer' }).click();
    await page.getByRole('button', { name: '网易云', exact: true }).click();
    await page.getByRole('button', { name: '扫码登录网易云' }).click();
    await expect(page.getByRole('img', { name: '网易云音乐登录二维码' })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse music drawer' }).click();
    await page.waitForTimeout(3300);
    expect(checks).toBe(0);
    await page.route('**/api/music/qr', route => route.fulfill({ status: 502, json: { success: false, code: 'MUSIC_NETWORK', message: '网易云连接暂时失败，可以继续听网站曲目' } }));
    await page.getByRole('button', { name: 'Expand music drawer' }).click();
    await page.getByRole('button', { name: '网易云', exact: true }).click();
    await page.getByRole('button', { name: '刷新二维码' }).click();
    await expect(page.getByText('网易云连接暂时失败，可以继续听网站曲目', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '网站曲目', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '网站曲目' }).locator('option')).toHaveCount(10);
});

test('a late remote playback response cannot replace the selected fixed tracks', async ({ page }) => {
    let release; let reached;
    const requested = new Promise(resolve => { reached = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/music/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/status')) return route.fulfill({ json: { success: true, enabled: true, profile: { id: '10001', nickname: '月下听歌人' } } });
        if (path.endsWith('/search')) return route.fulfill({ json: { success: true, tracks: [{ id: '123', title: '迟到的音乐', source: 'netease' }], total: 1 } });
        if (path.endsWith('/playback')) { reached(); await pending; return route.fulfill({ json: { success: true, url: 'https://m801.music.126.net/test.wav', expiresIn: 300 } }); }
        throw new Error(`Unexpected music request ${path}`);
    });
    await page.goto('/hub');
    await page.getByRole('button', { name: 'Expand music drawer' }).click();
    await page.getByRole('button', { name: '网易云', exact: true }).click();
    await expect(page.getByText('月下听歌人', { exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: '搜索网易云音乐' }).fill('测试');
    await page.getByRole('button', { name: '搜索音乐', exact: true }).click();
    await page.getByRole('button', { name: '播放 迟到的音乐' }).click();
    await requested;
    await page.getByRole('button', { name: '网站曲目', exact: true }).click();
    const replied = page.waitForResponse(response => response.url().endsWith('/tracks/123/playback'));
    release();
    await (await replied).finished();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await expect(page.locator('.site-music-title-row strong')).toHaveText('Remember');
    await expect(page.getByRole('button', { name: 'Pause music', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '网站曲目' }).locator('option')).toHaveCount(10);
});
