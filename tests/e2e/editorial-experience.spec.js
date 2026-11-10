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

test('article cover reserves its layout while the native image loads', async ({ page }) => {
    let releaseImage;
    const imageGate = new Promise((resolve) => { releaseImage = resolve; });
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//, (route) => route.fulfill({
        json: { success: true, data: { ...article, cover_image: '/e2e-image-bloom.svg' } }
    }));
    await page.route('**/e2e-image-bloom.svg', async (route) => {
        await imageGate;
        await route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700"><rect width="1600" height="700" fill="#778cf6"/></svg>'
        });
    });

    await page.goto('/article?id=3', { waitUntil: 'domcontentloaded' });
    const cover = page.locator('.article-cover');
    expect((await cover.boundingBox()).height).toBeGreaterThan(120);
    const pendingVisual = await cover.evaluate((node) => {
        const style = getComputedStyle(node);
        return { backgroundImage: style.backgroundImage, filter: style.filter };
    });
    expect(pendingVisual.filter).toBe('none');

    releaseImage();
    await expect(cover).toHaveJSProperty('complete', true);
    await expect.poll(() => cover.evaluate((node) => node.naturalWidth)).toBe(1600);
});

test('dynamic and cached images decode without a global animation observer', async ({ page }) => {
    let releaseSecond;
    const secondGate = new Promise((resolve) => { releaseSecond = resolve; });
    await page.route('**/e2e-global-first.svg', (route) => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"></svg>'
    }));
    await page.route('**/e2e-global-second.svg', async (route) => {
        await secondGate;
        await route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"></svg>'
        });
    });

    await page.goto('/hub');
    await page.evaluate(() => {
        const image = document.createElement('img');
        image.id = 'global-image-probe';
        image.width = 320;
        image.height = 180;
        image.src = '/e2e-global-first.svg';
        document.body.append(image);
    });
    const image = page.locator('#global-image-probe');
    await expect(image).toHaveJSProperty('complete', true);

    await image.evaluate((node) => {
        node.className = 'avatar-probe';
        node.src = '/e2e-global-second.svg';
    });
    await expect(image).toHaveJSProperty('complete', false);
    expect(await image.evaluate((node) => node.getAnimations().length)).toBe(0);
    expect(await image.evaluate((node) => getComputedStyle(node).filter)).toBe('none');
    releaseSecond();
    await expect(image).toHaveJSProperty('complete', true);
    await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBe(320);

    await page.evaluate(async () => {
        const cached = document.createElement('img');
        cached.id = 'cached-image-probe';
        cached.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>';
        await cached.decode();
        document.body.append(cached);
    });
    const cached = page.locator('#cached-image-probe');
    await expect(cached).toHaveJSProperty('complete', true);
    await expect(cached).not.toHaveAttribute('data-image-reveal');
    expect(await cached.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
});

test('stage defaults to latest and preserves featured and daily selections', async ({ page }) => {
    const articles = [
        { ...article, id: 'featured', title: '精选旧文', pinned_at: null, featured_score: 72, like_count: 20, bookmark_count: 12, created_at: '2026-01-01', published_at: '2026-01-01', excerpt: '旧文摘要' },
        { ...article, id: 'pinned', title: '置顶文章', pinned_at: '2026-09-10', featured_score: 8, like_count: 0, bookmark_count: 0, created_at: '2025-01-01', published_at: '2025-01-01', excerpt: '置顶摘要' },
        { ...article, id: 'latest', title: '最新文章', pinned_at: null, featured_score: 12, like_count: 1, bookmark_count: 0, created_at: '2026-09-13', published_at: '2026-09-13', excerpt: '新文摘要' }
    ];
    const requestedSorts = [];
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\?/, (route) => {
        const params = new URL(route.request().url()).searchParams;
        const sort = params.get('sort');
        requestedSorts.push(sort);
        expect(params.get('limit')).toBe('6');
        const data = sort === 'daily' ? [articles[0], articles[2]] : sort === 'featured'
            ? [articles[0], articles[2], articles[1]] : [articles[2], articles[0], articles[1]];
        return route.fulfill({ json: { success: true, data, recommendationDate: '2026-09-27', pagination: { page: 1, limit: 6, totalPages: 1, total: data.length } } });
    });
    await page.goto('/stage');
    const sort = page.getByRole('combobox', { name: '文章排序' });
    await expect(sort).toHaveValue('latest');
    await expect(page.locator('.journal-title h2')).toHaveText(['最新文章', '精选旧文', '置顶文章']);
    await expect(page.locator('.journal-title').first()).toHaveAttribute('href', /from=%2Fstage$/);
    await sort.selectOption('featured');
    await expect(page).toHaveURL(/sort=featured/);
    await expect(page.locator('.journal-title h2')).toHaveText(['精选旧文', '最新文章', '置顶文章']);
    await sort.selectOption('daily');
    await expect(page).toHaveURL(/sort=daily/);
    await expect(page.locator('.journal-title h2')).toHaveText(['精选旧文', '最新文章']);
    await expect(page.locator('.journal-title').first()).toHaveAttribute('href', /from=.*sort%3Ddaily/);
    await page.reload();
    await expect(sort).toHaveValue('daily');
    await expect(page.locator('.journal-title h2')).toHaveText(['精选旧文', '最新文章']);
    expect(requestedSorts).toEqual(['latest', 'featured', 'daily', 'daily']);
});

