import fs from 'node:fs';
import path from 'node:path';

const period = 15 * 60 * 1000;
export function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
function write(file, data, mode) {
  const temp = file + '.next';
  fs.writeFileSync(temp, JSON.stringify(data), {mode});
  fs.chmodSync(temp, mode);
  fs.renameSync(temp, file);
}
export async function sample(directory, configuration, business, probe, lastSuccessAt) {
  const file = path.join(directory, 'attempt.json');
  const previous = read(file);
  const now = Date.now();
  const same = previous.configuration === configuration;
  const verdict = same && previous.result;
  if (verdict?.evidence === 'probe_failed') verdict.state = 'unknown';
  if (business && business.at >= now-period && business.at <= now && (!verdict || business.at >= verdict.at)) {
    if (business.state === 'up' || (lastSuccessAt >= now-period && lastSuccessAt <= now) || now - (previous.attempt || 0) < period) return business;
  }
  // Reserve before dispatch, including on configuration changes or interrupted probes.
  if (now - (previous.attempt || 0) < period) {
    return verdict || {state:'unknown', evidence:'pending', at:now};
  }
  write(file, {configuration, attempt:now}, 0o600);
  let result;
  try { result = await probe(); }
  catch (error) {
    const frame = String(error.stack || '').split('\n').slice(1,5).map(v=>v.match(/([a-zA-Z0-9_-]+\.(?:m?js|cjs):\d+:\d+)/)?.[1]).filter(Boolean);
    const code = /^[A-Z0-9_]{1,50}$/.test(error.code || '') ? error.code : error.name;
    console.error('probe error', code, frame.join(' '));
    result = {state:'unknown', evidence:'probe_failed'};
  }
  result.at = Date.now();
  write(file, {configuration, attempt:now, result}, 0o600);
  return result;
}
export async function publish(directory, collect) {
  let result;
  try { result = await collect(); }
  catch { result = {state:'unknown', evidence:'collector_error', at:Date.now()}; }
  write(path.join(directory, 'public.json'), {state:result.state,evidence:result.evidence,
    observedAt:result.at || Date.now(), checkedAt:Date.now()}, 0o644);
  console.log(result.state, result.evidence);
}
