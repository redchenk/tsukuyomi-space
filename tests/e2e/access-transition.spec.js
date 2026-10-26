const { test, expect } = require('@playwright/test');

async function entry(page) {
  await page.goto('/');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.access-enter')).toBeEnabled();
}

async function pauseReveal(page) {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const gate = document.querySelector('.access-gate[data-phase="revealing"]');
      const animation = gate?.getAnimations()[0];
      if (!animation || gate.dataset.captured) return;
      gate.dataset.captured = 'true';
      animation.pause();
      animation.currentTime = 450;
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });
}

test('every full entry reload shows the brand splash, even with the legacy session marker', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('tsukuyomi_entry_splash_seen', '1'));
  let releasePoster;
  let poster = new Promise(resolve => { releasePoster = resolve; });
  await page.route('**/*moon-gate-poster*.webp', async route => { await poster; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-splash')).toBeVisible();
  releasePoster();
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  poster = new Promise(resolve => { releasePoster = resolve; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-splash')).toBeVisible();
  releasePoster();
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.access-enter')).toBeEnabled();
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`fast homepage loads and cached reloads keep a readable splash (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    // Observe actual topmost, fully opaque frames without delaying any resource.
    await page.addInitScript(() => {
      window.brandFrames = [];
      // WebKit can pause rAF sampling during screenshots. The splash remains
      // painted in that interval; measure its fade/removal via DOM mutation.
      new MutationObserver(() => {
        const splash = document.getElementById('boot-splash');
        if (window.brandFrames.length && !window.brandOpaqueUntil && (!splash || splash.classList.contains('is-ready'))) {
          window.brandOpaqueUntil = performance.now();
        }
      }).observe(document, { childList: true, attributes: true, subtree: true });
      const observe = () => {
        const splash = document.getElementById('boot-splash');
        if (splash && getComputedStyle(splash).opacity === '1'
          && document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#boot-splash')) {
          window.brandFrames.push(performance.now());
        }
        if (splash || document.readyState === 'loading') requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    for (const reload of [false, true]) {
      if (reload) await page.reload({ waitUntil: 'domcontentloaded' });
      else await page.goto('/', { waitUntil: 'domcontentloaded' });
      // The protocol may return after this deliberately short splash is gone.
      // Its in-page observer records the actual opaque, topmost painted frames.
      await expect.poll(() => page.evaluate(() => window.brandFrames.length)).toBeGreaterThan(0);
      if (!reload && await page.locator('#boot-splash').isVisible()) {
        await page.screenshot({ path: `output/access-transition/${test.info().project.name}-boot-${reducedMotion}.png` });
      }
      await expect(page.locator('#boot-splash')).toHaveCount(0);
      const duration = await page.evaluate(() => window.brandOpaqueUntil - window.brandFrames[0]);
      expect(duration).toBeGreaterThanOrEqual(800);
      await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
      await expect(page.locator('.access-enter')).toBeEnabled();
    }
  });
}

test('the circle reveals a single live Hub that updates and survives the transition', async ({ page }) => {
  await pauseReveal(page);
  let releaseData;
  const data = new Promise(resolve => { releaseData = resolve; });
  let requests = 0;
  await page.route('**/api/hub-preview*', async route => {
    requests++;
    await data;
    await route.fulfill({ json: { success: true, data: {
      article: { id: 1, title: '圆形展开时实时到达的文章', excerpt: '真实接口更新', slug: 'live-reveal', created_at: '2026-10-16' },
      messages: [], stats: { views: 123, articles: 1, messages: 0 }
    } } });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await entry(page);
  await page.locator('.access-enter').click();
  const gate = page.locator('.access-gate');
  await expect(gate).toHaveAttribute('data-captured', 'true');
  await expect(page.locator('.hub')).toHaveCount(1);
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
  await expect(gate).toHaveCSS('clip-path', /^path\(evenodd/);
  expect(await gate.evaluate(node => node.getAnimations()[0].effect.getTiming().duration)).toBe(650);
  const hub = await page.locator('.hub').elementHandle();
  releaseData();
  await expect(page.locator('.hub')).toContainText('圆形展开时实时到达的文章');
  await page.screenshot({ path: `output/access-transition/${test.info().project.name}-circle.png` });
  await gate.evaluate(node => node.getAnimations()[0].finish());
  await expect(gate).toHaveCount(0);
  expect(await hub.evaluate(node => node === document.querySelector('.hub'))).toBe(true);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.hub h1')).toBeFocused();
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `output/access-transition/${test.info().project.name}-hub.png` });
});

test('reduced motion uses a short fade and keyboard entry lands on the Hub heading', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pauseReveal(page);
  await entry(page);
  await page.locator('.access-enter').focus();
  await page.keyboard.press('Enter');
  const gate = page.locator('.access-gate');
  await expect(gate).toHaveAttribute('data-captured', 'true');
  const timing = await gate.evaluate(node => {
    const effect = node.getAnimations()[0].effect;
    return { duration: effect.getTiming().duration, circular: effect.getKeyframes().some(frame => frame.clipPath) };
  });
  expect(timing.duration).toBeLessThanOrEqual(150);
  expect(timing.circular).toBe(false);
  await gate.evaluate(node => node.getAnimations()[0].finish());
  await expect(gate).toHaveCount(0);
  await expect(page.locator('.hub h1')).toBeFocused();
});

test('slow route resources keep a real loading state; duplicate clicks and BFCache cannot leave stale navigation', async ({ page }) => {
  let releaseChunk;
  const chunk = new Promise(resolve => { releaseChunk = resolve; });
  await page.route('**/*HubPage-*.js', async route => { await chunk; await route.continue(); });
  await entry(page);
  await page.locator('.access-enter').evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('.access-gate')).toHaveAttribute('data-phase', 'loading');
  await expect(page.locator('.access-enter')).toBeDisabled();
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('.access-enter')).toBeEnabled();
  releaseChunk();
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-gate')).toHaveCount(0);
  await expect(page).toHaveURL(/\/hub$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.access-enter')).toBeEnabled();
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-gate')).toHaveCount(0);
});

test('failed Hub chunk leaves a usable retry button and no clipped page', async ({ page }) => {
  await page.route('**/*HubPage-*.js', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporary fixture outage' }));
  await entry(page);
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-entry-error')).toBeVisible();
  await expect(page.locator('.access-enter')).toBeEnabled();
  await expect(page.locator('.access-gate')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('.access-gate')).toHaveCSS('clip-path', 'none');
  await page.unroute('**/*HubPage-*.js');
  await Promise.all([page.waitForEvent('load'), page.locator('.access-enter').click()]);
  await expect(page.locator('.access-entry-error')).toHaveCount(0);
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-gate')).toHaveCount(0);
  await expect(page.locator('.hub')).toBeVisible();
});

test('resize during the reveal releases clipping and scrolling', async ({ page }) => {
  await pauseReveal(page);
  await entry(page);
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-gate')).toHaveAttribute('data-captured', 'true');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.access-gate')).toHaveCount(0);
  await expect(page.locator('.hub')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
});

for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`poster and video failures do not hide the entry at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.route('**/*moon-gate*', route => route.abort());
    await entry(page);
    await expect(page.locator('.access-enter')).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await page.locator('.access-enter').click();
    await expect(page.locator('.access-gate')).toHaveCount(0);
    await expect(page.locator('.hub')).toBeVisible();
  });
}

test('direct Hub visits and full reloads show splash until the app is ready', async ({ page }) => {
  let releaseBundle;
  let bundle = new Promise(resolve => { releaseBundle = resolve; });
  await page.route('**/assets/index-*.js', async route => { await bundle; await route.continue(); });
  await page.goto('/hub', { waitUntil: 'commit' });
  await expect(page.locator('#boot-splash')).toBeVisible();
  releaseBundle();
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.hub')).toBeVisible();
  await expect(page.locator('#boot-splash, .access-gate')).toHaveCount(0);
  bundle = new Promise(resolve => { releaseBundle = resolve; });
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('#boot-splash')).toBeVisible();
  releaseBundle();
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.hub')).toBeVisible();
  await expect(page.locator('.access-gate')).toHaveCount(0);
});

test('a failed application bundle exposes a reload action instead of an endless splash', async ({ page }) => {
  await page.clock.install();
  await page.route('**/assets/index-*.js', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-splash')).toBeVisible();
  await page.clock.fastForward(10050);
  await expect(page.locator('.boot-splash-retry')).toBeVisible();
});
