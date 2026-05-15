const express = require('express');
const https = require('https');
const { authenticateToken } = require('../middleware/auth');
const roomMemory = require('../services/room-memory');
const weatherCache = require('../services/weather-cache');

const router = express.Router();

const DEFAULT_WEATHER = {
    lat: 22.3193,
    lon: 114.1694,
    timezone: 'Asia/Hong_Kong',
    city: '香港'
};

const WEATHER_CODE_MAP = [
    { codes: [0, 1], weather: 'clear' },
    { codes: [2, 3], weather: 'cloudy' },
    { codes: [45, 48], weather: 'fog' },
    { codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], weather: 'rain' },
    { codes: [71, 73, 75, 77, 85, 86], weather: 'snow' },
    { codes: [95, 96, 99], weather: 'storm' }
];

function getSeason(date = new Date()) {
    const month = date.getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
}

function getTimePhase(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
}

function normalizeCoordinate(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function hasCoordinate(value) {
    return Number.isFinite(Number(value));
}

function normalizeIp(value = '') {
    const raw = String(value || '').split(',')[0].trim();
    return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function isPublicIp(ip = '') {
    const value = normalizeIp(ip);
    if (!value || value === '::1' || value === '127.0.0.1' || value === 'localhost') return false;
    if (/^(10|127)\./.test(value)) return false;
    if (/^192\.168\./.test(value)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return false;
    if (/^(169\.254|0\.|255\.)/.test(value)) return false;
    if (/^(fc|fd|fe80):/i.test(value)) return false;
    return true;
}

function getClientIp(req) {
    const candidates = [
        req.headers['cf-connecting-ip'],
        req.headers['x-forwarded-for'],
        req.headers['x-real-ip'],
        req.ip,
        req.socket?.remoteAddress
    ].flatMap((value) => String(value || '').split(',').map(item => normalizeIp(item)).filter(Boolean));
    return candidates.find(isPublicIp) || candidates[0] || '';
}

function shouldDebugWeather(req) {
    return process.env.ROOM_WEATHER_DEBUG === 'true' || req.query.debug === '1';
}

function weatherDebug(req, extra = {}) {
    if (!shouldDebugWeather(req)) return undefined;
    return {
        clientIp: getClientIp(req),
        ip: req.ip,
        remoteAddress: req.socket?.remoteAddress || '',
        headers: {
            cfConnectingIp: req.headers['cf-connecting-ip'] || '',
            xRealIp: req.headers['x-real-ip'] || '',
            xForwardedFor: req.headers['x-forwarded-for'] || '',
            xForwardedProto: req.headers['x-forwarded-proto'] || '',
            host: req.headers.host || ''
        },
        ...extra
    };
}

function weatherFromCode(code) {
    const numericCode = Number(code);
    const match = WEATHER_CODE_MAP.find((item) => item.codes.includes(numericCode));
    return match ? match.weather : 'cloudy';
}

function genericLocationName() {
    return '当前位置';
}

function pickReadableLocation(address = {}, payload = {}) {
    const city = address.city
        || address.town
        || address.village
        || address.municipality
        || address.county
        || address.district
        || address.state
        || payload.name
        || '';
    const detail = [
        address.country,
        address.state,
        address.city || address.town || address.village || address.municipality,
        address.county,
        address.suburb || address.neighbourhood || address.road
    ].filter(Boolean);
    return {
        city,
        address: payload.display_name || detail.join(' · ') || city
    };
}

async function reverseLocationByBigDataCloud({ lat, lon }) {
    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        localityLanguage: 'zh'
    });
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`;
    return new Promise((resolve) => {
        const request = https.get(url, { headers: { Accept: 'application/json' }, timeout: 8000 }, (response) => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                response.resume();
                resolve(null);
                return;
            }
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
                if (body.length > 64 * 1024) {
                    request.destroy();
                    resolve(null);
                }
            });
            response.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    const city = payload.city
                        || payload.locality
                        || payload.principalSubdivision
                        || payload.countryName
                        || '';
                    const address = [
                        payload.countryName,
                        payload.principalSubdivision,
                        payload.city || payload.locality
                    ].filter(Boolean).join(' · ');
                    resolve(city ? { city, address: address || city } : null);
                } catch (_) {
                    resolve(null);
                }
            });
        });
        request.on('timeout', () => request.destroy());
        request.on('error', () => resolve(null));
    });
}

async function resolveLocationName({ lat, lon, fallback, allowFallback = true }) {
    const fallbackName = allowFallback ? fallback : genericLocationName();
    if (process.env.ROOM_WEATHER_REVERSE_OFFLINE === 'true' || typeof fetch !== 'function') {
        return { city: fallbackName, address: fallbackName };
    }

    const params = new URLSearchParams({
        format: 'jsonv2',
        lat: String(lat),
        lon: String(lon),
        zoom: '16',
        addressdetails: '1',
        'accept-language': 'zh-CN'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'tsukuyomi-space/2.1 room-weather'
            }
        });
        if (response.ok) {
            const payload = await response.json();
            const readable = pickReadableLocation(payload.address || {}, payload);
            if (readable.city) return readable;
        }
    } catch (_) {
    } finally {
        clearTimeout(timeout);
    }
    if (!allowFallback) {
        const backup = await reverseLocationByBigDataCloud({ lat, lon });
        if (backup?.city) return backup;
    }
    return { city: fallbackName, address: fallbackName };
}

async function resolveIpLocation(req) {
    const clientIp = getClientIp(req);
    if (!isPublicIp(clientIp) || process.env.ROOM_WEATHER_IP_LOOKUP === 'false' || typeof fetch !== 'function') {
        return null;
    }

    const cached = await weatherCache.getIpLocation(clientIp);
    if (cached?.lat != null && cached?.lon != null) return cached;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2600);
    try {
        const fields = 'status,message,country,regionName,city,lat,lon,timezone,query';
        const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=${fields}&lang=zh-CN`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) return null;
        const payload = await response.json();
        if (payload.status !== 'success' || !hasCoordinate(payload.lat) || !hasCoordinate(payload.lon)) return null;
        const location = {
            lat: Number(payload.lat),
            lon: Number(payload.lon),
            timezone: payload.timezone || '',
            city: payload.city || payload.regionName || payload.country || '',
            address: [payload.country, payload.regionName, payload.city].filter(Boolean).join(' · '),
            source: 'ip-geolocation'
        };
        await weatherCache.setIpLocation(clientIp, location);
        return location;
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function fallbackWorld(reason, city = process.env.ROOM_WEATHER_CITY || DEFAULT_WEATHER.city) {
    const now = new Date();
    return {
        weather: 'clear',
        weatherCode: null,
        temperature: null,
        windSpeed: null,
        isDay: getTimePhase(now) !== 'night',
        timePhase: getTimePhase(now),
        season: getSeason(now),
        source: 'local-fallback',
        reason,
        city,
        updatedAt: now.toISOString()
    };
}

async function fetchOpenMeteoWorld({ lat, lon, timezone, city }) {
    if (process.env.ROOM_WEATHER_OFFLINE === 'true') {
        return fallbackWorld('offline-mode', city);
    }
    if (typeof fetch !== 'function') {
        return fallbackWorld('fetch-unavailable', city);
    }

    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: 'temperature_2m,weather_code,is_day,wind_speed_10m',
        timezone
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
            return fallbackWorld(`open-meteo-${response.status}`, city);
        }
        const payload = await response.json();
        const current = payload.current || {};
        const now = new Date(current.time || Date.now());
        const weatherCode = current.weather_code;
        return {
            weather: weatherFromCode(weatherCode),
            weatherCode,
            temperature: Number.isFinite(Number(current.temperature_2m)) ? Number(current.temperature_2m) : null,
            windSpeed: Number.isFinite(Number(current.wind_speed_10m)) ? Number(current.wind_speed_10m) : null,
            isDay: current.is_day === 1,
            timePhase: getTimePhase(now),
            season: getSeason(now),
            source: 'open-meteo',
            city,
            updatedAt: new Date().toISOString()
        };
    } catch (error) {
        return fallbackWorld(error.name === 'AbortError' ? 'weather-timeout' : 'weather-unavailable', city);
    } finally {
        clearTimeout(timeout);
    }
}

