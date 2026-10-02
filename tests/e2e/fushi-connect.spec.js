const { test, expect } = require('../e2e-fixtures.cjs');

const params = new URLSearchParams({ client_id: 'fixture-public-client', response_type: 'code',
    redirect_uri: 'https://client.example.test/return', resource: 'https://site.example.test/api/fushi/mcp',
    scope: 'fushi:read fushi:reply fushi:events', state: 'fixture-state',
    code_challenge_method: 'S256', code_challenge: 'v'.repeat(43) });
const connectPath = `/fushi/connect?${params}`;

for (const width of [390, 1280]) {
    test(`assistant consent preserves the login return request at ${width}px`, async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('lang', 'zh'));
        await page.setViewportSize({ width, height: 844 });
        await page.goto(connectPath);
        await expect(page.getByRole('heading', { name: '连接社区助手' })).toBeVisible();
        await page.getByRole('button', { name: '登录 Fushi 账号' }).click();
        await expect(page).toHaveURL(/\/login\?/);
        expect(new URL(page.url()).searchParams.get('redirect')).toBe(connectPath);
        await page.locator('#loginAccount').fill('e2e-user');
        await page.locator('#loginPassword').fill('e2e-password');
        await page.getByRole('button', { name: '登录', exact: true }).click();
        await expect(page).toHaveURL(new RegExp('/fushi/connect\\?'));
        expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(Object.fromEntries(params));
        await expect(page.getByRole('button', { name: '确认连接', exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test(`denied assistant authorization shows a useful message and permits retry at ${width}px`, async ({ page, baseURL }) => {
        await page.setViewportSize({ width, height: 844 });
        const login = await page.request.post('/api/auth/login', {
            headers: { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' },
            data: { username: 'e2e-user', password: 'e2e-password' }
        });
        expect(login.ok()).toBe(true);
        const requests = [];
        // HTTP consent/PKCE behavior is exercised with real SQLite in the API
        // suite. Here a denied server response isolates the browser's recovery UX.
        await page.route('**/api/fushi/oauth/authorize', async route => {
            requests.push(route.request().postDataJSON());
            expect(route.request().headers()['x-requested-with']).toBe('XMLHttpRequest');
            await route.fulfill({ status: 400, contentType: 'application/json',
                body: JSON.stringify({ success: false, message: 'access_denied' }) });
        });
        await page.goto(connectPath);
        const confirm = page.getByRole('button', { name: '确认连接', exact: true });
        await confirm.click();
        await expect(page.getByRole('alert')).toHaveText('请使用 Fushi 专属普通账号登录，再确认授权。');
        await expect(confirm).toBeEnabled();
        await page.getByRole('button', { name: '取消授权', exact: true }).click();
        await expect(page.getByRole('alert')).toBeVisible();
        expect(requests.map(request => request.approve)).toEqual([true, false]);
        expect(requests[0].state).toBe('fixture-state');
        expect(requests[0].redirect_uri).toBe('https://client.example.test/return');
        expect(requests[0].user_id).toBeUndefined();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
}

for (const width of [390, 1280]) {
    test(`AstrBot one-use callback strips its URL and keeps the confirmation only in memory at ${width}px`, async ({ page, baseURL }) => {
        await page.setViewportSize({ width, height:844 });
        const params = new URLSearchParams({code:'c'.repeat(43),state:'s'.repeat(43),iss:new URL(baseURL).origin});
        const response = await page.goto(`/fushi/astrbot/callback?${params}`);
        expect(response.headers()['referrer-policy']).toBe('no-referrer');
        expect(response.headers()['cache-control']).toContain('no-store');
        await expect(page.getByRole('heading',{name:'最后一步，回到机器人私聊'})).toBeVisible();
        await expect(page).toHaveURL(new URL('/fushi/astrbot/callback',baseURL).href);
        const command = await page.getByRole('textbox',{name:'一次性授权确认指令'}).inputValue();
        expect(command.startsWith('/Fushi确认 ')).toBe(true);
        expect(JSON.parse(Buffer.from(command.split(' ')[1],'base64url'))).toEqual({code:'c'.repeat(43),state:'s'.repeat(43),iss:new URL(baseURL).origin});
        expect(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('c'.repeat(43))))).toBe(false);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.reload();
        await expect(page.getByRole('heading',{name:'授权链接已失效'})).toBeVisible();
    });
}
test('AstrBot callback rejects a substituted issuer and cancellation leaves no confirmation code', async ({page}) => {
    await page.goto(`/fushi/astrbot/callback?code=${'c'.repeat(43)}&state=${'s'.repeat(43)}&iss=https%3A%2F%2Fevil.example.test`);
    await expect(page.getByRole('heading',{name:'授权链接已失效'})).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await page.goto('/fushi/astrbot/callback?error=access_denied');
    await expect(page.getByRole('heading',{name:'已取消连接'})).toBeVisible();
});
test('AstrBot callback rejects duplicate parameters and error/code mixtures', async ({page, baseURL}) => {
    const query = new URLSearchParams({code:'c'.repeat(43),state:'s'.repeat(43),iss:new URL(baseURL).origin});
    query.append('code','d'.repeat(43));
    await page.goto(`/fushi/astrbot/callback?${query}`);
    await expect(page.getByRole('heading',{name:'授权链接已失效'})).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    query.delete('code');
    query.set('code','c'.repeat(43));
    query.set('error','access_denied');
    await page.goto(`/fushi/astrbot/callback?${query}`);
    await expect(page.getByRole('heading',{name:'已取消连接'})).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
});
