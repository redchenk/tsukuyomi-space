export const PERFORMANCE_PROFILE_EVENT = 'tsukuyomi:performance-profile';

const PROFILE_BALANCED = 'balanced';
const PROFILE_REDUCED = 'reduced';
const LONG_TASK_WINDOW_MS = 10000;
const LONG_TASK_TOTAL_LIMIT_MS = 420;
const LONG_TASK_COUNT_LIMIT = 3;
const FRAME_PROBE_DURATION_MS = 12000;
const FRAME_PRESSURE_WINDOW_MS = 6000;
const SLOW_FRAME_THRESHOLD_MS = 34;
const SLOW_FRAME_COUNT_LIMIT = 8;
const SLOW_FRAME_EXCESS_LIMIT_MS = 240;
const INITIAL_PRESSURE_GRACE_MS = 7000;
const ROUTE_PRESSURE_GRACE_MS = 1500;

let currentProfile = PROFILE_BALANCED;
let initialized = false;
let longTaskObserver = null;
let longTaskSamples = [];
let frameProbeId = 0;
let frameProbeStartedAt = 0;
let previousFrameAt = 0;
let slowFrameSamples = [];
let pressureGraceUntil = 0;

function readHardwareProfile() {
  if (typeof navigator === 'undefined') return PROFILE_BALANCED;
  const memory = Number(navigator.deviceMemory) || 0;
  const cores = Number(navigator.hardwareConcurrency) || 0;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || '').toLowerCase();
  const constrainedNetwork = Boolean(connection?.saveData) || ['slow-2g', '2g', '3g'].includes(effectiveType);
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const veryLowHardware = (memory > 0 && memory <= 2) || (cores > 0 && cores <= 2);
  const jointlyLimited = memory > 0 && memory <= 4 && cores > 0 && cores <= 4;
  const unknownMemoryMobile = memory === 0 && coarsePointer && (cores === 0 || cores <= 4);
  return constrainedNetwork || veryLowHardware || jointlyLimited || unknownMemoryMobile
    ? PROFILE_REDUCED
    : PROFILE_BALANCED;
}

function stopFrameProbe() {
  if (frameProbeId) window.cancelAnimationFrame(frameProbeId);
  frameProbeId = 0;
  frameProbeStartedAt = 0;
  previousFrameAt = 0;
  slowFrameSamples = [];
}

function stopPressureObservers() {
  longTaskObserver?.disconnect();
  longTaskObserver = null;
  longTaskSamples = [];
  stopFrameProbe();
}

function publishProfile(nextProfile) {
  const normalized = nextProfile === PROFILE_REDUCED ? PROFILE_REDUCED : PROFILE_BALANCED;
  if (normalized === currentProfile && document.documentElement.dataset.performance === normalized) return;
  currentProfile = normalized;
  document.documentElement.dataset.performance = normalized;
  window.TSUKUYOMI_PERFORMANCE_PROFILE = normalized;
  window.dispatchEvent(new CustomEvent(PERFORMANCE_PROFILE_EVENT, {
    detail: { profile: normalized, reduced: normalized === PROFILE_REDUCED }
  }));
  if (normalized === PROFILE_REDUCED) stopPressureObservers();
}

