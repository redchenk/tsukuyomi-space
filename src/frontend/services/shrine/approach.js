import { shotAt } from './sequence.js';
import { shrinePose } from './camera.js';

// Retain the authored surfacing and side cut, then move the low camera past
// the near lanterns and bring it to rest facing the gate.
export function approachPose(seconds, aspect, portrait) {
  const t = Math.max(5, Math.min(10, seconds));
  const pose = { ...shotAt(Math.min(t, 10 - 1e-6), true).pose };
  const scale = portrait ? 1.72 / aspect : Math.min(1, (16 / 9) / aspect);
  pose.fov = 2 * Math.atan(Math.tan(pose.fov * Math.PI / 360) * scale) * 180 / Math.PI;
  if (t < 8.22) return pose;
  const u = (t - 8.22) / (10 - 8.22);
  const weight = u * u * u * (10 - 15 * u + 6 * u * u);
  const front = shrinePose(0, 0, aspect, portrait);
  for (const key of Object.keys(front)) pose[key] += (front[key] - pose[key]) * weight;
  return pose;
}
