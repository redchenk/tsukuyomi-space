import { computed, readonly, ref, watch } from 'vue';
import { SEASON_STORAGE_KEY, readSeasonPreference, writeSeasonPreference, normalizeSeasonPreference, resolveSeason, nextSeasonCheckDelay } from '../services/seasonTheme.mjs';
import summerLight from '../assets/seasons/summer-v1/background-light.webp';
import summerDark from '../assets/seasons/summer-v1/background-dark.webp';
import autumnLight from '../assets/seasons/autumn-v1/background-light.webp';
import autumnDark from '../assets/seasons/autumn-v1/background-dark.webp';
import winterLight from '../assets/seasons/winter-v1/background-light.webp';
import winterDark from '../assets/seasons/winter-v1/background-dark.webp';

const seasonalBackgrounds = { summer: [summerLight, summerDark], autumn: [autumnLight, autumnDark], winter: [winterLight, winterDark] };

function browserStorage() {
  try { return window.localStorage; } catch (_) { return null; }
}

const preference = ref(readSeasonPreference(browserStorage()));
const currentDate = ref(new Date());
const selection = computed(() => resolveSeason(preference.value, currentDate.value));
export const activeSeason = computed(() => selection.value.artwork);

export function initializeSeasonTheme() {
  const root = document.documentElement;
  root.dataset.season = selection.value.artwork;
  root.dataset.calendarSeason = selection.value.calendar;
  const background = seasonalBackgrounds[selection.value.artwork];
  if (background) {
    root.style.setProperty('--ts-season-background-light', `url("${background[0]}")`);
    root.style.setProperty('--ts-season-background-dark', `url("${background[1]}")`);
  } else {
    root.style.removeProperty('--ts-season-background-light');
    root.style.removeProperty('--ts-season-background-dark');
  }
}

watch(selection, initializeSeasonTheme, { flush: 'sync' });

export function useSeasonTheme() {
  const saved = ref(true);
  function setPreference(value) {
    preference.value = normalizeSeasonPreference({ ...preference.value, ...value });
    currentDate.value = new Date();
    saved.value = writeSeasonPreference(browserStorage(), preference.value);
  }
  return { preference: readonly(preference), selection, saved: readonly(saved), setPreference };
}

// One timer for the whole app, scheduled at local midnight; no API, worker or
// polling. Refresh when returning to a suspended tab or after OS clock changes.
export function startSeasonTracking() {
  let timer;
  function refresh() {
    window.clearTimeout(timer);
    currentDate.value = new Date();
    initializeSeasonTheme();
    timer = window.setTimeout(refresh, nextSeasonCheckDelay(currentDate.value));
  }
  function resume() { if (document.visibilityState === 'visible') refresh(); }
  function syncStorage(event) {
    if (event.key !== SEASON_STORAGE_KEY && event.key !== null) return;
    preference.value = readSeasonPreference(browserStorage());
    refresh();
  }
  window.addEventListener('storage', syncStorage);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', resume);
  refresh();
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('storage', syncStorage);
    window.removeEventListener('pageshow', refresh);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', resume);
  };
}
