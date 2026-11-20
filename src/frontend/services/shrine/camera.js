import { arrival, atGate } from './landmarks.js';

export const nightfallDuration = 2.3;
const clamp = value => Math.max(0, Math.min(1, value));

function ease(value) {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Projected width of the gate's crossbeam in the source 960 px shot.
// A monotone cubic keeps the dolly velocity continuous at every measured pose.
const times = [0, .35, .7, 1, 1.2, 1.4, 1.6, 1.8, 2, nightfallDuration];
const widths = [744, 731, 699, 637, 567, 461, 369, 320, 298, 288];
const slopes = widths.map((_, i) => {
  if (i === 0 || i === widths.length - 1) return 0;
  const before = (widths[i] - widths[i - 1]) / (times[i] - times[i - 1]);
  const after = (widths[i + 1] - widths[i]) / (times[i + 1] - times[i]);
  return 2 * before * after / (before + after);
});

function beamWidth(seconds) {
  let i = 0;
  while (i < times.length - 2 && seconds > times[i + 1]) i++;
  const span = times[i + 1] - times[i];
  const t = clamp((seconds - times[i]) / span);
  const mix = t * t * (3 - 2 * t);
  return widths[i] * (1 - mix) + widths[i + 1] * mix
    + span * (slopes[i] * t * (1 - t) ** 2 - slopes[i + 1] * t * t * (1 - t));
}

// Match the reference lens in landscape. The portrait take widens vertically
// to keep the lateral shot and both gate posts inside the narrower frame.
export function shrineFov(fov, aspect, portrait) {
  const reference = portrait ? 576 / 1024 : 16 / 9;
  const scale = (portrait ? 1.72 / reference : 1) * Math.min(1, reference / aspect);
  return 2 * Math.atan(Math.tan(fov * Math.PI / 360) * scale) * 180 / Math.PI;
}

export function shrinePose(heldSeconds, travelSeconds, aspect, portrait) {
  const width = beamWidth(travelSeconds);
  const progress = (744 - width) / (744 - 288);
  // Frame the roof tips and the feet at the waterline on the two master
  // plates. A level lateral offset leaves space for the desktop title.
  const distance = 16 + 8 * progress;
  const lateral = portrait ? 0 : -2.35 * (1 - progress);
  const center = atGate(-distance / arrival.scale, lateral / arrival.scale);
  const eye = 1.55 - 1.10 * progress;
  const pitch = portrait ? -.08 + .23 * progress : .135 + .095 * progress;
  const masterAspect = portrait ? 9 / 16 : 16 / 9;
  const halfHeight = (portrait ? 1.06 : .56) * Math.min(1, masterAspect / aspect);

  // Carry both the position and its derivative through the click. The two
  // envelopes have zero slope at their endpoints, even halfway through a glance.
  const clock = heldSeconds + travelSeconds;
  const weight = ease(heldSeconds ? clock / 1.2 : 0) * (1 - ease(travelSeconds / 1.35));
  const side = weight * (.052 * Math.sin(clock * .91) + .017 * Math.sin(clock * 1.49));
  const nod = Math.sin(clock * 1.13 + .38);
  return {
    x: center.x + Math.cos(arrival.yaw) * side,
    y: eye + weight * .009 * nod,
    z: center.z - Math.sin(arrival.yaw) * side,
    yaw: arrival.yaw + weight * (.0055 * Math.sin(clock * .79) + .0013 * Math.sin(clock * 1.37)),
    pitch: pitch + weight * .0028 * nod,
    roll: weight * .0014 * Math.sin(clock * .87 - .2),
    fov: 2 * Math.atan(halfHeight) * 180 / Math.PI
  };
}
