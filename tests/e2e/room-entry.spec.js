const { test, expect } = require('../e2e-fixtures.cjs');
const { configureRoomFixture } = require('../e2e-room-helpers.cjs');

async function pauseReveal(page) {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const splash = document.querySelector('.room-entry-splash[data-phase="revealing"]');
      const animation = splash?.getAnimations()[0];
      if (!animation || splash.dataset.captured) return;
      splash.dataset.captured = 'true';
      animation.pause();
      animation.currentTime = animation.effect.getTiming().duration * .35;
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });
}

// Hold the renderer readiness event independently of the application / route.
// Real renderer coverage is below; these cases exercise failure and cancellation.
async function controlledRenderer(page) {
  await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/*live2d-room-neuro-live*.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.initTsukuyomiLive2DRoom = () => { window.roomInitCount = (window.roomInitCount || 0) + 1; };
    window.destroyTsukuyomiLive2DRoom = () => {};
  ` }));
}
async function completeRenderer(page, fail = false) {
  await expect.poll(() => page.evaluate(() => window.roomInitCount)).toBe(1);
  await page.evaluate(fail => {
    window.TSUKUYOMI_LIVE2D_READY = !fail;
    window.dispatchEvent(new CustomEvent(fail ? 'tsukuyomi:live2d-error' : 'tsukuyomi:live2d-ready', { detail: { message: 'Fixture asset failure' } }));
  }, fail);
}
async function openHub(page) {
  await page.goto('/hub');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
}
async function enterRoom(page) {
  await page.locator('.hub [href="/room"]').first().click();
}

test('SPA entry covers route loading, then reveals the same live room and releases focus', async ({ page }, info) => {
  await configureRoomFixture(page);
  await controlledRenderer(page);
  await pauseReveal(page);
  let releaseChunk;
  const blocked = new Promise(resolve => { releaseChunk = resolve; });
  await page.route('**/*RoomPage-*.js', async route => { await blocked; await route.continue(); });
  await openHub(page);
  await enterRoom(page);
  const splash = page.locator('.room-entry-splash');
  await expect(splash).toHaveAttribute('data-phase', 'loading');
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
  releaseChunk();
  await expect(page).toHaveURL(/\/room$/);
  await expect(splash).toHaveAttribute('data-phase', 'loading');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  const room = await page.locator('.room-page').elementHandle();
  await completeRenderer(page);
  await expect(splash).toHaveAttribute('data-captured', 'true');
  const timing = await splash.evaluate(node => node.getAnimations()[0].effect.getTiming().duration);
  expect(timing).toBe(650);
  await expect(splash).toHaveCSS('clip-path', /^path\(evenodd/);
  await expect(page.locator('.room-page')).toHaveCount(1);
  // A state update underneath the circle is visible in the actual destination.
  await expect(page.locator('.room-companion-identity')).toContainText('在这里');
  await splash.evaluate(node => node.getAnimations()[0].finish());
  await expect(splash).toHaveCount(0);
  expect(await room.evaluate(node => node === document.querySelector('.room-page'))).toBe(true);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.room-page')).toBeFocused();
  expect(await page.evaluate(() => window.roomInitCount)).toBe(1);
});

