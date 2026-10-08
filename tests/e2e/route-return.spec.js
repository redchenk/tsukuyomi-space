const { test, expect } = require('../e2e-fixtures.cjs');

const listing = /\/api\/(?:live\/[^/]+\/)?articles\?/;
const hubPreview = /\/api\/(?:live\/[^/]+\/)?hub-preview\?/;
const article = { id: 3, title: '返回导航验收文章', slug: 'moon', author_id: 'e2e-user-001', author_username: 'e2e-user',
    category: '其他', content_format: 'markdown', published_at: '2026-10-08T00:00:00Z',
    content: '## 阅读正文\n\n' + '保留滚动位置和筛选条件。\n\n'.repeat(50) };
async function content(page) {
    const calls = { hub: 0, lists: [] };
    await page.route(hubPreview, route => {
        calls.hub++;
        return route.fulfill({ json: { success: true, data: { article, messages: [], stats: { articles: 18, users: 20 } } } });
    });
    await page.route(listing, route => {
        const params = new URL(route.request().url()).searchParams;
        calls.lists.push(params.get('page'));
        return route.fulfill({ json: { success: true, data: Array.from({ length: 6 }, (_, i) => ({ ...article, id: 3 + i, title: article.title + i })),
            pagination: { page: Number(params.get('page')), limit: 6, total: 18, totalPages: 3 } } });
    });
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//, route => route.fulfill({ json: { success: true, data: article } }));
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/messages/, route => route.fulfill({ json: { success: true, data: [] } }));
    await page.addInitScript(() => { window.__documentStamp = Math.random(); });
    return calls;
}
async function settle(page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.querySelector('.route-view-frame')?.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})) || []);
    });
}
async function navigate(page, path) {
    // Exercise the production delegated-link handler, rather than fake popstate.
    await page.evaluate(path => {
        const anchor = document.createElement('a'); anchor.href = path;
        document.querySelector('.route-stage').append(anchor); anchor.click(); anchor.remove();
    }, path);
    const target = new URL(path, page.url());
    await expect(page).toHaveURL(target.href);
    const key = ['/stage', '/plaza', '/wiki'].includes(target.pathname) ? target.pathname : target.pathname + target.search;
    await expect(page.locator('.route-view-frame')).toHaveAttribute('data-route-key', key);
}

test('list return and Hub return reuse pages, restore scroll and retain forward history', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const calls = await content(page);
    await page.goto('/hub');
    await expect(page.locator('.page.hub')).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => calls.hub).toBe(1);
    await settle(page);
    const hubState = await page.evaluate(() => {
        window.__hubNode = document.querySelector('.page.hub');
        scrollTo({ top: 320, behavior: 'instant' });
        return { position: history.state.position, stamp: window.__documentStamp, y: scrollY };
    });
    await navigate(page, '/stage?sort=latest&page=2');
    await expect(page.locator('.stage-card')).toHaveCount(6);
    await expect(page.locator('.stage-page')).toHaveAttribute('aria-busy', 'false');
    await settle(page);
    const stageState = await page.evaluate(() => {
        window.__stageNode = document.querySelector('.stage-page');
        scrollTo({ top: 360, behavior: 'instant' });
        return { position: history.state.position, y: scrollY };
    });
    const listCount = calls.lists.length;
    // Programmatic click avoids moving the list to the first card before leaving.
    await page.locator('.stage-card').first().evaluate(anchor => anchor.click());
    await expect(page.locator('.article-reader h1')).toHaveText(article.title);
    await page.locator('.article-back').click();
    await expect(page).toHaveURL(/\/stage\?sort=latest&page=2$/);
    await expect.poll(() => page.evaluate(() => document.querySelector('.stage-page') === window.__stageNode)).toBe(true);
    await expect.poll(() => page.evaluate(() => history.state.position)).toBe(stageState.position);
    await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), stageState.y)).toBeLessThan(3);
    expect(calls.lists.length).toBe(listCount);
    await page.locator('.site-brand').evaluate(anchor => anchor.click());
    await expect(page).toHaveURL(/\/hub$/);
    await expect.poll(() => page.evaluate(() => document.querySelector('.page.hub') === window.__hubNode)).toBe(true);
    await expect.poll(() => page.evaluate(() => history.state.position)).toBe(hubState.position);
    await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), hubState.y)).toBeLessThan(3);
    expect(calls.hub).toBe(1);
    expect(await page.evaluate(() => window.__documentStamp)).toBe(hubState.stamp);
    await page.goForward();
    await expect(page).toHaveURL(/\/stage\?sort=latest&page=2$/);
    await expect.poll(() => page.evaluate(() => document.querySelector('.stage-page') === window.__stageNode)).toBe(true);
    await page.goForward();
    await expect(page.locator('.article-reader h1')).toHaveText(article.title);
    await page.goBack();
    await expect(page).toHaveURL(/\/stage\?sort=latest&page=2$/);
    expect(errors).toEqual([]);
});

