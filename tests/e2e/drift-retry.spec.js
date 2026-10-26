const { test, expect } = require('../e2e-fixtures.cjs');

const unknown = '暂时无法确认是否已保存。内容可能已经保存，请先查看我的瓶子或收取回信；保留原文重试不会重复发送。';
async function login(request, baseURL, username) {
    const response = await request.post('/api/auth/login', { headers:{ Origin:new URL(baseURL).origin, 'X-Requested-With':'XMLHttpRequest' }, data:{ username,password:'mem0-test-password' } });
    expect(response.status()).toBe(200);
}
function headers(baseURL) { return { Origin:new URL(baseURL).origin, 'X-Requested-With':'XMLHttpRequest' }; }

test('saved bottle with a lost response retries once after reload and keeps its request ID', async ({ page, baseURL }, info) => {
    await login(page.request,baseURL,'reply-owner');
    const content = `响应中断回归 ${Date.now()}`;
    await page.goto('/drift');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    const requests = [];
    await page.route(url => url.pathname === '/api/drift', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) {
            const saved = await route.fetch();
            expect(saved.status()).toBe(201);
            return route.abort('connectionclosed');
        }
        return route.continue();
    });
    await page.getByRole('button',{ name:'扔一个',exact:true }).click();
    await page.locator('#drift-draft').fill(content);
    await page.getByRole('button',{ name:'交给潮汐',exact:true }).click();
    await expect(page.getByRole('status')).toHaveText(unknown);
    await expect(page.locator('#drift-draft')).toHaveValue(content);
    await page.screenshot({ path:info.outputPath('saved-response-lost.png') });
    let list = (await (await page.request.get('/api/drift')).json()).data;
    expect(list.filter(row=>row.content === content)).toHaveLength(1);
    const id = list.find(row=>row.content === content).id;
    try {
        await page.reload();
        await expect(page.locator('#boot-splash')).toHaveCount(0);
        await page.getByRole('button',{ name:'扔一个',exact:true }).click();
        await page.locator('#drift-draft').fill(content);
        await page.getByRole('button',{ name:'交给潮汐',exact:true }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
        await expect(page.getByRole('button').filter({ hasText:content })).toHaveCount(1);
        expect(requests).toHaveLength(2);
        expect(requests[1].requestId).toBe(requests[0].requestId);
        list = (await (await page.request.get('/api/drift')).json()).data;
        expect(list.filter(row=>row.content === content)).toHaveLength(1);
    } finally {
        await page.request.post(`/api/drift/${id}/close`,{ headers:headers(baseURL),data:{} });
    }
});

test('saved reply with a lost response retries without duplicate letters or notifications', async ({ page, browser, baseURL }) => {
    const owner = await browser.newContext({ baseURL });
    let id;
    try {
        await login(owner.request,baseURL,'reply-owner');
        await login(page.request,baseURL,'reply-reader');
        const created = await owner.request.post('/api/drift',{ headers:headers(baseURL),data:{ content:`回信重试瓶 ${Date.now()}` } });
        id = (await created.json()).data.id;
        const picked = await page.request.post('/api/drift/pick',{ headers:headers(baseURL),data:{} });
        expect((await picked.json()).data.id).toBe(id);
        await page.goto(`/drift?bottle=${id}`);
        await expect(page.locator('#boot-splash')).toHaveCount(0);
        const attempts = [];
        await page.route(url => url.pathname === `/api/drift/${id}/replies`,async route => {
            attempts.push(route.request().postDataJSON());
            if (attempts.length === 1) {
                expect((await route.fetch()).status()).toBe(201);
                return route.abort('connectionclosed');
            }
            return route.continue();
        });
        const content = '这封信只应寄出一次';
        await page.getByRole('button',{ name:'回应',exact:true }).click();
        await page.locator('#drift-reply').fill(content);
        const send = page.getByRole('button',{ name:'把回信放进瓶子',exact:true });
        await send.click();
        await expect(page.getByRole('status')).toHaveText(unknown);
        await expect(page.locator('#drift-reply')).toHaveValue(content);
        await send.click();
        await expect(page.locator('.drift-reply')).toHaveCount(1);
        expect(attempts).toHaveLength(2);
        expect(attempts[0].requestId).toBe(attempts[1].requestId);
        const data = (await (await page.request.get(`/api/drift/${id}`)).json()).data;
        expect(data.replies.filter(row=>row.content === content)).toHaveLength(1);
        const notifications = (await (await owner.request.get('/api/user/notifications')).json()).data;
        expect(notifications.filter(row=>row.link === `/drift?bottle=${id}`)).toHaveLength(1);
    } finally {
        if (id) await owner.request.post(`/api/drift/${id}/close`,{ headers:headers(baseURL),data:{} });
        await owner.close();
    }
});

test('read failures use localized feedback and keep the current letter', async ({ page, baseURL }) => {
    await login(page.request,baseURL,'reply-owner');
    const created = await page.request.post('/api/drift',{ headers:headers(baseURL),data:{ content:'读取失败仍保留纸条' } });
    const id = (await created.json()).data.id;
    try {
        await page.goto(`/drift?bottle=${id}`);
        await expect(page.locator('#boot-splash')).toHaveCount(0);
        await expect(page.locator('.drift-original-paper')).toContainText('读取失败仍保留纸条');
        await page.route(url=>url.pathname === `/api/drift/${id}`,route=>route.abort('internetdisconnected'));
        await page.getByRole('button',{ name:'收取回信',exact:true }).click();
        await expect(page.getByRole('status')).toContainText('网络连接异常');
        await expect(page.getByRole('status')).not.toContainText('Failed to fetch');
        await expect(page.locator('.drift-original-paper')).toContainText('读取失败仍保留纸条');
    } finally {
        await page.request.post(`/api/drift/${id}/close`,{ headers:headers(baseURL),data:{} });
    }
});


test('confirmed save followed by a failed refresh says not to resend', async ({ page, baseURL }) => {
    await login(page.request,baseURL,'reply-owner');
    await page.goto('/drift');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    const content = `保存后刷新失败 ${Date.now()}`;
    let savedId;
    await page.route(url=>url.pathname === '/api/drift',async route => {
        if (route.request().method() === 'POST') {
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            savedId = (await response.json()).data.id;
            return route.fulfill({ response });
        }
        if (savedId) return route.abort('internetdisconnected');
        return route.continue();
    });
    try {
        await page.getByRole('button',{ name:'扔一个',exact:true }).click();
        await page.locator('#drift-draft').fill(content);
        await page.getByRole('button',{ name:'交给潮汐',exact:true }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
        await expect(page.getByRole('status')).toHaveText('已保存，但暂时无法刷新内容。请稍后刷新列表或收取回信，无需重新发送。');
        const rows = (await (await page.request.get('/api/drift')).json()).data;
        expect(rows.filter(row=>row.content === content)).toHaveLength(1);
    } finally {
        if (savedId) await page.request.post(`/api/drift/${savedId}/close`,{ headers:headers(baseURL),data:{} });
    }
});
