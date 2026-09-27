const { test, expect } = require('../e2e-fixtures.cjs');

test('shared search finds navigation aliases, supports keyboard selection and preserves Room drafts', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/room');
    await page.locator('#chatInput').fill('尚未发送的消息');
    await page.locator('.site-search-trigger').click();
    const search = page.getByRole('dialog', { name: '想找些什么？' });
    const input = search.getByRole('searchbox');
    await expect(input).toBeFocused();
    await input.fill('八千代');
    await input.press('ArrowDown');
    await expect(search.getByRole('link', { name: '私人居所 /room' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).not.toBeVisible();
    await expect(page.locator('.site-search-trigger')).toBeFocused();
    await expect(page.locator('#chatInput')).toHaveValue('尚未发送的消息');
    await page.keyboard.press('Control+k');
    await expect(search).toBeVisible();
    await search.getByRole('searchbox').fill('图库');
    await search.getByRole('searchbox').press('Enter');
    await expect(page).toHaveURL(/\/gallery$/);
    await expect(search).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('search displays real API results, survives an error and follows the selected article', async ({ page }) => {
    const queries = [];
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\?/, route => {
        const q = new URL(route.request().url()).searchParams.get('q');
        queries.push(q);
        return route.fulfill({ json: q === '故障'
            ? { success: false, message: 'search unavailable' }
            : { success: true, data: q ? [{ id: 77, title: `${q}的创作手记`, slug: 'moonlight' }] : [] } });
    });
    await page.goto('/hub');
    await page.locator('.site-search-trigger').click();
    const search = page.getByRole('dialog', { name: '想找些什么？' });
    await search.getByRole('searchbox').fill('故障');
    await expect(search.getByText('文章暂时加载失败，页面入口仍可使用。')).toBeVisible();
    await search.getByRole('searchbox').fill('月下');
    await expect(search.getByRole('link', { name: '月下的创作手记' })).toBeVisible();
    expect(queries).toContain('月下');
    await search.getByRole('link', { name: '月下的创作手记' }).click();
    await expect(page).toHaveURL(/\/articles\/77\/moonlight$/);
});

test('signed-in Japanese navigation fits a narrow desktop and keeps account actions', async ({ page }) => {
    await page.setViewportSize({ width: 861, height: 844 });
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.getByRole('button', { name: '账号菜单', exact: true }).click();
    const menu = page.locator('#site-navigation');
    await expect(menu.getByRole('link', { name: '用户中心', exact: true })).toBeVisible();
    await menu.getByRole('button', { name: '日本語', exact: true }).click();
    await page.keyboard.press('Escape');
    expect(await page.locator('.site-commandbar').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /通知、未読/ })).toBeVisible();
});

for (const width of [360, 390, 860, 1024, 1440]) {
    test(`navigation and Room controls fit ${width}px without a duplicate global rail`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/room');
        await expect(page.locator('.site-commandbar')).toBeVisible();
        await expect(page.locator('.site-rail')).toHaveCount(0);
        const header = await page.locator('.site-commandbar').boundingBox();
        expect(header.x).toBeGreaterThanOrEqual(0);
        expect(header.x + header.width).toBeLessThanOrEqual(width);
        expect(await page.locator('.site-commandbar').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (width <= 860) {
            const tools = await page.locator('.room-mobile-header').boundingBox();
            expect(tools.y).toBeGreaterThanOrEqual(header.y + header.height);
            await expect(page.locator('.mobile-bottom-nav')).toHaveCount(0);
            await expect(page.locator('.site-mobile-navigation-trigger')).toBeVisible();
            await page.locator('.site-mobile-navigation-trigger').click();
        } else {
            await page.locator('.desktop-navigation').getByRole('button', { name: '探索' }).click();
        }
        const menu = page.locator('#site-navigation');
        await expect(menu.getByRole('link', { name: /^友情链接/ })).toBeVisible();
        await expect(menu.getByRole('link', { name: /^Agent OS/ })).toHaveAttribute('href', '/agent-os');
        await page.keyboard.press('Escape');
        await expect(menu).not.toBeVisible();
    });
}