test('direct loads and full reloads hand the boot splash to Room until readiness', async ({ page }) => {
  await controlledRenderer(page);
  for (let visit = 0; visit < 2; visit++) {
    if (visit) await page.reload({ waitUntil: 'domcontentloaded' });
    else await page.goto('/room', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.room-entry-splash')).toHaveAttribute('data-phase', 'loading');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
    await completeRenderer(page);
    await expect(page.locator('.room-entry-splash')).toHaveCount(0);
  }
});

test('background readiness also holds the splash after the renderer is ready', async ({ page }) => {
  await controlledRenderer(page);
  let releaseBackground;
  const background = new Promise(resolve => { releaseBackground = resolve; });
  await page.route(/\/(?:spring|summer|autumn|winter)-(?:day|night)-[^/]+\.webp/, async route => { await background; await route.continue(); });
  await page.goto('/room', { waitUntil: 'domcontentloaded' });
  await completeRenderer(page);
  await expect(page.locator('.room-page')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.room-entry-splash')).toHaveAttribute('data-phase', 'loading');
  releaseBackground();
  await expect(page.locator('.room-entry-splash')).toHaveCount(0);
});

test('reduced motion fades; resizing and BFCache finish without leaving interaction locked', async ({ page }) => {
  await configureRoomFixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await controlledRenderer(page);
  await pauseReveal(page);
  await page.goto('/room');
  await completeRenderer(page);
  const splash = page.locator('.room-entry-splash');
  await expect(splash).toHaveAttribute('data-captured', 'true');
  const effect = await splash.evaluate(node => {
    const effect = node.getAnimations()[0].effect;
    return { duration: effect.getTiming().duration, circular: effect.getKeyframes().some(frame => frame.clipPath) };
  });
  expect(effect).toEqual({ duration: 140, circular: false });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(splash).toHaveCount(0);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
});

test('failed renderer offers recovery or an explicit room fallback', async ({ page }) => {
  await controlledRenderer(page);
  await page.goto('/room');
  await completeRenderer(page, true);
  const splash = page.locator('.room-entry-splash');
  await expect(splash).toHaveAttribute('data-phase', 'error');
  await expect(page.locator('.room-setup-dialog')).toHaveCount(0);
  await expect(splash.getByRole('button', { name: '重新加载' })).toBeVisible();
  await splash.getByRole('button', { name: '先进入房间' }).click();
  await expect(splash).toHaveCount(0);
  await expect(page.locator('.room-setup-dialog')).toBeVisible();
  await page.getByRole('button', { name: '稍后设置', exact: true }).click();
  await page.locator('#chatInput').fill('入场失败后仍然可以输入');
  await expect(page.locator('#sendChatBtn')).toBeEnabled();
});

test('a stalled load remains retryable and returning to Hub clears the cover', async ({ page }) => {
  await controlledRenderer(page);
  await openHub(page);
  await page.clock.install();
  await enterRoom(page);
  await expect(page.locator('.room-entry-splash')).toHaveAttribute('data-phase', 'loading');
  await expect.poll(() => page.evaluate(() => window.roomInitCount)).toBe(1);
  await page.clock.fastForward(21000);
  await expect(page.locator('.room-entry-splash')).toHaveAttribute('data-phase', 'stalled');
  await page.getByRole('button', { name: '返回大厅', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.locator('.room-entry-splash')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-ready')));
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
});

test('a failed room chunk allows retry into a fresh document', async ({ page }) => {
  let fail = true;
  await controlledRenderer(page);
  await page.route('**/*RoomPage-*.js', route => fail ? route.fulfill({ status: 503, body: 'Fixture unavailable' }) : route.continue());
  await openHub(page);
  await enterRoom(page);
  await expect(page.locator('.room-entry-splash')).toHaveAttribute('data-phase', 'error');
  fail = false;
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.getByRole('button', { name: '重新加载', exact: true }).click()
  ]);
  await expect(page).toHaveURL(/\/room$/);
  await completeRenderer(page);
  await expect(page.locator('.room-entry-splash')).toHaveCount(0);
});

test('real renderer, seasonal background and live canvas reveal once', async ({ page }, info) => {
  await configureRoomFixture(page);
  test.setTimeout(60000);
  await pauseReveal(page);
  await page.goto('/room', { waitUntil: 'domcontentloaded' });
  const splash = page.locator('.room-entry-splash');
  await expect(splash).toHaveAttribute('data-captured', 'true', { timeout: 45000 });
  expect(await page.evaluate(() => window.TSUKUYOMI_LIVE2D_READY)).toBe(true);
  await expect(page.locator('#live2d-container canvas')).toHaveCount(1);
  await page.screenshot({ path: `output/room-entry/${info.project.name}-circle.png` });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width + 1, height: viewport.height });
  await expect(splash).toHaveCount(0);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  await page.screenshot({ path: `output/room-entry/${info.project.name}-room.png` });
});

test('leaving during renderer download cannot initialize a stale room after navigation', async ({ page }) => {
  await controlledRenderer(page);
  let releaseRuntime;
  const runtime = new Promise(resolve => { releaseRuntime = resolve; });
  await page.route('**/*live2d-room-neuro-live*.js', async route => { await runtime; await route.fallback(); });
  await openHub(page);
  await enterRoom(page);
  await expect(page).toHaveURL(/\/room$/);
  await expect(page.locator('.room-entry-splash')).toHaveAttribute('data-phase', 'loading');
  await page.goBack();
  await expect(page).toHaveURL(/\/hub$/);
  releaseRuntime();
  await expect.poll(() => page.evaluate(() => typeof window.initTsukuyomiLive2DRoom)).toBe('function');
  expect(await page.evaluate(() => window.roomInitCount || 0)).toBe(0);
  await expect(page.locator('.room-entry-splash')).toHaveCount(0);
  await enterRoom(page);
  await completeRenderer(page);
  await expect(page.locator('.room-entry-splash')).toHaveCount(0);
});

test('shared room links use the same readiness and reveal flow', async ({ page }) => {
  await controlledRenderer(page);
  await openHub(page);
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/room/shared/entry-fixture'));
  await expect(page.locator('.room-entry-splash')).toHaveAttribute('data-phase', 'loading');
  await completeRenderer(page);
  await expect(page.locator('.room-entry-splash')).toHaveCount(0);
  await expect(page.locator('[data-route-name="roomShared"]')).toBeVisible();
});
