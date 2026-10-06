import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { roomDayPart, roomSceneKey, nextRoomLightingCheckDelay, trackRoomLighting } from '../src/frontend/services/room/roomScene.mjs';

test('Room lighting switches at local 06:00 and 18:00, independently of season or UI theme', () => {
  for (let hour = 0; hour < 24; hour++) {
    const date = new Date(2026, 9, 6, hour, 0);
    const expected = hour >= 6 && hour < 18 ? 'day' : 'night';
    assert.equal(roomDayPart(date), expected);
    for (const season of ['spring', 'summer', 'autumn', 'winter']) assert.equal(roomSceneKey(season, date), season + '-' + expected);
  }
  assert.equal(roomDayPart(new Date(2026, 9, 6, 5, 59, 59, 999)), 'night');
  assert.equal(roomDayPart(new Date(2026, 9, 6, 17, 59, 59, 999)), 'day');
  assert.equal(roomSceneKey('invalid', new Date(2026, 9, 6, 12)), 'spring-day');
});

test('scheduled checks target the next boundary instead of polling', () => {
  assert.equal(nextRoomLightingCheckDelay(new Date(2026, 9, 6, 5, 59, 59)), 1000);
  assert.equal(nextRoomLightingCheckDelay(new Date(2026, 9, 6, 6)), 12 * 3600000);
  assert.equal(nextRoomLightingCheckDelay(new Date(2026, 9, 6, 18)), 12 * 3600000);
  assert.equal(nextRoomLightingCheckDelay(new Date(2026, 9, 6, 23)), 7 * 3600000);
  assert.equal(nextRoomLightingCheckDelay(new Date('invalid')), 3600000);
});

test('visitor timezone and daylight saving are respected at the actual boundary', () => {
  const url = new URL('../src/frontend/services/room/roomScene.mjs', import.meta.url).href;
  const run = (tz, expression) => execFileSync(process.execPath, ['--input-type=module', '-e',
    'import {roomDayPart,nextRoomLightingCheckDelay} from ' + JSON.stringify(url) + '; process.stdout.write(String(' + expression + '));'
  ], { encoding: 'utf8', env: { ...process.env, TZ: tz } });
  assert.equal(run('Asia/Shanghai', "roomDayPart(new Date('2026-10-06T08:00:00Z'))"), 'day');
  assert.equal(run('America/Los_Angeles', "roomDayPart(new Date('2026-10-06T08:00:00Z'))"), 'night');
  assert.equal(run('Asia/Shanghai', "roomDayPart(new Date('2026-10-06T12:00:00Z'))"), 'night');
  assert.equal(run('America/Los_Angeles', "roomDayPart(new Date('2026-10-06T12:00:00Z'))"), 'night');
  assert.equal(Number(run('America/New_York', 'nextRoomLightingCheckDelay(new Date(2026, 2, 8, 0))')), 5 * 3600000);
  assert.equal(Number(run('America/New_York', 'nextRoomLightingCheckDelay(new Date(2026, 10, 1, 0))')), 7 * 3600000);
});

test('Room suspends its only timer in background and releases all listeners when leaving', () => {
  const window = new EventTarget();
  const document = new EventTarget();
  const timers = new Map();
  let id = 0;
  window.setTimeout = (callback, delay) => { timers.set(++id, { callback, delay }); return id; };
  window.clearTimeout = timer => { timers.delete(timer); };
  document.visibilityState = 'visible';
  let date = new Date(2026, 9, 6, 17, 59, 59);
  const changes = [];
  const stop = trackRoomLighting(value => changes.push(roomDayPart(value)), { window, document, now: () => date });
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 1000);
  date = new Date(2026, 9, 6, 18);
  [...timers.values()][0].callback();
  assert.deepEqual(changes, ['day', 'night']);
  assert.equal(timers.size, 1);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 0);
  window.dispatchEvent(new Event('focus'));
  assert.equal(changes.length, 2);
  date = new Date(2026, 9, 7, 8);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(changes.at(-1), 'day');
  assert.equal(timers.size, 1);
  stop();
  assert.equal(timers.size, 0);
  const count = changes.length;
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('pageshow'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(changes.length, count);
});

test('all eight approved scenes are intact compressed full-resolution WebP assets', () => {
  const directory = new URL('../src/frontend/assets/room/lakeside-v1/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory)));
  assert.equal(manifest.assets.length, 8);
  const keys = new Set();
  let total = 0;
  for (const asset of manifest.assets) {
    const bytes = readFileSync(new URL(asset.file, directory));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    assert.equal(asset.width, 1672);
    assert.equal(asset.height, 941);
    assert.ok(bytes.length < 350 * 1024, 'Avoid large image downloads on phones');
    keys.add(asset.season + '-' + asset.time);
    total += bytes.length;
  }
  assert.equal(keys.size, 8);
  assert.equal(total, manifest.totalBytes);
  assert.ok(total < 2.5 * 1024 * 1024);
});
