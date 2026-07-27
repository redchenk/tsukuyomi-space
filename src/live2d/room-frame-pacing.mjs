const FRAME_INTERVAL_60_FPS = 1000 / 60;

const FRAME_PROFILES = Object.freeze({
  balanced: Object.freeze({
    activeIntervalMs: FRAME_INTERVAL_60_FPS,
    idleIntervalMs: 1000 / 45,
    activeDutyRatio: 0.58,
    idleDutyRatio: 0.48,
    activeMinimumFps: 15,
    idleMinimumFps: 12
  }),
  reduced: Object.freeze({
    activeIntervalMs: 1000 / 30,
    idleIntervalMs: 1000 / 24,
    activeDutyRatio: 0.48,
    idleDutyRatio: 0.38,
    activeMinimumFps: 10,
    idleMinimumFps: 8
  })
});

function finitePositive(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeRoomPerformanceProfile(value) {
  return value === 'reduced' ? 'reduced' : 'balanced';
}

export function roomBaseFrameInterval(profile, active = false) {
  const settings = FRAME_PROFILES[normalizeRoomPerformanceProfile(profile)];
  return active ? settings.activeIntervalMs : settings.idleIntervalMs;
}

export function computeRoomFrameInterval({
  profile = 'balanced',
  active = false,
  averageRenderCostMs = 0,
  renderCostMs = 0,
  currentIntervalMs = FRAME_INTERVAL_60_FPS
} = {}) {
  const settings = FRAME_PROFILES[normalizeRoomPerformanceProfile(profile)];
  const baseInterval = active ? settings.activeIntervalMs : settings.idleIntervalMs;
  const dutyRatio = active ? settings.activeDutyRatio : settings.idleDutyRatio;
  const minimumFps = active ? settings.activeMinimumFps : settings.idleMinimumFps;
  const maximumInterval = 1000 / minimumFps;
  const averageCost = finitePositive(averageRenderCostMs, 0);
  const renderCost = finitePositive(renderCostMs, averageCost);
  const currentInterval = finitePositive(currentIntervalMs, baseInterval);
  const budgetInterval = averageCost ? averageCost / dutyRatio : baseInterval;
  const emergencyInterval = renderCost >= 50 ? renderCost / dutyRatio : 0;
  const desiredInterval = clamp(
    Math.max(baseInterval, budgetInterval, emergencyInterval),
    baseInterval,
    maximumInterval
  );

  const underPressure = renderCost > currentInterval * 0.72
    || desiredInterval > currentInterval * 1.25;
  const blend = underPressure ? 0.58 : (desiredInterval < currentInterval && active ? 0.28 : 0.14);
  const smoothedInterval = currentInterval + (desiredInterval - currentInterval) * blend;

  return clamp(
    Math.max(baseInterval, smoothedInterval),
    FRAME_INTERVAL_60_FPS,
    maximumInterval
  );
}

export function roomFramePacingSnapshot({
  profile = 'balanced',
  active = false,
  targetIntervalMs = FRAME_INTERVAL_60_FPS,
  averageRenderCostMs = 0,
  renderCostMs = 0
} = {}) {
  const interval = finitePositive(targetIntervalMs, FRAME_INTERVAL_60_FPS);
  const settings = FRAME_PROFILES[normalizeRoomPerformanceProfile(profile)];
  const minimumFps = active ? settings.activeMinimumFps : settings.idleMinimumFps;
  return {
    targetFps: Math.max(minimumFps, Math.round((1000 / interval) * 10) / 10),
    targetIntervalMs: Math.round(interval * 100) / 100,
    averageRenderCostMs: Math.round(finitePositive(averageRenderCostMs, 0) * 100) / 100,
    renderCostMs: Math.round(finitePositive(renderCostMs, 0) * 100) / 100,
    active: Boolean(active),
    profile: normalizeRoomPerformanceProfile(profile)
  };
}
