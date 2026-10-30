const { test, expect } = require('../e2e-drift-fixtures.cjs');
const prompts = require('../../shared/drift-prompts.json');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../../src/frontend/data/driftCopy.js'),'utf8').replace('export const driftCopy =','this.copy ='),context);
const copy = context.copy;
const headers = baseURL => ({ Origin:new URL(baseURL).origin, 'X-Requested-With':'XMLHttpRequest' });
async function login(request, baseURL, username) {
    const response = await request.post('/api/auth/login',{ headers:headers(baseURL),data:{ username,password:'mem0-test-password' } });
    expect(response.status()).toBe(200);
    return (await response.json()).data.user;
}
for (const lang of ['zh','en','ja']) {
    test(`${lang}: daily quest, shared sea and a single localized inspiration button`, async ({ page, browser, baseURL }, info) => {
        test.setTimeout(60_000);
        const text = copy[lang];
        const user = await login(page.request,baseURL,`drift-daily-${lang}-${info.project.name}`);
        await page.addInitScript(({ lang,user }) => {
            localStorage.setItem('lang',lang);
            localStorage.setItem('tsukuyomi_user',JSON.stringify(user));
            localStorage.setItem('tsukuyomi_theme','light');
        },{ lang,user });
        await page.emulateMedia({ reducedMotion:'reduce' });
        await page.goto('/growth');
        await expect(page.locator('#boot-splash')).toBeHidden();
        const task = page.locator('.growth-task').filter({ hasText:text.questLabel });
        const prompt = (await (await page.request.get('/api/drift/daily-prompt')).json()).data;
        await expect(task).toContainText(prompt.text[lang]);
        await task.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.drift-prompt-context')).toContainText(prompt.text[lang]);
        await expect(dialog.getByRole('button',{ name:text.inspire,exact:true })).toHaveCount(0);
        await expect(page.locator('.drift-daily-entry small')).toHaveCount(0);
        await expect(dialog.locator('.drift-prompt-context small')).toHaveCount(0);
        const content = `A quiet day ${lang} ${info.project.name}`;
        await page.locator('#drift-draft').fill(content);
        await expect(dialog.getByRole('button',{ name:text.send,exact:true })).toBeInViewport();
        await page.screenshot({ path:info.outputPath('daily-writer.png'), scale:'css' });
        await dialog.getByRole('button',{ name:text.send,exact:true }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('.drift-notice')).toHaveText(text.questCompleted.replace('{xp}','20'));
        await expect(page.locator('.drift-notice')).toBeInViewport();
        await page.screenshot({ path:info.outputPath('daily-completed.png'), scale:'css' });
        const rows = (await (await page.request.get('/api/drift')).json()).data;
        const bottle = rows.find(row => row.content === content);
        expect(bottle.dailyPrompt).toEqual({ date:prompt.date,id:prompt.id });
        const id = bottle.id;
        const reader = await browser.newContext({ baseURL });
        try {
            const card = page.locator('.drift-list-item').filter({ hasText:content });
            await expect(card).toContainText(text.dailyResponse);
            await card.click();
            await expect(dialog.locator('.drift-prompt-context')).toHaveCount(0);
            await expect(dialog).not.toContainText(prompt.text[lang]);
            await expect(dialog.locator('.drift-original-paper')).toHaveText(content);
            await page.screenshot({ path:info.outputPath('daily-letter.png'), scale:'css' });
            await dialog.getByRole('button',{ name:text.closeWindow,exact:true }).click();
            await login(reader.request,baseURL,'reply-reader');
            const shared = (await (await reader.request.get('/api/drift/daily-prompt')).json()).data;
            expect(shared).toEqual(prompt);
            const picked = await reader.request.post('/api/drift/pick',{ headers:headers(baseURL),data:{} });
            expect((await picked.json()).data.id).toBe(id);
            expect((await (await reader.request.get(`/api/drift/${id}`)).json()).data.bottle.dailyPrompt).toEqual({ date:prompt.date,id:prompt.id });
            const received = await reader.newPage();
            await received.addInitScript(lang => localStorage.setItem('lang',lang),lang);
            await received.goto(`/drift?bottle=${id}`);
            const receivedLetter = received.locator('.drift-bottle-dialog');
            await expect(receivedLetter.locator('.drift-original-paper')).toHaveText(content);
            await expect(receivedLetter.locator('.drift-prompt-context')).toHaveCount(0);
            await expect(receivedLetter).not.toContainText(prompt.text[lang]);
            await received.close();
            await page.getByRole('tab',{ name:text.sea,exact:true }).click();
            await page.getByRole('button',{ name:text.throw,exact:true }).click();
            const input = page.locator('#drift-draft');
            await input.fill('Keep my own words');
            const inspire = dialog.getByRole('button',{ name:text.inspire,exact:true });
            await expect(inspire).toHaveCount(1);
            await inspire.click();
            const suggestion = dialog.locator('.drift-inspiration .drift-prompt-context p');
            await expect(dialog.locator('.drift-inspiration strong, .drift-inspiration small')).toHaveCount(0);
            const first = await suggestion.textContent();
            expect(prompts.some(prompt => prompt.text[lang] === first)).toBe(true);
            await inspire.click();
            await expect(suggestion).not.toHaveText(first);
            await expect(input).toHaveValue('Keep my own words');
            const latestText = await suggestion.textContent();
            const suggested = prompts.find(prompt => prompt.text[lang] === latestText);
            await page.screenshot({ path:info.outputPath('inspiration.png'), scale:'css' });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await dialog.getByRole('button',{ name:text.closeWindow,exact:true }).click();
            if (lang === 'zh') {
                await page.getByRole('button',{ name:text.dailyWrite,exact:true }).click();
                await input.fill('A separate daily draft');
                await dialog.getByRole('button',{ name:text.closeWindow,exact:true }).click();
                await page.getByRole('button',{ name:'账号菜单',exact:true }).click();
                await page.getByRole('button',{ name:'日本語',exact:true }).click();
                await expect(page.locator('html')).toHaveAttribute('lang','ja');
                await page.keyboard.press('Escape');
                await page.getByRole('button',{ name:copy.ja.throw,exact:true }).click();
                await expect(input).toHaveValue('Keep my own words');
                await expect(suggestion).toHaveText(suggested.text.ja);
                await expect(dialog.getByRole('button',{ name:copy.ja.inspire,exact:true })).toHaveCount(1);
                await dialog.getByRole('button',{ name:copy.ja.closeWindow,exact:true }).click();
                await page.getByRole('button',{ name:copy.ja.dailyWrite,exact:true }).click();
                await expect(input).toHaveValue('A separate daily draft');
                await expect(dialog.locator('.drift-prompt-context')).toContainText(prompt.text.ja);
                await dialog.getByRole('button',{ name:copy.ja.closeWindow,exact:true }).click();
            }
            await page.goto('/growth');
            await expect(task).toBeDisabled();
            expect((await (await page.request.get('/api/growth/me')).json()).data.level.totalXp).toBe(20);
        } finally {
            await page.request.post(`/api/drift/${id}/close`,{ headers:headers(baseURL),data:{} });
            await reader.close();
        }
    });
}

