// Scene lighting is independent of the UI's light/dark preference and weather
// API cache. Use the visitor's local clock; no location or server request.
export function roomDayPart(date = new Date()) {
  const hour = date.getHours();
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}

export function nextRoomLightingCheckDelay(date = new Date()) {
  if (!Number.isFinite(date.getTime())) return 60 * 60 * 1000;
  const next = new Date(date);
  const hour = date.getHours();
  if (hour < 6) next.setHours(6, 0, 0, 0);
  else if (hour < 18) next.setHours(18, 0, 0, 0);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(6, 0, 0, 0);
  }
  return Math.max(1000, next.getTime() - date.getTime());
}

export function roomSceneKey(season, date = new Date()) {
  const safeSeason = ['spring', 'summer', 'autumn', 'winter'].includes(season) ? season : 'spring';
  return safeSeason + '-' + roomDayPart(date);
}

// One boundary timer only while Room is visible. Resume events handle suspended
// tabs and changes to the OS clock/timezone. Cleanup also covers route changes.
export function trackRoomLighting(onChange, {
  window: targetWindow = window,
  document: targetDocument = document,
  now = () => new Date()
} = {}) {
  let timer;
  let stopped = false;
  function refresh() {
    targetWindow.clearTimeout(timer);
    timer = undefined;
    if (stopped || targetDocument.visibilityState === 'hidden') return;
    const date = now();
    onChange(date);
    timer = targetWindow.setTimeout(refresh, nextRoomLightingCheckDelay(date));
  }
  targetWindow.addEventListener('focus', refresh);
  targetWindow.addEventListener('pageshow', refresh);
  targetDocument.addEventListener('visibilitychange', refresh);
  refresh();
  return () => {
    stopped = true;
    targetWindow.clearTimeout(timer);
    targetWindow.removeEventListener('focus', refresh);
    targetWindow.removeEventListener('pageshow', refresh);
    targetDocument.removeEventListener('visibilitychange', refresh);
  };
}
