const crypto = require('crypto');
const config = require('../config');
const store = require('./redis-store');

const WORLD_CACHE_SCHEMA = 2;

function keyForLocation({ lat, lon, timezone, city, locationSource }) {
    const hasBrowserCoords = locationSource === 'browser-geolocation' || locationSource === 'cached-geolocation';
    const normalized = {
        schema: WORLD_CACHE_SCHEMA,
        lat: Number.isFinite(Number(lat)) ? Number(lat).toFixed(3) : lat,
        lon: Number.isFinite(Number(lon)) ? Number(lon).toFixed(3) : lon,
        timezone: timezone || ''
    };
    if (!hasBrowserCoords && city) normalized.city = city;
    const hash = crypto.createHash('sha1')
        .update(JSON.stringify(normalized))
        .digest('hex');
    return `weather:room-world:${hash}`;
}

function keyForIp(ip) {
    const hash = crypto.createHash('sha1')
        .update(String(ip || ''))
        .digest('hex');
    return `weather:ip-location:${hash}`;
}

async function getWorld(location) {
    return store.getJson(keyForLocation(location));
}

async function setWorld(location, data) {
    return store.setJson(keyForLocation(location), data, config.weatherCacheSeconds);
}

async function getIpLocation(ip) {
    return store.getJson(keyForIp(ip));
}

async function setIpLocation(ip, data) {
    return store.setJson(keyForIp(ip), data, config.weatherCacheSeconds * 6);
}

module.exports = {
    getWorld,
    setWorld,
    getIpLocation,
    setIpLocation
};