test('stale cached Hub remains readable while refreshing and on refresh failure', async ({ page }) => {
    await content(page);
    await page.goto('/hub');
    await expect(page.locator('.page.hub')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.scene-card').first()).toBeVisible();
    await page.evaluate(() => { window.__hubNode = document.querySelector('.page.hub'); });
    await navigate(page, '/stage');
    await expect(page.locator('.stage-card')).toHaveCount(6);
    await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 35000; });
    let refreshed = false, release;
    const waiting = new Promise(resolve => { release = resolve; });
    await page.route(hubPreview, async route => {
        refreshed = true; await waiting;
        await route.fulfill({ status: 503, json: { success: false } }).catch(() => {});
    });
    try {
        await page.locator('.site-brand').evaluate(anchor => anchor.click());
        await expect.poll(() => refreshed).toBe(true);
        await expect(page.locator('.page.hub')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('.scene-card').first()).toBeVisible();
        expect(await page.evaluate(() => document.querySelector('.page.hub') === window.__hubNode)).toBe(true);
    } finally { release(); }
    await expect(page.locator('.hub-preview-error')).toHaveCount(0);
    await expect(page.locator('.scene-card').first()).toBeVisible();
});

test('Plaza drafts survive a public page return and are discarded after logout', async ({ page }) => {
    await content(page);
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await navigate(page, '/plaza');
    const draft = page.locator('.plaza-compose-panel textarea');
    await draft.fill('未发布的草稿');
    await navigate(page, '/gallery');
    await expect(page.locator('.gallery-page')).toHaveAttribute('aria-busy', 'false');
    await page.goBack();
    await expect(draft).toHaveValue('未发布的草稿');
    await page.getByRole('button', { name: '账号菜单', exact: true }).click();
    await page.locator('#site-navigation').getByRole('button', { name: '退出', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/plaza$/);
    await expect(page.locator('.plaza-composer-locked')).toBeVisible();
    await expect(draft).toHaveCount(0);
    await navigate(page, '/login?redirect=%2Fplaza');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/plaza$/);
    await expect(draft).toHaveValue('');
});

test('direct article return stays inside the site and immersive pages are released', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await content(page);
    await page.goto('/articles/3/moon');
    await expect(page.locator('.article-reader h1')).toHaveText(article.title);
    await page.locator('.article-back').click();
    await expect(page).toHaveURL(/\/stage$/);
    await expect(page.locator('.stage-card')).toHaveCount(6);
    await navigate(page, '/room');
    await expect(page.locator('#chatInput')).toBeVisible();
    await page.locator('#chatInput').fill('不会留在公共页面缓存里的房间草稿');
    await page.locator('.site-brand').evaluate(anchor => anchor.click());
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.locator('#chatInput')).toHaveCount(0);
    await expect(page.locator('.room-page canvas')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#chatInput')).toBeVisible();
    await expect(page.locator('#chatInput')).toHaveValue('');
    expect(errors).toEqual([]);
});


