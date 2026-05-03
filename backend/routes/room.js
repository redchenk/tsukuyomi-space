const express = require('express');
const { ROOM_SYSTEM_PROMPT, createChatCompletion, fallbackRoomReply } = require('../services/llm');
const { synthesizeSpeech } = require('../services/tts');

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
    const timeout = setTimeout(() => controller.abort(), 2500);

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

router.post('/chat', async (req, res) => {
    try {
        const { message, conversation = [], settings = {} } = req.body || {};
        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: '消息内容不能为空' });
        }

        const data = await createChatCompletion({
            message,
            conversation,
            apiKey: settings.apiKey,
            apiUrl: settings.apiUrl,
            model: settings.model,
            systemPrompt: ROOM_SYSTEM_PROMPT
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Room chat error:', error);
        res.json({ success: true, data: { reply: fallbackRoomReply(req.body?.message), model: 'local-fallback' } });
    }
});

router.post('/tts', async (req, res) => {
    try {
        const { text, settings = {} } = req.body || {};
        if (!text || !String(text).trim()) {
            return res.status(400).json({ success: false, message: '文本内容不能为空' });
        }

        const { audioBuffer, contentType } = await synthesizeSpeech({
            text,
            apiKey: settings.apiKey,
            apiUrl: settings.apiUrl,
            voice: settings.voice,
            model: settings.model,
            provider: settings.provider
        });
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'no-store');
        res.send(audioBuffer);
    } catch (error) {
        console.error('Room TTS error:', error);
        res.status(error.status || 502).json({ success: false, message: error.message || 'TTS 服务暂时不可用' });
    }
});

module.exports = router;
