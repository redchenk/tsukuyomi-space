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

function makeAssetPickerPayload() {
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAQb7R3sAAAAASUVORK5CYII=';
    return {
        success: true,
        data: {
            assets: Array.from({ length: 12 }, (_, index) => ({
                id: `asset-picker-${index + 1}`,
                asset_type: 'image',
                mime_type: 'image/png',
                display_url: image,
                markdown_url: image,
                metadata: {
                    fileName: index === 0
                        ? 'spring-garden-yachiyo-afternoon-extra-long-preview-name-01.png'
                        : `article-attachment-${String(index + 1).padStart(2, '0')}.png`
                }
            })),
            pagination: { page: 1, totalPages: 1, total: 12 }
        }
    };
}

async function assetPickerLayout(page) {
    return page.locator('.editor-asset-grid').evaluate((grid) => {
        const cards = Array.from(grid.querySelectorAll('.editor-asset-card'));
        const boxes = cards.map((card) => card.getBoundingClientRect());
        let overlaps = 0;
        for (let first = 0; first < boxes.length; first += 1) {
            for (let second = first + 1; second < boxes.length; second += 1) {
                const a = boxes[first];
                const b = boxes[second];
                if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps += 1;
            }
        }
        const previewBoxes = cards.map((card) => card.querySelector('.editor-asset-preview').getBoundingClientRect());
        return {
            cardCount: cards.length,
            cardDisplay: getComputedStyle(cards[0]).display,
            overlaps,
            cardWidths: boxes.map((box) => Math.round(box.width)),
            previewRatios: previewBoxes.map((box) => box.width / box.height),
            columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
    });
}

async function expectLikedHeart(button) {
    await expect(button).toHaveClass(/liked/);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => button.locator('.ts-icon').evaluate((icon) => ({
        color: getComputedStyle(icon).color,
        fill: getComputedStyle(icon).fill
    }))).toEqual({
        color: 'rgb(255, 95, 115)',
        fill: 'rgb(255, 95, 115)'
    });
}

function sameOriginWriteHeaders(page) {
    return {
        Origin: new URL(page.url()).origin,
        'Sec-Fetch-Site': 'same-origin',
        'X-Requested-With': 'XMLHttpRequest'
    };
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
});

test('user can log in and reach the hub', async ({ page }) => {
    await loginAsUser(page);
    await expect(page.getByRole('link', { name: '用户中心' })).toBeVisible();
    const sessionResponse = await page.request.get('/api/auth/me');
    expect(sessionResponse.status()).toBe(200);
    const session = await sessionResponse.json();
    expect(session.data.username).toBe('e2e-user');
});

test('user can read an article and post a comment', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/article?id=1');
    await expect(page.getByRole('heading', { name: '欢迎来到月读空间' })).toBeVisible();
    await page.getByRole('link', { name: '进入完整互动文章页' }).click();

    const comment = `E2E article comment ${Date.now()}`;
    await page.getByPlaceholder('写下你的评论...').fill(comment);
    await page.getByRole('button', { name: '发布评论' }).click();

    await expect(page.getByText(comment)).toBeVisible();
    const commentLikeButton = page.locator('.comment-item').filter({ hasText: comment }).locator('.like-btn');
    await commentLikeButton.click();
    await expectLikedHeart(commentLikeButton);
});

test('user can publish a plaza message', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/plaza');

    const message = `E2E plaza message ${Date.now()}`;
    await page.locator('.plaza-textarea').fill(message);
    await page.locator('.plaza-composer-actions').getByRole('button', { name: '发布' }).click();

    await expect(page.getByText(message)).toBeVisible();
    const messageLikeButton = page.locator('.plaza-msg-card').filter({ hasText: message }).locator('.like-btn');
    await messageLikeButton.click();
    await expectLikedHeart(messageLikeButton);
});

