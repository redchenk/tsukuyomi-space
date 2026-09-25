const { test, expect } = require('../e2e-fixtures.cjs');

const holiday = '“假期将尽，书案蒙尘。非吾生性疏懒，实乃开学之日，令吾肝肠寸断，痛不欲生也。”😭';

test('emoji prose publishes while review reasons remain visible for messages, comments, replies and edits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await page.locator('#loginAccount').fill('feedback-browser');
    await page.locator('#loginPassword').fill('mem0-test-password');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/plaza');
    const composer = page.locator('.plaza-composer');
    const marker = `feedback-${Date.now()}`;
    await composer.locator('textarea').fill(`${marker} ${holiday}`);
    await composer.locator('.primary-btn').click();
    const post = page.locator('.plaza-msg-card').filter({ hasText: marker });
    await expect(post).toContainText(holiday);
    await expect(composer.locator('.moderation-notice')).toHaveCount(0);

    await composer.locator('textarea').fill('javascript:alert(1)');
    await composer.locator('.primary-btn').click();
    await expect(composer.locator('.moderation-notice')).toContainText('不允许发布的链接协议');
    await expect(composer.locator('textarea')).toHaveValue('javascript:alert(1)');
    await composer.locator('textarea').fill('防范诈骗 https://review.example/safety');
    await composer.locator('.primary-btn').click();
    await expect(composer.locator('.moderation-notice')).toContainText('关键词');
    await expect(composer.locator('.moderation-notice')).toContainText('review.example');
    await expect(composer.locator('textarea')).toHaveValue('');
    await expect(page.locator('.plaza-msg-card').filter({ hasText: 'review.example/safety' })).toHaveCount(0);

    await post.getByRole('button', { name: /回复/ }).first().click();
    const reply = post.locator('.plaza-reply-form');
    await reply.locator('textarea').fill('https://reply.example/help');
    await reply.locator('.primary-btn').click();
    await expect(post.locator('.moderation-notice')).toContainText('reply.example');
    await expect(reply).toHaveCount(0);

    await page.goto('/article?id=1');
    const comments = page.locator('.comments-section');
    const form = comments.locator('.comment-form');
    await form.locator('textarea').fill(`${marker} ${holiday}`);
    await form.locator('.primary-btn').click();
    const comment = page.locator('.comment-list > .comment-item').filter({ hasText: marker });
    await expect(comment).toContainText(holiday);
    await form.locator('textarea').fill('https://comment.example/link');
    await form.locator('.primary-btn').click();
    await expect(comments.locator(':scope > .moderation-notice')).toContainText('comment.example');
    await comment.getByRole('button', { name: /回复/ }).click();
    await comment.locator('.reply-form textarea').fill('这条提到诈骗，需要核实');
    await comment.locator('.reply-form .primary-btn').click();
    await expect(comment.locator('.moderation-notice')).toContainText('关键词');

    await page.goto('/user-center');
    await page.getByRole('button', { name: /我的留言/ }).click();
    const pendingId = await page.locator('.uc-message-item').filter({ hasText: 'review.example/safety' }).getAttribute('id');
    const pending = page.locator(`#${pendingId}`);
    await expect(pending.locator('.moderation-notice')).toContainText('按当前审核规则');
    await pending.getByRole('button', { name: '编辑', exact: true }).click();
    await pending.getByLabel('编辑留言').fill(`${marker} edited ${holiday}`);
    await pending.getByRole('button', { name: '保存', exact: true }).click();
    const edited = page.locator('.uc-message-item').filter({ hasText: `${marker} edited` });
    await expect(edited.locator('.uc-status-pill')).toHaveText('已通过');
    await expect(edited.locator('.moderation-notice')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
