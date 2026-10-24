const { createHash } = require('node:crypto');
const { test, expect } = require('../e2e-fixtures.cjs');

test('attachment library retries a lost chunk acknowledgement and downloads the original bytes', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/attachments');
    await expect(page.getByRole('heading', { name: '附件库', exact: true })).toBeVisible();
    await expect(page.locator('.attachments-hero')).toContainText('100 MB');
    let interrupted = false;
    const partRequests = [];
    await page.route('**/api/assets/uploads/*/*', async route => {
        if (route.request().method() === 'PUT') {
            partRequests.push(route.request().url().split('/').pop());
            expect(route.request().headers()['content-type']).toBe('application/octet-stream');
            if (!interrupted) { interrupted = true; await route.fetch(); await route.abort('connectionreset'); return; }
        }
        await route.continue();
    });
    const bytes = Buffer.alloc(5 * 1024 * 1024, 65); bytes.write('%PDF-1.7');
    const fileName = `upload-regression-${Date.now()}.pdf`;
    await page.locator('input[type=file]').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: bytes });
    await expect(page.locator('.attachments-grid')).toContainText(fileName, { timeout: 20000 });
    expect(partRequests).toEqual(['0', '0', '1']);
    await page.screenshot({ path: test.info().outputPath('attachment-upload.png'), fullPage: true });
    const assets = await (await page.request.get('/api/assets')).json();
    const asset = assets.data.assets.find(a => a.metadata.fileName === fileName);
    expect(asset).toBeTruthy();
    const response = await page.request.get(`/api/assets/proxy/${asset.id}`);
    expect(response.status()).toBe(200);
    expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tsukuyomi_upload:')))).toEqual([]);
    await page.request.delete(`/api/assets/${asset.id}`, { headers: { Origin: new URL(page.url()).origin, 'X-Requested-With': 'XMLHttpRequest' } });
});