test('user can edit and delete their own message from user center', async ({ page }) => {
    await loginAsUser(page);
    const original = `E2E managed message ${Date.now()}`;
    const createResponse = await page.request.post('/api/messages', {
        headers: sameOriginWriteHeaders(page),
        data: { content: original }
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    await page.goto('/user-center');
    await page.getByRole('button', { name: /我的留言/ }).click();
    const messageItem = page.locator(`#uc-message-${created.data.id}`);
    await expect(messageItem).toBeVisible();

    await messageItem.getByRole('button', { name: '编辑' }).click();
    const updated = `${original} updated`;
    await messageItem.getByLabel('编辑留言').fill(updated);
    await messageItem.getByRole('button', { name: '保存', exact: true }).click();
    await expect(messageItem.getByText(updated)).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await messageItem.getByRole('button', { name: '删除' }).click();
    await expect(messageItem).toHaveCount(0);
});

test('mobile account security and music playlist remain readable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsUser(page);
    await page.goto('/user-center');
    await page.getByRole('button', { name: '账户安全', exact: true }).click();

    const securityGrid = page.locator('.uc-security-grid');
    await expect(securityGrid).toBeVisible();
    const layout = await securityGrid.evaluate((grid) => {
        const [formColumn, securityCard] = grid.children;
        const formRect = formColumn.getBoundingClientRect();
        const cardRect = securityCard.getBoundingClientRect();
        return {
            columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
            formWidth: formRect.width,
            cardWidth: cardRect.width,
            viewportWidth: document.documentElement.clientWidth,
            pageWidth: document.documentElement.scrollWidth
        };
    });
    expect(layout.columns).toBe(1);
    expect(Math.abs(layout.formWidth - layout.cardWidth)).toBeLessThan(1);
    expect(layout.pageWidth).toBe(layout.viewportWidth);

    await page.getByRole('button', { name: 'Expand music drawer', exact: true }).click();
    await page.getByRole('button', { name: 'Playlist', exact: true }).click();
    const playlistStyle = await page.getByRole('combobox', { name: 'Track', exact: true }).evaluate((select) => {
        const optionStyle = getComputedStyle(select.options[0]);
        return {
            color: optionStyle.color,
            backgroundColor: optionStyle.backgroundColor,
            colorScheme: getComputedStyle(select).colorScheme
        };
    });
    expect(playlistStyle).toEqual({
        color: 'rgb(247, 251, 255)',
        backgroundColor: 'rgb(17, 24, 39)',
        colorScheme: 'dark'
    });
});

test('article attachment picker keeps thumbnails aligned on desktop and mobile', async ({ page }) => {
    await loginAsUser(page);
    await page.route('**/api/assets?**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(makeAssetPickerPayload())
        });
    });
    await page.goto('/editor');
    await page.getByRole('button', { name: '上传 / 选择附件', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: '附件库' });
    await expect(dialog).toBeVisible();
    const desktop = await assetPickerLayout(page);
    expect(desktop.cardCount).toBe(12);
    expect(desktop.cardDisplay).toBe('grid');
    expect(desktop.overlaps).toBe(0);
    expect(new Set(desktop.cardWidths).size).toBeLessThanOrEqual(2);
    expect(desktop.previewRatios.every((ratio) => Math.abs(ratio - (4 / 3)) < 0.02)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await assetPickerLayout(page);
    expect(mobile.columns).toBe(2);
    expect(mobile.overlaps).toBe(0);
    expect(mobile.horizontalOverflow).toBe(false);
    expect(new Set(mobile.cardWidths).size).toBe(1);
});

