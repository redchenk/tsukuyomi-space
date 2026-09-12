export const PERFORMANCE_PROFILE_EVENT = 'tsukuyomi:performance-profile';

const PROFILE_BALANCED = 'balanced';
const PROFILE_REDUCED = 'reduced';
const LONG_TASK_WINDOW_MS = 10000;
const LONG_TASK_TOTAL_LIMIT_MS = 420;
const LONG_TASK_COUNT_LIMIT = 3;

let currentProfile = PROFILE_BALANCED;
let initialized = false;
let longTaskObserver = null;
let longTaskTimer = 0;

function readHardwareProfile() {
  if (typeof navigator === 'undefined') return PROFILE_BALANCED;
  const memory = Number(navigator.deviceMemory) || 0;
  const cores = Number(navigator.hardwareConcurrency) || 0;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || '').toLowerCase();
  const constrainedNetwork = Boolean(connection?.saveData) || ['slow-2g', '2g', '3g'].includes(effectiveType);
  const veryLowHardware = (memory > 0 && memory <= 2) || (cores > 0 && cores <= 2);
  const jointlyLimited = memory > 0 && memory <= 4 && cores > 0 && cores <= 4;
  return constrainedNetwork || veryLowHardware || jointlyLimited ? PROFILE_REDUCED : PROFILE_BALANCED;
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
}

function observeLongTasks() {
  if (typeof PerformanceObserver !== 'function' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
  let count = 0;
  let total = 0;
  longTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      count += 1;
      total += entry.duration;
    }
    if (count >= LONG_TASK_COUNT_LIMIT && total >= LONG_TASK_TOTAL_LIMIT_MS) {
      publishProfile(PROFILE_REDUCED);
      longTaskObserver?.disconnect();
      longTaskObserver = null;
      window.clearTimeout(longTaskTimer);
    }
  });
  longTaskObserver.observe({ type: 'longtask', buffered: true });
  longTaskTimer = window.setTimeout(() => {
    longTaskObserver?.disconnect();
    longTaskObserver = null;
  }, LONG_TASK_WINDOW_MS);
}

export function initializePerformanceProfile() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return PROFILE_BALANCED;
  if (initialized) return currentProfile;
  initialized = true;
  currentProfile = readHardwareProfile();
  document.documentElement.dataset.performance = currentProfile;
  window.TSUKUYOMI_PERFORMANCE_PROFILE = currentProfile;
  if (currentProfile !== PROFILE_REDUCED) observeLongTasks();
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
