import test from 'node:test';
import assert from 'node:assert/strict';
import { nightfallDuration, shrinePose } from '../src/frontend/services/shrine/camera.js';
import { shotAt } from '../src/frontend/services/shrine/sequence.js';
import { approachPose } from '../src/frontend/services/shrine/approach.js';

for (const [name, aspect, portrait] of [['landscape', 1.6, false], ['portrait', 390 / 844, true]]) {
  test(`the ${name} approach settles into the live gate at ten seconds`, () => {
    for (const t of [5.6, 7.3, 8.1]) {
      const position = approachPose(t, aspect, portrait);
      const authored = shotAt(t, true).pose;
      for (const key of ['x', 'y', 'z', 'pitch', 'yaw', 'roll']) assert.equal(position[key], authored[key]);
    }
    const previous = approachPose(10 - .001, aspect, portrait);
    const end = approachPose(10, aspect, portrait);
    const hold = shrinePose(0, 0, aspect, portrait);
    for (const key of Object.keys(hold)) {
      assert.ok(Math.abs(end[key] - hold[key]) < 1e-12);
      assert.ok(Math.abs(end[key] - previous[key]) / .001 < .001);
    }
  });

  test(`the ${name} dolly inherits head position and velocity at any hold phase`, () => {
    const step = .0001;
    for (const time of [.02, .6, 1.2, 2.8, 5.2, 17, 300]) {
      const sample = (hold, travel) => shrinePose(hold, travel, aspect, portrait);
      const before = sample(time - step, 0);
      const click = sample(time, 0);
      const next = sample(time, step);
      for (const key of Object.keys(click)) {
        const incoming = (click[key] - before[key]) / step;
        const outgoing = (next[key] - click[key]) / step;
        assert.ok(Math.abs(outgoing - incoming) < .002, `${key} kink after holding ${time}s`);
      }
      const end = sample(time, nightfallDuration), reference = sample(0, nightfallDuration);
      for (const key of Object.keys(end)) assert.ok(end[key] === reference[key]);
    }
    const left = shrinePose(1.8, 0, aspect, portrait);
    const right = shrinePose(5, 0, aspect, portrait);
    assert.ok(Math.hypot(left.x - right.x, left.z - right.z) > .05);
    assert.ok(Math.abs(left.yaw - right.yaw) > .003);
  });
}
