const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');

// The operator-supplied game/media are deliberately outside Git. CI exercises
// the project-graph regression; this opt-in suite also runs the real engine.
test.skip(process.env.KAGUYA_ENGINE_FIXTURE !== 'true', 'Requires the verified original game archive and local engine fixture');
test.afterEach(async ({ page }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('last-frame.png') });
  const state = await page.evaluate(() => window.__rideSnapshot?.());
  fs.writeFileSync(testInfo.outputPath('last-state.json'), JSON.stringify(state, null, 2));
});
test('riding progresses, accepts both directions and survives repeated restarts', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) console.log(message.type(), message.text().slice(0, 500)); });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__rideSnapshot === 'function' && window.__kaguyaStability, null, { timeout: 90000 });
  const snapshots = [];
  for (let round = 0; round < 3; round++) {
    await page.evaluate(() => window.__rideStart());
    await expect.poll(async () => Number((await page.evaluate(() => window.__rideSnapshot())).values['轮回启动完成']), { timeout: 15000 }).toBe(1);
    // Complete the white tutorial area's native transition before testing the run.
    await page.evaluate(() => window.__rideEnterRun());
    await expect.poll(async () => Number((await page.evaluate(() => window.__rideSnapshot())).values['游戏是否开始']), { timeout: 20000 }).toBe(1);
    await page.evaluate(() => window.__ridePickup());
    await page.waitForTimeout(400);
    const initial = await page.evaluate(() => window.__rideSnapshot());
    snapshots.push(initial);
    await page.evaluate(() => window.__rideKey('ArrowUp', true));
    await page.waitForTimeout(300);
    const up = await page.evaluate(() => window.__rideSnapshot());
    await page.evaluate(() => { window.__rideKey('ArrowUp', false); window.__rideKey('ArrowDown', true); });
    await page.waitForTimeout(300);
    const down = await page.evaluate(() => window.__rideSnapshot());
    await page.evaluate(() => window.__rideKey('ArrowDown', false));
    snapshots.push(up, down);
    await testInfo.attach(`round-${round}.json`, { body: Buffer.from(JSON.stringify({ initial, up, down }, null, 2)), contentType: 'application/json' });
    fs.writeFileSync(testInfo.outputPath(`round-${round}.json`), JSON.stringify({ initial, up, down }, null, 2));
    await page.screenshot({ path: testInfo.outputPath(`round-${round}.png`) });
    expect(initial.errors).toEqual([]);
    expect(up.errors).toEqual([]);
    expect(down.errors).toEqual([]);
    expect(down.frames).toBeGreaterThan(initial.frames + 5);
    expect(up.y).toBeGreaterThan(initial.y);
    expect(down.y).toBeLessThan(up.y);
    expect(down.contextLost).toBe(false);
    expect(down.clones).toBeLessThanOrEqual(300);
    await page.evaluate(() => window.__rideKey('ArrowUp', true));
    await page.waitForTimeout(1000);
    const top = await page.evaluate(() => window.__rideSnapshot());
    expect(top.y).toBeLessThanOrEqual(70);
    await page.evaluate(() => { window.__rideKey('ArrowUp', false); window.__rideKey('ArrowDown', true); });
    await page.waitForTimeout(1500);
    const bottom = await page.evaluate(() => window.__rideSnapshot());
    expect(bottom.y).toBeGreaterThanOrEqual(-114);
    await page.evaluate(() => window.__rideKey('ArrowDown', false));
    if (round === 1) {
      await page.evaluate(() => window.__rideReset());
      await expect.poll(async () => (await page.evaluate(() => window.__rideSnapshot())).visible).toBe(false);
      await expect.poll(async () => (await page.evaluate(() => window.__rideSnapshot())).riderClones).toBe(0);
      await page.waitForTimeout(500);
      expect((await page.evaluate(() => window.__rideSnapshot())).riderClones).toBe(0);
    } else {
      await expect.poll(async () => Number((await page.evaluate(() => window.__rideSnapshot())).values['辉夜是否消失']), { timeout: 15000 }).toBe(0);
    }
    const finished = await page.evaluate(() => window.__rideSnapshot());
    expect(finished.frames).toBeGreaterThan(bottom.frames + (round === 1 ? 5 : 30));
    expect(finished.errors).toEqual([]);
  }
  await page.screenshot({ path: testInfo.outputPath('riding-after-three-restarts.png') });
});
