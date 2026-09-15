const { test, expect } = require('../e2e-fixtures.cjs');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });

const article = {
    id: '3', title: '月下的创作手记', category: '技术', author_username: 'admin',
    content_format: 'markdown', published_at: '2026-09-13T08:00:00Z', read_time: null,
    content: ['## 出发', ...Array(6).fill('给日常留一点月光。记录创作，也记录相遇。 '.repeat(12)),
        '## 把故事留下', '### 光与声音', ...Array(6).fill('从一个小小的想法开始，慢慢完成自己的作品。 '.repeat(12)),
        '## 下一次相遇', '愿每一份创作都被看见。'].join('\n\n')
};
async function readerFixture(page, content = article.content) {
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//, (route) => route.fulfill({ json: { success: true, data: { ...article, content } } }));
}

test('reader indexes real headings, scrolls accessibly and retains the list query', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await readerFixture(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/article?id=3&from=' + encodeURIComponent('/stage?page=2&category=技术&q=月&sort=latest'));
    const toc = page.locator('.article-toc');
    await expect(toc).toBeVisible();
    await expect(toc.getByRole('link')).toHaveCount(4);
    await expect(page.locator('.article-meta')).toContainText(/约 \d+ 分钟/);
    await toc.getByRole('link', { name: '把故事留下', exact: true }).click();
    await expect(page.locator('#article-section-2')).toBeFocused();
    await expect.poll(() => page.locator('#article-section-2').evaluate((node) => Math.round(node.getBoundingClientRect().top))).toBeLessThan(155);
    await expect(toc.getByRole('link', { name: '把故事留下', exact: true })).toHaveAttribute('aria-current', 'location');
    await expect.poll(() => page.locator('.article-progress').evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).a)).toBeGreaterThan(0.1);
    await expect(page.locator('.article-back')).toHaveAttribute('href', '/stage?sort=latest&page=2&category=%E6%8A%80%E6%9C%AF&q=%E6%9C%88');
    expect(errors).toEqual([]);
});

test('short articles have no empty directory, mobile long articles start collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await readerFixture(page);
    await page.goto('/article?id=3');
    await expect(page.locator('.article-toc')).toBeVisible();
    await expect(page.locator('.article-toc details')).not.toHaveAttribute('open', '');
    await page.locator('.article-toc summary').click();
    await expect(page.locator('.article-toc nav')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.unroute(/\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//);
    await readerFixture(page, '一篇很短的日常记录。');
    await page.reload();
    await expect(page.locator('.article-content')).toContainText('一篇很短');
    await expect(page.locator('.article-toc')).toHaveCount(0);
});

test('pinned articles stay first while featured and latest keep their own order', async ({ page }) => {
    const articles = [
        { ...article, id: 'featured', title: '精选旧文', pinned_at: null, featured_score: 72, like_count: 20, bookmark_count: 12, created_at: '2026-01-01', published_at: '2026-01-01', excerpt: '旧文摘要' },
        { ...article, id: 'pinned', title: '置顶文章', pinned_at: '2026-09-10', featured_score: 8, like_count: 0, bookmark_count: 0, created_at: '2025-01-01', published_at: '2025-01-01', excerpt: '置顶摘要' },
        { ...article, id: 'latest', title: '最新文章', pinned_at: null, featured_score: 12, like_count: 1, bookmark_count: 0, created_at: '2026-09-13', published_at: '2026-09-13', excerpt: '新文摘要' }
    ];
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\?/, (route) => {
        expect(new URL(route.request().url()).searchParams.get('sort')).toBe('featured');
        return route.fulfill({ json: { success: true, data: articles, pagination: { totalPages: 1, total: 3 } } });
    });
    await page.goto('/stage');
    await expect(page.locator('.stage-card-title')).toHaveText(['置顶文章', '精选旧文', '最新文章']);
    await expect(page.locator('.stage-card').nth(1).getByLabel('20 点赞')).toBeVisible();
    await expect(page.locator('.stage-card').nth(1).getByLabel('12 收藏')).toBeVisible();
    await expect(page.locator('.stage-card .read-time')).toHaveCount(0);
    await page.getByRole('button', { name: '最新发布', exact: true }).click();
    await expect(page).toHaveURL(/sort=latest/);
    await expect(page.locator('.stage-card-title')).toHaveText(['置顶文章', '最新文章', '精选旧文']);
    await expect(page.locator('.stage-card').first()).toHaveAttribute('href', /from=.*sort%3Dlatest/);
    await page.reload();
    await expect(page.getByRole('button', { name: '最新发布', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.stage-card-title')).toHaveText(['置顶文章', '最新文章', '精选旧文']);
});

test('public content is visible when opening an inactive window', async ({ page }) => {
    await page.goto('/hub');
    await page.evaluate(() => { document.documentElement.dataset.windowActive = 'false'; });
    for (const selector of ['.site-commandbar', '.hub-showcase', '.hub-grid-wrap', '.hub-hero-panel', '.hub-hero-copy', '.scene-card']) {
        await expect(page.locator(selector).first()).toHaveCSS('opacity', '1');
        await expect(page.locator(selector).first()).toHaveCSS('animation-name', 'none');
    }
    const notice = page.locator('.hub-notice');
    await notice.locator('summary').click();
    await expect(notice.locator('p')).toBeVisible();
});

test('image cards retain readable text in the mobile light theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('tsukuyomi_theme', 'light'));
    await page.goto('/hub');
    await expect(page.locator('.scene-card').first().locator('.scene-name')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.locator('.site-global-bg')).toHaveCSS('opacity', '1');
});
