import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { AVAILABLE_SEASONS, SEASON_STORAGE_KEY, calendarSeason, resolveSeason, nextSeasonCheckDelay, normalizeSeasonPreference, readSeasonPreference, writeSeasonPreference } from '../src/frontend/services/seasonTheme.mjs';

test('all local months map to meteorological seasons in both hemispheres', () => {
  const north = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  const opposite = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' };
  north.forEach((season, month) => {
    for (const day of [1, 28]) {
      const date = new Date(2026, month, day, 23, 59);
      assert.equal(calendarSeason(date), season);
      assert.equal(calendarSeason(date, 'south'), opposite[season]);
    }
  });
});

test('season boundaries use the visitor date rather than UTC or server timezone', () => {
  const moduleUrl = new URL('../src/frontend/services/seasonTheme.mjs', import.meta.url).href;
  const run = tz => execFileSync(process.execPath, ['--input-type=module', '-e', `import {calendarSeason} from '${moduleUrl}'; process.stdout.write(calendarSeason(new Date('2026-05-31T16:30:00Z')));`], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  assert.equal(run('Asia/Shanghai'), 'summer');
  assert.equal(run('America/Los_Angeles'), 'spring');
});

test('all four manual themes override the calendar and automatic seasons use their own artwork', () => {
  const january = new Date(2026, 0, 1);
  assert.deepEqual(AVAILABLE_SEASONS, ['spring', 'summer', 'autumn', 'winter']);
  for (const mode of AVAILABLE_SEASONS) {
    for (const hemisphere of ['north', 'south']) {
      assert.equal(resolveSeason({ mode, hemisphere }, january).artwork, mode);
    }
  }
  assert.deepEqual(resolveSeason({ mode: 'auto' }, january), { calendar: 'winter', requested: 'winter', artwork: 'winter' });
  assert.equal(resolveSeason({ mode: 'auto', hemisphere: 'south' }, january).artwork, 'summer');
  for (let month = 0; month < 12; month++) {
    for (const hemisphere of ['north', 'south']) {
      const date = new Date(2026, month, 1);
      const expected = calendarSeason(date, hemisphere);
      assert.equal(resolveSeason({ mode: 'auto', hemisphere }, date).artwork, expected);
    }
  }
  for (const [month, before, after] of [[2, 'winter', 'spring'], [5, 'spring', 'summer'], [8, 'summer', 'autumn'], [11, 'autumn', 'winter']]) {
    assert.equal(resolveSeason({}, new Date(2026, month, 0, 23, 59, 59)).artwork, before);
    assert.equal(resolveSeason({}, new Date(2026, month, 1)).artwork, after);
  }
});

test('malformed, missing, hostile and disabled storage never break theme selection', () => {
  assert.deepEqual(normalizeSeasonPreference({ mode: '<script>', hemisphere: '<script>', other: 'ignored' }), { version: 1, mode: 'auto', hemisphere: 'north' });
  assert.equal(readSeasonPreference(null).mode, 'auto');
  assert.equal(readSeasonPreference({ getItem() { return '{'; } }).mode, 'auto');
  assert.equal(readSeasonPreference({ getItem() { throw Error('blocked'); } }).mode, 'auto');
  assert.equal(writeSeasonPreference({ setItem() { throw Error('quota'); } }, { mode: 'summer' }), false);
  assert.equal(writeSeasonPreference(null, {}), false);
  let stored;
  const storage = { setItem(key, value) { assert.equal(key, SEASON_STORAGE_KEY); stored = value; }, getItem() { return stored; } };
  for (const mode of ['auto', ...AVAILABLE_SEASONS]) {
    assert.equal(writeSeasonPreference(storage, { mode, hemisphere: 'south' }), true);
    assert.deepEqual(readSeasonPreference(storage), { version: 1, mode, hemisphere: 'south' });
  }
  assert.equal(calendarSeason(new Date('invalid')), 'spring');
});

test('season packs contain intact deployable artwork for every declared role', () => {
  for (const season of AVAILABLE_SEASONS.filter(season => season !== 'spring')) {
    const directory = new URL(`../src/frontend/assets/seasons/${season}-v1/`, import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory)));
    assert.equal(manifest.theme, season);
    for (const role of ['backgroundLight', 'backgroundDark', 'hero', 'articleFallback', 'galleryFallback', 'pixelFallback']) {
      const asset = manifest.assets.find(asset => asset.webp === manifest.roles[role]);
      assert.ok(asset, `${season}: missing ${role}`);
      const bytes = readFileSync(new URL(asset.webp, directory));
      assert.equal(bytes.length, asset.webp_bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
      assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    }
  }
});

test('scheduled checks sleep until local midnight and respect daylight saving', () => {
  assert.equal(nextSeasonCheckDelay(new Date(2026, 5, 1, 23, 59, 59)), 1000);
  assert.equal(nextSeasonCheckDelay(new Date(2026, 5, 1, 12)), 12 * 3600000);
  const moduleUrl = new URL('../src/frontend/services/seasonTheme.mjs', import.meta.url).href;
  const delay = Number(execFileSync(process.execPath, ['--input-type=module', '-e', `import {nextSeasonCheckDelay} from '${moduleUrl}'; process.stdout.write(String(nextSeasonCheckDelay(new Date(2026, 2, 8))));`], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' }));
  assert.equal(delay, 23 * 3600000);
});
