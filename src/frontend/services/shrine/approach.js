import { shrinePose } from './camera.js';

// Used when rendering the 5–10 s opening footage with the source scene's
// shotAt sampler. Ease the original approach to rest in the exact live pose.
export function approachPose(seconds, aspect, portrait, shotAt) {
  const start = 7.05;
  const elapsed = Math.max(0, seconds - start);
  const sample = seconds <= start ? seconds : start - .64 * Math.expm1(-elapsed / .64);
  const pose = { ...shotAt(sample).pose };
  const lensScale = portrait ? 1.72 / aspect : Math.min(1, (16 / 9) / aspect);
  pose.fov = 2 * Math.atan(Math.tan(pose.fov * Math.PI / 360) * lensScale) * 180 / Math.PI;
  const end = shrinePose(0, 0, aspect, portrait);
  const t = Math.min(1, elapsed / (10 - start));
  const blend = t * t * t * (10 - 15 * t + 6 * t * t);
  for (const key of Object.keys(end)) pose[key] += (end[key] - pose[key]) * blend;
  return pose;
}
