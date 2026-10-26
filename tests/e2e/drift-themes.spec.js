const { test, expect } = require('../e2e-drift-fixtures.cjs');

async function switchTheme(page, mode) {
    const label = mode === 'dark' ? '切换深色主题' : '切换浅色主题';
    const toolbar = page.locator('.site-theme-button');
    if (await toolbar.isVisible()) await toolbar.click();
    else {
        await page.getByRole('button', { name: '账号菜单', exact: true }).click();
        await page.locator('#site-navigation').getByRole('button', { name: label, exact: true }).click();
        await page.locator('#site-navigation .site-nav-drawer-head button').click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
}

async function contrast(foreground, background, pseudo) {
    return foreground.evaluate((node, { selector, pseudo }) => {
        const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = value => rgb(value).map(v => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        const ink = luminance(getComputedStyle(node, pseudo).color);
        const paper = luminance(getComputedStyle(node.closest(selector)).backgroundColor);
        return (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05);
    }, { selector: background, pseudo });
}

test('light and dark shores, letters and drafts follow the selected theme', async ({ page, browser, baseURL }, info) => {
    test.setTimeout(45_000);
    const headers = { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' };
    const sender = await browser.newContext({ baseURL });
    const login = async (request, username) => {
        expect((await request.post('/api/auth/login', { headers, data: { username, password: 'mem0-test-password' } })).ok()).toBe(true);
    };
    let id;
    const content = `今天海边很安静，想听听远方的声音。 ${info.project.name}-${Date.now()}`;
    try {
        await login(sender.request, `drift-themes-owner-${info.project.name}`);
        const sent = await sender.request.post('/api/drift', { headers, data: { content } });
        expect(sent.status()).toBe(201);
        id = (await sent.json()).data.id;
        await login(page.request, `drift-themes-reader-${info.project.name}`);
        const picked = await page.request.post('/api/drift/pick', { headers, data: {} });
        expect((await picked.json()).data.id).toBe(id);
        expect((await page.request.post(`/api/drift/${id}/replies`, { headers, data: { content: '这边也起风了。愿你今晚睡个好觉。' } })).status()).toBe(201);
        await page.addInitScript(() => { localStorage.setItem('lang', 'zh'); localStorage.setItem('tsukuyomi_theme', 'light'); });
        await page.goto('/drift');
        await expect(page.locator('#boot-splash')).toHaveCount(0);
        const draft = '还没寄出的心事，切换主题以后继续写。';
        let dayImage;
        for (const mode of ['light', 'dark', 'light']) {
            if (await page.locator('html').getAttribute('data-theme') !== mode) await switchTheme(page, mode);
            const artwork = await page.locator('.drift-ocean').evaluate(async node => {
                const style = getComputedStyle(node);
                const url = style.backgroundImage.match(/url\(["']?([^"')]+)/)[1];
                const image = new Image(); image.src = url; await image.decode();
                return { url, width: image.naturalWidth };
            });
            expect(artwork.width).toBeGreaterThan(1000);
            if (mode === 'light') {
                if (!dayImage) dayImage = artwork.url;
                expect(artwork.url).toBe(dayImage);
            } else expect(artwork.url).not.toBe(dayImage);
            await page.getByRole('tab', { name: '我的瓶子', exact: true }).click();
            await page.locator('.drift-list-item').filter({ hasText: content }).click();
            await expect(page.locator('.drift-original-paper')).toHaveText(content);
            // Reopening a native dialog must not animate its title through
            // the eyebrow, including while the surrounding page reveals.
            const titleGaps = await page.locator('.drift-dialog-header').evaluate(async header => {
                const gaps = [];
                for (let frame = 0; frame < 4; frame++) {
                    await new Promise(requestAnimationFrame);
                    gaps.push(header.querySelector('h2').getBoundingClientRect().top
                        - header.querySelector('.drift-eyebrow').getBoundingClientRect().bottom);
                }
                return gaps;
            });
            expect(Math.min(...titleGaps)).toBeGreaterThanOrEqual(4.5);
            await page.screenshot({ path: info.outputPath(`letter-${mode}.png`) });
            await expect(page.locator('.drift-reply')).toContainText('愿你今晚睡个好觉。');
            expect(await contrast(page.locator('.drift-original-paper .drift-content'), '.drift-paper')).toBeGreaterThanOrEqual(4.5);
            expect(await contrast(page.locator('.drift-letter-byline time'), '.drift-bottle-dialog')).toBeGreaterThanOrEqual(4.5);
            expect(await contrast(page.locator('.drift-reader-footer .drift-primary'), '.drift-primary')).toBeGreaterThanOrEqual(4.5);
            await page.getByRole('button', { name: '关闭纸条', exact: true }).click();
            await page.getByRole('tab', { name: '海边', exact: true }).click();
            await page.screenshot({ path: info.outputPath(`shore-${mode}.png`) });
            await page.getByRole('button', { name: '扔一个', exact: true }).click();
            if (!await page.locator('#drift-draft').inputValue()) await page.locator('#drift-draft').fill(draft);
            await expect(page.locator('#drift-draft')).toHaveValue(draft);
            expect(await contrast(page.locator('#drift-draft'), '.drift-writing-paper')).toBeGreaterThanOrEqual(4.5);
            expect(await contrast(page.locator('#drift-draft'), '.drift-writing-paper', '::placeholder')).toBeGreaterThanOrEqual(4.5);
            await page.getByRole('button', { name: '取消', exact: true }).click();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    } finally {
        if (id) await sender.request.post(`/api/drift/${id}/close`, { headers, data: {} });
        await sender.close();
    }
});