test('pixel artwork preview is body-level and closes from the visible button', async ({ page }) => {
    await loginAsUser(page);
    const createResponse = await page.request.post('/api/pixel-art', {
        headers: sameOriginWriteHeaders(page),
        data: makePixelArtworkPayload(`E2E Arena Preview ${Date.now()}`)
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const artworkId = created.data.id;

    await page.goto('/pixel');
    const drawingCanvas = page.getByRole('img', { name: 'pixel canvas', exact: true });
    await expect(drawingCanvas).toHaveAttribute('width', '1152');
    await expect(drawingCanvas).toHaveAttribute('height', '648');
    await expect(page.locator('.arena-size-options')).toHaveCount(0);

    const galleryToggle = page.locator('[aria-controls="arena-gallery-panel"]');
    await expect(galleryToggle).toHaveAttribute('aria-expanded', 'false');
    await galleryToggle.click();
    await expect(galleryToggle).toHaveAttribute('aria-expanded', 'true');

    const card = page.locator(`#pixel-art-${artworkId}`);
    await expect(card).toBeVisible();

    const likeButton = card.locator('.like-btn');
    await likeButton.click();
    await expectLikedHeart(likeButton);

    const galleryActionLayout = async () => card.locator('.pixel-art-actions').evaluate((actions) => {
        const buttons = Array.from(actions.querySelectorAll('.icon-btn'));
        const actionRect = actions.getBoundingClientRect();
        const buttonRects = buttons.map((button) => button.getBoundingClientRect());
        return {
            actionHeight: actionRect.height,
            buttonHeights: buttonRects.map((rect) => rect.height),
            buttonWidthTotal: buttonRects.reduce((total, rect) => total + rect.width, 0),
            actionWidth: actionRect.width,
            aspectRatios: buttons.map((button) => getComputedStyle(button).aspectRatio),
            justifyContent: getComputedStyle(actions).justifyContent,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
    });

    const desktopActions = await galleryActionLayout();
    expect(desktopActions.justifyContent).toBe('flex-end');
    expect(desktopActions.aspectRatios.every((ratio) => ratio === 'auto')).toBe(true);
    expect(desktopActions.actionHeight).toBeLessThanOrEqual(52);
    expect(desktopActions.buttonWidthTotal).toBeLessThan(desktopActions.actionWidth * 0.95);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileActions = await galleryActionLayout();
    expect(mobileActions.actionHeight).toBeLessThanOrEqual(62);
    expect(mobileActions.buttonHeights.every((height) => height >= 34)).toBe(true);
    expect(mobileActions.buttonWidthTotal).toBeLessThan(mobileActions.actionWidth * 0.95);
    expect(mobileActions.horizontalOverflow).toBe(false);

    await page.setViewportSize({ width: 1280, height: 720 });
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

test('pixel canvas switches between mobile scrolling and uninterrupted drawing', async ({ browser }) => {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
    });
    const page = await context.newPage();

    try {
        await page.goto('/pixel');
        const canvas = page.getByRole('img', { name: 'pixel canvas', exact: true });
        const toolButtons = page.locator('.arena-tool-toggle .icon-btn');
        const brushButton = toolButtons.first();
        const moveButton = toolButtons.last();
        await expect(canvas).toBeVisible();
        await expect(moveButton).toHaveClass(/active/);
        await canvas.scrollIntoViewIfNeeded();

        const initialScrollY = await page.evaluate(() => window.scrollY);
        const canvasBox = await canvas.boundingBox();
        expect(canvasBox).not.toBeNull();
        expect(await canvas.evaluate((element) => getComputedStyle(element).touchAction)).toContain('pan-y');

        const session = await context.newCDPSession(page);
        const x = canvasBox.x + Math.min(canvasBox.width / 2, 120);
        const startY = Math.min(canvasBox.y + canvasBox.height / 2, 700);
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x, y: startY }]
        });
        for (const y of [startY - 35, startY - 75, startY - 120, startY - 165]) {
            await session.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x, y }]
            });
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScrollY);

        await brushButton.click();
        await expect(brushButton).toHaveClass(/active/);
        await expect.poll(() => canvas.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
        await canvas.evaluate((element) => {
            window.__pixelPointerTrace = [];
            for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
                element.addEventListener(type, () => window.__pixelPointerTrace.push(type));
            }
        });

        const drawingBox = await canvas.boundingBox();
        expect(drawingBox).not.toBeNull();
        const drawX = drawingBox.x + Math.min(drawingBox.width / 2, 120);
        const drawStartY = drawingBox.y + Math.min(drawingBox.height * 0.3, 120);
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: drawX, y: drawStartY }]
        });
        for (const y of [drawStartY + 30, drawStartY + 60, drawStartY + 90, drawStartY + 120]) {
            await session.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: drawX, y }]
            });
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

        const pointerTrace = await page.evaluate(() => window.__pixelPointerTrace);
        expect(pointerTrace).toContain('pointerdown');
        expect(pointerTrace).toContain('pointermove');
        expect(pointerTrace).toContain('pointerup');
        expect(pointerTrace).not.toContain('pointercancel');
    } finally {
        await context.close();
    }
});

