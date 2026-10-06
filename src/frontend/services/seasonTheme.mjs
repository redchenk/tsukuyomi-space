export const SEASON_STORAGE_KEY = 'tsukuyomi_season_theme_v1';
export const AVAILABLE_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

export function normalizeSeasonPreference(value) {
  return {
    version: 1,
    mode: ['auto', ...AVAILABLE_SEASONS].includes(value?.mode) ? value.mode : 'auto',
    hemisphere: value?.hemisphere === 'south' ? 'south' : 'north'
  };
}

export function readSeasonPreference(storage) {
  try {
    return normalizeSeasonPreference(JSON.parse(storage?.getItem(SEASON_STORAGE_KEY) || 'null'));
  } catch (_) {
    return normalizeSeasonPreference(null);
  }
}

export function writeSeasonPreference(storage, value) {
  try {
    storage?.setItem(SEASON_STORAGE_KEY, JSON.stringify(normalizeSeasonPreference(value)));
    return Boolean(storage);
  } catch (_) {
    return false;
  }
}

// Device-local calendar, meteorological seasons. Do not infer location from IP
// or request geolocation; visitors can explicitly choose their hemisphere.
export function calendarSeason(date = new Date(), hemisphere = 'north') {
  const month = date.getMonth();
  if (!Number.isInteger(month)) return 'spring';
  const north = month >= 2 && month <= 4 ? 'spring'
    : month >= 5 && month <= 7 ? 'summer'
      : month >= 8 && month <= 10 ? 'autumn' : 'winter';
  return hemisphere === 'south'
    ? ({ spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' })[north]
    : north;
}

export function resolveSeason(preference, date = new Date()) {
  const normalized = normalizeSeasonPreference(preference);
  const calendar = calendarSeason(date, normalized.hemisphere);
  const requested = normalized.mode === 'auto' ? calendar : normalized.mode;
  return { calendar, requested, artwork: AVAILABLE_SEASONS.includes(requested) ? requested : 'spring' };
}

export function nextSeasonCheckDelay(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  // The cap also handles a clock/timezone change while the page stays open.
  return Math.max(1000, Math.min(24 * 60 * 60 * 1000, next.getTime() - date.getTime()));
}