test('stale question review preserves the draft and lost-response retries save one bottle', async ({ page, baseURL }, info) => {
    await login(page.request,baseURL,`drift-daily-retry-${info.project.name}`);
    await page.addInitScript(() => localStorage.setItem('lang','en'));
    const prompt = (await (await page.request.get('/api/drift/daily-prompt')).json()).data;
    const old = { ...prompt,date:'2000-01-01' };
    await page.route('**/api/drift/daily-prompt',route => route.fulfill({ json:{ success:true,data:old } }));
    await page.goto('/drift?daily=1');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.unroute('**/api/drift/daily-prompt');
    const input = page.locator('#drift-draft');
    const content = `Preserved across midnight and retries ${info.project.name}`;
    await input.fill(content);
    const send = dialog.getByRole('button',{ name:copy.en.send,exact:true });
    await send.click();
    await expect(dialog.getByRole('status')).toHaveText(copy.en.promptChanged);
    await expect(input).toHaveValue(content);
    await expect(send).toBeDisabled();
    await dialog.getByRole('button',{ name:copy.en.useTodayPrompt,exact:true }).click();
    await expect(dialog.locator('.drift-prompt-context time')).toHaveText(prompt.date);
    const attempts = [];
    let id;
    await page.route('**/api/drift/daily',async route => {
        attempts.push(route.request().postDataJSON());
        if (attempts.length === 1) {
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            id = (await response.json()).data.id;
            return route.abort('connectionclosed');
        }
        return route.continue();
    });
    try {
        await send.click();
        await expect(dialog.getByRole('status')).toHaveText(copy.en.submissionUnknown);
        await expect(input).toHaveValue(content);
        await send.click();
        await expect(dialog).toBeHidden();
        expect(attempts[0].requestId).toBe(attempts[1].requestId);
        const rows = (await (await page.request.get('/api/drift')).json()).data;
        expect(rows.filter(row => row.content === content)).toHaveLength(1);
        expect((await (await page.request.get('/api/growth/me')).json()).data.level.totalXp).toBe(20);
    } finally {
        if (id) await page.request.post(`/api/drift/${id}/close`,{ headers:headers(baseURL),data:{} });
    }
});
