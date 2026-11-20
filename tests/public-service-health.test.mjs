import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import health from '../backend/services/public-service-health.js';
import { sample } from '../deploy/status-monitor/sample.mjs';
import { hasMp3Frames } from '../deploy/status-monitor/audio.mjs';

test('public results fail closed on expired, future or unrecognized samples and exclude private fields', () => {
  const now = Date.now();
  const row = {state:'up', evidence:'generated_text', observedAt:now, checkedAt:now};
  assert.deepEqual(health.sanitize({...row, secret:'private'}, now), row);
  for (const change of [{observedAt:now-19*60000},{checkedAt:now-181000},{checkedAt:now+15000},{evidence:'internal diagnostic'}]) {
    assert.equal(health.sanitize({...row,...change}, now).state, 'unknown');
  }
});

test('completed traffic skips generation and failures reserve the attempt across restarts and config changes', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'tsu-probe-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  let calls=0;
  const probe=async () => { calls++; return {state:'down',evidence:'provider_rejected'}; };
  const business={state:'up',evidence:'completed_request',at:Date.now()};
  assert.deepEqual(await sample(dir,'model-a',business,probe),business);
  assert.equal(calls,0);
  const laterFailure={...business,state:'degraded',evidence:'request_failed'};
  assert.deepEqual(await sample(dir,'model-a',laterFailure,probe,business.at),laterFailure);
  assert.equal(calls,0);
  assert.equal((await sample(dir,'model-a',null,probe)).state,'down');
  assert.equal((await sample(dir,'model-a',null,probe)).state,'down');
  assert.equal((await sample(dir,'model-b',null,probe)).state,'unknown');
  assert.equal(calls,1);
  assert.ok(JSON.parse(await readFile(path.join(dir,'attempt.json'))).attempt);
  const recent={...business, at:Date.now()};
  assert.deepEqual(await sample(dir,'model-a',recent,probe),recent);
  assert.equal(calls,1);
});

test('actual audio requires two complete compatible Layer III frames', () => {
  const frame=Buffer.alloc(417);
  Buffer.from([255,251,144,0]).copy(frame);
  const audio=Buffer.concat([frame,frame]);
  assert.ok(hasMp3Frames(audio));
  assert.ok(hasMp3Frames(Buffer.concat([Buffer.from([73,68,51,4,0,0,0,0,0,0]),audio])));
  assert.equal(hasMp3Frames(audio.subarray(0,500)),false);
  assert.equal(hasMp3Frames(Buffer.alloc(500)),false);
  assert.equal(hasMp3Frames(Buffer.concat([Buffer.from('ID3'),Buffer.alloc(800)])), false);
});
