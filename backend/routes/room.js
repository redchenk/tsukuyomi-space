const express = require('express');
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

function weatherFromCode(code) {
    const numericCode = Number(code);
    const match = WEATHER_CODE_MAP.find((item) => item.codes.includes(numericCode));
    return match ? match.weather : 'cloudy';
}

async function resolveLocationName({ lat, lon, fallback }) {
    if (process.env.ROOM_WEATHER_REVERSE_OFFLINE === 'true' || typeof fetch !== 'function') {
        return { city: fallback, address: fallback };
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
        if (!response.ok) return { city: fallback, address: fallback };
        const payload = await response.json();
        const address = payload.address || {};
        const city = address.city
            || address.town
            || address.village
            || address.county
            || address.state
            || payload.name
            || fallback;
        return {
            city,
            address: payload.display_name || payload.name || city
        };
    } catch (_) {
        return { city: fallback, address: fallback };
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
    const lat = normalizeCoordinate(req.query.lat || process.env.ROOM_WEATHER_LAT, DEFAULT_WEATHER.lat, -90, 90);
    const lon = normalizeCoordinate(req.query.lon || process.env.ROOM_WEATHER_LON, DEFAULT_WEATHER.lon, -180, 180);
    const timezone = String(req.query.timezone || process.env.ROOM_WEATHER_TIMEZONE || DEFAULT_WEATHER.timezone);
    const cityFallback = String(req.query.city || process.env.ROOM_WEATHER_CITY || DEFAULT_WEATHER.city).trim() || DEFAULT_WEATHER.city;
    const cacheLocation = { lat, lon, timezone, city: cityFallback };
    const cached = await weatherCache.getWorld(cacheLocation);
    if (cached) {
        res.set('Cache-Control', 'public, max-age=600');
        return res.json({ success: true, data: { ...cached, cache: 'hit' } });
    }

    const [data, locationName] = await Promise.all([
        fetchOpenMeteoWorld({ lat, lon, timezone, city: cityFallback }),
        resolveLocationName({ lat, lon, fallback: cityFallback })
    ]);
    const world = {
        ...data,
        city: locationName.city,
        address: locationName.address,
        location: { lat, lon, timezone, city: locationName.city, address: locationName.address }
    };
    await weatherCache.setWorld(cacheLocation, world);

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
