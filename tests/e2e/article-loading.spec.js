const { test, expect } = require('../e2e-fixtures.cjs');

const article = {
    id: 3, title: '长文章阅读测试', author_id: 'e2e-user-001', author_username: 'e2e-user',
    content_format: 'markdown', published_at: '2026-10-06T08:00:00Z', like_count: 2, bookmark_count: 1,
    content: Array.from({ length: 85 }, (_, i) => `## 第 ${i + 1} 节\n\n${'保留完整的正文、目录和阅读体验。'.repeat(24)}`).join('\n\n')
        + '\n\n| 功能 | 状态 |\n| --- | --- |\n| 阅读 | 正常 |\n\n```js\nconst ready = true;\n```\n\n脚注[^1]\n\n[^1]: 文末说明。'
};
const detail = /\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//;
const comments = /\/api\/(?:live\/[^/]+\/)?articles\/3\/messages(?:\?.*)?$/;
const levels = /\/api\/(?:live\/[^/]+\/)?growth\/public(?:\?.*)?$/;
function gate() {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, release };
}
async function reader(page, data = article) {
    await page.route(detail, route => route.fulfill({ json: { success: true, data } }));
}

test('long article is readable while comments, levels and private status requests are still pending', async ({ page, baseURL }) => {
    const headers = { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest', 'Sec-Fetch-Site': 'same-origin' };
    const login = await page.request.post('/api/auth/login', { headers, data: { username: 'e2e-user', password: 'e2e-password' } });
    expect(login.ok()).toBe(true);
    await page.addInitScript(() => localStorage.setItem('tsukuyomi_user', JSON.stringify({ id: 'e2e-user-001', username: 'e2e-user', role: 'user' })));
    const pending = gate();
    const routes = [comments, levels, /\/api\/user\/(?:bookmarks|article-likes)\/3\/status/];
    const seen = new Set();
    for (const pattern of routes) await page.route(pattern, async route => {
        seen.add(pattern);
        await pending.promise;
        const data = pattern === routes[2] ? { count: 4, liked: true, bookmarked: true }
            : pattern === levels ? [{ userId: 'e2e-user-001', level: 8 }] : [];
        await route.fulfill({ json: { success: true, data } }).catch(() => {});
    });
    await reader(page);
    try {
        await page.goto('/article?id=3', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.article-content')).toBeVisible();
        await expect(page.locator('.article-content h2')).toHaveCount(85);
        await expect(page.locator('.article-toc a')).toHaveCount(85);
        await expect(page.locator('.article-content table')).toContainText('正常');
        await expect(page.locator('.article-content code')).toContainText('const ready = true;');
        await expect(page.locator('.article-content .footnotes')).toContainText('文末说明');
        await expect(page.locator('.article-meta')).toContainText(/约 \d+ 分钟/);
        await expect(page.locator('.article-meta .user-level-badge')).toHaveCount(0);
        await expect(page.locator('#article-comments')).toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('.article-like-btn')).toBeDisabled();
        await expect(page.getByRole('button', { name: /^收藏/ })).toBeDisabled();
        await expect.poll(() => seen.size).toBe(3);
    } finally { pending.release(); }
    await expect(page.locator('#article-comments')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.article-like-btn')).toBeEnabled();
    await expect(page.locator('.article-like-btn')).toContainText('已点赞 4');
    await expect(page.getByRole('button', { name: /^已收藏/ })).toBeEnabled();
    await expect(page.locator('.article-meta .user-level-badge')).toHaveAttribute('data-level', '8');
});

test('delayed comments still reveal the exact notification reply after the article appears', async ({ page }) => {
    const pending = gate();
    await reader(page);
    await page.route(comments, async route => {
        await pending.promise;
        await route.fulfill({ json: { success: true, data: [
            { id: 9200, article_id: 3, author: '楼主', content: '评论主楼' },
            { id: 9201, article_id: 3, parent_id: 9200, reply_to_id: 9200, author: '甲', content: '通知中的较早回复' },
            { id: 9202, article_id: 3, parent_id: 9200, reply_to_id: 9201, author: '乙', content: '最新回复' }
        ] } });
    });
    try {
        await page.goto('/article?id=3#comment-9201', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.article-content')).toBeVisible();
        await expect(page.locator('#comment-9201')).toHaveCount(0);
    } finally { pending.release(); }
    await expect(page.locator('#comment-9201')).toContainText('通知中的较早回复');
    await expect(page.locator('#comment-9201')).toBeInViewport();
});

test('a failed comment request can be retried without reloading the body or directory', async ({ page }) => {
    await reader(page);
    let requests = 0;
    await page.route(comments, route => {
        requests += 1;
        return route.fulfill({ status: requests === 1 ? 503 : 200, json: requests === 1
            ? { success: false } : { success: true, data: [{ id: 9300, article_id: 3, author: '旅人', content: '重试后的评论' }] } });
    });
    await page.goto('/article?id=3');
    await expect(page.locator('.article-content')).toBeVisible();
    await page.locator('#article-comments').getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.locator('#comment-9300')).toContainText('重试后的评论');
    await expect(page.locator('.article-content h2')).toHaveCount(85);
    await expect(page.locator('.article-toc a')).toHaveCount(85);
    expect(requests).toBe(2);
});

test('navigation cancels old article work and never publishes its delayed comments into the new article', async ({ page }) => {
    await reader(page);
    const pending = gate();
    let oldRequest;
    await page.route(comments, async route => {
        oldRequest = route.request();
        await pending.promise;
        await route.fulfill({ json: { success: true, data: [{ id: 9400, article_id: 3, author: '旧作者', content: '旧文章的延迟评论' }] } }).catch(() => {});
    });
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/2\/live\//, route => route.fulfill({ json: { success: true, data: { ...article, id: 2, title: '另一篇文章', content: '新文章正文' } } }));
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/2\/messages/, route => route.fulfill({ json: { success: true, data: [{ id: 9401, article_id: 2, author: '新作者', content: '新文章评论' }] } }));
    try {
        await page.goto('/article?id=3', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.article-content')).toBeVisible();
        await expect.poll(() => Boolean(oldRequest)).toBe(true);
        // Exercise a SPA history navigation while ArticlePage is reused.
        await page.evaluate(() => {
            history.pushState({ ...history.state, current: '/articles/2', position: history.state.position + 1 }, '', '/articles/2');
            dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        });
        await expect(page.locator('.article-reader h1')).toHaveText('另一篇文章');
        await expect(page.locator('#comment-9401')).toBeVisible();
        await expect.poll(() => oldRequest.failure()?.errorText || '').toMatch(/ERR_ABORTED|cancelled/i);
    } finally { pending.release(); }
    await expect(page.locator('#comment-9400')).toHaveCount(0);
    await expect(page.locator('.article-content')).toHaveText('新文章正文');
    await expect(page.locator('.article-toc')).toHaveCount(0);
});

test('aborting an old detail request does not end the new article loading state or publish an error', async ({ page }) => {
    const first = gate(), second = gate();
    let oldRequest, newRequested = false;
    await page.route(detail, async route => {
        oldRequest = route.request();
        await first.promise;
        await route.fulfill({ json: { success: true, data: article } }).catch(() => {});
    });
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/2\/live\//, async route => {
        newRequested = true;
        await second.promise;
        await route.fulfill({ json: { success: true, data: { ...article, id: 2, title: '新请求的文章', content: '当前正文' } } });
    });
    try {
        await page.goto('/article?id=3', { waitUntil: 'domcontentloaded' });
        await expect.poll(() => Boolean(oldRequest)).toBe(true);
        await page.evaluate(() => {
            history.pushState({ ...history.state, current: '/articles/2', position: history.state.position + 1 }, '', '/articles/2');
            dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        });
        await expect.poll(() => newRequested).toBe(true);
        await expect.poll(() => oldRequest.failure()?.errorText || '').toMatch(/ERR_ABORTED|cancelled/i);
        await expect(page.locator('.article-page')).toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('.article-status.error')).toHaveCount(0);
    } finally { first.release(); second.release(); }
    await expect(page.locator('.article-reader h1')).toHaveText('新请求的文章');
    await expect(page.locator('.article-content')).toHaveText('当前正文');
});