router.get('/world', async (req, res) => {
    const hasClientCoords = hasCoordinate(req.query.lat) && hasCoordinate(req.query.lon);
    const hasEnvCoords = hasCoordinate(process.env.ROOM_WEATHER_LAT) && hasCoordinate(process.env.ROOM_WEATHER_LON);
    const ipLocation = !hasClientCoords ? await resolveIpLocation(req) : null;
    const hasIpCoords = hasCoordinate(ipLocation?.lat) && hasCoordinate(ipLocation?.lon);
    const rawLat = hasClientCoords ? req.query.lat : (hasIpCoords ? ipLocation.lat : (hasEnvCoords ? process.env.ROOM_WEATHER_LAT : null));
    const rawLon = hasClientCoords ? req.query.lon : (hasIpCoords ? ipLocation.lon : (hasEnvCoords ? process.env.ROOM_WEATHER_LON : null));
    const timezone = String(req.query.timezone || ipLocation?.timezone || process.env.ROOM_WEATHER_TIMEZONE || DEFAULT_WEATHER.timezone);
    const requestedCity = hasClientCoords ? '' : String(req.query.city || '').trim();
    const requestedLocationSource = String(req.query.locationSource || '').trim();
    const locationSource = hasClientCoords
        ? (requestedLocationSource || 'browser-geolocation')
        : (hasIpCoords ? 'ip-geolocation' : (hasEnvCoords ? 'env-default' : 'unavailable'));
    const cityFallback = hasClientCoords
        ? genericLocationName()
        : (String(requestedCity || ipLocation?.city || process.env.ROOM_WEATHER_CITY || DEFAULT_WEATHER.city).trim() || DEFAULT_WEATHER.city);
    if (!hasClientCoords && !hasIpCoords && !hasEnvCoords) {
        const world = {
            ...fallbackWorld('client-location-unavailable', '月读空间'),
            address: '等待定位授权',
            locationSource,
            location: { lat: null, lon: null, timezone, city: '月读空间', address: '等待定位授权', source: locationSource },
            debug: weatherDebug(req, { hasClientCoords, hasIpCoords, hasEnvCoords, ipLocation })
        };
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, data: world });
    }

    const lat = normalizeCoordinate(rawLat, DEFAULT_WEATHER.lat, -90, 90);
    const lon = normalizeCoordinate(rawLon, DEFAULT_WEATHER.lon, -180, 180);
    const accuracy = Number.isFinite(Number(req.query.accuracy)) ? Number(req.query.accuracy) : null;
    const cacheLocation = { lat, lon, timezone, city: cityFallback, locationSource };
    const cached = await weatherCache.getWorld(cacheLocation);
    if (cached) {
        const cachedWorld = {
            ...cached,
            locationSource,
            location: { ...(cached.location || {}), source: locationSource },
            debug: weatherDebug(req, { hasClientCoords, hasIpCoords, hasEnvCoords, ipLocation, cache: 'hit' })
        };
        res.set('Cache-Control', 'public, max-age=600');
        return res.json({ success: true, data: { ...cachedWorld, cache: 'hit' } });
    }

    const [data, locationName] = await Promise.all([
        fetchOpenMeteoWorld({ lat, lon, timezone, city: cityFallback }),
        resolveLocationName({ lat, lon, fallback: cityFallback, allowFallback: !hasClientCoords })
    ]);
    const world = {
        ...data,
        city: locationName.city,
        address: locationName.address,
        locationSource,
        location: { lat, lon, accuracy, timezone, city: locationName.city, address: locationName.address, source: locationSource },
        debug: weatherDebug(req, { hasClientCoords, hasIpCoords, hasEnvCoords, ipLocation })
    };
    if (!hasClientCoords || locationName.city !== genericLocationName()) {
        await weatherCache.setWorld(cacheLocation, world);
    }

    res.set('Cache-Control', 'public, max-age=600');
    res.json({
        success: true,
        data: world
    });
});

