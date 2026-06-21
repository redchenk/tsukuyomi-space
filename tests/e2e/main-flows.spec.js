const { test, expect } = require('@playwright/test');

async function loginAsUser(page) {
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
}

function makePixelArtworkPayload(title) {
    const width = 32;
    const height = 18;
    const pixels = Array(width * height).fill(-1);
    pixels[width * 3 + 3] = 2;
    pixels[width * 3 + 4] = 3;
    pixels[width * 4 + 3] = 4;
    pixels[width * 4 + 4] = 5;
    return {
        title,
        description: `${title} preview test`,
        size: width,
        width,
        height,
        background_color: '#172033',
        palette: ['#0b1020', '#ffffff', '#aef2ff', '#7b8cf6', '#a481ff', '#ff9aba'],
        pixels
    };
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
});

test('user can log in and reach the hub', async ({ page }) => {
    await loginAsUser(page);
    await expect(page.getByText('e2e-user')).toBeVisible();
});

test('user can read an article and post a comment', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/article?id=1');
    await expect(page.getByRole('heading', { name: '欢迎来到月读空间' })).toBeVisible();

    const comment = `E2E article comment ${Date.now()}`;
    await page.locator('.comment-input').first().fill(comment);
    await page.getByRole('button', { name: '发布评论' }).click();

    await expect(page.getByText(comment)).toBeVisible();
});

test('user can publish a plaza message', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/plaza');

    const message = `E2E plaza message ${Date.now()}`;
    await page.locator('.plaza-textarea').fill(message);
    await page.locator('.plaza-composer-actions').getByRole('button', { name: '发布' }).click();

    await expect(page.getByText(message)).toBeVisible();
});

test('arena artwork preview is body-level and closes from the visible button', async ({ page }) => {
    await loginAsUser(page);
    const createResponse = await page.request.post('/api/pixel-art', {
        data: makePixelArtworkPayload(`E2E Arena Preview ${Date.now()}`)
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const artworkId = created.data.id;

    await page.goto('/arena');
    const card = page.locator(`#pixel-art-${artworkId}`);
    await expect(card).toBeVisible();
    await card.locator('.pixel-art-preview').click();

    const lightbox = page.locator('body > .arena-art-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(page.locator('.page.arena-page .arena-art-lightbox')).toHaveCount(0);

    const closeButton = lightbox.locator('.arena-art-lightbox-close');
    await expect(closeButton).toBeVisible();
    const closeButtonOwnsCenterPoint = await page.evaluate(() => {
        const button = document.querySelector('body > .arena-art-lightbox .arena-art-lightbox-close');
        if (!button) return false;
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return target === button || button.contains(target);
    });
    expect(closeButtonOwnsCenterPoint).toBe(true);

    await closeButton.click();
    await expect(lightbox).toHaveCount(0);
});

test('admin can open the terminal dashboard and user panel', async ({ page }) => {
    await page.goto('/terminal');
    await page.locator('input[autocomplete="username"]').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
    await page.getByRole('button', { name: '连接终端' }).click();

    await expect(page.getByText('Tsukuyomi Terminal')).toBeVisible();
    await expect(page.getByRole('heading', { name: '系统总览' })).toBeVisible();

    await page.getByRole('button', { name: /用户/ }).click();
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'e2e-user' }).first()).toBeVisible();
});
