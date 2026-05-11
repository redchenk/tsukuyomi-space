import { computed, ref } from 'vue';

const WORLD_ENDPOINT = '/api/room/world';
const WORLD_CACHE_KEY = 'roomWorldState';
const WORLD_LOCATION_KEY = 'roomWorldLocation';
const WORLD_CACHE_TTL = 20 * 60 * 1000;
const WORLD_LOCATION_TTL = 6 * 60 * 60 * 1000;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function locationCacheKey(location = {}) {
  if (location.lat != null && location.lon != null) {
    return `${Number(location.lat).toFixed(3)},${Number(location.lon).toFixed(3)}`;
  }
  return `timezone:${location.timezone || browserTimezone() || 'unknown'}`;
}

function getTimePhase(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

function getSeason(date = new Date()) {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function normalizeWorld(data = {}) {
  const now = new Date();
  const weatherSet = new Set(['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog']);
  const timeSet = new Set(['dawn', 'day', 'dusk', 'night']);
  const seasonSet = new Set(['spring', 'summer', 'autumn', 'winter']);
  const city = String(data.city || data.location?.city || data.location?.timezone || '').trim();
  const address = String(data.address || data.location?.address || '').trim();
  return {
    weather: weatherSet.has(data.weather) ? data.weather : 'clear',
    timePhase: timeSet.has(data.timePhase) ? data.timePhase : getTimePhase(now),
    season: seasonSet.has(data.season) ? data.season : getSeason(now),
    temperature: Number.isFinite(Number(data.temperature)) ? Number(data.temperature) : null,
    windSpeed: Number.isFinite(Number(data.windSpeed)) ? Number(data.windSpeed) : null,
    city: city || '\u6708\u8bfb\u7a7a\u95f4',
    address: address || city || '\u6708\u8bfb\u7a7a\u95f4',
    source: data.source || 'local',
    reason: data.reason || '',
    locationSource: data.locationSource || data.location?.source || '',
    locationAccuracy: Number.isFinite(Number(data.location?.accuracy)) ? Number(data.location.accuracy) : null,
    updatedAt: data.updatedAt || now.toISOString()
  };
}

function weatherLabel(value) {
  return ({
    clear: '\u6674\u6717',
    cloudy: '\u591a\u4e91',
    rain: '\u96e8',
    storm: '\u96f7\u96e8',
    snow: '\u96ea',
    fog: '\u96fe'
  })[value] || '\u6674\u6717';
}

function weatherIcon(value) {
  return ({
    clear: '\u263c',
    cloudy: '\u2601',
    rain: '\u2602',
    storm: '\u03df',
    snow: '\u2744',
    fog: '\u224b'
  })[value] || '\u263c';
}

function timePhaseLabel(value) {
  return ({
    dawn: '\u6e05\u6668',
    day: '\u767d\u663c',
    dusk: '\u9ec4\u660f',
    night: '\u591c\u665a'
  })[value] || '\u6b64\u523b';
}

function seasonLabel(value) {
  return ({
    spring: '\u6625',
    summer: '\u590f',
    autumn: '\u79cb',
    winter: '\u51ac'
  })[value] || '\u5b63\u8282';
}

function readCachedWorld(location = {}) {
  const cached = readJson(WORLD_CACHE_KEY, null);
  if (!cached?.savedAt || !cached.data) return null;
  if (Date.now() - cached.savedAt > WORLD_CACHE_TTL) return null;
  if (cached.locationKey && cached.locationKey !== locationCacheKey(location)) return null;
  return normalizeWorld(cached.data);
}

function writeCachedWorld(value, location = {}) {
  writeJson(WORLD_CACHE_KEY, { savedAt: Date.now(), locationKey: locationCacheKey(location), data: value });
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
}

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (_) {
    return '';
  }
}

function cityFromTimezone(timezone = '') {
  const raw = String(timezone || '').split('/').pop() || '';
  return raw ? raw.replace(/_/g, ' ') : '';
}

function readCachedLocation() {
  const cached = readJson(WORLD_LOCATION_KEY, null);
  if (!cached?.savedAt || cached.lat == null || cached.lon == null) return null;
  if (Date.now() - cached.savedAt > WORLD_LOCATION_TTL) return null;
  return cached;
}

function writeCachedLocation(location) {
  if (location?.lat == null || location?.lon == null) return;
  writeJson(WORLD_LOCATION_KEY, { ...location, savedAt: Date.now() });
}

export function useRoomWorld() {
  const worldTimer = ref(null);
  const worldLocationPromise = ref(null);
  const weatherParticles = ref([]);
  const world = ref(normalizeWorld());

  const weatherCard = computed(() => ({
    icon: weatherIcon(world.value.weather),
    label: weatherLabel(world.value.weather),
    city: world.value.city || '\u6708\u8bfb\u7a7a\u95f4',
    address: world.value.address || world.value.city || '\u6708\u8bfb\u7a7a\u95f4',
    temperature: world.value.temperature == null ? '--\u00b0C' : `${Math.round(world.value.temperature)}\u00b0C`,
    wind: world.value.windSpeed == null ? '\u98ce\u901f --' : `\u98ce\u901f ${Math.round(world.value.windSpeed)} km/h`,
    detail: `${seasonLabel(world.value.season)} \u00b7 ${timePhaseLabel(world.value.timePhase)} \u00b7 ${world.value.source === 'open-meteo' ? '\u7528\u6237\u4f4d\u7f6e\u5b9e\u65f6\u540c\u6b65' : (world.value.reason === 'client-location-unavailable' ? '\u7b49\u5f85\u5b9a\u4f4d\u6388\u6743' : '\u672c\u5730\u4f30\u8ba1')}`
  }));

  function readRoomWorldLocation() {
    if (worldLocationPromise.value) return worldLocationPromise.value;
    const timezone = browserTimezone();
    const city = cityFromTimezone(timezone);
    const cachedLocation = readCachedLocation();
    if (cachedLocation) {
      worldLocationPromise.value = Promise.resolve({ ...cachedLocation, timezone: cachedLocation.timezone || timezone, city: cachedLocation.city || city, source: 'cached-geolocation' });
      return worldLocationPromise.value;
    }
    if (!navigator.geolocation) {
      worldLocationPromise.value = Promise.resolve(timezone ? { timezone, city, source: 'timezone' } : null);
      return worldLocationPromise.value;
    }
    worldLocationPromise.value = new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timezone,
            city,
            source: 'browser-geolocation'
          };
          writeCachedLocation(location);
          resolve(location);
        },
        () => resolve(timezone ? { timezone, city, source: 'timezone' } : null),
        { enableHighAccuracy: true, maximumAge: 10 * 60 * 1000, timeout: 10000 }
      );
    });
    return worldLocationPromise.value;
  }

  function particleStyle(particle) {
    return {
      '--particle-left': `${particle.left}%`,
      '--particle-delay': `${particle.delay}s`,
      '--particle-duration': `${particle.duration}s`,
      '--particle-drift': `${particle.drift}px`,
      '--particle-return': `${Math.round(particle.drift * -0.35)}px`,
      '--particle-size': `${particle.size}px`,
      '--particle-opacity': particle.opacity
    };
  }

  function buildWeatherParticles(weather) {
    if (!['rain', 'storm', 'snow'].includes(weather) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      weatherParticles.value = [];
      return;
    }
    const mobile = isMobileViewport();
    const count = mobile
      ? (weather === 'storm' ? 16 : weather === 'rain' ? 14 : 12)
      : (weather === 'storm' ? 42 : weather === 'rain' ? 34 : 26);
    weatherParticles.value = Array.from({ length: count }, (_, index) => ({
      id: `${weather}-${index}`,
      left: Math.round(Math.random() * 100),
      delay: (Math.random() * 8).toFixed(2),
      duration: weather === 'snow' ? (9 + Math.random() * 8).toFixed(2) : (0.9 + Math.random() * 0.9).toFixed(2),
      drift: Math.round((Math.random() - 0.5) * 90),
      size: Math.round(2 + Math.random() * 4),
      opacity: (0.32 + Math.random() * 0.3).toFixed(2)
    }));
  }

  function applyWorld(nextWorld) {
    world.value = normalizeWorld(nextWorld);
    buildWeatherParticles(world.value.weather);
  }

  async function refreshRoomWorld() {
    try {
      const location = await readRoomWorldLocation();
      const cached = readCachedWorld(location || {});
      if (cached) {
        applyWorld(cached);
        return;
      }
      const params = new URLSearchParams();
      if (location?.lat != null) params.set('lat', String(location.lat));
      if (location?.lon != null) params.set('lon', String(location.lon));
      if (location?.accuracy != null) params.set('accuracy', String(Math.round(location.accuracy)));
      if (location?.timezone) params.set('timezone', String(location.timezone));
      if (location?.city) params.set('city', String(location.city));
      if (location?.source) params.set('locationSource', String(location.source));
      const response = await fetch(`${WORLD_ENDPOINT}${params.toString() ? `?${params}` : ''}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      const nextWorld = normalizeWorld(result.data || {});
      applyWorld(nextWorld);
      writeCachedWorld(nextWorld, location || {});
    } catch (_) {
      applyWorld(normalizeWorld());
    }
  }

  function initRoomWorld() {
    applyWorld(normalizeWorld());
    refreshRoomWorld();
    window.clearInterval(worldTimer.value);
    worldTimer.value = window.setInterval(refreshRoomWorld, WORLD_CACHE_TTL);
  }

  function destroyRoomWorld() {
    window.clearInterval(worldTimer.value);
    worldTimer.value = null;
    worldLocationPromise.value = null;
    weatherParticles.value = [];
  }

  return {
    world,
    weatherCard,
    weatherParticles,
    particleStyle,
    initRoomWorld,
    destroyRoomWorld
  };
}
