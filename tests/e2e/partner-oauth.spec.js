const { test, expect } = require('../e2e-fixtures.cjs');
const crypto = require('node:crypto');
const verifier = 'v'.repeat(43);
const query = new URLSearchParams({ client_id: 'e2e-partner', redirect_uri: 'https://partner.example.test/callback',
    response_type: 'code', scope: 'profile.basic', state: 'browser-fixture', code_challenge_method: 'S256',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url') });

async function decide(page, name) {
    // The reserved example.test host has no real network destination.
    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
    const [response] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/oauth/authorize'
            && response.request().method() === 'POST'),
        page.getByRole('button', { name, exact: true }).click()
    ]);
    expect(response.status()).toBe(303);
    const callback = response.headers().location;
    expect(new URL(callback).origin).toBe('https://partner.example.test');
    // Playwright routes only the first URL in a redirect chain. Verify the real
    // form's 303, then open its exact Location as an interceptable fixture request.
    await navigation;
    await page.goto(callback);
}

for (const width of [390, 1280]) {
    test(`partner consent login, cancellation and grant revocation at ${width}px`, async ({ page, playwright, baseURL }, testInfo) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(() => localStorage.setItem('lang', 'zh'));
        await page.route('https://partner.example.test/callback?*', route => route.fulfill({ contentType: 'text/html', body: '<p>合作方回调测试页</p>' }));
        const path = '/oauth/authorize?' + query;
        const initial = await page.goto(path);
        expect(initial.headers()['referrer-policy']).toBe('no-referrer');
        expect(initial.headers()['cache-control']).toContain('no-store');
        await page.getByRole('link', { name: '前往登录' }).click();
        await page.waitForLoadState('load');
        expect(new URL(page.url()).searchParams.get('redirect')).toBe(path);
        // The site's boot splash temporarily makes the form inert.
        await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
        await expect(page.locator('#boot-splash')).toBeHidden();
        await page.locator('#loginAccount').waitFor({ state: 'visible' });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(document.querySelector('.route-view-frame').getAnimations({ subtree: true })
                .filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
        });
        await page.locator('#loginAccount').fill('e2e-user');
        await page.locator('#loginPassword').fill('e2e-password');
        await page.getByRole('button', { name: '登录', exact: true }).click();
        await expect(page.getByRole('heading', { name: '授权给第八千代测试应用' })).toBeVisible();
        expect(await page.locator('script').count()).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('consent.png'), fullPage: true });
        await decide(page, '取消授权');
        await expect(page).toHaveURL(/partner\.example\.test\/callback\?/);
        const denied = new URL(page.url());
        expect(denied.searchParams.get('error')).toBe('access_denied');
        expect(denied.searchParams.get('state')).toBe('browser-fixture');
        expect(denied.searchParams.has('code')).toBe(false);
        await page.goto(path);
        await decide(page, '同意并继续');
        await expect(page).toHaveURL(/partner\.example\.test\/callback\?/);
        const callback = new URL(page.url());
        expect(callback.searchParams.get('iss')).toBe(baseURL);
        // A separate context represents the partner backend without browser cookies.
        const backend = await playwright.request.newContext();
        try {
            const tokenResponse = await backend.post(`${baseURL}/api/partner/oauth/token`, {
                headers: { Authorization: 'Basic ' + Buffer.from('e2e-partner:' + 'e'.repeat(43)).toString('base64') },
                form: { grant_type: 'authorization_code', code: callback.searchParams.get('code'),
                    redirect_uri: 'https://partner.example.test/callback', code_verifier: verifier }
            });
            expect(tokenResponse.status()).toBe(200);
            const token = (await tokenResponse.json()).access_token;
            const profile = await backend.get(`${baseURL}/api/partner/oauth/userinfo`, { headers: { Authorization: 'Bearer ' + token } });
            expect(Object.keys(await profile.json()).sort()).toEqual(['avatar', 'nickname', 'sub']);
            await page.goto('/user-center');
            await expect(page.locator('#boot-splash')).toBeHidden();
            await page.getByRole('button', { name: '管理账号安全', exact: true }).click();
            await page.getByRole('button', { name: '已授权应用', exact: true }).click();
            await expect(page.getByRole('heading', { name: '已授权应用' })).toBeVisible();
            await page.screenshot({ path: testInfo.outputPath('connections.png'), fullPage: true });
            await page.getByRole('button', { name: '撤销第八千代测试应用授权' }).click();
            await expect(page.getByText('你还没有授权任何合作应用。')).toBeVisible();
            expect((await backend.get(`${baseURL}/api/partner/oauth/userinfo`, { headers: { Authorization: 'Bearer ' + token } })).status()).toBe(401);
        } finally { await backend.dispose(); }
    });
}
