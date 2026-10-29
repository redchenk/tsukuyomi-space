// A returning visitor with a complete, synthetic model configuration. Individual
// chat tests intercept the transport; first-use tests keep their empty storage.
async function configureRoomFixture(page) {
    await page.addInitScript(() => {
        if (!localStorage.getItem('roomLLMSettings')) {
            localStorage.setItem('roomLLMSettings', JSON.stringify({
                apiUrl: 'https://api.deepseek.com/chat/completions',
                apiKey: 'fixture-room-key', model: 'deepseek-chat', useProxy: true
            }));
        }
    });
}

// Wait for the input to become interactive. Playwright's fill() can otherwise
// set an inert textarea without dispatching the input event to Vue.
async function waitForRoom(page) {
    const { expect } = require('./e2e-fixtures.cjs');
    await expect(page.locator('.room-page')).toBeVisible();
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => document.querySelector('.room-entry-splash')?.dataset.phase || 'idle'),
        { timeout: 45000 }).not.toMatch(/^(loading|revealing)$/);
    const fallback = page.locator('.room-entry-splash').getByRole('button', { name: /^(先进入房间|Enter room|部屋に入る)$/ });
    if (await fallback.isVisible()) await fallback.click();
    await expect(page.locator('.room-entry-splash')).toHaveCount(0);
    await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
}

module.exports = { configureRoomFixture, waitForRoom };
