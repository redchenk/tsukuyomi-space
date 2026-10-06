const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');

test.use({ timezoneId: 'Asia/Shanghai' });
const evidence = path.resolve('.codex_tmp/room-scenes-20261006');
const seasonKey = 'tsukuyomi_season_theme_v1';

async function chooseSeason(page, mode, hemisphere = 'north') {
  await page.evaluate(({ key, mode, hemisphere }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, mode, hemisphere }));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, { key: seasonKey, mode, hemisphere });
}
async function refreshClock(page, time) {
  await page.clock.setFixedTime(new Date(time));
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
}
const sceneRequests = page => {
  const requests = [];
  page.on('request', request => {
    const file = new URL(request.url()).pathname.split('/').at(-1);
    if (/^(spring|summer|autumn|winter)-(day|night)(?:-[\w-]+)?\.webp$/.test(file)) requests.push(file);
  });
  return requests;
};

for (const width of [1440, 390]) {
  test('Room four seasons and both lighting variants preserve layout at ' + width + 'px', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-06T10:00:00+08:00'));
    await page.addInitScript(key => {
      localStorage.setItem(key, JSON.stringify({ mode: 'spring', hemisphere: 'north' }));
      localStorage.setItem('tsukuyomi_theme', 'light');
    }, seasonKey);
    const requests = sceneRequests(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.name));
    await page.goto('/room');
    const room = page.locator('.room-page');
    await expect(room).toHaveAttribute('data-room-scene', 'spring-day');
    await expect(room).toHaveAttribute('aria-busy', 'false');
    const canvas = page.locator('#live2d-container canvas').first();
    await expect(canvas).toBeVisible();
    const initialGeometry = await page.locator('.room-stage').boundingBox();
    const initialRequests = [...requests];
    expect(initialRequests).toHaveLength(1);
    expect(initialRequests[0]).toMatch(/^spring-day/);
    const records = [];
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const time of ['day', 'night']) {
        await refreshClock(page, '2026-10-06T' + (time === 'day' ? '10' : '22') + ':00:00+08:00');
        for (const season of ['spring', 'summer', 'autumn', 'winter']) {
          await chooseSeason(page, season);
          await expect(room).toHaveAttribute('data-room-scene', season + '-' + time);
          const image = await room.evaluate(async element => {
            const css = getComputedStyle(element).getPropertyValue('--ts-room-bg-image').trim();
            const url = css.slice(5, -2);
            const image = new Image(); image.src = url; await image.decode();
            return { url, width: image.naturalWidth, height: image.naturalHeight };
          });
          expect(image.width).toBe(1672);
          expect(image.height).toBe(941);
          expect(await page.locator('.room-stage').boundingBox()).toEqual(initialGeometry);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await expect(page.locator('#live2d-container canvas').first()).toBeVisible();
          await expect(page.locator('.room-scene-trigger')).toHaveAttribute('aria-label', new RegExp(time === 'day' ? '白昼' : '月夜'));
          await room.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          fs.mkdirSync(evidence, { recursive: true });
          await page.screenshot({ path: path.join(evidence, testInfo.project.name + '-' + width + '-' + season + '-' + time + '-' + theme + '.png') });
          records.push({ season, time, theme, width, artwork: image, overflow: false });
        }
      }
    }
    expect(errors).toEqual([]);
    fs.writeFileSync(path.join(evidence, testInfo.project.name + '-' + width + '-matrix.json'), JSON.stringify({ initialRequests, records, pageErrors: errors }, null, 2));
  });
}

test('automatic hemisphere, refresh and an actual 18:00 timer update the same Room', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-06T17:59:58+08:00') });
  await page.clock.pauseAt(new Date('2026-10-06T17:59:58+08:00'));
  await page.goto('/room');
  const room = page.locator('.room-page');
  await expect(room).toHaveAttribute('data-room-scene', 'autumn-day');
  await page.clock.runFor(2500);
  await expect(room).toHaveAttribute('data-room-scene', 'autumn-night');
  await chooseSeason(page, 'auto', 'south');
  await expect(room).toHaveAttribute('data-room-scene', 'spring-night');
  await chooseSeason(page, 'winter');
  await expect(room).toHaveAttribute('data-room-scene', 'winter-night');
  await page.reload();
  await expect(room).toHaveAttribute('data-room-scene', 'winter-night');
  await page.clock.setSystemTime(new Date('2026-10-07T07:00:00+08:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(room).toHaveAttribute('data-room-scene', 'winter-day');
});

test('late or failed artwork cannot replace a newer selection or remove the last usable room', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00+08:00'));
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ mode: 'spring' })), seasonKey);
  await page.goto('/room');
  const room = page.locator('.room-page');
  await expect(room).toHaveAttribute('data-room-scene', 'spring-day');
  let blocked;
  const summerSeen = new Promise(resolve => { blocked = resolve; });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route(/summer-day(?:-[\w-]+)?\.webp$/, async route => {
    blocked();
    await pending;
    await route.continue().catch(() => {});
  });
  await chooseSeason(page, 'summer');
  await summerSeen;
  await expect(room).toHaveAttribute('data-room-scene', 'spring-day');
  await chooseSeason(page, 'winter');
  await expect(room).toHaveAttribute('data-room-scene', 'winter-day');
  release();
  await page.route(/autumn-day(?:-[\w-]+)?\.webp$/, route => route.fulfill({ status: 503, body: '' }));
  const failed = page.waitForResponse(/autumn-day(?:-[\w-]+)?\.webp$/);
  await chooseSeason(page, 'autumn');
  await failed;
  await expect(room).toHaveAttribute('data-room-scene', 'winter-day');
  await chooseSeason(page, 'spring');
  await expect(room).toHaveAttribute('data-room-scene', 'spring-day');
});
