const { test, expect } = require('../e2e-fixtures.cjs');

const article = { id: 3, title: '双向滚动验收文章', content_format: 'markdown',
  content: Array.from({ length: 32 }, (_, i) => `## 月下章节 ${i + 1}\n\n${'顺着月光阅读，向下探索，向上回望。'.repeat(12)}`).join('\n\n') };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    try { sessionStorage.setItem('tsukuyomi_visit_popup_seen', '1'); } catch (_) { /* Sandboxed game frames have no storage. */ }
  });
  await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//, route => route.fulfill({ json: { success: true, data: article } }));
  await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/messages/, route => route.fulfill({ json: { success: true, data: [] } }));
});

async function ready(page, url = '/article?id=3') {
  await page.goto(url);
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.route-view-frame')).toHaveAttribute('data-scroll-reveal', 'bidirectional');
}

async function wheel(page, amount, selector = '.article-content') {
  // Mobile WebKit has no Playwright mouse.wheel implementation. Dispatch at the
  // real event target to exercise Lenis; desktop also uses real wheel below.
  await page.locator(selector).dispatchEvent('wheel', { deltaY: amount, deltaX: 0, bubbles: true, cancelable: true });
}

test('wheel movement eases in both directions and preserves a single document scroller', async ({ page, isMobile }) => {
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-scroll-engine', 'lenis');
  await page.mouse.move(180, 300);
  if (isMobile) await wheel(page, 650);
  else await page.mouse.wheel(0, 650);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - 650))).toBeLessThan(3);
  if (isMobile) await wheel(page, -420);
  else await page.mouse.wheel(0, -420);
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - 230))).toBeLessThan(3);
  expect(await page.locator('html.lenis').count()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('the same reading block re-enters from below and above without hiding content', async ({ page }) => {
  await ready(page);
  const target = page.locator('.article-content > p').nth(5);
  await expect(target).toHaveAttribute('data-scroll-motion', 'ready');
  const top = await target.evaluate(el => el.getBoundingClientRect().top + scrollY);
  await page.evaluate(top => scrollTo({ top: top - innerHeight + 100, behavior: 'instant' }), top);
  await expect(target).toHaveAttribute('data-scroll-motion', 'from-below');
  await expect.poll(() => target.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.evaluate(top => scrollTo({ top: top + innerHeight, behavior: 'instant' }), top);
  await expect.poll(() => target.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThan(0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(top => scrollTo({ top: top - 100, behavior: 'instant' }), top);
  await expect(target).toHaveAttribute('data-scroll-motion', 'from-above');
  await expect(target).toHaveCSS('opacity', '1');
  await expect(target).toHaveCSS('translate', 'none');
});

test('reduced motion changes at runtime restore native scrolling and cancel reveals', async ({ page }) => {
  await ready(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-scroll-engine', 'native');
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
  const target = page.locator('.article-content > p').nth(5);
  await target.scrollIntoViewIfNeeded();
  expect(await target.evaluate(el => el.getAnimations().length)).toBe(0);
  await expect(target).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-scroll-engine', 'lenis');
});

test('pointer intent and BFCache restoration cannot resume stale wheel inertia', async ({ page }) => {
  await ready(page);
  await wheel(page, 1400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);
  const position = await page.evaluate(() => {
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return scrollY;
  });
  await expect(page.locator('html')).not.toHaveClass(/lenis-scrolling/);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(page.locator('html')).toHaveAttribute('data-scroll-engine', 'native');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('html')).toHaveAttribute('data-scroll-engine', 'lenis');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(Math.abs(await page.evaluate(() => scrollY) - position)).toBeLessThan(2);
  await wheel(page, -100);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(position);
});

test('dynamically added nested content reveals in both directions inside its own viewport', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.id = 'nested-reveal-fixture';
    panel.style.cssText = 'position:fixed;left:20px;top:160px;width:220px;height:180px;overflow:auto;z-index:9999;background:white';
    panel.innerHTML = Array.from({ length: 8 }, (_, i) => `<div data-scroll-reveal style="height:150px">Nested block ${i}</div>`).join('');
    document.querySelector('.route-view-frame').append(panel);
  });
  const panel = page.locator('#nested-reveal-fixture');
  const target = panel.locator('[data-scroll-reveal]').nth(2);
  await expect(target).toHaveAttribute('data-scroll-motion', 'ready');
  await panel.evaluate(el => { el.scrollTop = 220; });
  await expect(target).toHaveAttribute('data-scroll-motion', 'from-below');
  await expect.poll(() => target.evaluate(el => el.getAnimations().length)).toBe(0);
  await panel.evaluate(el => { el.scrollTop = 550; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await panel.evaluate(el => { el.scrollTop = 220; });
  await expect(target).toHaveAttribute('data-scroll-motion', 'from-above');
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await panel.evaluate(el => el.remove());
});

test('modal scroll locks and nested scrollers release cleanly', async ({ page, browserName, isMobile }) => {
  await ready(page);
  // Exercise the same body/root lock used by gallery and navigation dialogs.
  await page.evaluate(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  });
  await expect(page.locator('html')).toHaveClass(/lenis-stopped/);
  await page.mouse.move(180, 300);
  await wheel(page, 500);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
    const nested = document.createElement('div');
    nested.id = 'scroll-fixture';
    nested.style.cssText = 'position:fixed;left:20px;top:160px;width:220px;height:180px;overflow:auto;overscroll-behavior:contain;z-index:9999;background:white';
    nested.innerHTML = '<div style="height:1600px">Nested content</div>';
    document.body.append(nested);
  });
  await expect(page.locator('html')).not.toHaveClass(/lenis-stopped/);
  await page.mouse.move(120, 240);
  if (browserName !== 'webkit' || !isMobile) {
    await page.mouse.wheel(0, 450);
    await expect.poll(() => page.locator('#scroll-fixture').evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  } else {
    const prevented = await page.locator('#scroll-fixture').evaluate(el => {
      const event = new WheelEvent('wheel', { deltaY: 450, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      el.scrollTop = 150;
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
  }
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.locator('#scroll-fixture').evaluate(el => el.remove());
  await wheel(page, 450);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200);
});

test('public and tool routes attach the shared scrolling layer with no page errors', async ({ page }) => {
  test.setTimeout(90000);
  // This route/scroll matrix does not exercise model downloads. Real renderer
  // readiness and navigation cancellation are covered by room-entry.spec.js.
  await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/*live2d-room-neuro-live*.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.initTsukuyomiLive2DRoom = () => {
      window.TSUKUYOMI_LIVE2D_READY = true;
      window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-ready'));
    };
    window.destroyTsukuyomiLive2DRoom = () => {};
  ` }));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page, '/hub');
  const routes = ['/stage', '/article?id=3', '/wiki', '/wiki/characters/yachiyo', '/gallery', '/plaza', '/friend-links', '/friend-links/apply', '/download', '/reality', '/room/settings', '/room', '/live2d', '/pixel', '/game', '/login', '/register', '/fushi/connect', '/fushi/astrbot/callback', '/terminal'];
  for (const path of routes) {
    // Fullscreen renderers are separate documents in this scroll-coverage
    // check; their GPU/model teardown is exercised by existing Room suites.
    const standalone = ['/room', '/live2d', '/pixel', '/game'];
    if (standalone.includes(path) || standalone.includes(new URL(page.url()).pathname)) await ready(page, '/hub');
    await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path);
    await expect(page.locator('.route-view-frame')).toHaveAttribute('data-route-key', path);
    await expect(page.locator('.route-view-frame')).toHaveAttribute('data-scroll-reveal', 'bidirectional');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('wheel reversal responds on the next frame and waking from idle still eases', async ({ page }) => {
  // Advance JS animation frames explicitly: a loaded CI host may spend the
  // whole easing duration between two real requestAnimationFrame callbacks.
  await page.clock.install();
  await ready(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 10_000));
  await wheel(page, 1400);
  await page.clock.runFor(64);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(60);
  const beforeReversal = await page.evaluate(() => scrollY);
  await wheel(page, -100);
  await page.clock.runFor(32);
  expect(await page.evaluate(() => scrollY)).toBeLessThan(beforeReversal);
  await page.clock.runFor(1500);
  // Verify that easing has stopped and the position stays still. Lenis's
  // native-scroll flag can outlive a zero-velocity browser scroll event.
  await expect(page.locator('html')).not.toHaveClass(/lenis-smooth/);
  const idlePosition = await page.evaluate(() => scrollY);
  // Catch a stale RAF clock without depending on wall-clock frame scheduling.
  await page.clock.runFor(700);
  const beforeWake = await page.evaluate(() => scrollY);
  expect(beforeWake).toBeCloseTo(idlePosition, 0);
  await wheel(page, 700);
  await page.clock.runFor(32);
  const afterWake = await page.evaluate(() => scrollY);
  expect(afterWake).toBeGreaterThan(beforeWake);
  expect(afterWake - beforeWake).toBeLessThan(500);
  await page.clock.runFor(1500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(beforeWake + 700, 0);
});

test('brief edge reversals finish a reveal instead of flashing it repeatedly', async ({ page }) => {
  await ready(page);
  const target = page.locator('.article-content > p').nth(5);
  // Hold the reveal in progress so protocol/trace latency cannot finish it
  // before we examine its identity across rapid edge reversals.
  await target.evaluate(el => {
    const animate = el.animate.bind(el);
    el.animate = (...args) => {
      const animation = animate(...args);
      animation.pause();
      animation.currentTime = 10;
      return animation;
    };
  });
  const top = await target.evaluate(el => el.getBoundingClientRect().top + scrollY);
  await page.evaluate(top => scrollTo({top: top - innerHeight + 100, behavior: 'instant'}), top);
  await expect(target).toHaveAttribute('data-scroll-motion', 'from-below');
  const sameAnimation = await target.evaluate(async (el, top) => {
    const animation = el.getAnimations()[0];
    scrollTo({top: top + innerHeight, behavior: 'instant'});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    scrollTo({top: top - 100, behavior: 'instant'});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return animation && el.getAnimations()[0] === animation;
  }, top);
  expect(sameAnimation).toBe(true);
  await target.evaluate(el => el.getAnimations()[0].finish());
  await expect(target).toHaveCSS('opacity', '1');
});

test('signed-in pages keep scrolling and focusable forms after route changes', async ({ page }) => {
  test.setTimeout(60000);
  await ready(page, '/login');
  await page.locator('#loginAccount').fill('e2e-user');
  await page.locator('#loginPassword').fill('e2e-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  for (const path of ['/user-center', '/growth', '/attachments', '/notifications', '/editor', '/gallery/manage', '/users/e2e-user', '/admin']) {
    await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path);
    await expect(page.locator('.route-view-frame')).toHaveAttribute('data-route-key', path);
    await expect(page.locator('.route-view-frame')).toHaveAttribute('data-scroll-reveal', 'bidirectional');
  }
});
