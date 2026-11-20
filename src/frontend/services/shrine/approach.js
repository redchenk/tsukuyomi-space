import { shotAt, waterCut, nightCut } from './sequence.js';
import { shrineFov, shrinePose } from './camera.js';

export function approachPose(seconds, aspect, portrait) {
  if (seconds >= nightCut) return shrinePose(0, 0, aspect, portrait);
  const { pose } = shotAt(Math.max(waterCut, seconds), true);
  return { ...pose, fov: shrineFov(pose.fov, aspect, portrait) };
}
