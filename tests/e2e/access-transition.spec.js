const { test, expect } = require('@playwright/test');

async function entry(page) {
  await page.goto('/');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.access-enter')).toBeEnabled();
}

test('entering Tsukuyomi never starts background music', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    window.__audioPlayCalls = 0;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.tagName === 'AUDIO') window.__audioPlayCalls++;
      return play.apply(this, args);
    };
  });
  await entry(page);
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-gate')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('.hub h1')).toBeVisible();
  expect(await page.evaluate(() => window.__audioPlayCalls)).toBe(0);
  await expect(page.locator('.mini-player')).toHaveCount(0);
});

test('skip intro on a narrow screen waits only for Hub and returns to a usable entrance', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let releaseChunk;
  const chunk = new Promise(resolve => { releaseChunk = resolve; });
  await page.route('**/*HubPage-*.js', async route => { await chunk; await route.continue(); });
  try {
    await entry(page);
    const skip = page.getByRole('button', { name: /跳过动画|スキップ|Skip intro/ });
    const button = await skip.boundingBox();
    const brand = await page.locator('.access-brand').boundingBox();
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.x).toBeGreaterThanOrEqual(brand.x + brand.width + 8);
    expect(button.x + button.width).toBeLessThanOrEqual(320);
    const historyLength = await page.evaluate(() => history.length);
    await skip.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(skip).toBeDisabled();
    await expect(page.locator('.access-page :is(video,canvas)')).toHaveCount(0);
    await expect(page.locator('.access-enter')).toHaveAttribute('aria-busy', 'true');
    await expect(page).toHaveURL(/\/$/);
    releaseChunk();
    await expect(page.locator('.access-gate')).toHaveCount(0);
    await expect(page.locator('.hub h1')).toBeFocused();
    expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
    await page.goBack();
    await expect(skip).toBeEnabled();
    await expect(page.locator('.access-enter')).toBeEnabled();
  } finally {
    releaseChunk();
  }
});

test('skip intro interrupts the playing departure film and reaches Hub', async ({ page }) => {
  await entry(page);
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-page')).toHaveAttribute('data-nightfall', 'playing');
  await expect(page.locator('.access-content')).toHaveAttribute('inert', '');
  const skip = page.getByRole('button', { name: /跳过动画|スキップ|Skip intro/ });
  await expect(skip).toBeEnabled();
  const nightfall = await page.locator('.access-nightfall').elementHandle();
  await skip.click();
  await expect(page.locator('.access-gate')).toHaveCount(0);
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.locator('.hub h1')).toBeFocused();
  expect(await nightfall.evaluate(video => video.paused && !video.ended)).toBe(true);
});

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

