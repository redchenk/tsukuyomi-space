import { computed, nextTick, readonly, ref, watch } from 'vue';
import { SEASON_STORAGE_KEY, readSeasonPreference, writeSeasonPreference, normalizeSeasonPreference, resolveSeason, nextSeasonCheckDelay } from '../services/seasonTheme.mjs';
import { createSeasonTransition, decodeSeasonImages } from '../services/seasonTransition.mjs';
import { seasonBackgrounds } from '../data/seasonBackgrounds';
const transitionSeason = createSeasonTransition({
  document: typeof document === 'undefined' ? null : document,
  reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  prepare: async season => {
    const { seasonalArt } = await import('../data/siteArt.js');
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    await decodeSeasonImages([
      seasonBackgrounds[season][theme],
      ...['hero', 'articleCover', 'galleryCover', 'pixelCover'].map(key => seasonalArt(key, season))
    ]);
  },
  flush: nextTick
});

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
  const background = seasonBackgrounds[selection.value.artwork];
  root.style.setProperty('--site-background-light', `url("${background.light}")`);
  root.style.setProperty('--site-background-dark', `url("${background.dark}")`);
}

watch(selection, initializeSeasonTheme, { flush: 'sync' });

export function useSeasonTheme() {
  const saved = ref(true);
  function setPreference(value) {
    const next = normalizeSeasonPreference({ ...preference.value, ...value });
    return transitionSeason(resolveSeason(next, new Date()).artwork, () => {
      preference.value = next;
      currentDate.value = new Date();
      saved.value = writeSeasonPreference(browserStorage(), preference.value);
    });
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