test('stage requests only the current server page', async ({ page }) => {
    const requestedPages = [];
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\?/, (route) => {
        const params = new URL(route.request().url()).searchParams;
        const requestedPage = Number(params.get('page'));
        requestedPages.push(requestedPage);
        expect(params.get('limit')).toBe('6');
        return route.fulfill({
            json: {
                success: true,
                data: [{ ...article, id: `page-${requestedPage}`, title: `第 ${requestedPage} 页文章`, excerpt: '分页摘要' }],
                pagination: { page: requestedPage, limit: 6, totalPages: 3, total: 13 }
            }
        });
    });

    await page.goto('/stage?page=2');
    await expect(page.locator('.journal-title h2')).toHaveText('第 2 页文章');
    await page.getByRole('button', { name: '再读一些', exact: true }).click();
    await expect(page.locator('.journal-title h2')).toHaveText(['第 2 页文章', '第 3 页文章']);
    expect(requestedPages).toEqual([2, 3]);
});

test('public content is visible when opening an inactive window', async ({ page }) => {
    await page.goto('/hub');
    await page.evaluate(() => { document.documentElement.dataset.windowActive = 'false'; });
    for (const selector of ['.site-header', '.home-hero', '.home-content', '.home-hero-content', '.discovery-item']) {
        await expect(page.locator(selector).first()).toHaveCSS('opacity', '1');
        await expect(page.locator(selector).first()).toHaveCSS('animation-name', 'none');
    }
    const notice = page.locator('.home-notice');
    await notice.locator('summary').click();
    await expect(notice.locator('p')).toBeVisible();
});

test('hub previews load their media and keep the pixel studio accessible', async ({ page }) => {
    await page.route(/\/api\/(?:live\/[^/]+\/)?hub-preview(?:\?|$)/, (route) => route.fulfill({
        json: {
            success: true,
            data: {
                article: { id: 'hub-article', title: '大厅文章', excerpt: '文章摘要', category: '技术', cover_image: '/e2e-hub-article.svg' },
                gallery: { id: 'hub-gallery', url: '/e2e-hub-gallery.svg', created_at: '2026-09-18' },
                pixel: {
                    id: 'hub-pixel', title: '月光像素画', author: 'tester', width: 2, height: 2,
                    background_color: '#10182a', palette: ['#ffffff', '#778cf6'], pixels_base64: 'AQIBAg=='
                },
                messages: [],
                stats: {}
            }
        }
    }));
    for (const path of ['/e2e-hub-article.svg', '/e2e-hub-gallery.svg']) {
        await page.route(`**${path}`, (route) => route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#778cf6"/></svg>'
        }));
    }

    await page.goto('/hub');
    const media = page.locator('.featured-story img, .discovery-item[href="/gallery"] img');
    await expect(media).toHaveCount(2);
    for (const image of await media.all()) { await image.scrollIntoViewIfNeeded(); await expect(image).toHaveJSProperty('complete', true); expect(await image.evaluate(el => el.naturalWidth)).toBe(1200); }
    await expect(page.locator('.discovery-item[href="/pixel"]')).toBeVisible();
});

test('gallery lightbox replaces the list thumbnail with the full image', async ({ page }) => {
    const asset = {
        id: 'gallery-full-image',
        preview_url: '/e2e-gallery-preview.svg',
        access_url: '/e2e-gallery-original.svg',
        display_url: '/e2e-gallery-original.svg',
        url: '/e2e-gallery-original.svg',
        metadata: { title: '清晰原图' },
        created_at: '2026-09-18'
    };
    await page.route(/\/api\/(?:live\/[^/]+\/)?assets\/gallery\/public(?:\?|$)/, (route) => route.fulfill({
        json: { success: true, data: { assets: [asset] } }
    }));
    await page.route(/\/api\/(?:live\/[^/]+\/)?assets\/gallery\?/, (route) => route.fulfill({
        json: { success: true, data: { assets: [asset], pagination: { page: 1, totalPages: 1, total: 1 } } }
    }));
    await page.route('**/e2e-gallery-preview.svg', (route) => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#9b8cff"/></svg>'
    }));
    await page.route('**/e2e-gallery-original.svg', (route) => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#56bfe8"/></svg>'
    }));

    await page.goto('/gallery');
    const thumbnail = page.locator('.gallery-thumb img').first();
    await expect(thumbnail).toHaveAttribute('src', '/e2e-gallery-preview.svg');
    await thumbnail.click();
    const fullImage = page.locator('.gallery-viewer-image > img');
    await expect(fullImage).toHaveAttribute('src', '/e2e-gallery-original.svg');
    await expect(fullImage).toHaveJSProperty('complete', true);
    await expect.poll(() => fullImage.evaluate((node) => node.naturalWidth)).toBe(1600);
});

test('image cards retain readable text in the mobile light theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('tsukuyomi_theme', 'light'));
    await page.goto('/hub');
    await expect(page.locator('.discovery-title h3').first()).toHaveCSS('color', await page.locator('.discovery-item').first().evaluate(el => { const probe = document.createElement('span'); probe.style.color = 'var(--ink)'; el.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; }));
    expect(await page.locator('.site-background-shell').evaluate(el => getComputedStyle(el, '::before').backgroundImage)).toContain('.webp');
});


test('growth keeps recent activity without a separate article XP panel after mobile refresh', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login?redirect=%2Fgrowth');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await page.getByLabel('用户名或邮箱', { exact: true }).fill('e2e-user');
    await page.getByLabel('密码', { exact: true }).fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/growth$/);
    await expect(page.locator('.growth-history')).toBeVisible();
    await expect(page.locator('.growth-articles')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.growth-history')).toContainText('最近记录');
    await expect(page.locator('.growth-articles')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