for (const timing of ['early', 'after the hold']) {
  test(`shrine entry ${timing} plays nightfall before navigating to Hub`, async ({ page }) => {
    await page.goto('/access');
    const standby = page.locator('.access-video');
    const nightfall = page.locator('.access-nightfall');
    test.skip(!await nightfall.evaluate(video => video.canPlayType('video/mp4; codecs="avc1.4D4028"')), 'H.264 decoder unavailable');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect.poll(() => standby.evaluate(video => video.currentTime)).toBeGreaterThan(0);
    expect(await standby.evaluate(video => [video.duration, video.loop])).toEqual([10, false]);
    if (timing === 'after the hold') {
      await page.waitForFunction(() => {
        const film = document.querySelector('.access-video');
        return !film || film.ended;
      }, undefined, { timeout: 13000 });
      const canvas = page.locator('.access-shrine');
      await expect(canvas).toHaveAttribute('data-shot', /^(hold|unavailable)$/);
      const live = await canvas.getAttribute('data-shot') === 'hold';
      if (live) {
        await expect(canvas).toHaveCSS('opacity', '1');
        await page.locator('.access-motion-control').click();
        await expect(page.locator('.access-motion-control')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('.access-motion-control').click();
      }
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await expect(standby).toHaveCount(0);
    }
    expect(await nightfall.evaluate(video => [video.currentTime, video.paused])).toEqual([0, true]);
    await nightfall.evaluate(video => {
      video.addEventListener('ended', () => { window.shrineEnding = location.pathname; }, { once: true });
      new MutationObserver(records => {
        if (records.some(record => record.target.dataset.shot === 'arrived')) window.shrineEnding = location.pathname;
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-shot'] });
      document.querySelector('.access-enter').addEventListener('click', () => { window.enterAt = performance.now(); });
    });
    await page.locator('.access-enter').click();
    await expect(page.locator('.access-page')).toHaveAttribute('data-nightfall', 'playing');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.access-gate')).toHaveCount(0);
    await expect(page).toHaveURL(/\/hub$/);
    expect(await page.evaluate(() => window.shrineEnding)).toBe('/');
    expect(await page.evaluate(() => performance.now() - window.enterAt)).toBeGreaterThanOrEqual(2300);
  });
}

test('rotation reframes the frontal hold without restarting the opening', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entry(page);
  const opening = page.locator('.access-video');
  const poster = page.locator('.access-poster');
  const ending = page.locator('.access-nightfall');
  await expect.poll(() => opening.evaluate(v => v.currentTime)).toBeGreaterThan(.2);
  const before = await opening.evaluate(v => ({ src: v.currentSrc, time: v.currentTime }));
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => poster.evaluate(img => img.currentSrc)).not.toContain('poster-mobile');
  await expect(ending).toHaveAttribute('src', /shrine-nightfall-(?!mobile)/);
  expect(await opening.evaluate(v => v.currentSrc)).toBe(before.src);
  await expect.poll(() => opening.evaluate(v => v.currentTime)).toBeGreaterThan(before.time);
  await opening.evaluate(v => { v.currentTime = 9.65; });
  await expect(opening).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(() => poster.evaluate(img => img.currentSrc)).toContain('poster-mobile');
  await expect(ending).toHaveAttribute('src', /shrine-nightfall-mobile/);
  await expect(page.locator('.access-enter')).toBeInViewport();
  await page.locator('.access-enter').click();
  await expect(page).toHaveURL(/\/hub$/);
});

test('the end of the side take cuts to the frontal still and live dusk camera', async ({ page }) => {
  let releaseScene;
  const delayed = new Promise(resolve => { releaseScene = resolve; });
  await page.route('**/renderer-*.js', async route => { await delayed; await route.continue(); });
  try {
    await page.goto('/access', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    const film = page.locator('.access-video');
    test.skip(!await film.evaluate(v => v.canPlayType('video/mp4; codecs="avc1.4D4028"')), 'H.264 unavailable');
    const pause = page.locator('.access-motion-control');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await film.evaluate(v => new Promise(resolve => {
      v.addEventListener('seeked', resolve, { once: true });
      v.currentTime = 299 / 30;
    }));
    const { width, height } = page.viewportSize();
    const clip = { x: Math.floor(width * .06), y: Math.floor(height * .22),
      width: Math.floor(width * .88), height: Math.floor(height * .27) };
    const sample = async () => (await page.screenshot({ clip, scale: 'css' })).toString('base64');
    const side = await sample();
    await pause.click();
    await expect(film).toHaveCount(0);
    const frontal = await sample();
    releaseScene();
    const canvas = page.locator('.access-shrine');
    await expect(canvas).toHaveAttribute('data-shot', /^(hold|unavailable)$/);
    test.skip(await canvas.getAttribute('data-shot') === 'unavailable', 'WebGL2 unavailable');
    const live = await sample();
    const differences = await page.evaluate(async frames => {
      const planes = await Promise.all(frames.map(async png => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();
        const surface = document.createElement('canvas');
        surface.width = image.width;
        surface.height = image.height;
        const ctx = surface.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(0, 0, image.width, image.height);
        const luma = new Float32Array(data.length / 4);
        for (let i = 0; i < data.length; i += 4) {
          luma[i / 4] = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
        }
        return luma;
      }));
      let cut = 0, handoff = 0, exposure = 0;
      for (let i = 0; i < planes[0].length; i++) {
        cut += Math.abs(planes[0][i] - planes[1][i]);
        const diff = planes[1][i] - planes[2][i];
        handoff += Math.abs(diff);
        exposure += diff;
      }
      const count = planes[0].length;
      return { cut: cut / count, handoff: handoff / count, exposure: Math.abs(exposure / count) };
    }, [side, frontal, live]);
    expect(differences.cut).toBeGreaterThan(12);
    expect(differences.handoff).toBeLessThan(differences.cut / 3);
    expect(differences.exposure).toBeLessThan(1.5);
  } finally {
    releaseScene();
  }
});

test('a device without WebGL plays the matched nightfall film on entry', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
      if (kind === 'webgl2' && this.classList.contains('access-shrine')) return null;
      return get.call(this, kind, ...options);
    };
  });
  await entry(page);
  const video = page.locator('.access-nightfall');
  test.skip(!await video.evaluate(node => node.canPlayType('video/mp4; codecs="avc1.4D4028"')), 'H.264 decoder unavailable');
  await expect(page.locator('.access-shrine')).toHaveAttribute('data-shot', 'unavailable');
  const opening = page.locator('.access-video');
  await opening.evaluate(film => { film.currentTime = film.duration - .25; });
  await expect(opening).toHaveCount(0);
  expect(await page.locator('.access-poster').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await video.evaluate(node => node.addEventListener('ended', () => { window.fallbackEnded = node.currentTime; }));
  await page.locator('.access-enter').click();
  await expect(page.locator('.access-gate')).toHaveCount(0);
  await expect(page).toHaveURL(/\/hub$/);
  expect(await page.evaluate(() => window.fallbackEnded)).toBeCloseTo(2.3, 3);
});

