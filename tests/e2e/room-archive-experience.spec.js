const { test, expect } = require('../e2e-fixtures.cjs');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });

test('mobile diary selection, persona switching and confirmed deletion preserve the archive', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        if (localStorage.getItem('roomDiaryArchive:guest')) return;
        localStorage.setItem('roomDiaryArchive:guest', JSON.stringify({
            slotId: 4, data: { prompts: { a: { data: { name: 'Aoi' } }, b: { data: { name: 'Sora' } } },
                diary: [1, 2].map(id => ({ diaryId: `entry-${id}`, date: `2026/9/${id}`, time: '12:00', content: `Test diary ${id}` })) }
        }));
    });
    await page.goto('/room');
    await page.getByRole('button', { name: '房间工具', exact: true }).click();
    await page.getByRole('button', { name: '日记', exact: true }).click();
    const diary = page.locator('#diaryPanel');
    await diary.getByRole('combobox').selectOption('b');
    await expect(diary).toContainText('Sora');
    await expect(diary.locator('.diary-list-item')).toHaveCount(2);
    page.once('dialog', dialog => dialog.dismiss());
    await diary.locator('.diary-list-delete').first().click();
    await expect(diary.locator('.diary-list-item')).toHaveCount(2);
    page.once('dialog', dialog => dialog.accept());
    await diary.locator('.diary-list-delete').first().click();
    await expect(diary.locator('.diary-list-item')).toHaveCount(1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('roomDiaryArchive:guest')));
    expect(saved.slotId).toBe(4);
    expect(saved.data.activePersonaId).toBe('b');
    expect(Object.keys(saved.data.prompts)).toHaveLength(2);
    expect(saved.data.diary.map(item => item.diaryId)).toEqual(['entry-1']);
    expect(await diary.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('character can open a new chat without creating a user message', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/room');
    await page.getByRole('button', { name: '我先说', exact: true }).click();
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toHaveCount(1);
    await expect(page.locator('.chat-message.user')).toHaveCount(0);
    await expect(page.locator('.chat-opener-btn')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toHaveCount(1);
});