test('desktop pixel controls scroll independently from the page', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/pixel');

    const controls = page.locator('.arena-controls');
    await expect(controls).toBeVisible();
    const controlsToggle = page.locator('[aria-controls="arena-controls-panel"]');
    await expect(controlsToggle).toHaveAttribute('aria-expanded', 'false');
    await controlsToggle.click();
    await expect(controlsToggle).toHaveAttribute('aria-expanded', 'true');

    const metrics = await controls.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY
    }));
    expect(metrics.overflowY).toBe('auto');
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await controls.hover();
    await page.mouse.wheel(0, 480);
    await expect.poll(() => controls.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('game leaderboard loads every score into a vertical scroll region', async ({ page }) => {
    const players = Array.from({ length: 63 }, (_, index) => ({
        rank: index + 1,
        userId: `game-player-${index + 1}`,
        username: `Player ${index + 1}`,
        avatar: '',
        score: 100000 - index * 137,
        updatedAt: '2026-07-27T00:00:00.000Z'
    }));
    const requestedPages = [];

    await page.route('**/api/growth/game/leaderboard?*', async (route) => {
        const url = new URL(route.request().url());
        const pageNumber = Number(url.searchParams.get('page')) || 1;
        const limit = Number(url.searchParams.get('limit')) || 10;
        requestedPages.push(pageNumber);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: {
                    entries: players.slice((pageNumber - 1) * limit, pageNumber * limit),
                    current: null,
                    page: pageNumber,
                    pageSize: limit,
                    total: players.length,
                    totalPages: Math.ceil(players.length / limit)
                }
            })
        });
    });
    await page.route('**/game-runtime/**', (route) => route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Game fixture</title>'
    }));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/game');

    const list = page.locator('.game-rank-list');
    await expect(list.locator('li')).toHaveCount(players.length);
    expect(requestedPages).toEqual([1, 2]);

    const metrics = await list.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
        touchAction: getComputedStyle(element).touchAction
    }));
    expect(metrics.overflowY).toBe('auto');
    expect(metrics.touchAction).toBe('pan-y');
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await list.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('admin can open the terminal dashboard and user panel', async ({ page }) => {
    await loginAsUser(page);
    const pendingMessage = `E2E terminal moderation 政治 ${Date.now()}`;
    const createResponse = await page.request.post('/api/messages', {
        headers: sameOriginWriteHeaders(page),
        data: { content: pendingMessage }
    });
    expect(createResponse.status()).toBe(201);

    await page.goto('/terminal');
    await page.locator('input[autocomplete="username"]').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
    await page.getByRole('button', { name: '连接终端' }).click();

    await expect(page.getByText('Tsukuyomi Terminal')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^(系统)?总览$/ })).toBeVisible();

    await page.getByRole('button', { name: '留言', exact: true }).click();
    const messageRow = page.locator('.terminal-message-table tbody tr').filter({ hasText: pendingMessage });
    await expect(messageRow).toBeVisible();
    await expect(messageRow.getByRole('button', { name: /通过留言/ })).toBeVisible();
    await expect(messageRow.getByRole('button', { name: /删除留言/ })).toBeVisible();

    await page.getByRole('button', { name: '用户', exact: true }).click();
    await expect(page.getByRole('heading', { name: '用户', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'e2e-user' }).first()).toBeVisible();
    await expect(page.locator('select option[value="banned"]').first()).toHaveText('banned');
});
