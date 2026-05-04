const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const roomMemory = require('../services/room-memory');

const router = express.Router();

const DEFAULT_WEATHER = {
    lat: 22.3193,
    lon: 114.1694,
    timezone: 'Asia/Hong_Kong'
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

function fallbackWorld(reason) {
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
        updatedAt: now.toISOString()
    };
}

async function fetchOpenMeteoWorld({ lat, lon, timezone }) {
    if (process.env.ROOM_WEATHER_OFFLINE === 'true') {
        return fallbackWorld('offline-mode');
    }
    if (typeof fetch !== 'function') {
        return fallbackWorld('fetch-unavailable');
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
            return fallbackWorld(`open-meteo-${response.status}`);
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
            updatedAt: new Date().toISOString()
        };
    } catch (error) {
        return fallbackWorld(error.name === 'AbortError' ? 'weather-timeout' : 'weather-unavailable');
    } finally {
        clearTimeout(timeout);
    }
}

router.get('/world', async (req, res) => {
    const lat = normalizeCoordinate(req.query.lat || process.env.ROOM_WEATHER_LAT, DEFAULT_WEATHER.lat, -90, 90);
    const lon = normalizeCoordinate(req.query.lon || process.env.ROOM_WEATHER_LON, DEFAULT_WEATHER.lon, -180, 180);
    const timezone = String(req.query.timezone || process.env.ROOM_WEATHER_TIMEZONE || DEFAULT_WEATHER.timezone);
    const data = await fetchOpenMeteoWorld({ lat, lon, timezone });

    res.set('Cache-Control', 'public, max-age=600');
    res.json({
        success: true,
        data: {
            ...data,
            location: { lat, lon, timezone }
        }
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

router.post('/memory', authenticateToken, (req, res) => {
    try {
        const result = roomMemory.recordMemory(req.user.id, req.body || {});
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