router.get('/memory/status', authenticateToken, (req, res) => {
    res.json({
        success: true,
        data: {
            mode: 'server-vector',
            scope: 'per-user',
            ...roomMemory.memoryStats(req.user.id)
        }
    });
});

router.get('/memory', authenticateToken, (req, res) => {
    const query = String(req.query.q || '').trim();
    const limit = req.query.limit || 50;
    const memories = query
        ? roomMemory.searchMemories(req.user.id, query, limit)
        : roomMemory.listMemories(req.user.id, { limit, type: req.query.type });
    res.json({ success: true, data: memories });
});

router.get('/memory/:id', authenticateToken, (req, res) => {
    const memory = roomMemory.getMemory(req.user.id, String(req.params.id || ''));
    if (!memory) return res.status(404).json({ success: false, message: '记忆不存在' });
    res.json({ success: true, data: memory });
});

router.post('/memory', authenticateToken, async (req, res) => {
    try {
        const result = await roomMemory.recordMemory(req.user.id, req.body || {});
        if (!result) {
            return res.status(202).json({ success: true, data: null, message: '本轮对话没有需要长期保存的记忆' });
        }
        res.status(result.action === 'created' ? 201 : 200).json({
            success: true,
            data: result.memory,
            message: result.action === 'merged' ? '记忆已合并更新' : '记忆已保存'
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : '无法保存记忆'
        });
    }
});

router.patch('/memory/:id', authenticateToken, (req, res) => {
    try {
        const memory = roomMemory.updateMemory(req.user.id, String(req.params.id || ''), req.body || {});
        if (!memory) return res.status(404).json({ success: false, message: '记忆不存在' });
        res.json({ success: true, data: memory, message: '记忆已更新' });
    } catch (error) {
        res.status(500).json({ success: false, message: '无法更新记忆' });
    }
});

router.delete('/memory/:id', authenticateToken, (req, res) => {
    const count = roomMemory.deleteMemory(req.user.id, String(req.params.id || ''));
    if (!count) return res.status(404).json({ success: false, message: '记忆不存在' });
    res.json({ success: true, data: { count }, message: '记忆已删除' });
});

router.delete('/memory', authenticateToken, (req, res) => {
    const count = roomMemory.clearMemories(req.user.id);
    res.json({ success: true, data: { count }, message: '记忆已清空' });
});

router.post('/chat', async (req, res) => {
    res.status(410).json({
        success: false,
        message: 'Room LLM requests are sent directly from the browser. Server proxying is disabled.'
    });
});

router.post('/tts', async (req, res) => {
    res.status(410).json({
        success: false,
        message: 'Room TTS requests are sent directly from the browser. Server proxying is disabled.'
    });
});

module.exports = router;
