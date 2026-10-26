const { test, expect } = require('../e2e-fixtures.cjs');

test.use({ isMobile: true, hasTouch: true });

async function login(request, baseURL, username) {
    const response = await request.post('/api/auth/login', {
        headers: { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' },
        data: { username, password: 'mem0-test-password' }
    });
    expect(response.status()).toBe(200);
}

async function installViewport(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    // Controlled viewport events cover overlay/panning and rotation. These
    // assertions supplement physical-device checks; they do not emulate an IME.
    await page.addInitScript(() => {
        const viewport = new EventTarget();
        Object.assign(viewport, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
        Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    });
}

async function verifyKeyboardCycle(page, input, draft, info) {
    await input.fill(draft);
    for (const size of [
        { width: 390, height: 844, visible: 400, offset: 80 },
        { width: 932, height: 430, visible: 190, offset: 32 },
        { width: 390, height: 844, visible: 430, offset: 0 }
    ]) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await input.focus();
        await page.evaluate(size => {
            Object.assign(window.visualViewport, { width: size.width, height: size.visible, offsetTop: size.offset });
            window.visualViewport.dispatchEvent(new Event('resize'));
            window.visualViewport.dispatchEvent(new Event('scroll'));
        }, size);
        await expect(page.locator('.app-shell')).toHaveClass(/is-keyboard-open/);
        await expect(input).toHaveValue(draft);
        const controls = [input, ...await page.locator('.drift-letter-actions button').all(), page.getByRole('button', { name: '关闭纸条', exact: true })];
        for (const control of controls) {
            await expect.poll(async () => {
                const box = await control.boundingBox();
                return box && box.y >= size.offset && box.y + box.height <= size.offset + size.visible;
            }).toBe(true);
            expect(await control.evaluate(node => {
                const rect = node.getBoundingClientRect();
                return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
            })).toBe(true);
        }
        if (size.width > 860) await page.screenshot({ path: info.outputPath('landscape-keyboard.png') });
    }
    await input.blur();
    await page.evaluate(() => {
        Object.assign(window.visualViewport, { height: 844, offsetTop: 0 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('.app-shell')).not.toHaveClass(/is-keyboard-open/);
    await expect(input).toHaveValue(draft);
}

test('bottle draft and actions remain reachable through portrait and wide touch landscape keyboards', async ({ page, baseURL }, info) => {
    await installViewport(page);
    await login(page.request, baseURL, `drift-keyboard-owner-${info.project.name}`);
    await page.goto('/drift');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await page.getByRole('button', { name: '扔一个', exact: true }).click();
    const input = page.locator('#drift-draft');
    const draft = '转动手机时，长纸条与发送按钮都应该留在可见区域。\n'.repeat(30);
    await verifyKeyboardCycle(page, input, draft, info);
    await page.getByRole('button', { name: '关闭纸条', exact: true }).click();
    await page.getByRole('button', { name: '扔一个', exact: true }).click();
    await expect(input).toHaveValue(draft);
});

test('reply draft and actions survive keyboard panning, rotation, dismissal and returning to the letter', async ({ page, browser, baseURL }, info) => {
    await installViewport(page);
    const owner = await browser.newContext({ baseURL });
    const headers = { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' };
    let id;
    try {
        await login(owner.request, baseURL, `drift-keyboard-owner-${info.project.name}`);
        const created = await owner.request.post('/api/drift', { headers, data: { content: `键盘回信测试 ${Date.now()}` } });
        expect(created.status()).toBe(201);
        id = (await created.json()).data.id;
        await login(page.request, baseURL, `drift-keyboard-reader-${info.project.name}`);
        expect((await (await page.request.post('/api/drift/pick', { headers, data: {} })).json()).data.id).toBe(id);
        await page.goto(`/drift?bottle=${id}`);
        await expect(page.locator('#boot-splash')).toHaveCount(0);
        await page.getByRole('button', { name: '回应', exact: true }).click();
        const input = page.locator('#drift-reply');
        const draft = '这是一封仍未发送的长回信，旋转和收起键盘不能把它弄丢。\n'.repeat(25);
        await verifyKeyboardCycle(page, input, draft, info);
        await page.getByRole('button', { name: '取消', exact: true }).click();
        await page.getByRole('button', { name: '回应', exact: true }).click();
        await expect(input).toHaveValue(draft);
    } finally {
        if (id) await owner.request.post(`/api/drift/${id}/close`, { headers, data: {} });
        await owner.close();
    }
});
