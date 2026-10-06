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

async function playbackFixture(page, { local = false, delaySecond = false } = {}) {
    const songs = ['第一首', '第二首', '第三首'].map((title, index) => ({ id: String(123 + index), title, source: 'netease' }));
    const calls = []; const media = [];
    let release; let reached;
    const pending = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { reached = resolve; });
    const audioResponse = route => {
        const bytes = wav(); const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
        if (!range) return route.fulfill({ contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: bytes });
        const start = Number(range[1]); const end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1);
        return route.fulfill({ status: 206, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${bytes.length}` }, body: bytes.subarray(start, end + 1) });
    };
    await page.addInitScript(() => {
        const NativeAudio = window.Audio;
        window.__testAudios = [];
        window.Audio = function (...args) {
            const audio = new NativeAudio(...args); window.__testAudios.push(audio); return audio;
        };
        window.Audio.prototype = NativeAudio.prototype;
        if (!localStorage.getItem('roomMusicPlaybackMode')) localStorage.setItem('roomMusicPlaybackMode', 'loop');
    });
    await page.route('**/api/music/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/status')) return route.fulfill({ json: { success: true, enabled: true, profile: local ? null : { id: '10001', nickname: '听歌测试' } } });
        if (path.endsWith('/search')) return route.fulfill({ json: { success: true, tracks: songs, total: songs.length } });
        if (path.endsWith('/playback')) {
            const id = path.split('/').at(-2); calls.push(id);
            if (delaySecond && id === '124') { reached(); await pending; }
            return route.fulfill({ json: { success: true, url: `https://m801.music.126.net/${id}.wav`, expiresIn: 300, preview: false } });
        }
        throw new Error(`Unexpected music request ${path}`);
    });
    await page.route('https://m801.music.126.net/*.wav', route => {
        media.push(route.request().url()); return audioResponse(route);
    });
    await page.route('**/assets/music/**', audioResponse);
    await page.goto('/hub');
    await page.getByRole('button', { name: 'Expand music drawer' }).click();
    if (!local) {
        await page.getByRole('button', { name: '网易云', exact: true }).click();
        await expect(page.getByText('听歌测试', { exact: true })).toBeVisible();
        await page.getByRole('searchbox', { name: '搜索网易云音乐' }).fill('测试');
        await page.getByRole('button', { name: '搜索音乐', exact: true }).click();
        await page.getByRole('button', { name: '播放 第一首' }).click();
    } else await page.locator('.site-music-main-control').click();
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Pause music');
    await expect.poll(() => page.evaluate(() => window.__testAudios.some(audio => Number.isFinite(audio.duration) && audio.duration > 0))).toBe(true);
    return { calls, media, release, requested };
}
async function finishAudio(page) {
    await expect.poll(() => page.evaluate(() => window.__testAudios.some(audio => Number.isFinite(audio.duration) && audio.duration > 0 && !audio.paused && audio.readyState >= 2))).toBe(true);
    await page.evaluate(() => {
        const audio = window.__testAudios.find(item => item.src.includes('/assets/music/') || item.src.includes('.music.126.net/'));
        if (!audio || !Number.isFinite(audio.duration) || audio.paused) throw new Error('Audio is not playing');
        // Seek near the end; the browser, rather than a synthetic DOM event,
        // raises ended and its accompanying pause/timeupdate events.
        audio.currentTime = Math.max(0, audio.duration - .08);
    });
}
test('fixed site songs really continue playing after the browser ended event', async ({ page }) => {
    await playbackFixture(page, { local: true });
    await page.getByRole('combobox', { name: '播放顺序' }).selectOption('sequence');
    await finishAudio(page);
    await expect(page.locator('.site-music-title-row strong')).not.toHaveText('Remember');
    await expect.poll(() => page.evaluate(() => window.__testAudios.some(audio => !audio.paused && !audio.ended && audio.currentTime < 5))).toBe(true);
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Pause music');
});
test('remote automatic continuation uses direct NetEase audio even with the drawer closed', async ({ page }) => {
    const { calls, media } = await playbackFixture(page);
    await page.getByRole('combobox', { name: '播放顺序' }).selectOption('sequence');
    await page.getByRole('button', { name: 'Collapse music drawer' }).click();
    await finishAudio(page);
    await expect.poll(() => calls.join(',')).toBe('123,124');
    await expect.poll(() => page.evaluate(() => window.__testAudios.some(audio => audio.src.endsWith('/124.wav') && !audio.paused && audio.currentTime < 5))).toBe(true);
    await page.getByRole('button', { name: 'Expand music drawer' }).click();
    await expect(page.locator('.site-music-title-row strong')).toHaveText('第二首');
    expect(media.every(url => new URL(url).hostname === 'm801.music.126.net')).toBe(true);
    expect(media.some(url => url.endsWith('/124.wav'))).toBe(true);
    await page.getByRole('button', { name: '播放 第三首' }).click();
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Pause music');
    await finishAudio(page);
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Play music');
    expect(calls.join(',')).toBe('123,124,125');
});
test('repeat queue wraps, repeat one repeats, and paused skipping stays paused', async ({ page }) => {
    const { calls } = await playbackFixture(page);
    await page.getByRole('button', { name: '播放 第三首' }).click();
    await finishAudio(page);
    await expect(page.locator('.site-music-title-row strong')).toHaveText('第一首');
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Pause music');
    await page.getByRole('combobox', { name: '播放顺序' }).selectOption('single');
    const before = calls.length;
    await finishAudio(page);
    await expect.poll(() => calls.length).toBe(before + 1);
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Pause music');
    await expect(page.locator('.site-music-title-row strong')).toHaveText('第一首');
    await page.locator('.site-music-main-control').click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.site-music-title-row strong')).toHaveText('第二首');
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Play music');
    await expect.poll(() => page.evaluate(() => window.__testAudios.every(audio => audio.paused))).toBe(true);
});
test('shuffle history works and the selected mode survives reload', async ({ page }) => {
    await playbackFixture(page);
    const select = page.getByRole('combobox', { name: '播放顺序' });
    await select.selectOption('shuffle');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const second = await page.locator('.site-music-title-row strong').innerText();
    expect(second).not.toBe('第一首');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const third = await page.locator('.site-music-title-row strong').innerText();
    expect(new Set(['第一首', second, third]).size).toBe(3);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page.locator('.site-music-title-row strong')).toHaveText(second);
    await page.evaluate(() => localStorage.setItem('roomMusicPlaybackMode', 'shuffle'));
    await page.goto('/stage');
    await page.getByRole('button', { name: 'Expand music drawer' }).click();
    await expect(select).toHaveValue('shuffle');
});
test('pausing during automatic remote resolution prevents late autoplay', async ({ page }) => {
    const { requested, release, calls } = await playbackFixture(page, { delaySecond: true });
    await finishAudio(page); await requested;
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Pause music');
    await page.locator('.site-music-main-control').click();
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Play music');
    const replied = page.waitForResponse(response => response.url().endsWith('/tracks/124/playback'));
    release(); await (await replied).finished();
    await expect(page.locator('.music-playback-status')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__testAudios.every(audio => audio.paused))).toBe(true);
    expect(calls.join(',')).toBe('123,124');
    await page.locator('.site-music-main-control').click();
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Pause music');
    expect(calls.join(',')).toBe('123,124');
});
test('an unavailable next song stops with a reason and cannot start a retry loop', async ({ page }) => {
    const { calls } = await playbackFixture(page);
    let failed = 0;
    await page.route('**/api/music/tracks/124/playback', route => {
        failed++; return route.fulfill({ status: 422, json: { success: false, code: 'MUSIC_UNAVAILABLE', message: '这首歌暂时无法播放' } });
    });
    await finishAudio(page);
    await expect(page.locator('.music-playback-status')).toHaveText('这首歌暂时无法播放');
    await expect(page.locator('.site-music-main-control')).toHaveAttribute('aria-label', 'Play music');
    await page.waitForTimeout(500);
    expect(failed).toBe(1); expect(calls).toEqual(['123']);
});
test('drawer morphs both directions, cancels rapid reversals and respects reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/music/status', route => route.fulfill({ json: { success: true, enabled: true, profile: null } }));
    await page.route('**/assets/music/**', route => route.fulfill({ contentType: 'audio/wav', body: wav() }));
    await page.goto('/hub');
    const drawer = page.locator('.site-music-drawer');
    await page.getByRole('button', { name: 'Expand music drawer' }).click();
    await expect(drawer).toHaveClass(/is-morphing/);
    await expect(drawer).not.toHaveClass(/is-morphing/);
    await expect(page.getByRole('combobox', { name: '播放顺序' })).toBeVisible();
    const from = await drawer.boundingBox();
    await page.getByRole('button', { name: 'Collapse music drawer' }).click();
    await expect(drawer).toHaveClass(/is-morphing/);
    await expect(drawer).not.toHaveClass(/is-morphing/);
    const to = await drawer.boundingBox(); expect(to.height).toBeLessThan(from.height); expect(to.width).toBeLessThan(from.width);
    await expect(page.getByRole('combobox', { name: '播放顺序' })).not.toBeVisible();
    await drawer.locator('.site-music-handle').evaluate(el => { el.click(); setTimeout(() => el.click(), 80); setTimeout(() => el.click(), 120); });
    await expect(drawer).toHaveClass(/is-open/);
    await expect(drawer).not.toHaveClass(/is-morphing/);
    expect(await drawer.evaluate(el => el.style.height || el.style.width)).toBe('');
    expect(await page.locator('.site-music-panel').evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    expect(await page.getByRole('combobox', { name: '播放顺序' }).evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(15);
    await page.screenshot({ path: path.resolve('.codex_tmp/music-playback-20261006', 'playback-390-light.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Collapse music drawer' }).click();
    await expect(drawer).not.toHaveClass(/is-morphing|is-open/);
    await page.getByRole('button', { name: 'Expand music drawer' }).click();
    await expect(drawer).not.toHaveClass(/is-morphing/);
});
