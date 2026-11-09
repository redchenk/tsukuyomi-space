const { test, expect } = require('../e2e-drift-fixtures.cjs');

test('only a saved bottle starts the lantern film, which reveals My Bottles', async ({ page, baseURL }, info) => {
    const mobile = info.project.name.includes('mobile');
    if (mobile) await page.setViewportSize({ width: 390, height: 730 });
    const headers = { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' };
    expect((await page.request.post('/api/auth/login', { headers, data: {
        username: 'reply-owner', password: 'mem0-test-password'
    } })).ok()).toBe(true);
    await page.goto('/drift');
    await expect(page.locator('#boot-splash')).toBeHidden();
    const draft = page.getByRole('textbox', { name: '写给海的另一端' });
    const submit = page.locator('.drift-compose [type=submit]');
    const film = page.getByRole('dialog', { name: '流灯入月' });
    const note = `等潮汐带走这一封信 ${Date.now()}`;
    await expect(submit).toBeDisabled();
    await draft.fill(note);
    await expect(draft).toHaveValue(note);
    await expect(film).toHaveCount(0);

    let release;
    const receiptGate = new Promise(resolve => { release = resolve; });
    let pending = false;
    let id;
    await page.route(url => url.pathname === '/api/drift', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        pending = true;
        await receiptGate;
        const response = await route.fetch();
        id = (await response.json()).data.id;
        await route.fulfill({ response });
    });
    try {
        await submit.click();
        await expect.poll(() => pending).toBe(true);
        await expect(film).toHaveCount(0);
        await expect(page.locator('#drift-tab-write')).toHaveAttribute('aria-selected', 'true');
        const scrolled = await page.evaluate(() => window.scrollY);
        if (mobile) expect(scrolled).toBeGreaterThan(20);
        const returnToLake = scrolled > 20 && page.evaluate(() => new Promise(resolve => {
            const positions = [];
            const started = performance.now();
            const sample = now => {
                positions.push(window.scrollY);
                if (document.querySelector('.drift-film') || now - started > 2000) resolve(positions);
                else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
        }));
        const moonExposure = page.evaluate(() => new Promise(resolve => {
            const started = performance.now();
            let flashed = false;
            let appearedInZoom = false;
            const sample = now => {
                const film = document.querySelector('.drift-film');
                const act = film?.dataset.act;
                const moon = film?.querySelector('.drift-film-moon-detail');
                if (moon) {
                    const style = getComputedStyle(moon);
                    if (style.visibility === 'visible' && Number(style.opacity) > .01) {
                        if (act === 'zoom') appearedInZoom ||= moon.naturalWidth > 0;
                        else flashed = true;
                    }
                }
                if (act === 'reveal' || now - started > 8000) resolve({ flashed, appearedInZoom });
                else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
        }));
        release();
        await expect(film).toBeVisible();
        if (returnToLake) {
            const positions = await returnToLake;
            expect(positions.some(y => y > 1 && y < scrolled - 8)).toBe(true);
            expect(positions.at(-1)).toBe(0);
        }
        await expect(page).not.toHaveURL(/tab=bottles/);
        await expect(page.locator('#drift-draft')).toHaveValue(note);
        await expect(page.locator('#drift-panel-write .drift-notice')).toHaveCount(0);
        await expect(film.locator('.drift-film-moon-detail')).toHaveJSProperty('naturalWidth', 1254);
        expect(await moonExposure).toEqual({ flashed: false, appearedInZoom: true });
        await expect(page).toHaveURL(/tab=bottles/);
        await expect(film).toHaveCount(0);
        await expect(page.locator('#drift-tab-bottles')).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#drift-panel-bottles .drift-list-item')).toContainText([note]);
        await page.locator('#drift-tab-sea').click();
        await expect(page.getByRole('button', { name: '捡一个', exact: true })).toBeVisible();
        await page.getByRole('button', { name: '再发一封', exact: true }).click();
        await expect(draft).toHaveValue('');
        await expect(film).toHaveCount(0);
    } finally {
        release();
        if (id) await page.request.post(`/api/drift/${id}/close`, { headers, data: {} });
    }
});
