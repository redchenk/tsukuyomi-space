const fs = require('node:fs');
const { test, expect } = require('../e2e-fixtures.cjs');

test('likes burst only at the successful initiating button and can be removed across the site', async ({ page, request, baseURL }, info) => {
  test.skip(!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Uses local fixture accounts and content.');
  test.setTimeout(120000);
  const headers = { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' };
  const post = async (api, path, data) => {
    const response = await api.post(path, { headers, data });
    const result = await response.json();
    expect(result.success, path + ': ' + result.message).toBe(true);
    return result.data;
  };
  await post(page.request, '/api/auth/login', { username: 'badge-' + info.project.name, password: 'e2e-password' });
  await post(request, '/api/auth/login', { username: 'e2e-user', password: 'e2e-password' });
  const marker = '月下画作' + Date.now() + info.workerIndex;
  const message = await post(request, '/api/messages', { content: marker });
  const comment = await post(request, '/api/messages', { content: marker + '评论', article_id: 1 });
  const artwork = await post(request, '/api/pixel-art', {
    width: 32, height: 18, size: 32, title: marker, palette: ['#101020', '#ffffff'], pixels: Array(32 * 18).fill(1)
  });
  const image = await post(request, '/api/assets', {
    dataUrl: 'data:image/webp;base64,' + fs.readFileSync('src/frontend/assets/navigation/gallery-yachiyo.webp').toString('base64'),
    fileName: marker + '.webp', collection: 'gallery', storage: 'local'
  });

  await page.addInitScript(() => {
    window.likeCelebrations = 0;
    new MutationObserver(changes => {
      for (const change of changes) for (const node of change.addedNodes) {
        if (node.matches?.('canvas.like-burst-layer')) window.likeCelebrations++;
      }
    }).observe(document, { subtree: true, childList: true });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const layers = page.locator('canvas.like-burst-layer');
  async function toggle(button, endpoint, add, motion = true) {
    await expect(button).toHaveAttribute('aria-pressed', String(!add));
    await expect(button).toBeEnabled();
    const before = await page.evaluate(() => window.likeCelebrations);
    const ack = page.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === (add ? 'POST' : 'DELETE'));
    await button.click();
    expect((await ack).ok()).toBe(true);
    await expect(button).toHaveAttribute('aria-pressed', String(add));
    await expect(button).toBeEnabled();
    if (add && motion) {
      await expect.poll(() => page.evaluate(() => window.likeCelebrations)).toBe(before + 1);
      await expect.poll(() => layers.evaluateAll(nodes => nodes.some(canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.some((value, index) => index % 4 === 3 && value > 0);
      }))).toBe(true);
    }
    await expect(layers).toHaveCount(0);
    expect(await page.evaluate(() => window.likeCelebrations)).toBe(before + Number(add && motion));
    if (add) await expect(button.locator('svg')).not.toHaveCSS('fill', 'none');
    else await expect(button.locator('svg')).toHaveCSS('fill', 'none');
  }

  const imagePath = '/api/assets/gallery/' + image.id + '/like';
  await page.goto('/gallery');
  const card = page.locator('.gallery-card').filter({ hasText: marker });
  await toggle(card.locator('.gallery-like-button'), imagePath, true);
  await card.locator('.gallery-thumb').click();
  const preview = page.locator('.gallery-viewer .gallery-like-button');
  await toggle(preview, imagePath, false);
  await expect(card.locator('.gallery-like-button')).toHaveAttribute('aria-pressed', 'false');
  await page.route('**' + imagePath, route => route.fulfill({ status: 503, json: { success: false, message: 'Test unavailable' } }));
  await preview.click();
  await expect(page.locator('.gallery-like-error')).toBeVisible();
  await expect(preview).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.likeCelebrations)).toBe(1);
  await page.unroute('**' + imagePath);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toggle(preview, imagePath, true, false);
  await page.goto('/gallery?image=' + image.id);
  await expect(preview).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.likeCelebrations)).toBe(0);
  await toggle(preview, imagePath, false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await toggle(preview, imagePath, true);
  await toggle(preview, imagePath, false);

  await page.goto('/plaza#msg-' + message.id);
  const plazaLike = page.locator('#msg-' + message.id + ' .like-btn').first();
  await toggle(plazaLike, '/api/messages/' + message.id + '/like', true);
  await toggle(plazaLike, '/api/messages/' + message.id + '/like', false);

  const articleEndpoint = '/api/user/article-likes/1';
  await page.request.delete(articleEndpoint, { headers });
  await page.goto('/article?id=1');
  const articleButton = page.locator('.article-like-btn');
  await toggle(articleButton, articleEndpoint, true);
  const dock = page.locator('nav .like-control:visible');
  await toggle(await dock.count() ? dock.first() : articleButton, articleEndpoint, false);
  const commentLike = page.locator('#comment-' + comment.id + ' .like-btn').first();
  await toggle(commentLike, '/api/messages/' + comment.id + '/like', true);
  await toggle(commentLike, '/api/messages/' + comment.id + '/like', false);

  async function openPixelGallery() {
    await page.goto('/pixel');
    const open = page.locator('[aria-controls="arena-gallery-panel"]:visible').first();
    await expect(page.locator('.arena-page')).toBeVisible();
    if (!await open.count()) await page.locator('.ps-icon-btn.ps-show-mobile[aria-controls="arena-controls-panel"]:visible').click();
    await open.click();
  }
  await openPixelGallery();
  const pixel = page.locator('#pixel-art-' + artwork.id + ' .like-btn');
  const pixelEndpoint = '/api/pixel-art/' + artwork.id + '/like';
  await toggle(pixel, pixelEndpoint, true);
  await openPixelGallery();
  await toggle(pixel, pixelEndpoint, false);
  for (const endpoint of [imagePath, '/api/messages/' + message.id + '/like', pixelEndpoint]) {
    // A retry removes only this account's vote, even if the author also voted.
    await post(request, endpoint, {});
    for (let retry = 0; retry < 2; retry++) {
      const response = await page.request.delete(endpoint, { headers });
      expect(response.ok()).toBe(true);
      const { data } = await response.json();
      expect(data.viewer_liked).toBe(false);
      expect(data.like_count).toBe(1);
    }
  }
  const notifications = (await (await request.get('/api/user/notifications?limit=50')).json()).data;
  const likes = notifications.filter(row => row.metadata?.assetId === image.id && row.type === 'like');
  expect(likes).toHaveLength(1);
});
