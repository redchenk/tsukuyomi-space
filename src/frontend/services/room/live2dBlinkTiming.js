const BLINK_PERIOD_SECONDS = 4.2;
const BLINK_START_OFFSET_SECONDS = 1.35;
const BLINK_JITTER_SECONDS = 0.45;
const BLINK_CLOSE_SECONDS = 0.13;
const BLINK_HOLD_SECONDS = 0.075;
const BLINK_OPEN_SECONDS = 0.21;

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function fract(value) {
  return value - Math.floor(value);
}

function cycleJitterSeconds(index) {
  return (fract(Math.sin((Number(index) + 1) * 12.9898 + 78.233) * 43758.5453) - 0.5) * 2 * BLINK_JITTER_SECONDS;
}

function blinkStartSeconds(index) {
  return BLINK_START_OFFSET_SECONDS + Number(index) * BLINK_PERIOD_SECONDS + cycleJitterSeconds(index);
}

function blinkOpenForLocalSeconds(localSeconds, baseOpen) {
  const open = clamp(baseOpen, 0.62, 1, 0.92);
  if (localSeconds < 0) return null;
  if (localSeconds < BLINK_CLOSE_SECONDS) {
    const t = localSeconds / BLINK_CLOSE_SECONDS;
    return open * (1 - t * t);
  }
  if (localSeconds < BLINK_CLOSE_SECONDS + BLINK_HOLD_SECONDS) return 0.015;
  if (localSeconds < BLINK_CLOSE_SECONDS + BLINK_HOLD_SECONDS + BLINK_OPEN_SECONDS) {
    const t = (localSeconds - BLINK_CLOSE_SECONDS - BLINK_HOLD_SECONDS) / BLINK_OPEN_SECONDS;
    return 0.015 + (open - 0.015) * (1 - Math.pow(1 - t, 2));
  }
  return null;
}

export function naturalAutoBlinkOpen(nowMs, baseOpen = 0.92) {
  const seconds = Math.max(0, Number(nowMs || 0) / 1000);
  const open = clamp(baseOpen, 0.62, 1, 0.92);
  const approximateIndex = Math.floor((seconds - BLINK_START_OFFSET_SECONDS) / BLINK_PERIOD_SECONDS);
  for (const index of [approximateIndex - 1, approximateIndex, approximateIndex + 1]) {
    const blinkOpen = blinkOpenForLocalSeconds(seconds - blinkStartSeconds(index), open);
    if (blinkOpen !== null) return blinkOpen;
  }
  return open;
}