function observeLongTasks() {
  if (longTaskObserver
    || typeof PerformanceObserver !== 'function'
    || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
  longTaskObserver = new PerformanceObserver((list) => {
    const now = performance.now();
    for (const entry of list.getEntries()) {
      if (entry.startTime < pressureGraceUntil) continue;
      longTaskSamples.push({
        at: Math.max(now, entry.startTime + entry.duration),
        duration: entry.duration
      });
    }
    longTaskSamples = longTaskSamples.filter((sample) => now - sample.at <= LONG_TASK_WINDOW_MS);
    const total = longTaskSamples.reduce((sum, sample) => sum + sample.duration, 0);
    if (longTaskSamples.length >= LONG_TASK_COUNT_LIMIT && total >= LONG_TASK_TOTAL_LIMIT_MS) {
      publishProfile(PROFILE_REDUCED);
    }
  });
  longTaskObserver.observe({ type: 'longtask' });
}

function sampleFramePressure(now) {
  frameProbeId = 0;
  if (currentProfile === PROFILE_REDUCED) return;
  if (now < pressureGraceUntil) {
    previousFrameAt = now;
    slowFrameSamples = [];
  } else if (document.visibilityState !== 'visible') {
    previousFrameAt = 0;
  } else if (previousFrameAt) {
    const delta = now - previousFrameAt;
    if (delta >= SLOW_FRAME_THRESHOLD_MS && delta < 1000) {
      slowFrameSamples.push({ at: now, excess: delta - (1000 / 60) });
    }
    slowFrameSamples = slowFrameSamples.filter((sample) => now - sample.at <= FRAME_PRESSURE_WINDOW_MS);
    const excess = slowFrameSamples.reduce((sum, sample) => sum + sample.excess, 0);
    if (slowFrameSamples.length >= SLOW_FRAME_COUNT_LIMIT && excess >= SLOW_FRAME_EXCESS_LIMIT_MS) {
      publishProfile(PROFILE_REDUCED);
      return;
    }
  }
  previousFrameAt = now;
  if (now - frameProbeStartedAt < FRAME_PROBE_DURATION_MS) {
    frameProbeId = window.requestAnimationFrame(sampleFramePressure);
  } else {
    previousFrameAt = 0;
    slowFrameSamples = [];
  }
}

function startFrameProbe() {
  if (currentProfile === PROFILE_REDUCED || typeof window.requestAnimationFrame !== 'function') return;
  stopFrameProbe();
  frameProbeStartedAt = Math.max(performance.now(), pressureGraceUntil);
  frameProbeId = window.requestAnimationFrame(sampleFramePressure);
}

export function refreshPerformanceProbe() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!initialized) initializePerformanceProfile();
  if (currentProfile === PROFILE_REDUCED) return;
  pressureGraceUntil = Math.max(
    pressureGraceUntil,
    performance.now() + ROUTE_PRESSURE_GRACE_MS
  );
  longTaskSamples = [];
  slowFrameSamples = [];
  observeLongTasks();
  startFrameProbe();
}

export function initializePerformanceProfile() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return PROFILE_BALANCED;
  if (initialized) return currentProfile;
  initialized = true;
  currentProfile = readHardwareProfile();
  pressureGraceUntil = performance.now() + INITIAL_PRESSURE_GRACE_MS;
  document.documentElement.dataset.performance = currentProfile;
  window.TSUKUYOMI_PERFORMANCE_PROFILE = currentProfile;
  if (currentProfile !== PROFILE_REDUCED) {
    observeLongTasks();
    startFrameProbe();
  }
  return currentProfile;
}

export function getPerformanceProfile() {
  if (!initialized && typeof window !== 'undefined') initializePerformanceProfile();
  return currentProfile;
}

export function isReducedPerformance() {
  return getPerformanceProfile() === PROFILE_REDUCED;
}

export function scheduleIdleTask(callback, options = {}) {
  if (typeof window === 'undefined') return () => {};
  const delay = Math.max(0, Number(options.delay) || 0);
  const timeout = Math.max(250, Number(options.timeout) || 2500);
  let delayId = 0;
  let idleId = 0;
  let cancelled = false;

  const run = () => {
    if (cancelled || document.visibilityState === 'hidden') return;
    callback();
  };
  const schedule = () => {
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout });
    } else {
      idleId = window.setTimeout(run, Math.min(timeout, 1200));
    }
  };

  if (delay) delayId = window.setTimeout(schedule, delay);
  else schedule();

  return () => {
    cancelled = true;
    if (delayId) window.clearTimeout(delayId);
    if (!idleId) return;
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
    else window.clearTimeout(idleId);
  };
}