test('every full entry reload shows the brand splash, even with the legacy session marker', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('tsukuyomi_entry_splash_seen', '1'));
  let releasePoster;
  let poster = new Promise(resolve => { releasePoster = resolve; });
  await page.route('**/*shrine-poster*.webp', async route => { await poster; await route.continue(); });
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
      await expect(page.locator('#boot-splash')).toBeVisible();
      if (!reload) await page.screenshot({ path: `output/access-transition/${test.info().project.name}-boot-${reducedMotion}.png` });
      await expect(page.locator('#boot-splash')).toHaveCount(0);
      const duration = await page.evaluate(() => window.brandFrames.at(-1) - window.brandFrames[0]);
      expect(duration).toBeGreaterThanOrEqual(800);
      await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
      await expect(page.locator('.access-enter')).toBeEnabled();
    }
  });
}

test('the shrine dissolves into a single live Hub that updates through the transition', async ({ page }) => {
  await pauseReveal(page);
  let releaseData;
  const data = new Promise(resolve => { releaseData = resolve; });
  let requests = 0;
  await page.route('**/api/hub-preview*', async route => {
    requests++;
    await data;
    await route.fulfill({ json: { success: true, data: {
      article: { id: 1, title: '星夜淡入时到达的文章', excerpt: '真实接口更新', slug: 'live-reveal', created_at: '2026-10-16' },
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
  await expect(gate).toHaveCSS('clip-path', 'none');
  expect(await gate.evaluate(node => node.getAnimations()[0].effect.getKeyframes().map(frame => Number(frame.opacity)))).toEqual([1, 0]);
  expect(await gate.evaluate(node => node.getAnimations()[0].effect.getTiming().duration)).toBe(720);
  const hub = await page.locator('.hub').elementHandle();
  releaseData();
  await expect(page.locator('.hub')).toContainText('星夜淡入时到达的文章');
  await page.screenshot({ path: `output/access-transition/${test.info().project.name}-dissolve.png` });
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
    await page.route('**/*shrine*', route => route.abort());
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