test('cached Stage filters stay visible during a slow or failed refresh', async ({ page }) => {
    const calls = await content(page);
    await page.goto('/stage?q=moon&sort=daily&page=2');
    await expect(page.locator('.stage-card')).toHaveCount(6);
    await page.evaluate(() => { window.__stageNode = document.querySelector('.stage-page'); });
    await page.locator('.stage-card').first().evaluate(anchor => anchor.click());
    await expect(page.locator('.article-reader h1')).toHaveText(article.title);
    await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 35000; });
    let started = false, release;
    const waiting = new Promise(resolve => { release = resolve; });
    await page.route(listing, async route => {
        started = true; await waiting;
        await route.fulfill({ status: 503, json: { success: false } }).catch(() => {});
    });
    try {
        await page.locator('.article-back').click();
        await expect.poll(() => started).toBe(true);
        await expect(page.locator('.stage-card')).toHaveCount(6);
        await expect(page.locator('.stage-page')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('.stage-controls input')).toHaveValue('moon');
        await expect(page.locator('.stage-order [aria-pressed=true]')).toContainText('每日');
        expect(await page.evaluate(() => document.querySelector('.stage-page') === window.__stageNode)).toBe(true);
    } finally { release(); }
    await expect(page.locator('.stage-status.error')).toHaveCount(0);
    await expect(page.locator('.stage-card')).toHaveCount(6);
    expect(calls.lists.length).toBe(1);
});

test('a cached Gallery retains filters and cannot open a delayed image modal on another page', async ({ page }) => {
    await content(page);
    let lists = 0;
    const asset = { id: 'fixture-image', metadata: { title: '月光' }, preview_url: '/assets/sakura/nav-gallery.webp' };
    await page.route(/\/api\/(?:live\/[^/]+\/)?assets\/gallery\?/, route => {
        lists++; return route.fulfill({ json: { success: true, data: { assets: [asset], pagination: { page: 1, total: 1, totalPages: 1 } } } });
    });
    await page.goto('/gallery');
    await expect(page.locator('.gallery-thumb')).toHaveCount(1);
    await page.evaluate(() => { window.__galleryNode = document.querySelector('.gallery-page'); });
    await page.locator('.gallery-thumb').click();
    await expect(page.locator('.gallery-viewer')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    // A normal button cannot be clicked behind a modal; delegated navigation can
    // still occur from notification/keyboard shortcuts.
    await navigate(page, '/stage');
    await expect(page.locator('.stage-card')).toHaveCount(6);
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    await page.goBack();
    await expect(page).toHaveURL(/\/gallery$/);
    expect(await page.evaluate(() => document.querySelector('.gallery-page') === window.__galleryNode)).toBe(true);
    await expect(page.locator('.gallery-viewer')).toHaveCount(0);
    expect(lists).toBe(1);
    let requested = false, release;
    const waiting = new Promise(resolve => { release = resolve; });
    await page.route(/\/api\/assets\/gallery\/delayed-image(?:\?.*)?$/, async route => {
        requested = true; await waiting;
        await route.fulfill({ json: { success: true, data: { ...asset, id: 'delayed-image' } } }).catch(() => {});
    });
    await navigate(page, '/gallery?image=delayed-image');
    await expect.poll(() => requested).toBe(true);
    await navigate(page, '/stage');
    try {
        release();
        await expect(page.locator('.stage-card')).toHaveCount(6);
        await expect(page.locator('.gallery-viewer')).toHaveCount(0);
        await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    } finally { release(); }
});


test('public page instance storage stays bounded across many Gallery URLs', async ({ page }) => {
    await content(page);
    await page.route(/\/api\/(?:live\/[^/]+\/)?assets\/gallery\?/, route => route.fulfill({ json: {
        success: true, data: { assets: [], pagination: { page: 1, total: 0, totalPages: 1 } }
    } }));
    await page.goto('/gallery?visit=0');
    await expect(page.locator('.gallery-page')).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(() => { window.__firstGallery = document.querySelector('.gallery-page'); });
    for (let index = 1; index <= 5; index++) {
        await navigate(page, '/gallery?visit=' + index);
        await expect(page.locator('.gallery-page')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('.route-view-frame')).toHaveCount(1);
    }
    await page.goBack();
    await expect(page).toHaveURL(/visit=4$/);
    await navigate(page, '/gallery?visit=0');
    await expect(page.locator('.gallery-page')).toHaveAttribute('aria-busy', 'false');
    expect(await page.evaluate(() => document.querySelector('.gallery-page') === window.__firstGallery)).toBe(false);
});