for (const width of [390, 1280]) {
    test(`music and Yachiyo stay separately accessible at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        for (const path of ['/stage', '/hub']) {
            await page.goto(path);
            const pet = page.getByRole('button', { name: '打开八千代 AI 使用向导' });
            const music = page.getByRole('button', { name: 'Expand music drawer' });
            await expect(pet).toBeVisible();
            const petBox = await pet.boundingBox();
            const musicBox = await music.boundingBox();
            expect(musicBox.x + musicBox.width).toBeLessThan(petBox.x);
            if (width <= 860) {
                expect(Math.abs(musicBox.y + musicBox.height / 2 - petBox.y - petBox.height / 2)).toBeLessThan(2);
                expect(petBox.y + petBox.height).toBeGreaterThan(844 - 40);
                expect(petBox.y + petBox.height).toBeLessThanOrEqual(844);
            }
            await music.click();
            const panel = page.locator('.site-music-panel');
            await expect(panel).toBeVisible();
            const panelBox = await panel.boundingBox();
            expect(panelBox.x).toBeGreaterThanOrEqual(0);
            expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(petBox.x);
            await page.getByRole('button', { name: 'Collapse music drawer' }).click();
            await pet.click();
            await expect(page.getByRole('button', { name: '关闭向导' })).toBeVisible();
            await page.getByRole('button', { name: '关闭向导' }).click();
        }
    });

    test(`menu motion preserves focus, scroll and search handoff at ${width}px`, async ({ page, browserName }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.addInitScript(() => {
            window.menuMotionEvents = [];
            document.addEventListener('animationend', event => {
                // WebKit can report backdrop events without pseudoElement metadata.
                if (event.target.id === 'site-navigation' && ['site-menu-in', 'site-menu-out'].includes(event.animationName)) {
                    window.menuMotionEvents.push({
                        name: event.animationName,
                        elapsed: event.elapsedTime
                    });
                }
            });
        });
        await page.goto('/stage');
        await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
        await page.locator('main').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => {
            // Short menu transitions remain available in the automatic low-power profile.
            document.documentElement.dataset.performance = 'reduced';
            window.scrollTo({ top: 200, behavior: 'instant' });
        });
        // Card entrance animations are independent of the page animation.
        // Finish them before comparing dialog-open geometry.
        await page.locator('.stage-card').evaluateAll(cards => Promise.all(
            cards.flatMap(card => card.getAnimations()).map(animation => animation.finished.catch(() => {}))
        ));
        const scrollY = await page.evaluate(() => window.scrollY);
        const geometry = () => page.evaluate(() => ({
            scrollY: window.scrollY,
            header: document.querySelector('.site-commandbar').getBoundingClientRect().toJSON(),
            main: document.querySelector('main').getBoundingClientRect().toJSON(),
            cards: [...document.querySelectorAll('.stage-card')].map(el => el.getBoundingClientRect().toJSON())
        }));
        const before = await geometry();
        const menu = page.locator('#site-navigation');
        const explore = width <= 860
            ? page.locator('.site-mobile-navigation-trigger')
            : page.locator('.desktop-navigation').getByRole('button', { name: '探索' });
        const openMenu = trigger => browserName === 'webkit' ? trigger.tap() : trigger.click();
        let completed = 0;
        for (const trigger of [explore, page.getByRole('button', { name: '账号菜单', exact: true })]) {
            await openMenu(trigger);
            await expect(menu).toBeVisible();
            await expect(menu).not.toHaveAttribute('data-motion', /enter|leave/);
            completed++;
            if (browserName !== 'webkit') await expect.poll(() => page.evaluate(() => window.menuMotionEvents.length)).toBe(completed);
            await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
            expect(await geometry()).toEqual(before);
            // Mobile WebKit has no wheel transport; verify its open/close
            // geometry and root lock without injecting desktop-only input.
            if (browserName !== 'webkit') {
                await page.mouse.move(2, 400);
                await page.mouse.wheel(0, 350);
            }
            expect(await geometry()).toEqual(before);
            await page.keyboard.press('Escape');
            await expect(menu).not.toBeVisible();
            completed++;
            if (browserName !== 'webkit') await expect.poll(() => page.evaluate(() => window.menuMotionEvents.length)).toBe(completed);
            await expect(trigger).toBeFocused();
            await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
            expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollY)).toBeLessThan(2);
        }
        const events = await page.evaluate(() => window.menuMotionEvents);
        // WebKit can omit repeated animationend events when reusing a dialog.
        // Its visible/closed states and completed motion are checked above.
        if (browserName !== 'webkit') expect(events.map(event => event.name)).toEqual(['site-menu-in', 'site-menu-out', 'site-menu-in', 'site-menu-out']);
        expect(events.some(event => event.name === 'site-menu-in')).toBe(true);
        expect(events.some(event => event.name === 'site-menu-out')).toBe(true);
        for (const event of events) {
            expect(event.elapsed).toBeGreaterThan(0.1);
        }

        await explore.click();
        await page.keyboard.press('Control+k');
        const search = page.getByRole('dialog', { name: '想找些什么？' });
        await expect(menu).not.toBeVisible();
        await expect(search.getByRole('searchbox')).toBeFocused();
        await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
        expect(await geometry()).toEqual(before);
        await page.keyboard.press('Escape');
        await expect(search).not.toBeVisible();
        await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
        expect(await geometry()).toEqual(before);

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await explore.click();
        await expect(menu).toBeVisible();
        expect(await menu.evaluate(el => el.getAnimations().length)).toBe(0);
        await page.keyboard.press('Escape');
        await expect(menu).not.toBeVisible();
        await expect(explore).toBeFocused();

        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await explore.click();
        await menu.getByRole('link', { name: /^图库/ }).click();
        await expect(page).toHaveURL(/\/gallery$/);
        await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    });
}

test('mobile top navigation keeps primary routes, account, notifications and search reachable', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    // Navigation does not need a cold Cubism model load in this narrow-screen check.
    await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ status: 404, body: '' }));
    const activate = locator => browserName === 'webkit' ? locator.tap() : locator.click();
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.locator('.mobile-bottom-nav')).toHaveCount(0);
    for (const locator of [page.locator('.site-brand'), page.locator('.site-search-trigger'), page.getByRole('button', { name: /^站内信，/ }), page.locator('.site-account-trigger'), page.locator('.site-mobile-navigation-trigger')]) {
        await expect(locator).toBeVisible();
        await expect(locator).toBeInViewport();
    }
    expect(await page.locator('.site-commandbar').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const path of ['/room', '/plaza', '/stage', '/hub']) {
        await activate(page.locator('.site-mobile-navigation-trigger'));
        const menu = page.locator('#site-navigation');
        await expect(menu).toBeVisible();
        const header = await page.locator('.site-commandbar').boundingBox();
        await expect(menu).not.toHaveAttribute('data-motion', /enter|leave/);
        expect((await menu.boundingBox()).y).toBeGreaterThanOrEqual(header.y + header.height);
        await activate(menu.locator(`.site-mobile-shortcuts a[href="${path}"]`));
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(menu).not.toBeVisible();
    }
    await activate(page.locator('.site-account-trigger'));
    await expect(page.locator('#site-navigation').getByRole('link', { name: '用户中心', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await activate(page.getByRole('button', { name: /^站内信，/ }));
    await expect(page).toHaveURL(/\/notifications$/);
    await activate(page.locator('.site-search-trigger'));
    await expect(page.getByRole('dialog', { name: '想找些什么？' }).getByRole('searchbox')).toBeFocused();
});
